import type { FastifyPluginAsync } from 'fastify';

const DEFAULT_WALKIN_MINUTES = 120;
const DEFAULT_EXTEND_MINUTES = 30;

interface WalkInBody {
  firstName:         string;
  lastName:          string;
  email:             string;
  phone?:            string;
  passedOrientation: boolean;
  resourceId?:       string;
  durationMinutes?:  number;
}

const walkInRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /api/walkin/resources — kiosk tool selector. Unauthenticated. */
  fastify.get('/api/walkin/resources', async (_req, reply) => {
    const resources = await fastify.prisma.resource.findMany({
      where:   { showOnKiosk: true, status: { not: 'MAINTENANCE' } },
      orderBy: [{ shop: { name: 'asc' } }, { name: 'asc' }],
      select:  { id: true, name: true, shop: { select: { name: true } } },
    });
    reply.send(resources);
  });

  /** POST /api/walkin — record a walk-in from the kiosk. Unauthenticated. */
  fastify.post<{ Body: WalkInBody }>('/api/walkin', async (req, reply) => {
    const { firstName, lastName, email, phone, passedOrientation, resourceId, durationMinutes } = req.body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return reply.code(400).send({ code: 'INVALID_BODY', message: 'firstName, lastName, and email are required.' });
    }

    const now    = new Date();
    const endsAt = new Date(now.getTime() + (durationMinutes ?? DEFAULT_WALKIN_MINUTES) * 60_000);

    const entry = await fastify.prisma.$transaction(async (tx) => {
      const walkin = await tx.walkIn.create({
        data: {
          firstName:         firstName.trim(),
          lastName:          lastName.trim(),
          email:             email.trim().toLowerCase(),
          phone:             phone?.trim() || null,
          passedOrientation: passedOrientation === true,
          resourceId:        resourceId || null,
          endsAt,
        },
        include: { resource: { select: { name: true, shop: { select: { name: true } } } } },
      });

      // Mark the resource IN_USE while this walk-in is active
      if (resourceId) {
        await tx.resource.update({
          where: { id: resourceId },
          data:  { status: 'IN_USE' },
        });
      }

      return walkin;
    });

    reply.code(201).send({ ...entry, endsAt: entry.endsAt?.toISOString() ?? null });
  });

  /** POST /api/walkin/:id/extend — push endsAt forward. Unauthenticated (kiosk). */
  fastify.post<{
    Params: { id: string };
    Body:   { minutes?: number };
  }>('/api/walkin/:id/extend', async (req, reply) => {
    const minutes = req.body.minutes ?? DEFAULT_EXTEND_MINUTES;
    const walkin  = await fastify.prisma.walkIn.findUnique({ where: { id: req.params.id } });

    if (!walkin || walkin.signedOutAt) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Active walk-in not found.' });
    }

    const base   = walkin.endsAt ?? new Date();
    const newEnd = new Date(base.getTime() + minutes * 60_000);

    await fastify.prisma.walkIn.update({
      where: { id: walkin.id },
      data:  { endsAt: newEnd },
    });

    reply.send({ endsAt: newEnd.toISOString() });
  });

  /** POST /api/walkin/:id/signout — complete the walk-in, free the resource. Unauthenticated. */
  fastify.post<{ Params: { id: string } }>('/api/walkin/:id/signout', async (req, reply) => {
    const walkin = await fastify.prisma.walkIn.findUnique({ where: { id: req.params.id } });

    if (!walkin) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Walk-in not found.' });
    }

    await fastify.prisma.$transaction(async (tx) => {
      await tx.walkIn.update({
        where: { id: walkin.id },
        data:  { signedOutAt: new Date() },
      });

      if (walkin.resourceId) {
        // Only free the resource if no other active walk-in or checked-in booking is using it
        const otherActive = await tx.walkIn.count({
          where: { resourceId: walkin.resourceId, signedOutAt: null, id: { not: walkin.id } },
        });
        const activeBooking = await tx.booking.count({
          where: { resourceId: walkin.resourceId, status: 'CHECKED_IN', endsAt: { gt: new Date() } },
        });
        if (otherActive === 0 && activeBooking === 0) {
          await tx.resource.update({
            where: { id: walkin.resourceId },
            data:  { status: 'AVAILABLE' },
          });
        }
      }
    });

    reply.send({ ok: true });
  });

  /** GET /api/walkin — today's log. Requires admin. */
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
