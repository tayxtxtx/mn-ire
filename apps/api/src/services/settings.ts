/**
 * Settings Cache
 * ──────────────
 * Provides a unified config lookup that checks the DB first, then falls back
 * to the process environment. Used by all services so that admin-saved values
 * take effect without restarting the server.
 *
 * Call `initSettings(prisma)` once at startup (after the DB plugin is ready).
 * The cache auto-refreshes every 60 seconds in the background.
 */
import type { PrismaClient } from '@makenashville/db';
import { env } from '../env.js';

const CACHE_TTL_MS = 60_000;

// ── Env-var fallback map ───────────────────────────────────────────────────

const ENV_FALLBACK: Record<string, string> = {
  // Slack bot
  SLACK_BOT_TOKEN:               env.SLACK_BOT_TOKEN,
  SLACK_APP_TOKEN:               env.SLACK_APP_TOKEN,
  SLACK_SIGNING_SECRET:          env.SLACK_SIGNING_SECRET,
  SLACK_GUILD_CHANNELS:          env.SLACK_GUILD_CHANNELS,

  // Google Calendar
  GOOGLE_CALENDAR_CLIENT_ID:     env.GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET: env.GOOGLE_CALENDAR_CLIENT_SECRET,
  GOOGLE_CALENDAR_REFRESH_TOKEN: env.GOOGLE_CALENDAR_REFRESH_TOKEN,
  GOOGLE_CALENDAR_UID_PREFIX:    env.GOOGLE_CALENDAR_UID_PREFIX,

  // Booking rules
  DEFAULT_BOOKING_WINDOW_DAYS:   String(env.DEFAULT_BOOKING_WINDOW_DAYS),
  DEFAULT_NO_SHOW_GRACE_MINUTES: String(env.DEFAULT_NO_SHOW_GRACE_MINUTES),
  HIGH_DEMAND_COOLDOWN_HOURS:    String(env.HIGH_DEMAND_COOLDOWN_HOURS),
  ADMIN_EMAILS:                  env.ADMIN_EMAILS,

  // Auth provider (changes require restart)
  AUTH_PROVIDER:           env.AUTH_PROVIDER,
  AUTHENTIK_ISSUER_URL:    env.AUTHENTIK_ISSUER_URL,
  AUTHENTIK_CLIENT_ID:     env.AUTHENTIK_CLIENT_ID,
  AUTHENTIK_CLIENT_SECRET: env.AUTHENTIK_CLIENT_SECRET,
  AUTHENTIK_REDIRECT_URI:  env.AUTHENTIK_REDIRECT_URI,
  AUTHENTIK_CERT_SCOPES:   env.AUTHENTIK_CERT_SCOPES,
  SLACK_CLIENT_ID:         env.SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET:     env.SLACK_CLIENT_SECRET,
  SLACK_REDIRECT_URI:      env.SLACK_REDIRECT_URI,
};

// ── Cache state ────────────────────────────────────────────────────────────

let _prisma: PrismaClient | null = null;
let _cache = new Map<string, string>();
let _lastLoaded = 0;
let _refreshTimer: ReturnType<typeof setInterval> | null = null;

// ── Core functions ─────────────────────────────────────────────────────────

async function _reload(): Promise<void> {
  if (!_prisma) return;
  try {
    const rows = await _prisma.systemSetting.findMany();
    _cache = new Map(rows.map((r) => [r.key, r.value]));
    _lastLoaded = Date.now();
  } catch {
    // DB temporarily unavailable — keep stale values
  }
}

export async function initSettings(prisma: PrismaClient): Promise<void> {
  _prisma = prisma;
  await _reload();
  if (!_refreshTimer) {
    _refreshTimer = setInterval(() => { void _reload(); }, CACHE_TTL_MS);
  }
}

/** Force an immediate cache reload and notify all watchers. */
export function invalidateSettingsCache(): void {
  _lastLoaded = 0;
  void _reload();
}

// ── Public getters (sync — safe to call anywhere after initSettings) ───────

/**
 * Returns the setting value for `key`.
 * Priority: DB → env var → hardFallback
 */
export function getSetting(key: string, hardFallback = ''): string {
  return _cache.get(key) ?? ENV_FALLBACK[key] ?? hardFallback;
}

export function getSettingNumber(key: string, hardFallback: number): number {
  const v = getSetting(key, String(hardFallback));
  const n = Number(v);
  return Number.isFinite(n) ? n : hardFallback;
}

// ── Catalog (used by the admin settings API) ──────────────────────────────

export type SettingGroup = 'booking' | 'slack' | 'gcal' | 'auth';

export interface SettingMeta {
  key:             string;
  label:           string;
  group:           SettingGroup;
  isSecret:        boolean;
  requiresRestart: boolean;
  hint?:           string;
}

