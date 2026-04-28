import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import ConnectRedis from 'connect-redis';
import { env } from './env.js';
import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';
import shopsRoutes from './routes/shops.js';
import bookingsRoutes from './routes/bookings.js';
import adminRoutes from './routes/admin.js';
import { startGCalSyncScheduler } from './services/gcal.js';
import { startSlackApp } from './services/slack.js';
import { startNoShowWorker } from './workers/noshow.js';

const fastify = Fastify(
  env.NODE_ENV === 'development'
    ? {
        logger: {
          transport: { target: 'pino-pretty', options: { colorize: true } },
        },
      }
    : { logger: true },
);

// ── Infrastructure plugins ────────────────────────────────────────────────────

await fastify.register(fastifyCors, {
  origin: [env.WEB_PUBLIC_URL, env.KIOSK_PUBLIC_URL],
  credentials: true,
});

await fastify.register(prismaPlugin);
await fastify.register(redisPlugin);

// Session — backed by Redis via connect-redis
await fastify.register(fastifyCookie);
await fastify.register(fastifySession, {
  secret: env.SESSION_SECRET,
  cookie: {
    secure: env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
  store: new ConnectRedis({ client: fastify.redis as never }),
  saveUninitialized: false,
});

// Rate limiting — global default: 100 req/min per IP
await fastify.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis: fastify.redis,
});

// ── Feature plugins & routes ──────────────────────────────────────────────────

// Auth: /auth/login, /auth/callback, /auth/logout, /auth/me
await fastify.register(authPlugin);

// API routes
await fastify.register(shopsRoutes);
await fastify.register(bookingsRoutes);
await fastify.register(adminRoutes);

// ── Health check ──────────────────────────────────────────────────────────────

fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

// ── Background services ───────────────────────────────────────────────────────

// GCal incremental sync — polls every 60 seconds
const stopGCalSync = startGCalSyncScheduler(fastify.prisma, 60_000);

// Slack Socket Mode bot
const stopSlack = await startSlackApp();

// BullMQ no-show worker
const noShowWorker = startNoShowWorker();

// ── Graceful shutdown ─────────────────────────────────────────────────────────

fastify.addHook('onClose', async () => {
  stopGCalSync();
  await stopSlack();
  await noShowWorker.close();
});

// ── Start ─────────────────────────────────────────────────────────────────────

try {
  await fastify.listen({ port: env.API_PORT, host: '0.0.0.0' });
  fastify.log.info(`MN-IRE API listening on port ${env.API_PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
