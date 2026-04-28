/**
 * TEST MODE — Web App Mock Data
 * ──────────────────────────────
 * Activated by appending ?test to any URL (e.g. http://localhost:5173?test).
 * All pages check TEST_MODE and use this data instead of hitting the API.
 * React Router keeps TEST_MODE true for the lifetime of the session because
 * it's set once at module load; only a hard refresh loses it.
 *
 * TO REMOVE: delete this file and every import of it.
 */
import type { BookingDto, BookingStatus, WhosInEntry } from '@makenashville/shared';

export const TEST_MODE = new URLSearchParams(window.location.search).has('test');

// ── Authenticated user ────────────────────────────────────────────────────────
export const MOCK_USER = {
  sub:            'mock-sub-001',
  email:          'demo@makenashville.org',
  name:           'Demo User',
  certifications: ['woodshop_basic', 'laser_certified'],
  isAdmin:        true,
} as const;

// ── Shops — used by FacilityOverview (summary) ───────────────────────────────
export const MOCK_SHOPS = [
  {
    id:          'shop-woodshop',
    name:        'Wood Shop',
    slug:        'woodshop',
    description: 'Table saw, band saw, lathe, planer, and jointer.',
    resources: [
      { id: 'r-tablesw', name: 'Table Saw',  status: 'AVAILABLE'   as const },
      { id: 'r-bandsaw', name: 'Band Saw',   status: 'IN_USE'      as const },
      { id: 'r-lathe',   name: 'Wood Lathe', status: 'MAINTENANCE' as const },
    ],
  },
  {
    id:          'shop-metalshop',
    name:        'Metal Shop',
    slug:        'metalshop',
    description: 'MIG/TIG welding, metal lathe, and mill.',
    resources: [
      { id: 'r-mig', name: 'MIG Welder', status: 'AVAILABLE' as const },
      { id: 'r-tig', name: 'TIG Welder', status: 'IN_USE'    as const },
    ],
  },
  {
    id:          'shop-cnc',
    name:        'CNC / Laser',
    slug:        'cnc',
    description: 'CNC router and 60W CO₂ laser cutter.',
    resources: [
      { id: 'r-cnc',   name: 'CNC Router',   status: 'IN_USE'    as const },
      { id: 'r-laser', name: 'Laser Cutter', status: 'AVAILABLE' as const },
    ],
  },
  {
    id:          'shop-electronics',
    name:        'Electronics Lab',
    slug:        'electronics',
    description: 'Oscilloscopes, soldering stations, and 3D printers.',
    resources: [
      { id: 'r-solder',  name: 'Soldering Station', status: 'AVAILABLE' as const },
      { id: 'r-3dprint', name: '3D Printer',        status: 'AVAILABLE' as const },
    ],
  },
];

