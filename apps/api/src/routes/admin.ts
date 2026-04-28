import type { FastifyPluginAsync } from 'fastify';
import { getWhosIn } from '../services/booking.js';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/admin/whos-in
   * Returns all currently active (CHECKED_IN) sessions.
   * Unauthenticated — safe for the kiosk read-only view and the status screen.
   */
  fastify.get('/api/admin/whos-in', async (_req, reply) => {
    const entries = await getWhosIn(fastify.prisma);
    reply.send(entries);
  });

  /**
   * GET /api/status
   * Full facility snapshot for the status board:
   *   - All shops with their resources and live status
   *   - Current CHECKED_IN sessions
   *   - Upcoming CONFIRMED bookings (next 60 minutes)
   * Unauthenticated — the status screen has no login.
   */
  fastify.get('/api/status', async (_req, reply) => {
    const now = new Date();
    const horizon = new Date(now.getTime() + 60 * 60_000);

    const [shops, whosIn, upcoming] = await Promise.all([
      fastify.prisma.shop.findMany({
        orderBy: { name: 'asc' },
        include: {
          resources: {
            orderBy: { name: 'asc' },
            select: { id: true, name: true, status: true, isHighDemand: true },
          },
        },
      }),

      fastify.prisma.booking.findMany({
        where: { status: 'CHECKED_IN', endsAt: { gt: now } },
        include: {
          user:     { select: { displayName: true } },
          resource: { select: { id: true, name: true, shopId: true } },
        },
        orderBy: { endsAt: 'asc' },
      }),

      fastify.prisma.booking.findMany({
        where: {
          status:   'CONFIRMED',
          startsAt: { gte: now, lte: horizon },
        },
        include: {
          user:     { select: { displayName: true } },
          resource: { select: { id: true, name: true, shopId: true } },
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    const whosInByResource = new Map(
      whosIn.map((b) => [
        b.resourceId,
        {
          memberName:       b.user.displayName,
          endsAt:           b.endsAt.toISOString(),
          minutesRemaining: Math.max(0, Math.floor((b.endsAt.getTime() - now.getTime()) / 60_000)),
        },
      ]),
    );

    const upcomingByResource = new Map<string, { memberName: string; startsAt: string }[]>();
    for (const b of upcoming) {
      const list = upcomingByResource.get(b.resourceId) ?? [];
      list.push({ memberName: b.user.displayName, startsAt: b.startsAt.toISOString() });
      upcomingByResource.set(b.resourceId, list);
    }

    reply.send({
      asOf:        now.toISOString(),
      activeSessions: whosIn.length,
      shops: shops.map((shop) => ({
        id:        shop.id,
        name:      shop.name,
        slug:      shop.slug,
        resources: shop.resources.map((r) => ({
          id:          r.id,
          name:        r.name,
          status:      r.status,
          isHighDemand: r.isHighDemand,
          activeSession:   whosInByResource.get(r.id) ?? null,
          upcomingBookings: upcomingByResource.get(r.id) ?? [],
        })),
      })),
    });
  });

  /**
   * POST /api/admin/resources/:id/maintenance
   * Toggle a resource in/out of MAINTENANCE.
   * Requires admin in production; for now open to any authenticated user.
   */
  fastify.post<{
    Params: { id: string };
    Body: { maintenance: boolean };
  }>('/api/admin/resources/:id/maintenance', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const resource = await fastify.prisma.resource.update({
      where: { id: req.params.id },
      data:  { status: req.body.maintenance ? 'MAINTENANCE' : 'AVAILABLE' },
    });
    reply.send({ id: resource.id, status: resource.status });
  });
};

export default adminRoutes;
