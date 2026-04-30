/**
 * Local auth provider — email + password.
 *
 * No external services required. Accounts are created via admin-issued
 * invite links (/api/admin/invites → /api/invites/:token/accept).
 *
 * Routes registered:
 *   POST /auth/login   — verify credentials, start session
 */
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { env } from '../../env.js';
import type { SessionUser } from './types.js';
import './types.js';

export async function registerLocalRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: { email?: string; password?: string } }>(
    '/auth/login',
    async (req, reply) => {
      const { email, password } = req.body ?? {};

      if (!email || !password) {
        reply.code(400).send({ code: 'MISSING_FIELDS', message: 'Email and password are required.' });
        return;
      }

      const user = await fastify.prisma.user.findUnique({ where: { email } });

      // Use a constant-time compare even on "user not found" to prevent timing attacks
      const hash = user?.passwordHash ?? '$2a$10$invalidhashpaddingtomatchlength0000000000000';
      const valid = await bcrypt.compare(password, hash);

      if (!user || !valid || !user.passwordHash) {
        reply.code(401).send({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
        return;
      }

      const sessionUser: SessionUser = {
        sub:            user.id,
        email:          user.email,
        name:           user.displayName,
        certifications: user.certifications,
      };

      req.session.user = sessionUser;
      (req.session as unknown as Record<string, unknown>)['isAdmin'] = user.isAdmin;

      // If the user's email is in ADMIN_EMAILS, promote them
      const adminEmails = ((fastify as unknown as Record<string, unknown>)['_adminEmails'] as Set<string>) ?? new Set();
      if (adminEmails.has(user.email) && !user.isAdmin) {
        await fastify.prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
        (req.session as unknown as Record<string, unknown>)['isAdmin'] = true;
      }

      // JSON response — the login page handles the redirect
      reply.send({ ok: true, name: user.displayName });
    },
  );

  // Expose the login page URL for the frontend to know where to redirect
  fastify.get('/auth/login', async (_req, reply) => {
    reply.redirect(`${env.WEB_PUBLIC_URL}/login`);
  });
}
