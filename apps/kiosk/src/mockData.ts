/**
 * TEST MODE — Kiosk Mock Data
 * ────────────────────────────
 * Activated by appending ?test to any URL (e.g. http://localhost:5174?test).
 *
 * TO REMOVE: delete this file and every import of it.
 */
import type { BookingDto, WhosInEntry } from '@makenashville/shared';

export const TEST_MODE = new URLSearchParams(window.location.search).has('test');

const now = new Date();
const _m = (n: number) => new Date(now.getTime() + n * 60_000).toISOString();

// ── Confirmed bookings for CheckIn page ──────────────────────────────────────
export const MOCK_CONFIRMED_BOOKINGS: BookingDto[] = [
  { id: 'bk-k1', userId: 'u-demo', resourceId: 'r-tablesw', resourceName: 'Table Saw',    shopName: 'Wood Shop',   startsAt: _m(5),  endsAt: _m(125), status: 'CONFIRMED', checkedInAt: null },
  { id: 'bk-k2', userId: 'u-demo', resourceId: 'r-laser',   resourceName: 'Laser Cutter', shopName: 'CNC / Laser', startsAt: _m(60), endsAt: _m(180), status: 'CONFIRMED', checkedInAt: null },
];

// ── Active sessions for Who's In page ───────────────────────────────────────
export const MOCK_WHOS_IN: WhosInEntry[] = [
  { bookingId: 'bk-001', userId: 'u-001', displayName: 'Alice Chen',    resourceId: 'r-bandsaw', resourceName: 'Band Saw',   shopName: 'Wood Shop',   startsAt: _m(-30), endsAt: _m(30),  minutesRemaining: 30  },
  { bookingId: 'bk-002', userId: 'u-002', displayName: 'Jordan Lee',    resourceId: 'r-cnc',     resourceName: 'CNC Router', shopName: 'CNC / Laser', startsAt: _m(-60), endsAt: _m(90),  minutesRemaining: 90  },
  { bookingId: 'bk-003', userId: 'u-003', displayName: 'Sam Okonkwo',  resourceId: 'r-tig',     resourceName: 'TIG Welder', shopName: 'Metal Shop',  startsAt: _m(-15), endsAt: _m(105), minutesRemaining: 105 },
];

// ── Kiosk resources for the tool selector ────────────────────────────────────
export const MOCK_RESOURCES = [
  { id: 'r-tablesw', name: 'Table Saw',         shop: { name: 'Wood Shop'      } },
  { id: 'r-bandsaw', name: 'Band Saw',           shop: { name: 'Wood Shop'      } },
  { id: 'r-mig',     name: 'MIG Welder',         shop: { name: 'Metal Shop'     } },
  { id: 'r-tig',     name: 'TIG Welder',         shop: { name: 'Metal Shop'     } },
  { id: 'r-cnc',     name: 'CNC Router',         shop: { name: 'CNC / Laser'    } },
  { id: 'r-laser',   name: 'Laser Cutter',       shop: { name: 'CNC / Laser'    } },
  { id: 'r-solder',  name: 'Soldering Station',  shop: { name: 'Electronics Lab'} },
  { id: 'r-3dprint', name: '3D Printer',         shop: { name: 'Electronics Lab'} },
];
