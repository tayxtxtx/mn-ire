/**
 * Admin User & Invite Routes
 * ───────────────────────────
 * User management and invite system for AUTH_PROVIDER=local.
 * All routes below /api/admin/* require requireAdmin.
 * Invite acceptance routes (/api/invites/*) are public.
 *
 * GET    /api/admin/users             — list all users
 * PATCH  /api/admin/users/:id         — promote/demote admin
 * POST   /api/admin/invites           — create invite link
 * GET    /api/admin/invites           — list pending invites
 * DELETE /api/admin/invites/:id       — revoke an invite
 *
 * GET    /api/invites/:token          — validate token (public)
 * POST   /api/invites/:token/accept   — accept invite, set password, start session (public)
 */
import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { env } from '../env.js';

const INVITE_EXPIRY_DAYS = 7;
const BCRYPT_ROUNDS = 12;

const adminUsersRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Admin-only routes ──────────────────────────────────────────────────────

  // GET /api/admin/users
  fastify.get('/api/admin/users', { preHandler: [fastify.requireAdmin] }, async (_req, reply) => {
    const users = await fastify.prisma.user.findMany({
      select: {
        id: true,
        displayName: true,
        email: true,
        isAdmin: true,
        certifications: true,
        createdAt: true,
        // Never expose passwordHash
      },
      orderBy: { displayName: 'asc' },
    });
    reply.send(users);
  });

  // PATCH /api/admin/users/:id — promote/demote admin or update certifications
  fastify.patch<{
    Params: { id: string };
    Body: { isAdmin?: boolean; certifications?: string[] };
  }>('/api/admin/users/:id', { preHandler: [fastify.requireAdmin] }, async (req, reply) => {
    const { isAdmin, certifications } = req.body;
    const user = await fastify.prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(isAdmin        !== undefined ? { isAdmin }        : {}),
        ...(certifications !== undefined ? { certifications } : {}),
      },
      select: { id: true, displayName: true, email: true, isAdmin: true, certifications: true },
    });
    reply.send(user);
  });

  // POST /api/admin/invites — create a new invite
  fastify.post<{ Body: { email?: string; displayName?: string } }>(
    '/api/admin/invites',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      const { email, displayName } = req.body ?? {};
      if (!email || !displayName) {
        reply.code(400).send({ code: 'MISSING_FIELDS', message: 'email and displayName are required.' });
        return;
      }

      // Check that email isn't already registered
      const existing = await fastify.prisma.user.findUnique({ where: { email } });
      if (existing) {
        reply.code(409).send({ code: 'EMAIL_TAKEN', message: 'A user with that email already exists.' });
        return;
      }

      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60_000);
      const invite = await fastify.prisma.invite.create({
        data: { email, displayName, expiresAt },
      });

      const inviteUrl = `${env.WEB_PUBLIC_URL}/accept-invite?token=${invite.token}`;
      reply.code(201).send({ id: invite.id, email, displayName, token: invite.token, inviteUrl, expiresAt: invite.expiresAt.toISOString() });
    },
  );

  // GET /api/admin/invites — list pending (unused, not expired) invites
  fastify.get('/api/admin/invites', { preHandler: [fastify.requireAdmin] }, async (_req, reply) => {
    const invites = await fastify.prisma.invite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    reply.send(
      invites.map((i) => ({
        id:          i.id,
        email:       i.email,
        displayName: i.displayName,
        inviteUrl:   `${env.WEB_PUBLIC_URL}/accept-invite?token=${i.token}`,
        expiresAt:   i.expiresAt.toISOString(),
        createdAt:   i.createdAt.toISOString(),
      })),
    );
  });

  // DELETE /api/admin/invites/:id — revoke invite
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/invites/:id',
    { preHandler: [fastify.requireAdmin] },
    async (req, reply) => {
      await fastify.prisma.invite.deleteMany({ where: { id: req.params.id, usedAt: null } });
      reply.send({ ok: true });
    },
  );

  // ── Public invite-acceptance routes ───────────────────────────────────────

  // GET /api/invites/:token — validate and preview the invite
  fastify.get<{ Params: { token: string } }>(
    '/api/invites/:token',
    async (req, reply) => {
      const invite = await fastify.prisma.invite.findUnique({ where: { token: req.params.token } });
      if (!invite) {
        reply.code(404).send({ code: 'NOT_FOUND', message: 'Invite not found.' });
        return;
      }
      if (invite.usedAt) {
        reply.send({ valid: false, reason: 'already_used', displayName: invite.displayName, email: invite.email });
        return;
      }
      if (invite.expiresAt < new Date()) {
        reply.send({ valid: false, reason: 'expired', displayName: invite.displayName, email: invite.email });
        return;
      }
      reply.send({ valid: true, displayName: invite.displayName, email: invite.email });
    },
  );

  // POST /api/invites/:token/accept — set password, create user, start session
  fastify.post<{ Params: { token: string }; Body: { password?: string } }>(
    '/api/invites/:token/accept',
    async (req, reply) => {
      const { password } = req.body ?? {};
      if (!password || password.length < 8) {
        reply.code(400).send({ code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' });
        return;
      }

      const invite = await fastify.prisma.invite.findUnique({ where: { token: req.params.token } });
      if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
        reply.code(410).send({ code: 'INVITE_INVALID', message: 'This invite is invalid or has expired.' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const adminEmails  = ((fastify as unknown as Record<string, unknown>)['_adminEmails'] as Set<string>) ?? new Set();
      const isAdmin      = adminEmails.has(invite.email);

      // Upsert — handle the edge case where an OAuth account already exists with this email
      const user = await fastify.prisma.user.upsert({
        where:  { email: invite.email },
        update: { passwordHash, displayName: invite.displayName, ...(isAdmin ? { isAdmin: true } : {}) },
        create: {
          authentikId:  `local:${invite.email}`,
          email:        invite.email,
          displayName:  invite.displayName,
          certifications: [],
          passwordHash,
          isAdmin,
        },
      });

      // Mark invite as used
      await fastify.prisma.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });

      // Start session
      req.session.user = { sub: user.id, email: user.email, name: user.displayName, certifications: user.certifications };
      (req.session as unknown as Record<string, unknown>)['isAdmin'] = user.isAdmin;

      reply.send({ ok: true, name: user.displayName });
    },
  );
};

export default adminUsersRoutes;
