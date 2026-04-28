import type { FastifyPluginAsync } from 'fastify';

const shopsRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /api/shops — list all shops with per-resource status summary */
  fastify.get('/api/shops', async (_req, reply) => {
    const shops = await fastify.prisma.shop.findMany({
      orderBy: { name: 'asc' },
      include: {
        resources: {
          select: { id: true, name: true, status: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    reply.send(shops);
  });

  /** GET /api/shops/:slug — single shop with full resource detail */
  fastify.get<{ Params: { slug: string } }>(
    '/api/shops/:slug',
    async (req, reply) => {
      const shop = await fastify.prisma.shop.findUnique({
        where: { slug: req.params.slug },
        include: {
          resources: {
            orderBy: { name: 'asc' },
          },
        },
      });
      if (!shop) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Shop not found.' });
        return;
      }
      reply.send(shop);
    },
  );

  /**
   * GET /api/resources/:id/availability
   * Returns a list of already-booked intervals within the booking window
   * so the frontend can render an availability timeline.
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/resources/:id/availability',
    async (req, reply) => {
      const resource = await fastify.prisma.resource.findUnique({
        where: { id: req.params.id },
      });
      if (!resource) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Resource not found.' });
        return;
      }

      const windowEnd = new Date(
        Date.now() + resource.bookingWindowDays * 24 * 60 * 60_000,
      );
      const bookings = await fastify.prisma.booking.findMany({
        where: {
          resourceId: req.params.id,
          status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
          startsAt: { gte: new Date() },
          endsAt: { lte: windowEnd },
        },
        select: { id: true, startsAt: true, endsAt: true, status: true },
        orderBy: { startsAt: 'asc' },
      });

      reply.send({
        resourceId: resource.id,
        maxSessionMinutes: resource.maxSessionMinutes,
        bookingWindowDays: resource.bookingWindowDays,
        bookedSlots: bookings.map((b) => ({
          id: b.id,
          startsAt: b.startsAt.toISOString(),
          endsAt: b.endsAt.toISOString(),
          status: b.status,
        })),
      });
    },
  );
};

export default shopsRoutes;
