/**
 * Auth plugin — provider-agnostic wrapper.
 *
 * Selects the identity provider based on AUTH_PROVIDER env var:
 *   "authentik" (default) — OIDC via Authentik; certs extracted from token scopes.
 *   "slack"               — Sign in with Slack OAuth2; certs managed in the DB.
 *
 * In both cases the session shape, the `req.user` decorator, and the
 * `fastify.authenticate` guard are identical — the rest of the app is
 * completely unaware of which provider is active.
 */
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthClaims } from '@mn-ire/shared';
import { env } from '../env.js';
import { registerAuthentikRoutes } from './auth/authentik.js';
import { registerSlackOAuthRoutes } from './auth/slack-oauth.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: AuthClaims | null;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate every request with a nullable user
  fastify.decorateRequest('user', null);

  // Populate req.user from the session on every request
  fastify.addHook('preHandler', async (req) => {
    if (req.session.user) {
      req.user = req.session.user;
    }
  });

  // Auth guard — attach to any route that requires authentication
  fastify.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) {
        reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Login required.' });
      }
    },
  );

  // ── Provider-specific login / callback routes ─────────────────────────────

  if (env.AUTH_PROVIDER === 'slack') {
    fastify.log.info('[auth] Using Slack OAuth provider.');
    await registerSlackOAuthRoutes(fastify);
  } else {
    fastify.log.info('[auth] Using Authentik OIDC provider.');
    await registerAuthentikRoutes(fastify);
  }

  // ── Shared routes (provider-independent) ─────────────────────────────────

  fastify.post('/auth/logout', async (req, reply) => {
    await req.session.destroy();
    reply.send({ ok: true });
  });

  fastify.get('/auth/me', async (req, reply) => {
    if (!req.user) {
      reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Not logged in.' });
      return;
    }
    reply.send(req.user);
  });

  // Expose which provider is active (useful for the frontend login button label)
  fastify.get('/auth/provider', async (_req, reply) => {
    reply.send({ provider: env.AUTH_PROVIDER });
  });
};

export default fp(authPlugin, { name: 'auth', dependencies: ['prisma'] });
