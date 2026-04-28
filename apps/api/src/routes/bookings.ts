import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  BookingError,
  cancelBooking,
  checkInBooking,
  createBooking,
} from '../services/booking.js';

const CreateBookingSchema = z.object({
  resourceId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const bookingsRoutes: FastifyPluginAsync = async (fastify) => {
  // All booking routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  /** GET /api/bookings — current user's bookings (optionally filtered by status) */
  fastify.get<{ Querystring: { status?: string } }>(
    '/api/bookings',
    async (req, reply) => {
      const userId = req.user!.sub;
      const statusFilter = req.query.status?.split(',') as
        | ('PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED')[]
        | undefined;

      const dbUser = await fastify.prisma.user.findUniqueOrThrow({
        where: { authentikId: userId },
        select: { id: true },
      });

      const bookings = await fastify.prisma.booking.findMany({
        where: {
          userId: dbUser.id,
          ...(statusFilter ? { status: { in: statusFilter } } : {}),
        },
        include: { resource: { include: { shop: true } } },
        orderBy: { startsAt: 'desc' },
      });

      reply.send(
        bookings.map((b) => ({
          id: b.id,
          userId: b.userId,
          resourceId: b.resourceId,
          resourceName: b.resource.name,
          shopName: b.resource.shop.name,
          startsAt: b.startsAt.toISOString(),
          endsAt: b.endsAt.toISOString(),
          status: b.status,
          checkedInAt: b.checkedInAt?.toISOString() ?? null,
        })),
      );
    },
  );

  /** GET /api/bookings/:id */
  fastify.get<{ Params: { id: string } }>(
    '/api/bookings/:id',
    async (req, reply) => {
      const dbUser = await fastify.prisma.user.findUniqueOrThrow({
        where: { authentikId: req.user!.sub },
        select: { id: true },
      });
      const booking = await fastify.prisma.booking.findUnique({
        where: { id: req.params.id },
        include: { resource: { include: { shop: true } } },
      });
      if (!booking || booking.userId !== dbUser.id) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Booking not found.' });
        return;
      }
      reply.send({
        id: booking.id,
        userId: booking.userId,
        resourceId: booking.resourceId,
        resourceName: booking.resource.name,
        shopName: booking.resource.shop.name,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        status: booking.status,
        checkedInAt: booking.checkedInAt?.toISOString() ?? null,
      });
    },
  );

  /** POST /api/bookings — create a booking */
  fastify.post<{ Body: unknown }>('/api/bookings', async (req, reply) => {
    const parsed = CreateBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body.',
        details: parsed.error.flatten(),
      });
      return;
    }

    const dbUser = await fastify.prisma.user.findUniqueOrThrow({
      where: { authentikId: req.user!.sub },
      select: { id: true },
    });

    try {
      const booking = await createBooking(fastify.prisma, fastify.redis, {
        userId: dbUser.id,
        resourceId: parsed.data.resourceId,
        startsAt: new Date(parsed.data.startsAt),
        endsAt: new Date(parsed.data.endsAt),
      });

      // Fire-and-forget: schedule no-show check + Slack notifications
      // (imported lazily to avoid circular deps at startup)
      void import('../workers/noshow.js').then(({ scheduleNoShowCheck }) =>
        scheduleNoShowCheck(booking.id, booking.startsAt),
      );
      void import('../services/slack.js').then(({ notifyBookingCreated }) =>
        notifyBookingCreated(booking),
      );
      void import('../services/gcal.js').then(({ syncBookingToGCal }) =>
        syncBookingToGCal(fastify.prisma, booking),
      );

      reply.code(201).send({
        id: booking.id,
        userId: booking.userId,
        resourceId: booking.resourceId,
        resourceName: booking.resource.name,
        shopName: booking.resource.shop.name,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        status: booking.status,
        checkedInAt: null,
      });
    } catch (err) {
      if (err instanceof BookingError) {
        reply.code(err.statusCode).send(err.conflict);
        return;
      }
      throw err;
    }
  });

  /** DELETE /api/bookings/:id — cancel */
  fastify.delete<{ Params: { id: string } }>(
    '/api/bookings/:id',
    async (req, reply) => {
      const dbUser = await fastify.prisma.user.findUniqueOrThrow({
        where: { authentikId: req.user!.sub },
        select: { id: true },
      });

      try {
        const booking = await cancelBooking(fastify.prisma, req.params.id, dbUser.id);
        void import('../services/gcal.js').then(({ deleteGCalEvent }) =>
          deleteGCalEvent(fastify.prisma, booking),
        );
        void import('../services/slack.js').then(({ notifyBookingCancelled }) =>
          notifyBookingCancelled(booking),
        );
        reply.send({ ok: true });
      } catch (err) {
        if (err instanceof BookingError) {
          reply.code(err.statusCode).send(err.conflict);
          return;
        }
        throw err;
      }
    },
  );

  /** POST /api/bookings/:id/checkin — kiosk check-in */
  fastify.post<{ Params: { id: string } }>(
    '/api/bookings/:id/checkin',
    async (req, reply) => {
      const dbUser = await fastify.prisma.user.findUniqueOrThrow({
        where: { authentikId: req.user!.sub },
        select: { id: true },
      });

      try {
        const booking = await checkInBooking(fastify.prisma, req.params.id, dbUser.id);
        void import('../services/slack.js').then(({ notifyCheckedIn }) =>
          notifyCheckedIn(booking),
        );
        reply.send({ ok: true, checkedInAt: booking.checkedInAt?.toISOString() });
      } catch (err) {
        if (err instanceof BookingError) {
          reply.code(err.statusCode).send(err.conflict);
          return;
        }
        throw err;
      }
    },
  );
};

export default bookingsRoutes;
