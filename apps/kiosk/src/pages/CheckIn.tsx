import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid,
  Column,
  Tile,
  Button,
  Tag,
  SkeletonText,
  InlineNotification,
} from '@carbon/react';
import type { BookingDto } from '@makenashville/shared';
import { TEST_MODE, MOCK_CONFIRMED_BOOKINGS } from '../mockData.js';  // DELETE with mockData.ts
import { bookingStatusIntent } from '@makenashville/shared';
import type { SessionState } from './ActiveSession.js';

const INTENT_TO_CARBON: Record<string, 'green' | 'blue' | 'red' | 'gray'> = {
  green: 'green',
  blue: 'blue',
  red: 'red',
  gray: 'gray',
};

export default function CheckIn() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  useEffect(() => {
    if (TEST_MODE) {
      setBookings(MOCK_CONFIRMED_BOOKINGS);
      setLoading(false);
      return;
    }
    fetch('/api/bookings?status=CONFIRMED', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setBookings(data as BookingDto[]))
      .catch(() => setError('Could not load bookings.'))
      .finally(() => setLoading(false));
  }, []);

  const checkIn = async (b: BookingDto) => {
    setCheckingIn(b.id);
    setError(null);
    if (TEST_MODE) {
      await new Promise((r) => setTimeout(r, 600));
      const sessionState: SessionState = {
        type:         'booking',
        id:           b.id,
        name:         b.resourceName,
        resourceName: b.resourceName,
        endsAt:       b.endsAt,
      };
      navigate('/session', { state: sessionState });
      return;
    }
    try {
      const res = await fetch(`/api/bookings/${b.id}/checkin`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sessionState: SessionState = {
        type:         'booking',
        id:           b.id,
        name:         b.resourceName,
        resourceName: b.resourceName,
        endsAt:       b.endsAt,
      };
      navigate('/session', { state: sessionState });
    } catch {
      setError('Check-in failed. Please see the front desk.');
      setCheckingIn(null);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <Grid fullWidth style={{ minHeight: '100vh', alignContent: 'start', padding: '2rem 0' }}>
      <Column lg={{ span: 10, offset: 3 }} md={8} sm={4}>
        <h1
          style={{
            fontFamily: 'IBM Plex Sans, sans-serif',
            fontSize: '1.75rem',
            fontWeight: 700,
            marginBottom: '0.5rem',
          }}
        >
          Your Upcoming Bookings
        </h1>
        <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1.5rem' }}>
          Tap a session to check in.
        </p>

        {error && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={error}
            hideCloseButton
            style={{ marginBottom: '1rem' }}
          />
        )}
        {loading ? (
          <SkeletonText paragraph lineCount={6} />
        ) : bookings.length === 0 ? (
          <Tile style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>
              No upcoming confirmed bookings found.
            </p>
            <Button kind="secondary" size="xl" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </Tile>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {bookings.map((b) => (
              <Tile key={b.id}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{b.resourceName}</div>
                    <div style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
                      {b.shopName} · {fmt(b.startsAt)} – {fmt(b.endsAt)}
                    </div>
                    <Tag
                      type={INTENT_TO_CARBON[bookingStatusIntent(b.status)]}
                      size="sm"
                      style={{ marginTop: '0.25rem' }}
                    >
                      {b.status}
                    </Tag>
                  </div>
                  <Button
                    size="xl"
                    onClick={() => checkIn(b)}
                    disabled={checkingIn === b.id}
                    style={{ minWidth: '160px' }}
                  >
                    {checkingIn === b.id ? 'Checking in…' : 'Check In'}
                  </Button>
                </div>
              </Tile>
            ))}
          </div>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'right' }}>
          <Button kind="ghost" size="lg" onClick={() => navigate('/')}>
            Done / Sign Out
          </Button>
        </div>
      </Column>
    </Grid>
  );
}