// ── Shop detail — used by ShopDetail (full resource info) ────────────────────
export const MOCK_SHOP_DETAILS: Record<string, {
  id: string; name: string; slug: string; description: string | null;
  resources: {
    id: string; name: string; description: string | null;
    status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE';
    requiredCertifications: string[];
    isHighDemand: boolean;
    cooldownHours: number;
  }[];
}> = {
  woodshop: {
    id: 'shop-woodshop', name: 'Wood Shop', slug: 'woodshop',
    description: 'Table saw, band saw, lathe, planer, and jointer.',
    resources: [
      { id: 'r-tablesw', name: 'Table Saw',  description: 'SawStop contractor saw with dado insert.',    status: 'AVAILABLE',   requiredCertifications: ['woodshop_basic'],    isHighDemand: false, cooldownHours: 0 },
      { id: 'r-bandsaw', name: 'Band Saw',   description: '14" Jet band saw.',                           status: 'IN_USE',      requiredCertifications: ['woodshop_basic'],    isHighDemand: false, cooldownHours: 0 },
      { id: 'r-lathe',   name: 'Wood Lathe', description: 'Variable speed wood lathe — out for service.',status: 'MAINTENANCE', requiredCertifications: ['woodshop_advanced'], isHighDemand: false, cooldownHours: 0 },
    ],
  },
  metalshop: {
    id: 'shop-metalshop', name: 'Metal Shop', slug: 'metalshop',
    description: 'MIG/TIG welding, metal lathe, and mill.',
    resources: [
      { id: 'r-mig', name: 'MIG Welder', description: 'Lincoln Electric MIG welder.', status: 'AVAILABLE', requiredCertifications: ['welding_mig'], isHighDemand: false, cooldownHours: 0 },
      { id: 'r-tig', name: 'TIG Welder', description: 'Miller TIG welder.',           status: 'IN_USE',    requiredCertifications: ['welding_tig'], isHighDemand: false, cooldownHours: 0 },
    ],
  },
  cnc: {
    id: 'shop-cnc', name: 'CNC / Laser', slug: 'cnc',
    description: 'CNC router and 60W CO₂ laser cutter.',
    resources: [
      { id: 'r-cnc',   name: 'CNC Router',   description: '4×4 ShopBot CNC router.',        status: 'IN_USE',    requiredCertifications: ['cnc_basic'],        isHighDemand: true, cooldownHours: 4 },
      { id: 'r-laser', name: 'Laser Cutter', description: '60W Epilog Helix laser cutter.', status: 'AVAILABLE', requiredCertifications: ['laser_certified'],   isHighDemand: true, cooldownHours: 4 },
    ],
  },
  electronics: {
    id: 'shop-electronics', name: 'Electronics Lab', slug: 'electronics',
    description: 'Oscilloscopes, soldering stations, and 3D printers.',
    resources: [
      { id: 'r-solder',  name: 'Soldering Station', description: 'Hakko FX-888D station.',    status: 'AVAILABLE', requiredCertifications: ['electronics_basic'], isHighDemand: false, cooldownHours: 0 },
      { id: 'r-3dprint', name: '3D Printer',        description: 'Prusa MK4 — 0.4mm nozzle.', status: 'AVAILABLE', requiredCertifications: ['3dprint_basic'],    isHighDemand: false, cooldownHours: 0 },
    ],
  },
};

// ── Who's In — used by FacilityOverview sidebar ──────────────────────────────
const now = new Date();
const _30m = (n: number) => new Date(now.getTime() + n * 60_000).toISOString();

export const MOCK_WHOS_IN: WhosInEntry[] = [
  { bookingId: 'bk-001', userId: 'u-001', displayName: 'Alice Chen',   resourceId: 'r-bandsaw', resourceName: 'Band Saw',   shopName: 'Wood Shop',   startsAt: _30m(-30), endsAt: _30m(30),  minutesRemaining: 30 },
  { bookingId: 'bk-002', userId: 'u-002', displayName: 'Jordan Lee',   resourceId: 'r-cnc',     resourceName: 'CNC Router', shopName: 'CNC / Laser', startsAt: _30m(-60), endsAt: _30m(90),  minutesRemaining: 90 },
  { bookingId: 'bk-003', userId: 'u-003', displayName: 'Sam Okonkwo', resourceId: 'r-tig',     resourceName: 'TIG Welder', shopName: 'Metal Shop',  startsAt: _30m(-15), endsAt: _30m(105), minutesRemaining: 105 },
];

// ── My Bookings — used by MyBookings page ─────────────────────────────────────
export const MOCK_BOOKINGS: BookingDto[] = [
  { id: 'bk-001', userId: 'u-demo', resourceId: 'r-tablesw', resourceName: 'Table Saw',       shopName: 'Wood Shop',   startsAt: _30m(120),  endsAt: _30m(240),   status: 'CONFIRMED',  checkedInAt: null },
  { id: 'bk-004', userId: 'u-demo', resourceId: 'r-laser',   resourceName: 'Laser Cutter',    shopName: 'CNC / Laser', startsAt: _30m(1440), endsAt: _30m(1560),  status: 'PENDING',    checkedInAt: null },
  { id: 'bk-005', userId: 'u-demo', resourceId: 'r-solder',  resourceName: 'Soldering Station',shopName: 'Electronics Lab', startsAt: _30m(-120), endsAt: _30m(-60), status: 'CHECKED_IN', checkedInAt: _30m(-120) },
  { id: 'bk-006', userId: 'u-demo', resourceId: 'r-cnc',     resourceName: 'CNC Router',      shopName: 'CNC / Laser', startsAt: _30m(-240), endsAt: _30m(-180),  status: 'COMPLETED',  checkedInAt: _30m(-240) },
  { id: 'bk-007', userId: 'u-demo', resourceId: 'r-mig',     resourceName: 'MIG Welder',      shopName: 'Metal Shop',  startsAt: _30m(-360), endsAt: _30m(-300),  status: 'NO_SHOW',    checkedInAt: null },
];

