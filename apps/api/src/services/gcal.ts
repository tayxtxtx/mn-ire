/**
 * Google Calendar Sync Service
 * ─────────────────────────────
 * OUTBOUND (MakeNashville Booking System → GCal):
 *   syncBookingToGCal  — creates / updates a GCal event for a booking.
 *   deleteGCalEvent    — deletes the GCal event when a booking is cancelled.
 *
 * INBOUND (GCal → MakeNashville Booking System):
 *   runIncrementalSync — polls each shop's GCal calendar using a stored
 *                        syncToken; ignores events with the UID_PREFIX to
 *                        prevent infinite update loops.
 *
 * Loop-prevention contract
 * ────────────────────────
 * Every MakeNashville Booking System event carries `extendedProperties.private.mnUid = UID_PREFIX + bookingId`.
 * The inbound watcher skips any event whose mnUid starts with UID_PREFIX.
 * No other guard is needed.
 */
import { google } from 'googleapis';
import type { PrismaClient, Booking, Resource, Shop, User } from '@makenashville/db';
import { UID_PREFIX } from '@makenashville/shared';
import { env } from '../env.js';

// ── OAuth2 client (singleton) ──────────────────────────────────────────────

function buildAuth() {
  const auth = new google.auth.OAuth2(
    env.GOOGLE_CALENDAR_CLIENT_ID,
    env.GOOGLE_CALENDAR_CLIENT_SECRET,
  );
  if (env.GOOGLE_CALENDAR_REFRESH_TOKEN) {
    auth.setCredentials({ refresh_token: env.GOOGLE_CALENDAR_REFRESH_TOKEN });
  }
  return auth;
}

let _auth: ReturnType<typeof buildAuth> | null = null;

function getAuth() {
  _auth ??= buildAuth();
  return _auth;
}

function getCalendar() {
  return google.calendar({ version: 'v3', auth: getAuth() });
}

// ── GCal enabled guard ─────────────────────────────────────────────────────

function isGCalConfigured(): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_CLIENT_ID &&
      env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      env.GOOGLE_CALENDAR_REFRESH_TOKEN,
  );
}

// ── Type helpers ───────────────────────────────────────────────────────────

type BookingWithRelations = Booking & {
  resource: Resource & { shop: Shop };
  user: User;
};

// ── Outbound: MakeNashville Booking System → GCal ────────────────────────────────────────────────

/**
 * Create or update the GCal event for a booking.
 * The event is stamped with `extendedProperties.private.mnUid` so the
 * inbound watcher can recognize and skip it.
 */
export async function syncBookingToGCal(
  prisma: PrismaClient,
  booking: BookingWithRelations,
): Promise<void> {
  if (!isGCalConfigured()) return;

  const calendarId = booking.resource.shop.gcalCalendarId;
  if (!calendarId) return;

  const calendar = getCalendar();
  const mnUid = `${UID_PREFIX}${booking.id}`;

  const eventBody = {
    summary: `[MakeNashville Booking System] ${booking.user.displayName} — ${booking.resource.name}`,
    description: `Booking ID: ${booking.id}\nMember: ${booking.user.email}\nResource: ${booking.resource.name} (${booking.resource.shop.name})`,
    start: { dateTime: booking.startsAt.toISOString() },
    end: { dateTime: booking.endsAt.toISOString() },
    extendedProperties: {
      private: { mnUid },
    },
  };

  try {
    if (booking.gcalEventId) {
      // Update existing event
      await calendar.events.update({
        calendarId,
        eventId: booking.gcalEventId,
        requestBody: eventBody,
      });
    } else {
      // Create new event and persist the GCal event ID
      const { data } = await calendar.events.insert({
        calendarId,
        requestBody: eventBody,
      });

      if (data.id) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { gcalEventId: data.id },
        });
      }
    }
  } catch (err) {
    console.error('[gcal] syncBookingToGCal error:', err);
  }
}

/**
 * Delete the GCal event when a booking is cancelled.
 */
export async function deleteGCalEvent(
  prisma: PrismaClient,
  booking: BookingWithRelations,
): Promise<void> {
  if (!isGCalConfigured() || !booking.gcalEventId) return;

  const calendarId = booking.resource.shop.gcalCalendarId;
  if (!calendarId) return;

  try {
    await getCalendar().events.delete({
      calendarId,
      eventId: booking.gcalEventId,
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { gcalEventId: null },
    });
  } catch (err) {
    console.error('[gcal] deleteGCalEvent error:', err);
  }
}

// ── Inbound: GCal → MakeNashville Booking System ────────────────────────────────────────────────

/**
 * Run an incremental sync for all shops that have a GCal calendar configured.
 *
 * Algorithm:
 *   1. For each shop, load the stored syncToken from CalendarSyncState.
 *   2. List events using the syncToken (or do a full sync if no token).
 *   3. For each returned event, skip any with mnUid starting with UID_PREFIX
 *      (those are MakeNashville Booking System-originated — loop prevention).
 *   4. External events create a "block" booking (userId = system sentinel).
 *   5. Persist the new syncToken.
 *
 * Call this on a schedule (e.g. every 60 seconds via setInterval at startup).
 */
