import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Grid, Column, Tile, Button, InlineNotification } from '@carbon/react';
import { TEST_MODE } from '../mockData.js';  // DELETE with mockData.ts

export interface SessionState {
  type:         'booking' | 'walkin';
  id:           string;
  name:         string;         // first name of the person
  resourceName: string | null;
  endsAt:       string;         // ISO
}

const EXTEND_MINUTES = 30;

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h   = Math.floor(totalSec / 3600);
  const m   = Math.floor((totalSec % 3600) / 60);
  const s   = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ActiveSession() {
  const location = useLocation();
  const navigate  = useNavigate();
  const state     = location.state as SessionState | null;

  const [endsAt,    setEndsAt]    = useState<Date>(state ? new Date(state.endsAt) : new Date());
  const [remaining, setRemaining] = useState(0);
  const [extending, setExtending] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Redirect to home if no session state (e.g. hard refresh)
  useEffect(() => {
    if (!state) navigate('/', { replace: true });
  }, [state, navigate]);

  // Live countdown tick
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, endsAt.getTime() - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (!state) return null;

  const handleExtend = async () => {
    setExtending(true);
    setError(null);

    if (TEST_MODE) {
      await new Promise((r) => setTimeout(r, 400));
      setEndsAt((prev) => new Date(prev.getTime() + EXTEND_MINUTES * 60_000));
      setExtending(false);
      return;
    }

    try {
      const url = state.type === 'booking'
        ? `/api/kiosk/bookings/${state.id}/extend`
        : `/api/walkin/${state.id}/extend`;

      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ minutes: EXTEND_MINUTES }),
      });

      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setError(err.message ?? 'Could not extend session.');
        return;
      }
      const data = await res.json() as { endsAt: string };
      setEndsAt(new Date(data.endsAt));
    } catch {
      setError('Network error. Please see the front desk.');
    } finally {
      setExtending(false);
    }
  };

  const handleDone = async () => {
    setCompleting(true);
    setError(null);

    if (TEST_MODE) {
      await new Promise((r) => setTimeout(r, 400));
      navigate('/', { replace: true });
      return;
    }

    try {
      const url = state.type === 'booking'
        ? `/api/kiosk/bookings/${state.id}/complete`
        : `/api/walkin/${state.id}/signout`;

      const res = await fetch(url, { method: 'POST' });

      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setError(err.message ?? 'Could not complete session.');
        setCompleting(false);
        return;
      }
      navigate('/', { replace: true });
    } catch {
      setError('Network error. Please see the front desk.');
      setCompleting(false);
    }
  };

  const isOvertime = remaining === 0;

  return (
    <Grid fullWidth style={{ minHeight: '100vh', alignContent: 'center' }}>
      <Column
        lg={{ span: 8, offset: 4 }}
        md={{ span: 6, offset: 1 }}
        sm={4}
        style={{ textAlign: 'center' }}
      >
        <Tile style={{ padding: 'clamp(2rem, 5vw, 4rem)' }}>
          {/* Greeting */}
          <div style={{ fontSize: 'clamp(1rem, 2vw, 1.25rem)', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
            Active Session
          </div>
          <div style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 700, marginBottom: '0.25rem' }}>
            {state.name}
          </div>
          {state.resourceName && (
            <div style={{ fontSize: 'clamp(1rem, 2vw, 1.25rem)', color: 'var(--cds-text-secondary)', marginBottom: '1.5rem' }}>
              {state.resourceName}
            </div>
          )}

          {/* Countdown */}
          <div
            style={{
              fontSize:    'clamp(3rem, 8vw, 6rem)',
              fontWeight:  700,
              fontVariantNumeric: 'tabular-nums',
              fontFamily:  'IBM Plex Mono, monospace',
              color:       isOvertime ? 'var(--cds-support-warning)' : 'var(--cds-text-primary)',
              marginBottom: '0.5rem',
              lineHeight:  1,
            }}
          >
            {fmtCountdown(remaining)}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '2rem' }}>
            {isOvertime
              ? 'Time is up — please wrap up and press Done'
              : `ends at ${endsAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
          </div>

          {error && (
            <InlineNotification
              kind="error" title="Error" subtitle={error} hideCloseButton
              style={{ marginBottom: '1rem', textAlign: 'left' }}
            />
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              kind="secondary"
              size="xl"
              onClick={handleExtend}
              disabled={extending || completing}
              style={{ minWidth: '180px' }}
            >
              {extending ? 'Extending…' : `+${EXTEND_MINUTES} min`}
            </Button>
            <Button
              kind="primary"
              size="xl"
              onClick={handleDone}
              disabled={extending || completing}
              style={{ minWidth: '180px' }}
            >
              {completing ? 'Finishing…' : 'Done'}
            </Button>
          </div>
        </Tile>
      </Column>
    </Grid>
  );
}
