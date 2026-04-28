/** Prefix for all MakeNashville Booking System-originated GCal event IDs. Used to detect and
 *  short-circuit bidirectional sync loops. Must match GOOGLE_CALENDAR_UID_PREFIX in .env. */
export const UID_PREFIX = 'mn-booking-' as const;

export const BOOKING_POLICY = {
  BOOKING_WINDOW_DAYS: 7,
  NO_SHOW_GRACE_MINUTES: 15,
  HIGH_DEMAND_COOLDOWN_HOURS: 4,
} as const;

export const CERT_SCOPES = [
  'woodshop_basic',
  'woodshop_advanced',
  'metal_lathe',
  'metal_mill',
  'cnc_basic',
  'cnc_advanced',
  'laser_certified',
  '3dprint_basic',
  'welding_mig',
  'welding_tig',
  'electronics_basic',
] as const;

export type CertScope = (typeof CERT_SCOPES)[number];

export const SHOP_SLUGS = [
  'woodshop',
  'metalshop',
  'cnc',
  'laser',
  'electronics',
  'welding',
  '3dprinting',
] as const;

export type ShopSlug = (typeof SHOP_SLUGS)[number];

export const GUILD_CHANNEL_MAP: Record<string, string> = {
  woodshop: '#woodshop-captains',
  metalshop: '#metal-captains',
  cnc: '#cnc-captains',
  laser: '#laser-captains',
  electronics: '#electronics-captains',
};

export const OIDC_SCOPES = [
  'openid',
  'profile',
  'email',
  ...CERT_SCOPES,
] as const;
