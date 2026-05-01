/**
 * First-run Setup Routes
 * ───────────────────────
 * GET  /api/setup/status  — public; returns { required: true } if no admin exists
 * POST /api/setup         — public; creates the first admin account
 *                           Returns 403 if an admin already exists.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const setupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/setup/status', async (_req, reply) => {
    const count = await fastify.prisma.user.count({ where: { isAdmin: true } });
    reply.send({ required: count === 0 });
  });

  fastify.post<{ Body: { displayName: string; email: string; password: string } }>(
    '/api/setup',
    async (req, reply) => {
      const count = await fastify.prisma.user.count({ where: { isAdmin: true } });
      if (count > 0) {
        reply.code(403).send({ message: 'Setup is already complete.' });
        return;
      }

      const parsed = z.object({
        displayName: z.string().min(1),
        email:       z.string().email(),
        password:    z.string().min(8, 'Password must be at least 8 characters.'),
      }).safeParse(req.body);

      if (!parsed.success) {
        reply.code(400).send({ message: parsed.error.issues[0]?.message ?? 'Invalid input.' });
        return;
      }

      const { displayName, email, password } = parsed.data;
      const passwordHash = await bcrypt.hash(password, 12);

      const user = await fastify.prisma.user.create({
        data: {
          authentikId:    `local:${email}`,
          email,
          displayName,
          passwordHash,
          isAdmin:        true,
          certifications: [],
        },
      });

      // Start a session immediately so the user lands in the app
      req.session.user = {
        sub:            user.authentikId,
        email:          user.email,
        name:           user.displayName,
        certifications: [],
      };
      (req.session as unknown as Record<string, unknown>)['isAdmin'] = true;

      reply.send({ message: 'Setup complete. Welcome!' });
    },
  );
};

export default setupRoutes;
