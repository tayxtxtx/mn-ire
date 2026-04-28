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
import type { BookingDto } from '@mn-ire/shared';
import { bookingStatusIntent } from '@mn-ire/shared';

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
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/bookings?status=CONFIRMED', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setBookings(data as BookingDto[]))
      .catch(() => setError('Could not load bookings.'))
      .finally(() => setLoading(false));
  }, []);

  const checkIn = async (id: string, resourceName: string) => {
    setCheckingIn(id);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${id}/checkin`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccess(`Checked in to ${resourceName}. Enjoy your session!`);
      setBookings((prev) => prev.filter((b) => b.id !== id));
    } catch {
      setError('Check-in failed. Please see the front desk.');
    } finally {
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
        {success && (
          <InlineNotification
            kind="success"
            title="Checked In"
            subtitle={success}
            hideCloseButton
            style={{ marginBottom: '1rem' }}
          />
        )}

        {loading ? (
          <SkeletonText paragraph lineCount={6} />
        ) : bookings.length === 0 && !success ? (
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
                    onClick={() => checkIn(b.id, b.resourceName)}
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
