import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { Issuer } from 'openid-client';
import { env } from '../env.js';
import type { AuthClaims } from '@mn-ire/shared';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: AuthClaims | null;
  }
}

declare module '@fastify/session' {
  interface FastifySessionObject {
    user?: AuthClaims;
    returnTo?: string;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Discover the Authentik OIDC configuration
  const issuer = await Issuer.discover(env.AUTHENTIK_ISSUER_URL);
  const client = new issuer.Client({
    client_id: env.AUTHENTIK_CLIENT_ID,
    client_secret: env.AUTHENTIK_CLIENT_SECRET,
    redirect_uris: [env.AUTHENTIK_REDIRECT_URI],
    response_types: ['code'],
  });

  // Decorate every request with a nullable user
  fastify.decorateRequest('user', null);

  // Prehandler that populates req.user from the session
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

  // ── Auth routes ──────────────────────────────────────────────────────────

  fastify.get('/auth/login', async (req, reply) => {
    const certScopes = env.AUTHENTIK_CERT_SCOPES
      ? env.AUTHENTIK_CERT_SCOPES.split(',')
      : [];
    const scopes = ['openid', 'profile', 'email', ...certScopes].join(' ');

    const url = client.authorizationUrl({ scope: scopes });
    reply.redirect(url);
  });

  fastify.get<{ Querystring: { code: string; state?: string } }>(
    '/auth/callback',
    async (req, reply) => {
      const params = client.callbackParams(req.raw);
      const tokenSet = await client.callback(env.AUTHENTIK_REDIRECT_URI, params);
      const claims = tokenSet.claims();

      // Extract cert scopes from the token: any claim key that matches a known cert scope
      const certScopes = env.AUTHENTIK_CERT_SCOPES
        ? env.AUTHENTIK_CERT_SCOPES.split(',')
        : [];
      const certifications = certScopes.filter(
        (scope) => claims[scope] === true || claims[scope] === 'true',
      );

      const user: AuthClaims = {
        sub: claims['sub'] as string,
        email: claims['email'] as string,
        name: (claims['name'] ?? claims['preferred_username'] ?? '') as string,
        certifications,
      };

      // Upsert the user in Postgres to keep certifications snapshot fresh
      await fastify.prisma.user.upsert({
        where: { authentikId: user.sub },
        update: {
          email: user.email,
          displayName: user.name,
          certifications: user.certifications,
        },
        create: {
          authentikId: user.sub,
          email: user.email,
          displayName: user.name,
          certifications: user.certifications,
        },
      });

      req.session.user = user;
      const returnTo = req.session.returnTo ?? env.WEB_PUBLIC_URL;
      delete req.session.returnTo;
      reply.redirect(returnTo);
    },
  );

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
};

export default fp(authPlugin, { name: 'auth', dependencies: ['prisma'] });
