/**
 * Admin Booking Routes
 * ────────────────────
 * All routes require the `requireAdmin` preHandler.
 *
 * GET  /api/admin/bookings          — paginated list with filters
 * GET  /api/admin/bookings/:id      — single booking detail
 * PATCH /api/admin/bookings/:id     — edit status and/or times
 * DELETE /api/admin/bookings/:id    — force-cancel (bypasses ownership check)
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const PatchSchema = z.object({
  status: z
    .enum(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW', 'CANCELLED'])
    .optional(),
  startsAt: z.string().datetime().optional(),
  endsAt:   z.string().datetime().optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: 'At least one field must be provided.' },
);

const adminBookingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireAdmin);

  // ── GET /api/admin/bookings ───────────────────────────────────────────────
  fastify.get<{
    Querystring: {
      status?: string;
      resourceId?: string;
      shopId?: string;
      userId?: string;
      from?: string;
      to?: string;
      page?: string;
      limit?: string;
    };
  }>('/api/admin/bookings', async (req, reply) => {
    const {
      status,
      resourceId,
      shopId,
      userId,
      from,
      to,
      page = '1',
      limit = '50',
    } = req.query;

    const take = Math.min(Number(limit), 200);
    const skip = (Math.max(Number(page), 1) - 1) * take;

    const statuses = status?.split(',') as
      | ('PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED')[]
      | undefined;

    const [bookings, total] = await Promise.all([
      fastify.prisma.booking.findMany({
        where: {
          ...(statuses ? { status: { in: statuses } } : {}),
          ...(resourceId ? { resourceId } : {}),
          ...(shopId ? { resource: { shopId } } : {}),
          ...(userId ? { userId } : {}),
          ...(from || to
            ? {
                startsAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to   ? { lte: new Date(to) }   : {}),
                },
              }
            : {}),
        },
        include: {
          user:     { select: { id: true, displayName: true, email: true } },
          resource: { select: { id: true, name: true, shop: { select: { id: true, name: true, slug: true } } } },
        },
        orderBy: { startsAt: 'desc' },
        take,
        skip,
      }),
      fastify.prisma.booking.count({
        where: {
          ...(statuses ? { status: { in: statuses } } : {}),
          ...(resourceId ? { resourceId } : {}),
          ...(shopId ? { resource: { shopId } } : {}),
          ...(userId ? { userId } : {}),
        },
      }),
    ]);

    reply.send({
      data: bookings.map(serializeBooking),
      meta: { total, page: Number(page), limit: take, pages: Math.ceil(total / take) },
    });
  });

  // ── GET /api/admin/bookings/:id ───────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/api/admin/bookings/:id',
    async (req, reply) => {
      const booking = await fastify.prisma.booking.findUnique({
        where: { id: req.params.id },
        include: {
          user:     { select: { id: true, displayName: true, email: true, certifications: true } },
          resource: { include: { shop: true } },
        },
      });
      if (!booking) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Booking not found.' });
        return;
      }
      reply.send(serializeBooking(booking));
    },
  );

  // ── PATCH /api/admin/bookings/:id ─────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/api/admin/bookings/:id',
    async (req, reply) => {
      const parsed = PatchSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body.',
          details: parsed.error.flatten(),
        });
        return;
      }

      const existing = await fastify.prisma.booking.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Booking not found.' });
        return;
      }

      const { status, startsAt, endsAt } = parsed.data;

      // If rescheduling, verify new times don't overlap another booking on the same resource
      if (startsAt ?? endsAt) {
        const newStart = startsAt ? new Date(startsAt) : existing.startsAt;
        const newEnd   = endsAt   ? new Date(endsAt)   : existing.endsAt;

        if (newEnd <= newStart) {
          reply.code(422).send({ code: 'DURATION', message: 'End time must be after start time.' });
          return;
        }

        const overlap = await fastify.prisma.booking.findFirst({
          where: {
            id:         { not: existing.id },
            resourceId: existing.resourceId,
            status:     { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
            AND: [{ startsAt: { lt: newEnd } }, { endsAt: { gt: newStart } }],
          },
        });
        if (overlap) {
          reply.code(409).send({ code: 'OVERLAP', message: 'New times overlap an existing booking.' });
          return;
        }
      }

      const updated = await fastify.prisma.booking.update({
        where: { id: req.params.id },
        data: {
          ...(status   ? { status } : {}),
          ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
          ...(endsAt   ? { endsAt:   new Date(endsAt) }   : {}),
          // Auto-set timestamps when transitioning to terminal states
          ...(status === 'CANCELLED' && !existing.cancelledAt ? { cancelledAt: new Date() } : {}),
          ...(status === 'CHECKED_IN' && !existing.checkedInAt ? { checkedInAt: new Date() } : {}),
        },
        include: {
          user:     { select: { id: true, displayName: true, email: true } },
          resource: { include: { shop: true } },
        },
      });

      reply.send(serializeBooking(updated));
    },
  );

  // ── DELETE /api/admin/bookings/:id ────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/bookings/:id',
    async (req, reply) => {
      const existing = await fastify.prisma.booking.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Booking not found.' });
        return;
      }
      await fastify.prisma.booking.update({
        where: { id: req.params.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      reply.send({ ok: true });
    },
  );

};
// Note: /api/admin/users and /api/admin/users/:id are in adminUsers.ts

// ── Serializer ────────────────────────────────────────────────────────────

type BookingRow = Awaited<
  ReturnType<typeof import('@makenashville/db').PrismaClient.prototype.booking.findUnique>
>;

function serializeBooking(b: NonNullable<BookingRow> & {
  user?: { id: string; displayName: string; email: string; certifications?: string[] };
  resource?: { id: string; name: string; shop?: { id: string; name: string; slug?: string } };
}) {
  return {
    id:              b.id,
    userId:          b.userId,
    resourceId:      b.resourceId,
    startsAt:        b.startsAt.toISOString(),
    endsAt:          b.endsAt.toISOString(),
    status:          b.status,
    gcalEventId:     b.gcalEventId,
    checkedInAt:     b.checkedInAt?.toISOString()      ?? null,
    noShowNotifiedAt: b.noShowNotifiedAt?.toISOString() ?? null,
    cancelledAt:     b.cancelledAt?.toISOString()       ?? null,
    createdAt:       b.createdAt.toISOString(),
    updatedAt:       b.updatedAt.toISOString(),
    user:            b.user     ?? null,
    resource:        b.resource ?? null,
  };
}

export default adminBookingsRoutes;
