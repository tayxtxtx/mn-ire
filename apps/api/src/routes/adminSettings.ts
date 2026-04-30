/**
 * Admin Settings Routes
 * ──────────────────────
 * GET  /api/admin/settings        — full catalog with current values (secrets masked)
 * PATCH /api/admin/settings       — upsert changed values; clear on empty string
 *
 * After a successful PATCH the settings cache is invalidated and hot-reload
 * callbacks are invoked for Slack and GCal when their keys change.
 * Auth-provider credentials have requiresRestart=true — the UI shows a warning.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  buildSettingsResponse,
  invalidateSettingsCache,
  SETTINGS_CATALOG,
  MASK,
} from '../services/settings.js';

const SLACK_KEYS = new Set([
  'SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_GUILD_CHANNELS',
]);
const GCAL_KEYS = new Set([
  'GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REFRESH_TOKEN',
  'GOOGLE_CALENDAR_UID_PREFIX',
]);

const updateSchema = z.object({
  updates: z.array(z.object({
    key:   z.string().min(1),
    value: z.string(),
  })).min(1),
});

const adminSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.requireAdmin);

  // ── GET /api/admin/settings ─────────────────────────────────────────────────

  fastify.get('/api/admin/settings', async (_req, reply) => {
    reply.send(buildSettingsResponse());
  });

  // ── PATCH /api/admin/settings ───────────────────────────────────────────────

  fastify.patch('/api/admin/settings', async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ message: 'Invalid request body.', issues: parsed.error.issues });
      return;
    }

    const { updates } = parsed.data;

    // Build a lookup of secret keys so we can skip unchanged masked values
    const secretKeys = new Set(SETTINGS_CATALOG.filter((s) => s.isSecret).map((s) => s.key));

    let slackChanged = false;
    let gcalChanged  = false;
    let requiresRestart = false;

    for (const { key, value } of updates) {
      const meta = SETTINGS_CATALOG.find((s) => s.key === key);
      if (!meta) continue; // unknown key — ignore

      // If the user submitted the mask for a secret, they didn't change it — skip
      if (secretKeys.has(key) && value === MASK) continue;

      if (value === '') {
        // Empty string → clear DB entry (fall back to env var)
        await fastify.prisma.systemSetting.deleteMany({ where: { key } });
      } else {
        await fastify.prisma.systemSetting.upsert({
          where:  { key },
          update: { value },
          create: { key, value },
        });
      }

      if (SLACK_KEYS.has(key)) slackChanged = true;
      if (GCAL_KEYS.has(key))  gcalChanged  = true;
      if (meta.requiresRestart) requiresRestart = true;
    }

    // Refresh the in-memory cache immediately
    invalidateSettingsCache();

    // Hot-reload side-effects (non-auth settings only)
    if (slackChanged) {
      try {
        const { restartSlackApp } = await import('../services/slack.js');
        await restartSlackApp();
      } catch (err) {
        fastify.log.warn({ err }, '[settings] Slack restart failed — new credentials will take effect after next restart');
      }
    }

    if (gcalChanged) {
      try {
        const { resetGCalAuth } = await import('../services/gcal.js');
        resetGCalAuth();
      } catch (err) {
        fastify.log.warn({ err }, '[settings] GCal auth reset failed');
      }
    }

    reply.send({
      message:        'Settings saved.',
      requiresRestart,
    });
  });
};

export default adminSettingsRoutes;
