import { useEffect, useRef, useState } from 'react';
import type { StatusPayload } from './types.js';
import ResourceCard from './ResourceCard.js';
import { MOCK_PAYLOAD } from './mockData.js';  // DELETE when test mode is no longer needed

const POLL_MS     = 30_000;
const RETRY_MS    = 10_000;
const DOWN_THRESH = 2;

const TEST_MODE = new URLSearchParams(window.location.search).has('test');

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span>
      {time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

export default function App() {
  const [payload,     setPayload]     = useState<StatusPayload | null>(TEST_MODE ? MOCK_PAYLOAD : null);
  const [apiDown,     setApiDown]     = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(TEST_MODE ? new Date() : null);
  const failCount = useRef(0);

  const fetchStatus = () => {
    if (TEST_MODE) return;
    fetch('/api/status')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<StatusPayload>;
      })
      .then((data) => {
        failCount.current = 0;
        setPayload(data);
        setApiDown(false);
        setLastUpdated(new Date());
      })
      .catch(() => {
        failCount.current += 1;
        if (failCount.current >= DOWN_THRESH) setApiDown(true);
      });
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, apiDown ? RETRY_MS : POLL_MS);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiDown]);

  const allResources = payload?.shops.flatMap((s) =>
    s.resources.map((r) => ({ ...r, shopName: s.name })),
  ) ?? [];

  const cols = allResources.length <= 4  ? 2
             : allResources.length <= 9  ? 3
             : 4;

  return (
    <div
      style={{
        width:           '100vw',
        height:          '100vh',
        background:      '#161616',
        color:           '#F4F4F4',
        display:         'flex',
        flexDirection:   'column',
        fontFamily:      "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
        overflow:        'hidden',
      }}
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          padding:        '0.75rem 1.5rem',
          borderBottom:   '1px solid #393939',
          flexShrink:     0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
          <span style={{ fontSize: '1.125rem', fontWeight: 600 }}>
            MakeNashville
          </span>
          <span style={{ fontSize: '0.875rem', color: '#8D8D8D' }}>
            Facility Status{TEST_MODE ? ' — TEST MODE' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem', color: '#8D8D8D' }}>
          {payload && (
            <span>{payload.activeSessions} active session{payload.activeSessions !== 1 ? 's' : ''}</span>
          )}
          {lastUpdated && (
            <span>Updated {lastUpdated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
          )}
          <span style={{ color: '#F4F4F4', fontVariantNumeric: 'tabular-nums' }}>
            <Clock />
          </span>
        </div>
      </div>

      {/* ── Resource grid ─────────────────────────────────────────────────── */}
      <div
        style={{
          flex:           1,
          padding:        '1rem',
          display:        'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap:            '1rem',
          alignContent:   'start',
          overflowY:      'auto',
        }}
      >
        {apiDown && !payload && (
          <div
            style={{
              gridColumn:     `1 / -1`,
              background:     '#FF6D00',
              color:          '#000000',
              borderRadius:   '0.25rem',
              padding:        'clamp(2rem, 5vw, 5rem)',
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              textAlign:      'center',
            }}
          >
            <div style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 700 }}>
              Booking System Down
            </div>
            <div style={{ fontSize: 'clamp(1rem, 2vw, 1.5rem)', marginTop: '0.75rem' }}>
              Please check with staff.
            </div>
          </div>
        )}

        {allResources.map((r) => (
          <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#8D8D8D', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {r.shopName}
            </div>
            <ResourceCard resource={r} apiDown={apiDown} />
          </div>
        ))}
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div
        style={{
          display:    'flex',
          gap:        '1.5rem',
          padding:    '0.625rem 1.5rem',
          borderTop:  '1px solid #393939',
          flexShrink: 0,
          fontSize:   '0.75rem',
          color:      '#8D8D8D',
        }}
      >
        {[
          { color: '#24A148', label: 'Available' },
          { color: '#F1C21B', label: 'Reserved soon' },
          { color: '#DA1E28', label: 'Occupied' },
          { color: '#FF6D00', label: 'Down / Maintenance' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
