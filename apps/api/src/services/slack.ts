/**
 * Slack Service (Socket Mode via @slack/bolt)
 * ────────────────────────────────────────────
 * Responsibilities:
 *   notifyBookingCreated   — DM the member; guild alert for high-demand tools.
 *   notifyBookingCancelled — DM the member.
 *   notifyCheckedIn        — DM the member confirming check-in.
 *   notifyNoShow           — DM the member; guild alert releasing the slot.
 *   startSlackApp          — starts Socket Mode listener. Call once at startup.
 *
 * Guild channels are resolved from env.SLACK_GUILD_CHANNELS:
 *   woodshop=#woodshop-captains,cnc=#cnc-captains,...
 *
 * The Slack user ID is stored on User.slackUserId. If missing, DMs are skipped
 * gracefully — no hard dependency on Slack being wired up per-member.
 */
import { App } from '@slack/bolt';
import type { Booking, Resource, Shop, User } from '@makenashville/db';
import { env } from '../env.js';

// ── Type helpers ───────────────────────────────────────────────────────────

type BookingWithRelations = Booking & {
  resource: Resource & { shop: Shop };
  user: User;
};

// ── Slack app singleton ────────────────────────────────────────────────────

let _app: App | null = null;

function isSlackConfigured(): boolean {
  return Boolean(env.SLACK_BOT_TOKEN && env.SLACK_APP_TOKEN && env.SLACK_SIGNING_SECRET);
}

function getApp(): App | null {
  if (!isSlackConfigured()) return null;
  if (!_app) {
    _app = new App({
      token: env.SLACK_BOT_TOKEN,
      appToken: env.SLACK_APP_TOKEN,
      signingSecret: env.SLACK_SIGNING_SECRET,
      socketMode: true,
    });
  }
  return _app;
}

// ── Guild channel resolution ───────────────────────────────────────────────

/**
 * Parse SLACK_GUILD_CHANNELS env string into a Map<shopSlug, channelId>.
 * Format: "woodshop=#woodshop-captains,cnc=#cnc-captains"
 */
function buildGuildChannelMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!env.SLACK_GUILD_CHANNELS) return map;
  for (const pair of env.SLACK_GUILD_CHANNELS.split(',')) {
    const [slug, channel] = pair.trim().split('=');
    if (slug && channel) map.set(slug.trim(), channel.trim());
  }
  return map;
}

const guildChannelMap = buildGuildChannelMap();

function guildChannelFor(shop: Shop): string | undefined {
  return shop.guildSlackChannel ?? guildChannelMap.get(shop.slug);
}

// ── DM helper ─────────────────────────────────────────────────────────────

async function dmUser(slackUserId: string | null | undefined, text: string): Promise<void> {
  const app = getApp();
  if (!app || !slackUserId) return;
  try {
    await app.client.chat.postMessage({ channel: slackUserId, text });
  } catch (err) {
    console.error('[slack] dmUser error:', err);
  }
}

async function postToChannel(channel: string, text: string): Promise<void> {
  const app = getApp();
  if (!app) return;
  try {
    await app.client.chat.postMessage({ channel, text });
  } catch (err) {
    console.error('[slack] postToChannel error:', err);
  }
}

// ── Notification functions ─────────────────────────────────────────────────

