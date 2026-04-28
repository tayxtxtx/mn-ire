/**
 * Kiosk session management — unauthenticated.
 * These routes are called from the kiosk after a member checks in to a booking.
 * No user session is required because the kiosk device is trusted (local network).
 */
import type { FastifyPluginAsync } from 'fastify';

const DEFAULT_EXTEND_MINUTES = 30;

const kioskRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/kiosk/bookings/:id/extend
   * Adds N minutes to a CHECKED_IN booking's endsAt.
   * Fails with 409 if extending would conflict with another booking.
   */
  fastify.post<{
    Params: { id: string };
    Body:   { minutes?: number };
  }>('/api/kiosk/bookings/:id/extend', async (req, reply) => {
    const minutes = req.body.minutes ?? DEFAULT_EXTEND_MINUTES;
    const booking = await fastify.prisma.booking.findUnique({ where: { id: req.params.id } });

    if (!booking || booking.status !== 'CHECKED_IN') {
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Active booking not found.' });
    }

    const newEnd = new Date(booking.endsAt.getTime() + minutes * 60_000);

    // Conflict check: another booking on the same resource in the extended window
    const conflict = await fastify.prisma.booking.findFirst({
      where: {
        resourceId: booking.resourceId,
        id:         { not: booking.id },
        status:     { in: ['CONFIRMED', 'CHECKED_IN'] },
        startsAt:   { lt: newEnd },
        endsAt:     { gt: booking.endsAt },
      },
    });

    if (conflict) {
      return reply.code(409).send({
        code:    'CONFLICT',
        message: `Cannot extend — another booking starts at ${conflict.startsAt.toLocaleTimeString()}.`,
        conflictStartsAt: conflict.startsAt.toISOString(),
      });
    }

    const updated = await fastify.prisma.booking.update({
      where: { id: booking.id },
      data:  { endsAt: newEnd },
    });

    reply.send({ endsAt: updated.endsAt.toISOString() });
  });

  /**
   * POST /api/kiosk/bookings/:id/complete
   * Marks a CHECKED_IN booking as COMPLETED and sets endsAt = now.
   * Frees the resource if no other active booking claims it.
   */
  fastify.post<{ Params: { id: string } }>('/api/kiosk/bookings/:id/complete', async (req, reply) => {
    const booking = await fastify.prisma.booking.findUnique({ where: { id: req.params.id } });

    if (!booking || booking.status !== 'CHECKED_IN') {
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Active booking not found.' });
    }

    const now = new Date();

    await fastify.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data:  { status: 'COMPLETED', endsAt: now },
      });

      // Free the resource if no other CHECKED_IN booking is still active
      const otherActive = await tx.booking.count({
        where: { resourceId: booking.resourceId, status: 'CHECKED_IN', id: { not: booking.id }, endsAt: { gt: now } },
      });
      const activeWalkIn = await tx.walkIn.count({
        where: { resourceId: booking.resourceId, signedOutAt: null },
      });
      if (otherActive === 0 && activeWalkIn === 0) {
        await tx.resource.update({
          where: { id: booking.resourceId },
          data:  { status: 'AVAILABLE' },
        });
      }
    });

    reply.send({ ok: true });
  });
};

export default kioskRoutes;
