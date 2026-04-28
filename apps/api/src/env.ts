import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // ── Identity provider ────────────────────────────────────────────────────
  // Set to "slack" to use Slack OAuth instead of Authentik OIDC.
  // When using Slack, certifications are managed directly in the DB
  // rather than derived from OIDC token scopes.
  AUTH_PROVIDER: z.enum(['authentik', 'slack']).default('authentik'),

  // Authentik (required when AUTH_PROVIDER=authentik)
  AUTHENTIK_ISSUER_URL: z.string().default(''),
  AUTHENTIK_CLIENT_ID: z.string().default(''),
  AUTHENTIK_CLIENT_SECRET: z.string().default(''),
  AUTHENTIK_REDIRECT_URI: z.string().default(''),
  AUTHENTIK_CERT_SCOPES: z.string().default(''),

  // Slack OAuth (required when AUTH_PROVIDER=slack)
  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_REDIRECT_URI: z.string().default(''),

  // Slack bot (optional — notifications work regardless of AUTH_PROVIDER)
  SLACK_BOT_TOKEN: z.string().default(''),
  SLACK_APP_TOKEN: z.string().default(''),
  SLACK_SIGNING_SECRET: z.string().default(''),
  SLACK_GUILD_CHANNELS: z.string().default(''),

  GOOGLE_CALENDAR_CLIENT_ID: z.string().default(''),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALENDAR_REFRESH_TOKEN: z.string().default(''),
  GOOGLE_CALENDAR_UID_PREFIX: z.string().default('mn-booking-'),

  API_PORT: z.coerce.number().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  KIOSK_PUBLIC_URL: z.string().url().default('http://localhost:5174'),
  SESSION_SECRET: z.string().min(32).default('change-me-in-prod-must-be-32-chars!'),

  // Comma-separated emails that are auto-promoted to isAdmin=true on login.
  // Useful for bootstrapping without touching the DB directly.
  ADMIN_EMAILS: z.string().default(''),

  DEFAULT_BOOKING_WINDOW_DAYS: z.coerce.number().default(7),
  DEFAULT_NO_SHOW_GRACE_MINUTES: z.coerce.number().default(15),
  HIGH_DEMAND_COOLDOWN_HOURS: z.coerce.number().default(4),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Validate that whichever provider is selected actually has its credentials.
if (env.AUTH_PROVIDER === 'authentik') {
  const missing = (['AUTHENTIK_ISSUER_URL', 'AUTHENTIK_CLIENT_ID', 'AUTHENTIK_CLIENT_SECRET', 'AUTHENTIK_REDIRECT_URI'] as const)
    .filter((k) => !env[k]);
  if (missing.length) {
    console.error(`AUTH_PROVIDER=authentik but missing: ${missing.join(', ')}`);
    process.exit(1);
  }
}

if (env.AUTH_PROVIDER === 'slack') {
  const missing = (['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'SLACK_REDIRECT_URI'] as const)
    .filter((k) => !env[k]);
  if (missing.length) {
    console.error(`AUTH_PROVIDER=slack but missing: ${missing.join(', ')}`);
    process.exit(1);
  }
}
