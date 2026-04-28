import type { FastifyPluginAsync } from 'fastify';

interface WalkInBody {
  firstName:         string;
  lastName:          string;
  email:             string;
  phone?:            string;
  passedOrientation: boolean;
  resourceId?:       string;
}

const walkInRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/walkin/resources
   * Returns resources with showOnKiosk=true for the tool selector.
   * Unauthenticated — kiosk has no login.
   */
  fastify.get('/api/walkin/resources', async (_req, reply) => {
    const resources = await fastify.prisma.resource.findMany({
      where:   { showOnKiosk: true, status: { not: 'MAINTENANCE' } },
      orderBy: [{ shop: { name: 'asc' } }, { name: 'asc' }],
      select:  { id: true, name: true, shop: { select: { name: true } } },
    });
    reply.send(resources);
  });

  /**
   * POST /api/walkin
   * Records a walk-in from the kiosk sign-in form.
   * Unauthenticated — kiosk has no login.
   */
  fastify.post<{ Body: WalkInBody }>('/api/walkin', async (req, reply) => {
    const { firstName, lastName, email, phone, passedOrientation, resourceId } = req.body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return reply.code(400).send({ code: 'INVALID_BODY', message: 'firstName, lastName, and email are required.' });
    }

    const entry = await fastify.prisma.walkIn.create({
      data: {
        firstName:         firstName.trim(),
        lastName:          lastName.trim(),
        email:             email.trim().toLowerCase(),
        phone:             phone?.trim() || null,
        passedOrientation: passedOrientation === true,
        resourceId:        resourceId || null,
      },
      include: { resource: { select: { name: true, shop: { select: { name: true } } } } },
    });

    reply.code(201).send(entry);
  });

  /**
   * GET /api/walkin
   * Returns today's walk-in log. Requires admin.
   */
  fastify.get('/api/walkin', { preHandler: [fastify.requireAdmin] }, async (_req, reply) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const entries = await fastify.prisma.walkIn.findMany({
      where:   { signedInAt: { gte: startOfDay } },
      orderBy: { signedInAt: 'desc' },
      include: { resource: { select: { name: true, shop: { select: { name: true } } } } },
    });
    reply.send(entries);
  });
};

export default walkInRoutes;