export async function runIncrementalSync(prisma: PrismaClient): Promise<void> {
  if (!isGCalConfigured()) return;

  const shops = await prisma.shop.findMany({
    where: { gcalCalendarId: { not: null } },
    select: { id: true, gcalCalendarId: true, name: true },
  });

  await Promise.all(
    shops.map((shop) => syncCalendar(prisma, shop.gcalCalendarId!, shop.name)),
  );
}

async function syncCalendar(
  prisma: PrismaClient,
  calendarId: string,
  shopName: string,
): Promise<void> {
  const calendar = getCalendar();

  // Load stored syncToken
  const syncState = await prisma.calendarSyncState.findUnique({
    where: { calendarId },
  });

  try {
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    do {
      // Build params as `any` to work around the googleapis overloaded
      // signatures — the runtime call is correct; only the types differ.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: Record<string, any> = {
        calendarId,
        singleEvents: true,
        ...(syncState?.syncToken
          ? { syncToken: syncState.syncToken }
          : { timeMin: new Date().toISOString(), maxResults: 250 }),
        ...(pageToken ? { pageToken } : {}),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (calendar.events.list as any)(params) as
        { data: { items?: GCalEvent[]; nextSyncToken?: string; nextPageToken?: string } };

      const { data } = response;

      nextSyncToken = data.nextSyncToken ?? undefined;
      pageToken = data.nextPageToken ?? undefined;

      for (const event of data.items ?? []) {
        await processInboundEvent(prisma, calendarId, shopName, event);
      }
    } while (pageToken);

    // Persist the new syncToken
    if (nextSyncToken) {
      await prisma.calendarSyncState.upsert({
        where: { calendarId },
        update: { syncToken: nextSyncToken, lastSyncAt: new Date() },
        create: { calendarId, syncToken: nextSyncToken, lastSyncAt: new Date() },
      });
    }
  } catch (err: unknown) {
    // GCal returns 410 Gone when a syncToken is invalid — fall back to full sync
    if (isGoneError(err)) {
      console.warn(`[gcal] syncToken expired for calendar ${calendarId}, clearing.`);
      await prisma.calendarSyncState.upsert({
        where: { calendarId },
        update: { syncToken: null },
        create: { calendarId, syncToken: null },
      });
      return;
    }
    console.error(`[gcal] syncCalendar error for ${shopName}:`, err);
  }
}

function isGoneError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 410
  );
}

/** Minimal shape of a Google Calendar event item we care about. */
interface GCalEvent {
  id?: string | null;
  status?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  extendedProperties?: {
    private?: Record<string, string>;
  } | null;
}

async function processInboundEvent(
  prisma: PrismaClient,
  calendarId: string,
  _shopName: string,
  event: GCalEvent,
): Promise<void> {
  if (!event) return;

  const mnUid = event.extendedProperties?.private?.['mnUid'] as string | undefined;

  // ── Loop prevention: skip all MakeNashville Booking System-originated events ──────────────────
  if (mnUid?.startsWith(UID_PREFIX)) return;

  // Deleted/cancelled external events — find and cancel corresponding block booking
  if (event.status === 'cancelled') {
    if (event.id) {
      await prisma.booking.updateMany({
        where: { gcalEventId: event.id, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    }
    return;
  }

  const startTime = event.start?.dateTime ?? event.start?.date;
  const endTime = event.end?.dateTime ?? event.end?.date;
  if (!startTime || !endTime || !event.id) return;

  // Find the shop's first resource for this calendar to attach block bookings to.
  // A more sophisticated implementation would match by resource.
  const shop = await prisma.shop.findFirst({
    where: { gcalCalendarId: calendarId },
    include: { resources: { take: 1 } },
  });
  if (!shop || shop.resources.length === 0) return;

  // Upsert a block booking using gcalEventId as the external key
  const existing = await prisma.booking.findFirst({
    where: { gcalEventId: event.id },
  });

  if (existing) {
    await prisma.booking.update({
      where: { id: existing.id },
      data: {
        startsAt: new Date(startTime),
        endsAt: new Date(endTime),
      },
    });
  }
  // We do NOT auto-create block bookings for external events in this scaffold —
  // that would require a "system" user. This is a TODO for Phase 2 hardening.
}

// ── Sync scheduler ─────────────────────────────────────────────────────────

/**
 * Start a recurring GCal sync. Returns a cleanup function.
 * Call once at server startup; call the returned fn in onClose.
 */
export function startGCalSyncScheduler(
  prisma: PrismaClient,
  intervalMs = 60_000,
): () => void {
  if (!isGCalConfigured()) {
    console.info('[gcal] Credentials not configured — sync disabled.');
    return () => {};
  }

  // Run immediately, then on interval
  void runIncrementalSync(prisma).catch((e) =>
    console.error('[gcal] initial sync error:', e),
  );

  const timer = setInterval(() => {
    void runIncrementalSync(prisma).catch((e) =>
      console.error('[gcal] periodic sync error:', e),
    );
  }, intervalMs);

  return () => clearInterval(timer);
}