export const SETTINGS_CATALOG: SettingMeta[] = [
  // ── Booking rules ────────────────────────────────────────────────────────
  { key: 'DEFAULT_BOOKING_WINDOW_DAYS',   label: 'Booking window (days)',         group: 'booking', isSecret: false, requiresRestart: false, hint: 'How far ahead members can book. Default: 7' },
  { key: 'DEFAULT_NO_SHOW_GRACE_MINUTES', label: 'No-show grace period (minutes)', group: 'booking', isSecret: false, requiresRestart: false, hint: 'Minutes after start time before a booking is marked no-show. Default: 15' },
  { key: 'HIGH_DEMAND_COOLDOWN_HOURS',    label: 'High-demand cooldown (hours)',   group: 'booking', isSecret: false, requiresRestart: false, hint: 'Minimum gap between sessions on high-demand tools. Default: 4' },
  { key: 'ADMIN_EMAILS',                  label: 'Auto-admin emails',             group: 'booking', isSecret: false, requiresRestart: false, hint: 'Comma-separated emails that receive isAdmin=true on first login.' },

  // ── Slack bot ─────────────────────────────────────────────────────────────
  { key: 'SLACK_BOT_TOKEN',      label: 'Bot Token',       group: 'slack', isSecret: true,  requiresRestart: false, hint: 'Starts with xoxb-' },
  { key: 'SLACK_APP_TOKEN',      label: 'App Token',       group: 'slack', isSecret: true,  requiresRestart: false, hint: 'Starts with xapp- (Socket Mode)' },
  { key: 'SLACK_SIGNING_SECRET', label: 'Signing Secret',  group: 'slack', isSecret: true,  requiresRestart: false },
  { key: 'SLACK_GUILD_CHANNELS', label: 'Guild channels',  group: 'slack', isSecret: false, requiresRestart: false, hint: 'e.g. woodshop=#woodshop-captains,cnc=#cnc-captains' },

  // ── Google Calendar ───────────────────────────────────────────────────────
  { key: 'GOOGLE_CALENDAR_CLIENT_ID',     label: 'OAuth Client ID',     group: 'gcal', isSecret: false, requiresRestart: false },
  { key: 'GOOGLE_CALENDAR_CLIENT_SECRET', label: 'OAuth Client Secret', group: 'gcal', isSecret: true,  requiresRestart: false },
  { key: 'GOOGLE_CALENDAR_REFRESH_TOKEN', label: 'Refresh Token',       group: 'gcal', isSecret: true,  requiresRestart: false },
  { key: 'GOOGLE_CALENDAR_UID_PREFIX',    label: 'Event UID prefix',    group: 'gcal', isSecret: false, requiresRestart: false, hint: 'Prefix for GCal event IDs to prevent sync loops. Default: mn-booking-' },

  // ── Auth provider ─────────────────────────────────────────────────────────
  { key: 'AUTH_PROVIDER',           label: 'Identity provider',         group: 'auth', isSecret: false, requiresRestart: true,  hint: 'local | authentik | slack' },
  { key: 'AUTHENTIK_ISSUER_URL',    label: 'Authentik — Issuer URL',    group: 'auth', isSecret: false, requiresRestart: true },
  { key: 'AUTHENTIK_CLIENT_ID',     label: 'Authentik — Client ID',     group: 'auth', isSecret: false, requiresRestart: true },
  { key: 'AUTHENTIK_CLIENT_SECRET', label: 'Authentik — Client Secret', group: 'auth', isSecret: true,  requiresRestart: true },
  { key: 'AUTHENTIK_REDIRECT_URI',  label: 'Authentik — Redirect URI',  group: 'auth', isSecret: false, requiresRestart: true },
  { key: 'AUTHENTIK_CERT_SCOPES',   label: 'Authentik — Cert scopes',   group: 'auth', isSecret: false, requiresRestart: true,  hint: 'Comma-separated scope names that map to certifications' },
  { key: 'SLACK_CLIENT_ID',         label: 'Slack OAuth — Client ID',   group: 'auth', isSecret: false, requiresRestart: true },
  { key: 'SLACK_CLIENT_SECRET',     label: 'Slack OAuth — Client Secret', group: 'auth', isSecret: true, requiresRestart: true },
  { key: 'SLACK_REDIRECT_URI',      label: 'Slack OAuth — Redirect URI',  group: 'auth', isSecret: false, requiresRestart: true },
];

export const MASK = '••••••••';

/** Build the API response for GET /api/admin/settings */
export function buildSettingsResponse(): {
  key: string; label: string; group: SettingGroup;
  isSecret: boolean; requiresRestart: boolean; hint?: string;
  value: string; hasValue: boolean; source: 'db' | 'env' | 'none';
}[] {
  return SETTINGS_CATALOG.map(({ key, label, group, isSecret, requiresRestart, hint }) => {
    const dbValue  = _cache.get(key);
    const envValue = ENV_FALLBACK[key];
    const raw      = dbValue ?? envValue ?? '';
    const hasValue = Boolean(raw);
    const source   = dbValue ? 'db' : (envValue ? 'env' : 'none');
    return {
      key, label, group, isSecret, requiresRestart,
      ...(hint ? { hint } : {}),
      value:    isSecret && hasValue ? MASK : raw,
      hasValue,
      source,
    };
  });
}
