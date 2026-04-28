/**
 * Authentik OIDC provider.
 * Registers /auth/login and /auth/callback.
 * Extracts cert scopes from the token claims and upserts the User row.
 */
import type { FastifyInstance } from 'fastify';
import { Issuer } from 'openid-client';
import { env } from '../../env.js';
import type { SessionUser } from './types.js';

export async function registerAuthentikRoutes(fastify: FastifyInstance): Promise<void> {
  const issuer = await Issuer.discover(env.AUTHENTIK_ISSUER_URL);
  const client = new issuer.Client({
    client_id: env.AUTHENTIK_CLIENT_ID,
    client_secret: env.AUTHENTIK_CLIENT_SECRET,
    redirect_uris: [env.AUTHENTIK_REDIRECT_URI],
    response_types: ['code'],
  });

  fastify.get('/auth/login', async (_req, reply) => {
    const certScopes = env.AUTHENTIK_CERT_SCOPES ? env.AUTHENTIK_CERT_SCOPES.split(',') : [];
    const scope = ['openid', 'profile', 'email', ...certScopes].join(' ');
    reply.redirect(client.authorizationUrl({ scope }));
  });

  fastify.get<{ Querystring: { code?: string; state?: string } }>(
    '/auth/callback',
    async (req, reply) => {
      const params = client.callbackParams(req.raw);
      const tokenSet = await client.callback(env.AUTHENTIK_REDIRECT_URI, params);
      const claims = tokenSet.claims();

      const certScopes = env.AUTHENTIK_CERT_SCOPES ? env.AUTHENTIK_CERT_SCOPES.split(',') : [];
      const certifications = certScopes.filter(
        (s) => claims[s] === true || claims[s] === 'true',
      );

      const user: SessionUser = {
        sub: claims['sub'] as string,
        email: claims['email'] as string,
        name: (claims['name'] ?? claims['preferred_username'] ?? '') as string,
        certifications,
      };

      await fastify.prisma.user.upsert({
        where: { authentikId: user.sub },
        update: { email: user.email, displayName: user.name, certifications },
        create: {
          authentikId: user.sub,
          email: user.email,
          displayName: user.name,
          certifications,
        },
      });

      req.session.user = user;
      const returnTo = req.session.returnTo ?? env.WEB_PUBLIC_URL;
      delete req.session.returnTo;
      reply.redirect(returnTo);
    },
  );
}
