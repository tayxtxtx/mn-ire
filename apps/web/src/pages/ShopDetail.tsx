import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Grid,
  Column,
  Tile,
  Tag,
  Button,
  SkeletonText,
  Breadcrumb,
  BreadcrumbItem,
  InlineNotification,
} from '@carbon/react';
import { resourceStatusIntent } from '@mn-ire/shared';

interface ResourceDetail {
  id: string;
  name: string;
  description: string | null;
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE';
  requiredCertifications: string[];
  isHighDemand: boolean;
  cooldownHours: number;
}

interface ShopDetailData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  resources: ResourceDetail[];
}

const INTENT_TO_CARBON: Record<string, 'green' | 'blue' | 'red' | 'gray'> = {
  green: 'green',
  blue: 'blue',
  red: 'red',
  gray: 'gray',
};

export default function ShopDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [shop, setShop] = useState<ShopDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/shops/${slug}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setShop(data as ShopDetailData))
      .catch(() => setError('Failed to load shop data.'))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <Grid fullWidth>
      <Column lg={16} md={8} sm={4} style={{ paddingTop: '1rem' }}>
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/">Facility Overview</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>{shop?.name ?? slug}</BreadcrumbItem>
        </Breadcrumb>
      </Column>

      {error && (
        <Column lg={16} md={8} sm={4}>
          <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />
        </Column>
      )}

      {loading ? (
        <Column lg={16} md={8} sm={4}>
          <SkeletonText paragraph lineCount={8} />
        </Column>
      ) : shop ? (
        <>
          <Column lg={16} md={8} sm={4} style={{ margin: '1rem 0 0.5rem' }}>
            <h1
              style={{
                fontFamily: 'IBM Plex Sans, sans-serif',
                fontSize: '1.5rem',
                fontWeight: 600,
              }}
            >
              {shop.name}
            </h1>
            {shop.description && (
              <p style={{ color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
                {shop.description}
              </p>
            )}
          </Column>

          {shop.resources.map((resource) => (
            <Column key={resource.id} lg={8} md={4} sm={4} style={{ marginBottom: '1rem' }}>
              <Tile>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.5rem',
                  }}
                >
                  <h3
                    style={{
                      fontFamily: 'IBM Plex Sans, sans-serif',
                      fontSize: '1rem',
                      fontWeight: 600,
                    }}
                  >
                    {resource.name}
                  </h3>
                  <Tag type={INTENT_TO_CARBON[resourceStatusIntent(resource.status)]} size="sm">
                    {resource.status.replace('_', ' ')}
                  </Tag>
                </div>

                {resource.description && (
                  <p
                    style={{
                      color: 'var(--cds-text-secondary)',
                      fontSize: '0.75rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    {resource.description}
                  </p>
                )}

                {resource.isHighDemand && (
                  <div style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                    <span style={{ color: 'var(--cds-text-secondary)' }}>
                      {resource.cooldownHours}h cooldown between sessions
                    </span>
                  </div>
                )}

                {resource.requiredCertifications.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    {resource.requiredCertifications.map((cert) => (
                      <Tag key={cert} type="gray" size="sm">
                        {cert}
                      </Tag>
                    ))}
                  </div>
                )}

                <Button
                  size="sm"
                  disabled={resource.status !== 'AVAILABLE'}
                  kind={resource.status === 'AVAILABLE' ? 'primary' : 'ghost'}
                >
                  {resource.status === 'AVAILABLE' ? 'Book Now' : 'Unavailable'}
                </Button>
              </Tile>
            </Column>
          ))}
        </>
      ) : null}
    </Grid>
  );
}
