import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, Column, Tile, Button, SkeletonText, Tag } from '@carbon/react';
import type { WhosInEntry } from '@makenashville/shared';
import { TEST_MODE, MOCK_WHOS_IN } from '../mockData.js';  // DELETE with mockData.ts

export default function WhosIn() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<WhosInEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (TEST_MODE) {
      setEntries(MOCK_WHOS_IN);
      setLoading(false);
      return;
    }
    fetch('/api/admin/whos-in', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setEntries(data as WhosInEntry[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Refresh every 30 seconds — kiosk is always on
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <Grid fullWidth style={{ minHeight: '100vh', alignContent: 'start', padding: '2rem 0' }}>
      <Column lg={{ span: 12, offset: 2 }} md={8} sm={4}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <h1
            style={{
              fontFamily: 'IBM Plex Sans, sans-serif',
              fontSize: '1.75rem',
              fontWeight: 700,
            }}
          >
            Who's In Right Now
          </h1>
          <Button kind="ghost" size="lg" onClick={() => navigate('/')}>
            Back
          </Button>
        </div>

        {loading ? (
          <SkeletonText paragraph lineCount={8} />
        ) : entries.length === 0 ? (
          <Tile style={{ textAlign: 'center', padding: '2.5rem' }}>
            <p style={{ fontSize: '1.125rem', color: 'var(--cds-text-secondary)' }}>
              No active sessions at the moment.
            </p>
          </Tile>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {entries.map((e) => (
              <Tile key={e.bookingId}>
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
                    <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{e.displayName}</div>
                    <div style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
                      {e.resourceName} — {e.shopName}
                    </div>
                  </div>
                  <Tag type="blue" size="md">
                    {e.minutesRemaining} min remaining
                  </Tag>
                </div>
              </Tile>
            ))}
          </div>
        )}
      </Column>
    </Grid>
  );
}
