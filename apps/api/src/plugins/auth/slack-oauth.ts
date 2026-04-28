/**
 * Slack OAuth2 provider ("Sign in with Slack").
 * Registers /auth/login and /auth/callback.
 *
 * Slack OAuth does not carry certification scopes — certifications are
 * managed directly in the DB by an admin (e.g. via Prisma Studio or a
 * future admin UI). The DB snapshot is loaded on every login.
 *
 * Required Slack scopes: openid, profile, email
 * (use the "Sign in with Slack" button / OIDC flow, not the bot flow)
 */
import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { env } from '../../env.js';
import type { SessionUser } from './types.js';
import './types.js'; // activate FastifySessionObject module augmentation

const SLACK_AUTHORIZE_URL = 'https://slack.com/openid/connect/authorize';
const SLACK_TOKEN_URL = 'https://slack.com/api/openid.connect.token';
const SLACK_USERINFO_URL = 'https://slack.com/api/openid.connect.userInfo';

interface SlackTokenResponse {
  ok: boolean;
  access_token?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
}

interface SlackUserInfo {
  ok: boolean;
  sub: string;
  email: string;
  name: string;
  'https://slack.com/user_id'?: string;
  error?: string;
}

export async function registerSlackOAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/auth/login', async (req, reply) => {
    // CSRF protection: store a random state value in the session
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.SLACK_CLIENT_ID,
      scope: 'openid profile email',
      redirect_uri: env.SLACK_REDIRECT_URI,
      state,
    });
    reply.redirect(`${SLACK_AUTHORIZE_URL}?${params.toString()}`);
  });

  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/callback',
    async (req, reply) => {
      const { code, state, error } = req.query;

      if (error) {
        reply.code(400).send({ code: 'OAUTH_ERROR', message: error });
        return;
      }

      // Validate CSRF state
      const savedState = req.session.oauthState;
      if (!state || state !== savedState) {
        reply.code(400).send({ code: 'OAUTH_STATE_MISMATCH', message: 'Invalid OAuth state.' });
        return;
      }

      if (!code) {
        reply.code(400).send({ code: 'OAUTH_NO_CODE', message: 'No authorization code received.' });
        return;
      }

      // Exchange code for tokens
      const tokenRes = await fetch(SLACK_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.SLACK_CLIENT_ID,
          client_secret: env.SLACK_CLIENT_SECRET,
          redirect_uri: env.SLACK_REDIRECT_URI,
        }),
      });

      const tokens = (await tokenRes.json()) as SlackTokenResponse;
      if (!tokens.ok || !tokens.access_token) {
        reply.code(502).send({ code: 'TOKEN_EXCHANGE_FAILED', message: tokens.error ?? 'Token exchange failed.' });
        return;
      }

      // Fetch user info
      const userRes = await fetch(SLACK_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const slackUser = (await userRes.json()) as SlackUserInfo;

      if (!slackUser.ok) {
        reply.code(502).send({ code: 'USERINFO_FAILED', message: slackUser.error ?? 'Could not fetch user info.' });
        return;
      }

      const slackUserId = slackUser['https://slack.com/user_id'] ?? slackUser.sub;

      // Upsert user — certifications come from the DB, not the token
      const dbUser = await fastify.prisma.user.upsert({
        where: { authentikId: slackUser.sub },
        update: {
          email: slackUser.email,
          displayName: slackUser.name,
          slackUserId,
        },
        create: {
          authentikId: slackUser.sub,   // reuse the sub field as the stable ID
          email: slackUser.email,
          displayName: slackUser.name,
          slackUserId,
          certifications: [],           // admin assigns these in the DB
        },
      });

      const sessionUser: SessionUser = {
        sub: slackUser.sub,
        email: slackUser.email,
        name: slackUser.name,
        certifications: dbUser.certifications,
      };

      req.session.user = sessionUser;
      const returnTo = req.session.returnTo ?? env.WEB_PUBLIC_URL;
      delete req.session.returnTo;
      reply.redirect(returnTo);
    },
  );
}
