export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED';

export type ResourceStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE';

/** Semantic color intent — used across web and kiosk UIs. */
export type StatusIntent = 'green' | 'blue' | 'red' | 'gray';

export function bookingStatusIntent(status: BookingStatus): StatusIntent {
  switch (status) {
    case 'CONFIRMED':
    case 'PENDING':
      return 'blue';
    case 'CHECKED_IN':
      return 'green';
    case 'COMPLETED':
      return 'gray';
    case 'NO_SHOW':
    case 'CANCELLED':
      return 'red';
  }
}

export function resourceStatusIntent(status: ResourceStatus): StatusIntent {
  switch (status) {
    case 'AVAILABLE':
      return 'green';
    case 'IN_USE':
      return 'blue';
    case 'MAINTENANCE':
      return 'red';
  }
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/** Shape of the claims extracted from an Authentik OIDC token. */
export interface AuthClaims {
  sub: string;
  email: string;
  name: string;
  certifications: string[];
}

/** Public shape of a booking returned from the API. */
export interface BookingDto {
  id: string;
  userId: string;
  resourceId: string;
  resourceName: string;
  shopName: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  checkedInAt: string | null;
}

/** Payload for creating a booking via POST /api/bookings. */
export interface CreateBookingBody {
  resourceId: string;
  startsAt: string;
  endsAt: string;
}

/** Live entry in the "Who's In" dashboard. */
export interface WhosInEntry {
  bookingId: string;
  userId: string;
  displayName: string;
  resourceId: string;
  resourceName: string;
  shopName: string;
  startsAt: string;
  endsAt: string;
  minutesRemaining: number;
}
