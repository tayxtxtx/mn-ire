import type { FastifyPluginAsync } from 'fastify';
import { getWhosIn } from '../services/booking.js';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/admin/whos-in
   * Returns all currently active (CHECKED_IN) sessions.
   * Intentionally unauthenticated for the kiosk read-only view;
   * no PII beyond display names is exposed.
   */
  fastify.get('/api/admin/whos-in', async (_req, reply) => {
    const entries = await getWhosIn(fastify.prisma);
    reply.send(entries);
  });

  /**
   * POST /api/admin/resources/:id/maintenance
   * Toggle a resource in/out of MAINTENANCE status.
   * In production this should be gated by an admin role — left as a TODO
   * until the RBAC layer is implemented.
   */
  fastify.post<{
    Params: { id: string };
    Body: { maintenance: boolean };
  }>('/api/admin/resources/:id/maintenance', async (req, reply) => {
    const resource = await fastify.prisma.resource.update({
      where: { id: req.params.id },
      data: { status: req.body.maintenance ? 'MAINTENANCE' : 'AVAILABLE' },
    });
    reply.send({ id: resource.id, status: resource.status });
  });
};

export default adminRoutes;
