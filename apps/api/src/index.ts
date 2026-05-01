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
import adminBookingsRoutes from './routes/adminBookings.js';
import adminShopsRoutes from './routes/adminShops.js';
import adminUsersRoutes from './routes/adminUsers.js';
import walkInRoutes from './routes/walkin.js';
import kioskRoutes from './routes/kiosk.js';
import { startGCalSyncScheduler } from './services/gcal.js';
import { startSlackApp } from './services/slack.js';
import { startNoShowWorker } from './workers/noshow.js';
import { initSettings } from './services/settings.js';
import adminSettingsRoutes from './routes/adminSettings.js';
import setupRoutes from './routes/setup.js';

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
    secure: env.COOKIE_SECURE === 'true',
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

// ── Settings cache ─────────────────────────────────────────────────────────────
// Must run before auth plugins so getSetting() works during OIDC discovery.
await initSettings(fastify.prisma);

// ── Feature plugins & routes ──────────────────────────────────────────────────

// Setup: /api/setup/status, /api/setup (public, no auth required)
await fastify.register(setupRoutes);

// Auth: /auth/login, /auth/callback, /auth/logout, /auth/me
await fastify.register(authPlugin);

// API routes
await fastify.register(shopsRoutes);
await fastify.register(bookingsRoutes);
await fastify.register(adminRoutes);
await fastify.register(adminBookingsRoutes);
await fastify.register(adminShopsRoutes);
await fastify.register(adminUsersRoutes);
await fastify.register(adminSettingsRoutes);
await fastify.register(walkInRoutes);
await fastify.register(kioskRoutes);

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
  fastify.log.info(`MakeNashville Booking System API listening on port ${env.API_PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