// ── Admin bookings — used by AdminBookings page ───────────────────────────────
type AdminBooking = {
  id: string; startsAt: string; endsAt: string; status: BookingStatus;
  checkedInAt: string | null; cancelledAt: string | null;
  user:     { id: string; displayName: string; email: string } | null;
  resource: { id: string; name: string; shop: { name: string } | null } | null;
};

export const MOCK_ADMIN_BOOKINGS: { data: AdminBooking[]; meta: { total: number } } = {
  data: [
    { id: 'bk-001', startsAt: _30m(120),  endsAt: _30m(240),   status: 'CONFIRMED',  checkedInAt: null,        cancelledAt: null, user: { id: 'u-demo', displayName: 'Demo User',    email: 'demo@makenashville.org' }, resource: { id: 'r-tablesw', name: 'Table Saw',         shop: { name: 'Wood Shop'      } } },
    { id: 'bk-002', startsAt: _30m(-30),  endsAt: _30m(30),    status: 'CHECKED_IN', checkedInAt: _30m(-30),   cancelledAt: null, user: { id: 'u-001',  displayName: 'Alice Chen',   email: 'alice@example.com'      }, resource: { id: 'r-bandsaw', name: 'Band Saw',           shop: { name: 'Wood Shop'      } } },
    { id: 'bk-003', startsAt: _30m(-60),  endsAt: _30m(90),    status: 'CHECKED_IN', checkedInAt: _30m(-60),   cancelledAt: null, user: { id: 'u-002',  displayName: 'Jordan Lee',   email: 'jordan@example.com'     }, resource: { id: 'r-cnc',     name: 'CNC Router',         shop: { name: 'CNC / Laser'    } } },
    { id: 'bk-004', startsAt: _30m(1440), endsAt: _30m(1560),  status: 'PENDING',    checkedInAt: null,        cancelledAt: null, user: { id: 'u-demo', displayName: 'Demo User',    email: 'demo@makenashville.org' }, resource: { id: 'r-laser',   name: 'Laser Cutter',       shop: { name: 'CNC / Laser'    } } },
    { id: 'bk-005', startsAt: _30m(-120), endsAt: _30m(-60),   status: 'COMPLETED',  checkedInAt: _30m(-120),  cancelledAt: null, user: { id: 'u-003',  displayName: 'Sam Okonkwo', email: 'sam@example.com'        }, resource: { id: 'r-tig',     name: 'TIG Welder',         shop: { name: 'Metal Shop'     } } },
    { id: 'bk-006', startsAt: _30m(-360), endsAt: _30m(-300),  status: 'NO_SHOW',    checkedInAt: null,        cancelledAt: null, user: { id: 'u-demo', displayName: 'Demo User',    email: 'demo@makenashville.org' }, resource: { id: 'r-cnc',     name: 'CNC Router',         shop: { name: 'CNC / Laser'    } } },
    { id: 'bk-007', startsAt: _30m(-480), endsAt: _30m(-420),  status: 'CANCELLED',  checkedInAt: null,        cancelledAt: _30m(-500), user: { id: 'u-001', displayName: 'Alice Chen', email: 'alice@example.com'    }, resource: { id: 'r-mig',     name: 'MIG Welder',         shop: { name: 'Metal Shop'     } } },
  ],
  meta: { total: 7 },
};
