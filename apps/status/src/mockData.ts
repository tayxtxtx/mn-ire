/**
 * TEST MODE MOCK DATA
 * ───────────────────
 * Activated by appending ?test to the status URL (e.g. http://localhost:5175?test).
 * Demonstrates all four card states simultaneously so you can verify the display
 * without needing a live API or database.
 *
 * DELETE THIS FILE (and the import in App.tsx) when you no longer need it.
 */
import type { StatusPayload } from './types.js';

const now = new Date();
const inFifteen = new Date(now.getTime() + 15 * 60_000).toISOString();
const inFortyFive = new Date(now.getTime() + 45 * 60_000).toISOString();
const endsInTwenty = new Date(now.getTime() + 20 * 60_000).toISOString();

export const MOCK_PAYLOAD: StatusPayload = {
  asOf:           now.toISOString(),
  activeSessions: 2,
  shops: [
    {
      id:   'mock-woodshop',
      name: 'Wood Shop',
      slug: 'woodshop',
      resources: [
        // ── Green: Available ────────────────────────────────────────────
        {
          id:               'mock-r1',
          name:             'Table Saw',
          status:           'AVAILABLE',
          isHighDemand:     false,
          activeSession:    null,
          upcomingBookings: [],
        },
        // ── Yellow: Reservation coming up ───────────────────────────────
        {
          id:               'mock-r2',
          name:             'Band Saw',
          status:           'AVAILABLE',
          isHighDemand:     false,
          activeSession:    null,
          upcomingBookings: [
            { memberName: 'Alice Chen',  startsAt: inFifteen },
            { memberName: 'Bob Martinez', startsAt: inFortyFive },
          ],
        },
      ],
    },
    {
      id:   'mock-cnc',
      name: 'CNC / Laser',
      slug: 'cnc',
      resources: [
        // ── Red: Occupied ───────────────────────────────────────────────
        {
          id:               'mock-r3',
          name:             'CNC Router',
          status:           'IN_USE',
          isHighDemand:     true,
          activeSession: {
            memberName:       'Jordan Lee',
            endsAt:           endsInTwenty,
            minutesRemaining: 20,
          },
          upcomingBookings: [],
        },
        // ── Orange: Maintenance ─────────────────────────────────────────
        {
          id:               'mock-r4',
          name:             'Laser Cutter',
          status:           'MAINTENANCE',
          isHighDemand:     true,
          activeSession:    null,
          upcomingBookings: [],
        },
      ],
    },
  ],
};
