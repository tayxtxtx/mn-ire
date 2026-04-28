import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  AUTHENTIK_ISSUER_URL: z.string().url(),
  AUTHENTIK_CLIENT_ID: z.string().min(1),
  AUTHENTIK_CLIENT_SECRET: z.string().min(1),
  AUTHENTIK_REDIRECT_URI: z.string().url(),
  AUTHENTIK_CERT_SCOPES: z.string().default(''),

  GOOGLE_CALENDAR_CLIENT_ID: z.string().default(''),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALENDAR_REFRESH_TOKEN: z.string().default(''),
  GOOGLE_CALENDAR_UID_PREFIX: z.string().default('mn-booking-'),

  SLACK_BOT_TOKEN: z.string().default(''),
  SLACK_APP_TOKEN: z.string().default(''),
  SLACK_SIGNING_SECRET: z.string().default(''),
  SLACK_GUILD_CHANNELS: z.string().default(''),

  API_PORT: z.coerce.number().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  KIOSK_PUBLIC_URL: z.string().url().default('http://localhost:5174'),
  SESSION_SECRET: z.string().min(32).default('change-me-in-prod-must-be-32-chars!'),

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
