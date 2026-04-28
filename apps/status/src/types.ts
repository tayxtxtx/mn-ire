export interface ActiveSession {
  memberName:       string;
  endsAt:           string;
  minutesRemaining: number;
}

export interface UpcomingBooking {
  memberName: string;
  startsAt:   string;
}

export interface ResourceStatus {
  id:               string;
  name:             string;
  status:           'AVAILABLE' | 'IN_USE' | 'MAINTENANCE';
  isHighDemand:     boolean;
  activeSession:    ActiveSession | null;
  upcomingBookings: UpcomingBooking[];
}

export interface ShopStatus {
  id:        string;
  name:      string;
  slug:      string;
  resources: ResourceStatus[];
}

export interface StatusPayload {
  asOf:           string;
  activeSessions: number;
  shops:          ShopStatus[];
}

/** The four display states for a resource card. */
export type CardState = 'available' | 'upcoming' | 'occupied' | 'down';

export interface CardConfig {
  state:      CardState;
  background: string;
  foreground: string;
  headline:   string;
  subline:    string | null;
}

export function deriveCardConfig(
  resource: ResourceStatus,
  apiDown: boolean,
): CardConfig {
  if (apiDown) {
    return {
      state:      'down',
      background: '#FF6D00',   // orange
      foreground: '#000000',
      headline:   'Booking System Down',
      subline:    'Please check with staff.',
    };
  }

  if (resource.status === 'MAINTENANCE') {
    return {
      state:      'down',
      background: '#FF6D00',
      foreground: '#000000',
      headline:   'Under Maintenance',
      subline:    null,
    };
  }

  if (resource.activeSession) {
    const { memberName, minutesRemaining } = resource.activeSession;
    return {
      state:      'occupied',
      background: '#DA1E28',   // red
      foreground: '#FFFFFF',
      headline:   `Occupied by ${memberName}`,
      subline:    `${minutesRemaining} min remaining`,
    };
  }

  if (resource.upcomingBookings.length > 0) {
    const next = resource.upcomingBookings[0]!;
    const minsUntil = Math.max(
      0,
      Math.floor((new Date(next.startsAt).getTime() - Date.now()) / 60_000),
    );
    return {
      state:      'upcoming',
      background: '#F1C21B',   // yellow
      foreground: '#000000',
      headline:   `Reserved for ${next.memberName}`,
      subline:    `Starts in ${minsUntil} min`,
    };
  }

  return {
    state:      'available',
    background: '#24A148',   // green
    foreground: '#FFFFFF',
    headline:   'Available',
    subline:    null,
  };
}
