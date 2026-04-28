import { useEffect, useState } from 'react';
import {
  Grid,
  Column,
  Tile,
  Tag,
  SkeletonText,
  InlineNotification,
} from '@carbon/react';
import { Link } from 'react-router-dom';
import type { WhosInEntry } from '@makenashville/shared';
import { resourceStatusIntent } from '@makenashville/shared';

interface ShopSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  resources: {
    id: string;
    name: string;
    status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE';
  }[];
}

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  IN_USE: 'In Use',
  MAINTENANCE: 'Maintenance',
};

const INTENT_TO_CARBON: Record<string, 'green' | 'blue' | 'red' | 'gray'> = {
  green: 'green',
  blue: 'blue',
  red: 'red',
  gray: 'gray',
};

export default function FacilityOverview() {
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [whosIn, setWhosIn] = useState<WhosInEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/shops', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/whos-in', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([shopData, whosInData]) => {
        setShops(shopData as ShopSummary[]);
        setWhosIn(whosInData as WhosInEntry[]);
      })
      .catch(() => setError('Failed to load facility data.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Grid fullWidth>
      {/* ── F-pattern: full-width stat bar ── */}
      <Column lg={16} md={8} sm={4}>
        <div style={{ padding: '1rem 0 0.5rem' }}>
          <h1
            style={{
              fontFamily: 'IBM Plex Sans, sans-serif',
              fontSize: '1.5rem',
              fontWeight: 600,
              marginBottom: '0.25rem',
            }}
          >
            Facility Overview
          </h1>
          <p style={{ color: 'var(--cds-text-secondary)' }}>
            {whosIn.length} active session{whosIn.length !== 1 ? 's' : ''} in progress
          </p>
        </div>
      </Column>

      {error && (
        <Column lg={16} md={8} sm={4}>
          <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />
        </Column>
      )}

      {/* ── Left column: Who's In ── */}
      <Column lg={5} md={3} sm={4}>
        <Tile style={{ minHeight: '60vh' }}>
          <h2
            style={{
              fontFamily: 'IBM Plex Sans, sans-serif',
              fontSize: '1rem',
              fontWeight: 600,
              marginBottom: '1rem',
            }}
          >
            Who's In Now
          </h2>
          {loading ? (
            <SkeletonText paragraph lineCount={6} />
          ) : whosIn.length === 0 ? (
            <p style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
              No active sessions.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {whosIn.map((entry) => (
                <li
                  key={entry.bookingId}
                  style={{
                    borderBottom: '1px solid var(--cds-border-subtle)',
                    padding: '0.75rem 0',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    {entry.displayName}
                  </div>
                  <div style={{ color: 'var(--cds-text-secondary)', fontSize: '0.75rem' }}>
                    {entry.resourceName} — {entry.minutesRemaining} min remaining
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </Column>

      {/* ── Main grid: shop cards ── */}
      <Column lg={11} md={5} sm={4}>
        <Grid narrow>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Column key={i} lg={8} md={4} sm={4} style={{ marginBottom: '1rem' }}>
                  <Tile>
                    <SkeletonText paragraph lineCount={4} />
                  </Tile>
                </Column>
              ))
            : shops.map((shop) => (
                <Column
                  key={shop.id}
                  lg={8}
                  md={4}
                  sm={4}
                  style={{ marginBottom: '1rem' }}
                >
                  <Tile>
                    <Link
                      to={`/shop/${shop.slug}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <h3
                        style={{
                          fontFamily: 'IBM Plex Sans, sans-serif',
                          fontSize: '1rem',
                          fontWeight: 600,
                          marginBottom: '0.5rem',
                        }}
                      >
                        {shop.name}
                      </h3>
                    </Link>
                    {shop.description && (
                      <p
                        style={{
                          color: 'var(--cds-text-secondary)',
                          fontSize: '0.75rem',
                          marginBottom: '0.75rem',
                        }}
                      >
                        {shop.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {shop.resources.map((r) => (
                        <Tag
                          key={r.id}
                          type={INTENT_TO_CARBON[resourceStatusIntent(r.status)]}
                          size="sm"
                        >
                          {r.name}: {STATUS_LABEL[r.status]}
                        </Tag>
                      ))}
                    </div>
                  </Tile>
                </Column>
              ))}
        </Grid>
      </Column>
    </Grid>
  );
}