function fmtTime(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Called when a new booking is CONFIRMED.
 * - DMs the member with booking details.
 * - If the resource is high-demand, posts a guild alert.
 */
export async function notifyBookingCreated(booking: BookingWithRelations): Promise<void> {
  const { user, resource } = booking;

  // 1. DM the member
  const memberText =
    `✅ *Booking confirmed!*\n` +
    `> *Resource:* ${resource.name} (${resource.shop.name})\n` +
    `> *Start:* ${fmtTime(booking.startsAt)}\n` +
    `> *End:* ${fmtTime(booking.endsAt)}\n` +
    `> *Booking ID:* \`${booking.id}\`\n\n` +
    `Check in at the kiosk within 15 minutes of your start time. No-shows release the slot.`;

  await dmUser(user.slackUserId, memberText);

  // 2. Guild alert for high-demand tools
  if (resource.isHighDemand) {
    const guildChannel = guildChannelFor(resource.shop);
    if (guildChannel) {
      const guildText =
        `🔧 *High-demand tool reserved*\n` +
        `> *Member:* ${user.displayName} (\`${user.email}\`)\n` +
        `> *Resource:* ${resource.name}\n` +
        `> *Time:* ${fmtTime(booking.startsAt)} – ${fmtTime(booking.endsAt)}`;
      await postToChannel(guildChannel, guildText);
    }
  }
}

/**
 * Called when a booking is cancelled.
 */
export async function notifyBookingCancelled(booking: BookingWithRelations): Promise<void> {
  const { user, resource } = booking;

  const text =
    `🚫 *Booking cancelled*\n` +
    `> *Resource:* ${resource.name} (${resource.shop.name})\n` +
    `> *Was scheduled:* ${fmtTime(booking.startsAt)} – ${fmtTime(booking.endsAt)}`;

  await dmUser(user.slackUserId, text);

  // Notify the guild that the slot is now free
  if (resource.isHighDemand) {
    const guildChannel = guildChannelFor(resource.shop);
    if (guildChannel) {
      await postToChannel(
        guildChannel,
        `🟢 *Slot released* — ${resource.name} is now available at ${fmtTime(booking.startsAt)}.`,
      );
    }
  }
}

/**
 * Called when a member checks in at the kiosk.
 */
export async function notifyCheckedIn(booking: BookingWithRelations): Promise<void> {
  const { user, resource } = booking;
  await dmUser(
    user.slackUserId,
    `🟢 *Checked in!* You're all set on *${resource.name}*. Your session ends at *${fmtTime(booking.endsAt)}*.`,
  );
}

/**
 * Called by the no-show BullMQ worker when a member didn't check in.
 * - Transitions booking to NO_SHOW (already done by markNoShow).
 * - DMs the member.
 * - Posts a guild alert that the slot has been released.
 */
export async function notifyNoShow(booking: BookingWithRelations): Promise<void> {
  const { user, resource } = booking;

  await dmUser(
    user.slackUserId,
    `⚠️ *No-show recorded* for your booking of *${resource.name}* ` +
      `starting at ${fmtTime(booking.startsAt)}.\n` +
      `The slot has been released. Please book again if you still need it.`,
  );

  const guildChannel = guildChannelFor(resource.shop);
  if (guildChannel) {
    await postToChannel(
      guildChannel,
      `⚠️ *No-show* — ${user.displayName} did not check in to *${resource.name}* ` +
        `by ${fmtTime(new Date(booking.startsAt.getTime() + 15 * 60_000))}. Slot released.`,
    );
  }
}

// ── App commands / event listeners ────────────────────────────────────────

function registerListeners(app: App): void {
  // /mnire-status — quick health check from Slack
  app.command('/mnire-status', async ({ ack, respond }) => {
    await ack();
    await respond({ text: '✅ MakeNashville Booking System API is running.' });
  });

  // Log all errors
  app.error(async (error) => {
    console.error('[slack] bolt error:', error);
  });
}

// ── Startup ────────────────────────────────────────────────────────────────

/**
 * Start the Slack Socket Mode listener. Returns a cleanup fn.
 * Call once at server startup; call the returned fn in onClose.
 */
export async function startSlackApp(): Promise<() => Promise<void>> {
  const app = getApp();
  if (!app) {
    console.info('[slack] Credentials not configured — Slack bot disabled.');
    return async () => {};
  }

  registerListeners(app);
  await app.start();
  console.info('[slack] Socket Mode app started.');

  return async () => {
    await app.stop();
    console.info('[slack] Socket Mode app stopped.');
  };
}
