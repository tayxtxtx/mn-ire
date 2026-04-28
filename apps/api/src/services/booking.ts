/**
 * Booking Service — all create/cancel/checkin business logic.
 * Routes stay thin; this module owns the invariants.
 */
import type { PrismaClient } from '@mn-ire/db';
import type { Redis } from 'ioredis';
import { BOOKING_POLICY } from '@mn-ire/shared';

export interface BookingConflict {
  code: 'CERT_MISSING' | 'COOLDOWN' | 'OVERLAP' | 'WINDOW' | 'DURATION' | 'NO_SLOT';
  message: string;
  /** For COOLDOWN: ISO timestamp when cooldown expires */
  cooldownEndsAt?: string;
}

export interface CreateBookingInput {
  userId: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
}

export class BookingError extends Error {
  constructor(
    public readonly conflict: BookingConflict,
    public readonly statusCode: number,
  ) {
    super(conflict.message);
    this.name = 'BookingError';
  }
}

export async function createBooking(
  prisma: PrismaClient,
  _redis: Redis,
  input: CreateBookingInput,
) {
  const { userId, resourceId, startsAt, endsAt } = input;

  // ── 1. Load resource + user in parallel ──────────────────────────────────
  const [resource, user] = await Promise.all([
    prisma.resource.findUniqueOrThrow({ where: { id: resourceId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
  ]);

  // ── 2. Certification check ────────────────────────────────────────────────
  const missingCerts = resource.requiredCertifications.filter(
    (cert) => !user.certifications.includes(cert),
  );
  if (missingCerts.length > 0) {
    throw new BookingError(
      {
        code: 'CERT_MISSING',
        message: `Missing certifications: ${missingCerts.join(', ')}`,
      },
      403,
    );
  }

  // ── 3. Duration sanity check ──────────────────────────────────────────────
  if (endsAt <= startsAt) {
    throw new BookingError(
      { code: 'DURATION', message: 'End time must be after start time.' },
      422,
    );
  }

  // ── 4. Booking window check ───────────────────────────────────────────────
  const windowMs = resource.bookingWindowDays * 24 * 60 * 60_000;
  if (startsAt.getTime() > Date.now() + windowMs) {
    throw new BookingError(
      {
        code: 'WINDOW',
        message: `Bookings can only be made up to ${resource.bookingWindowDays} days in advance.`,
      },
      422,
    );
  }

  if (startsAt < new Date()) {
    throw new BookingError(
      { code: 'WINDOW', message: 'Start time must be in the future.' },
      422,
    );
  }

  // ── 5. High-demand cooldown check ─────────────────────────────────────────
  if (resource.isHighDemand && resource.cooldownHours > 0) {
    const cooldownWindowStart = new Date(
      Date.now() - resource.cooldownHours * 60 * 60_000,
    );
    const recentBooking = await prisma.booking.findFirst({
      where: {
        userId,
        resourceId,
        status: { in: ['CHECKED_IN', 'COMPLETED'] },
        endsAt: { gte: cooldownWindowStart },
      },
      orderBy: { endsAt: 'desc' },
    });

    if (recentBooking) {
      const cooldownEndsAt = new Date(
        recentBooking.endsAt.getTime() + resource.cooldownHours * 60 * 60_000,
      );
      throw new BookingError(
        {
          code: 'COOLDOWN',
          message: `Cooldown active until ${cooldownEndsAt.toISOString()}. High-demand tools require a ${resource.cooldownHours}-hour gap between your sessions.`,
          cooldownEndsAt: cooldownEndsAt.toISOString(),
        },
        429,
      );
    }
  }

  // ── 6. Overlap check (atomic via serializable transaction) ────────────────
  const booking = await prisma.$transaction(
    async (tx) => {
      const overlap = await tx.booking.findFirst({
        where: {
          resourceId,
          status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
          AND: [{ startsAt: { lt: endsAt } }, { endsAt: { gt: startsAt } }],
        },
      });

      if (overlap) {
        throw new BookingError(
          {
            code: 'OVERLAP',
            message: 'This time slot is already booked. Please choose a different time.',
          },
          409,
        );
      }

      return tx.booking.create({
        data: {
          userId,
          resourceId,
          startsAt,
          endsAt,
          status: 'CONFIRMED',
        },
        include: { resource: { include: { shop: true } }, user: true },
      });
    },
    { isolationLevel: 'Serializable' },
  );

  return booking;
}

export async function cancelBooking(
  prisma: PrismaClient,
  bookingId: string,
  requestingUserId: string,
) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });

  if (booking.userId !== requestingUserId) {
    throw new BookingError(
      { code: 'NO_SLOT', message: 'You do not own this booking.' },
      403,
    );
  }

  if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
    throw new BookingError(
      {
        code: 'NO_SLOT',
        message: `Cannot cancel a booking with status ${booking.status}.`,
      },
      422,
    );
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
    include: { resource: { include: { shop: true } }, user: true },
  });
}

export async function checkInBooking(
  prisma: PrismaClient,
  bookingId: string,
  requestingUserId: string,
) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { resource: true },
  });

  if (booking.userId !== requestingUserId) {
    throw new BookingError(
      { code: 'NO_SLOT', message: 'You do not own this booking.' },
      403,
    );
  }

  if (booking.status !== 'CONFIRMED') {
    throw new BookingError(
      {
        code: 'NO_SLOT',
        message: `Cannot check in to a booking with status ${booking.status}.`,
      },
      422,
    );
  }

  const gracePeriodMs =
    (Number(process.env['DEFAULT_NO_SHOW_GRACE_MINUTES']) ||
      BOOKING_POLICY.NO_SHOW_GRACE_MINUTES) * 60_000;
  const checkInDeadline = new Date(booking.startsAt.getTime() + gracePeriodMs);

  if (new Date() > checkInDeadline) {
    throw new BookingError(
      { code: 'NO_SLOT', message: 'Check-in window has expired.' },
      422,
    );
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CHECKED_IN', checkedInAt: new Date() },
    include: { resource: { include: { shop: true } }, user: true },
  });
}

export async function markNoShow(prisma: PrismaClient, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.status !== 'CONFIRMED') return null;

  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'NO_SHOW', noShowNotifiedAt: new Date() },
    include: { resource: { include: { shop: true } }, user: true },
  });
}

/** Build the "Who's In" snapshot from active CHECKED_IN bookings. */
export async function getWhosIn(prisma: PrismaClient) {
  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: {
      status: 'CHECKED_IN',
      endsAt: { gt: now },
    },
    include: { user: true, resource: { include: { shop: true } } },
    orderBy: { endsAt: 'asc' },
  });

  return bookings.map((b) => ({
    bookingId: b.id,
    userId: b.userId,
    displayName: b.user.displayName,
    resourceId: b.resourceId,
    resourceName: b.resource.name,
    shopName: b.resource.shop.name,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    minutesRemaining: Math.max(
      0,
      Math.floor((b.endsAt.getTime() - now.getTime()) / 60_000),
    ),
  }));
}
