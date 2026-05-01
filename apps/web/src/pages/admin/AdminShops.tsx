import { useCallback, useEffect, useState } from 'react';
import {
  Grid, Column,
  Button, Tag,
  SkeletonText, InlineNotification,
  Modal, TextInput, TextArea, Checkbox,
  NumberInput,
} from '@carbon/react';
import { Add, Edit, TrashCan, ChevronDown, ChevronUp, Screen } from '@carbon/icons-react';
import { TEST_MODE, MOCK_ADMIN_SHOPS } from '../../mockData.js';  // DELETE with mockData.ts
import type { AdminShop, AdminResource } from '../../mockData.js';  // DELETE with mockData.ts
import AdminNav from './AdminNav.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type ShopFormState = {
  name: string;
  slug: string;
  description: string;
  guildSlackChannel: string;
  gcalCalendarId: string;
};

type ResourceFormState = {
  name: string;
  description: string;
  requiredCertifications: string;  // comma-separated
  cooldownHours: number;
  isHighDemand: boolean;
  bookingWindowDays: number;
  showOnKiosk: boolean;
};

const emptyShopForm = (): ShopFormState => ({
  name: '', slug: '', description: '', guildSlackChannel: '', gcalCalendarId: '',
});

const emptyResourceForm = (): ResourceFormState => ({
  name: '', description: '', requiredCertifications: '',
  cooldownHours: 0, isHighDemand: false, bookingWindowDays: 7, showOnKiosk: true,
});

const resourceFormFrom = (r: AdminResource): ResourceFormState => ({
  name:                   r.name,
  description:            r.description ?? '',
  requiredCertifications: r.requiredCertifications.join(', '),
  cooldownHours:          r.cooldownHours,
  isHighDemand:           r.isHighDemand,
  bookingWindowDays:      r.bookingWindowDays,
  showOnKiosk:            r.showOnKiosk,
});

