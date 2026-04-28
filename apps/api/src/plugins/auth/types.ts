import type { AuthClaims } from '@makenashville/shared';

/** Shape stored in the session — identical regardless of provider. */
export interface SessionUser extends AuthClaims {}

declare module '@fastify/session' {
  interface FastifySessionObject {
    user?: SessionUser;
    returnTo?: string;
    oauthState?: string;
  }
}