const STATUS_COLOR: Record<string, 'green' | 'red' | 'purple' | 'gray'> = {
  AVAILABLE:   'green',
  IN_USE:      'red',
  MAINTENANCE: 'purple',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminShops() {
  const [shops, setShops]     = useState<AdminShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Shop modal state
  const [shopModal, setShopModal] = useState<'add' | 'edit' | null>(null);
  const [editingShop, setEditingShop] = useState<AdminShop | null>(null);
  const [shopForm, setShopForm] = useState<ShopFormState>(emptyShopForm());
  const [shopSaving, setShopSaving] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);

  // Delete shop confirm
  const [deletingShop, setDeletingShop] = useState<AdminShop | null>(null);
  const [shopDeleting, setShopDeleting] = useState(false);

  // Resource modal state
  const [resourceModal, setResourceModal] = useState<'add' | 'edit' | null>(null);
  const [resourceShopId, setResourceShopId] = useState<string>('');
  const [editingResource, setEditingResource] = useState<AdminResource | null>(null);
  const [resourceForm, setResourceForm] = useState<ResourceFormState>(emptyResourceForm());
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);

  // Delete resource confirm
  const [deletingResource, setDeletingResource] = useState<AdminResource | null>(null);
  const [resourceDeleting, setResourceDeleting] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(() => {
    if (TEST_MODE) {
      setShops(MOCK_ADMIN_SHOPS as AdminShop[]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch('/api/admin/shops', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setShops(d as AdminShop[]))
      .catch(() => setError('Failed to load shops.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Accordion toggle ───────────────────────────────────────────────────────

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ── Shop CRUD ──────────────────────────────────────────────────────────────

  const openAddShop = () => {
    setShopForm(emptyShopForm());
    setShopError(null);
    setEditingShop(null);
    setShopModal('add');
  };

  const openEditShop = (shop: AdminShop) => {
    setShopForm({
      name:              shop.name,
      slug:              shop.slug,
      description:       shop.description ?? '',
      guildSlackChannel: shop.guildSlackChannel ?? '',
      gcalCalendarId:    shop.gcalCalendarId ?? '',
    });
    setShopError(null);
    setEditingShop(shop);
    setShopModal('edit');
  };

  const saveShop = async () => {
    if (!shopForm.name.trim() || !shopForm.slug.trim()) {
      setShopError('Name and slug are required.');
      return;
    }
    if (TEST_MODE) { setShopModal(null); return; }
    setShopSaving(true);
    setShopError(null);
    try {
      const body = {
        name:              shopForm.name.trim(),
        slug:              shopForm.slug.trim(),
        ...(shopForm.description       ? { description:       shopForm.description.trim()       } : {}),
        ...(shopForm.guildSlackChannel ? { guildSlackChannel: shopForm.guildSlackChannel.trim() } : {}),
        ...(shopForm.gcalCalendarId    ? { gcalCalendarId:    shopForm.gcalCalendarId.trim()    } : {}),
      };
      const url    = shopModal === 'edit' ? `/api/admin/shops/${editingShop!.id}` : '/api/admin/shops';
      const method = shopModal === 'edit' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setShopError(err.message ?? 'Could not save shop.');
        return;
      }
      setShopModal(null);
      load();
    } catch {
      setShopError('Network error.');
    } finally {
      setShopSaving(false);
    }
  };

  const confirmDeleteShop = async () => {
    if (!deletingShop) return;
    if (TEST_MODE) { setDeletingShop(null); return; }
    setShopDeleting(true);
    try {
      await fetch(`/api/admin/shops/${deletingShop.id}`, { method: 'DELETE', credentials: 'include' });
      setDeletingShop(null);
      load();
    } catch {
      setError('Could not delete shop.');
    } finally {
      setShopDeleting(false);
    }
  };

  // ── Resource CRUD ──────────────────────────────────────────────────────────

  const openAddResource = (shopId: string) => {
    setResourceForm(emptyResourceForm());
    setResourceError(null);
    setEditingResource(null);
    setResourceShopId(shopId);
    setResourceModal('add');
  };

  const openEditResource = (resource: AdminResource) => {
    setResourceForm(resourceFormFrom(resource));
    setResourceError(null);
    setEditingResource(resource);
    setResourceShopId(resource.shopId);
    setResourceModal('edit');
  };

  const saveResource = async () => {
    if (!resourceForm.name.trim()) {
      setResourceError('Name is required.');
      return;
    }
    if (TEST_MODE) { setResourceModal(null); return; }
    setResourceSaving(true);
    setResourceError(null);
    try {
      const certs = resourceForm.requiredCertifications
        .split(',').map((s) => s.trim()).filter(Boolean);
      const body = {
        name:                   resourceForm.name.trim(),
        ...(resourceForm.description ? { description: resourceForm.description.trim() } : {}),
        requiredCertifications: certs,
        cooldownHours:          resourceForm.cooldownHours,
        isHighDemand:           resourceForm.isHighDemand,
        bookingWindowDays:      resourceForm.bookingWindowDays,
        showOnKiosk:            resourceForm.showOnKiosk,
      };
      const url = resourceModal === 'edit'
        ? `/api/admin/resources/${editingResource!.id}`
        : `/api/admin/shops/${resourceShopId}/resources`;
      const method = resourceModal === 'edit' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setResourceError(err.message ?? 'Could not save resource.');
        return;
      }
      setResourceModal(null);
      load();
    } catch {
      setResourceError('Network error.');
    } finally {
      setResourceSaving(false);
    }
  };

  const confirmDeleteResource = async () => {
    if (!deletingResource) return;
    if (TEST_MODE) { setDeletingResource(null); return; }
    setResourceDeleting(true);
    try {
      await fetch(`/api/admin/resources/${deletingResource.id}`, { method: 'DELETE', credentials: 'include' });
      setDeletingResource(null);
      load();
    } catch {
      setError('Could not delete resource.');
    } finally {
      setResourceDeleting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Grid fullWidth>
      <Column lg={16} md={8} sm={4} style={{ paddingTop: '1rem', paddingBottom: '0.5rem' }}>
        <AdminNav active="shops" />
      </Column>

      <Column lg={16} md={8} sm={4} style={{ paddingBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
            Shops & Resources
          </h1>
          <Button size="md" renderIcon={Add} onClick={openAddShop}>
            Add Shop
          </Button>
        </div>
      </Column>

      {error && (
        <Column lg={16} md={8} sm={4}>
          <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />
        </Column>
      )}

      <Column lg={16} md={8} sm={4}>
        {loading ? (
          <SkeletonText paragraph lineCount={12} />
        ) : shops.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
            No shops yet. Click "Add Shop" to create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {shops.map((shop) => {
              const open = expanded.has(shop.id);
              return (
                <div
                  key={shop.id}
                  style={{
                    border: '1px solid var(--cds-border-subtle-01)',
                    background: 'var(--cds-layer-01)',
                  }}
                >
                  {/* Shop header */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.875rem 1rem', cursor: 'pointer',
                    }}
                    onClick={() => toggleExpand(shop.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: '1rem' }}>{shop.name}</span>
                      <span style={{ color: 'var(--cds-text-secondary)', fontSize: '0.8125rem', marginLeft: '0.5rem' }}>
                        /{shop.slug}
                      </span>
                      {shop.description && (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--cds-text-secondary)', marginTop: '0.125rem' }}>
                          {shop.description}
                        </div>
                      )}
                    </div>
                    <Tag type="gray" size="sm">{shop.resources.length} resource{shop.resources.length !== 1 ? 's' : ''}</Tag>
                    <Button
                      kind="ghost" size="sm" renderIcon={Screen} iconDescription="Status screen"
                      hasIconOnly
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`http://${window.location.hostname}:82/${shop.slug}`, '_blank');
                      }}
                    />
                    <Button
                      kind="ghost" size="sm" renderIcon={Edit} iconDescription="Edit shop"
                      hasIconOnly
                      onClick={(e) => { e.stopPropagation(); openEditShop(shop); }}
                    />
                    <Button
                      kind="danger--ghost" size="sm" renderIcon={TrashCan} iconDescription="Delete shop"
                      hasIconOnly
                      onClick={(e) => { e.stopPropagation(); setDeletingShop(shop); }}
                    />
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>

                  {/* Resources list */}
                  {open && (
                    <div style={{ borderTop: '1px solid var(--cds-border-subtle-01)', padding: '0.75rem 1rem' }}>
                      {shop.resources.length === 0 ? (
                        <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }}>
                          No resources yet.
                        </p>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--cds-border-subtle-01)', textAlign: 'left', color: 'var(--cds-text-secondary)' }}>
                              <th style={{ padding: '0.25rem 0.5rem' }}>Name</th>
                              <th style={{ padding: '0.25rem 0.5rem' }}>Status</th>
                              <th style={{ padding: '0.25rem 0.5rem' }}>Certifications</th>
                              <th style={{ padding: '0.25rem 0.5rem' }}>Cooldown</th>
                              <th style={{ padding: '0.25rem 0.5rem' }}>Window</th>
                              <th style={{ padding: '0.25rem 0.5rem' }}>Kiosk</th>
                              <th style={{ padding: '0.25rem 0.5rem' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {shop.resources.map((r) => (
                              <tr key={r.id} style={{ borderBottom: '1px solid var(--cds-border-subtle-01)' }}>
                                <td style={{ padding: '0.375rem 0.5rem', fontWeight: 500 }}>
                                  {r.name}
                                  {r.isHighDemand && <Tag type="blue" size="sm" style={{ marginLeft: '0.5rem' }}>High demand</Tag>}
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem' }}>
                                  <Tag type={STATUS_COLOR[r.status] ?? 'gray'} size="sm">{r.status}</Tag>
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem', color: 'var(--cds-text-secondary)' }}>
                                  {r.requiredCertifications.length > 0
                                    ? r.requiredCertifications.join(', ')
                                    : <span style={{ fontStyle: 'italic' }}>None</span>}
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem', color: 'var(--cds-text-secondary)' }}>
                                  {r.cooldownHours > 0 ? `${r.cooldownHours}h` : '—'}
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem', color: 'var(--cds-text-secondary)' }}>
                                  {r.bookingWindowDays}d
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem', color: 'var(--cds-text-secondary)' }}>
                                  {r.showOnKiosk ? 'Yes' : 'No'}
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem' }}>
                                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <Button kind="ghost" size="sm" renderIcon={Edit} iconDescription="Edit" hasIconOnly onClick={() => openEditResource(r)} />
                                    <Button kind="danger--ghost" size="sm" renderIcon={TrashCan} iconDescription="Delete" hasIconOnly onClick={() => setDeletingResource(r)} />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <Button size="sm" kind="secondary" renderIcon={Add} onClick={() => openAddResource(shop.id)}>
                        Add Resource
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Column>

      {/* ── Shop modal ──────────────────────────────────────────────────────── */}
      <Modal
        open={shopModal !== null}
        modalHeading={shopModal === 'edit' ? 'Edit Shop' : 'Add Shop'}
        primaryButtonText={shopSaving ? 'Saving…' : 'Save'}
        secondaryButtonText="Cancel"
        onRequestSubmit={saveShop}
        onRequestClose={() => setShopModal(null)}
        onSecondarySubmit={() => setShopModal(null)}
        primaryButtonDisabled={shopSaving}
        size="sm"
      >
        {shopError && (
          <InlineNotification kind="error" title="Error" subtitle={shopError} hideCloseButton style={{ marginBottom: '1rem' }} />
        )}
        <TextInput
          id="shop-name"
          labelText="Name *"
          value={shopForm.name}
          onChange={(e) => setShopForm((f) => ({ ...f, name: e.target.value }))}
          style={{ marginBottom: '1rem' }}
        />
        <TextInput
          id="shop-slug"
          labelText="Slug * (lowercase letters, numbers, hyphens)"
          placeholder="wood-shop"
          value={shopForm.slug}
          onChange={(e) => setShopForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
          style={{ marginBottom: '1rem' }}
        />
        <TextArea
          id="shop-desc"
          labelText="Description"
          value={shopForm.description}
          onChange={(e) => setShopForm((f) => ({ ...f, description: e.target.value }))}
          style={{ marginBottom: '1rem' }}
          rows={2}
        />
        <TextInput
          id="shop-slack"
          labelText="Guild Slack channel (optional)"
          placeholder="#woodshop-captains"
          value={shopForm.guildSlackChannel}
          onChange={(e) => setShopForm((f) => ({ ...f, guildSlackChannel: e.target.value }))}
          style={{ marginBottom: '1rem' }}
        />
        <TextInput
          id="shop-gcal"
          labelText="Google Calendar ID (optional)"
          placeholder="abc123@group.calendar.google.com"
          value={shopForm.gcalCalendarId}
          onChange={(e) => setShopForm((f) => ({ ...f, gcalCalendarId: e.target.value }))}
        />
      </Modal>

      {/* ── Delete shop confirm ──────────────────────────────────────────────── */}
      <Modal
        open={deletingShop !== null}
        danger
        modalHeading="Delete Shop"
        primaryButtonText={shopDeleting ? 'Deleting…' : 'Delete'}
        secondaryButtonText="Cancel"
        onRequestSubmit={confirmDeleteShop}
        onRequestClose={() => setDeletingShop(null)}
        onSecondarySubmit={() => setDeletingShop(null)}
        primaryButtonDisabled={shopDeleting}
        size="xs"
      >
        <p>
          Delete <strong>{deletingShop?.name}</strong>? This will also delete all{' '}
          {deletingShop?.resources.length ?? 0} resource(s) in this shop. Existing bookings will
          be preserved but orphaned. This cannot be undone.
        </p>
      </Modal>

      {/* ── Resource modal ───────────────────────────────────────────────────── */}
      <Modal
        open={resourceModal !== null}
        modalHeading={resourceModal === 'edit' ? 'Edit Resource' : 'Add Resource'}
        primaryButtonText={resourceSaving ? 'Saving…' : 'Save'}
        secondaryButtonText="Cancel"
        onRequestSubmit={saveResource}
        onRequestClose={() => setResourceModal(null)}
        onSecondarySubmit={() => setResourceModal(null)}
        primaryButtonDisabled={resourceSaving}
        size="sm"
      >
        {resourceError && (
          <InlineNotification kind="error" title="Error" subtitle={resourceError} hideCloseButton style={{ marginBottom: '1rem' }} />
        )}
        <TextInput
          id="res-name"
          labelText="Name *"
          value={resourceForm.name}
          onChange={(e) => setResourceForm((f) => ({ ...f, name: e.target.value }))}
          style={{ marginBottom: '1rem' }}
        />
        <TextArea
          id="res-desc"
          labelText="Description"
          value={resourceForm.description}
          onChange={(e) => setResourceForm((f) => ({ ...f, description: e.target.value }))}
          style={{ marginBottom: '1rem' }}
          rows={2}
        />
        <TextInput
          id="res-certs"
          labelText="Required certifications (comma-separated)"
          placeholder="woodshop_basic, woodshop_advanced"
          value={resourceForm.requiredCertifications}
          onChange={(e) => setResourceForm((f) => ({ ...f, requiredCertifications: e.target.value }))}
          style={{ marginBottom: '1rem' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <NumberInput
            id="res-cooldown"
            label="Cooldown (hours)"
            min={0}
            value={resourceForm.cooldownHours}
            onChange={(_e, { value }) => setResourceForm((f) => ({ ...f, cooldownHours: Number(value ?? 0) }))}
          />
          <NumberInput
            id="res-window"
            label="Booking window (days)"
            min={1}
            max={365}
            value={resourceForm.bookingWindowDays}
            onChange={(_e, { value }) => setResourceForm((f) => ({ ...f, bookingWindowDays: Number(value ?? 7) }))}
          />
        </div>
        <div style={{ display: 'flex', gap: '2rem', marginBottom: '0.5rem' }}>
          <Checkbox
            id="res-highdemand"
            labelText="High demand (enforces cooldown)"
            checked={resourceForm.isHighDemand}
            onChange={(_: unknown, { checked }: { checked: boolean }) => setResourceForm((f) => ({ ...f, isHighDemand: checked }))}
          />
          <Checkbox
            id="res-kiosk"
            labelText="Show on kiosk tool selector"
            checked={resourceForm.showOnKiosk}
            onChange={(_: unknown, { checked }: { checked: boolean }) => setResourceForm((f) => ({ ...f, showOnKiosk: checked }))}
          />
        </div>
      </Modal>

      {/* ── Delete resource confirm ──────────────────────────────────────────── */}
      <Modal
        open={deletingResource !== null}
        danger
        modalHeading="Delete Resource"
        primaryButtonText={resourceDeleting ? 'Deleting…' : 'Delete'}
        secondaryButtonText="Cancel"
        onRequestSubmit={confirmDeleteResource}
        onRequestClose={() => setDeletingResource(null)}
        onSecondarySubmit={() => setDeletingResource(null)}
        primaryButtonDisabled={resourceDeleting}
        size="xs"
      >
        <p>
          Delete <strong>{deletingResource?.name}</strong>? Existing bookings for this resource
          will be preserved but orphaned. This cannot be undone.
        </p>
      </Modal>
    </Grid>
  );
}
