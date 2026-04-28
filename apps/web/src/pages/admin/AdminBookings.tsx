import { useCallback, useEffect, useState } from 'react';
import {
  Grid, Column,
  DataTable, Table, TableHead, TableRow, TableHeader,
  TableBody, TableCell, TableToolbar, TableToolbarContent,
  TableToolbarSearch,
  Tag, Button, Select, SelectItem,
  SkeletonText, InlineNotification, Pagination,
} from '@carbon/react';
import type { BookingStatus } from '@makenashville/shared';
import { TEST_MODE, MOCK_ADMIN_BOOKINGS } from '../../mockData.js';  // DELETE with mockData.ts
import { bookingStatusIntent } from '@makenashville/shared';
import AdminBookingEditModal from './AdminBookingEditModal.js';
import AdminNav from './AdminNav.js';

const INTENT_TO_CARBON: Record<string, 'green' | 'blue' | 'red' | 'gray'> = {
  green: 'green', blue: 'blue', red: 'red', gray: 'gray',
};

interface AdminBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  checkedInAt: string | null;
  cancelledAt: string | null;
  user:     { id: string; displayName: string; email: string } | null;
  resource: { id: string; name: string; shop: { name: string } | null } | null;
}

const STATUS_OPTIONS: BookingStatus[] = [
  'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'PENDING',
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const headers = [
  { key: 'member',   header: 'Member' },
  { key: 'resource', header: 'Resource' },
  { key: 'shop',     header: 'Shop' },
  { key: 'startsAt', header: 'Start' },
  { key: 'endsAt',   header: 'End' },
  { key: 'status',   header: 'Status' },
  { key: 'actions',  header: '' },
];

export default function AdminBookings() {
  const [bookings, setBookings]     = useState<AdminBooking[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [statusFilter, setStatus]   = useState('');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(50);
  const [total, setTotal]           = useState(0);
  const [editing, setEditing]       = useState<AdminBooking | null>(null);

  const load = useCallback(() => {
    if (TEST_MODE) {
      setBookings(MOCK_ADMIN_BOOKINGS.data as AdminBooking[]);
      setTotal(MOCK_ADMIN_BOOKINGS.meta.total);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(page));
    params.set('limit', String(pageSize));
    fetch(`/api/admin/bookings?${params}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { data: AdminBooking[]; meta: { total: number } }) => {
        setBookings(d.data);
        setTotal(d.meta.total);
      })
      .catch(() => setError('Failed to load bookings.'))
      .finally(() => setLoading(false));
  }, [statusFilter, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const forcedCancel = async (id: string) => {
    if (TEST_MODE) return;
    await fetch(`/api/admin/bookings/${id}`, {
      method: 'DELETE', credentials: 'include',
    });
    load();
  };

  const filtered = search
    ? bookings.filter((b) =>
        b.user?.displayName.toLowerCase().includes(search.toLowerCase()) ||
        b.user?.email.toLowerCase().includes(search.toLowerCase()) ||
        b.resource?.name.toLowerCase().includes(search.toLowerCase()),
      )
    : bookings;

  const rows = filtered.map((b) => ({
    id:       b.id,
    member:   b.user ? `${b.user.displayName} (${b.user.email})` : '—',
    resource: b.resource?.name ?? '—',
    shop:     b.resource?.shop?.name ?? '—',
    startsAt: fmt(b.startsAt),
    endsAt:   fmt(b.endsAt),
    status: (
      <Tag type={INTENT_TO_CARBON[bookingStatusIntent(b.status)]} size="sm">
        {b.status}
      </Tag>
    ),
    actions: (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button kind="ghost" size="sm" onClick={() => setEditing(b)}>Edit</Button>
        {(b.status === 'CONFIRMED' || b.status === 'PENDING') && (
          <Button kind="danger--ghost" size="sm" onClick={() => forcedCancel(b.id)}>
            Cancel
          </Button>
        )}
      </div>
    ),
  }));

  return (
    <Grid fullWidth>
      <Column lg={16} md={8} sm={4} style={{ paddingTop: '1rem', paddingBottom: '0.5rem' }}>
        <AdminNav active="bookings" />
        <h1 style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '1.5rem', fontWeight: 600 }}>
          All Bookings
        </h1>
      </Column>

      {error && (
        <Column lg={16} md={8} sm={4}>
          <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />
        </Column>
      )}

      {/* Filter bar */}
      <Column lg={4} md={3} sm={4} style={{ marginBottom: '1rem' }}>
        <Select
          id="status-filter"
          labelText="Filter by status"
          value={statusFilter}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <SelectItem value="" text="All statuses" />
          {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} text={s} />)}
        </Select>
      </Column>

      <Column lg={16} md={8} sm={4}>
        {loading ? (
          <SkeletonText paragraph lineCount={10} />
        ) : (
          <>
            <DataTable rows={rows} headers={headers}>
              {({ rows: tableRows, headers: tableHeaders, getTableProps, getRowProps }) => (
                <>
                  <TableToolbar>
                    <TableToolbarContent>
                      <TableToolbarSearch
                        value={search}
                        onChange={(_, value) => setSearch(value ?? '')}
                        placeholder="Search member or resource…"
                        persistent
                      />
                    </TableToolbarContent>
                  </TableToolbar>
                  <Table {...getTableProps()} size="sm">
                    <TableHead>
                      <TableRow>
                        {tableHeaders.map((h) => (
                          <TableHeader key={h.key}>{h.header}</TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableRows.map((row) => {
                        const { key, ...rowProps } = getRowProps({ row });
                        return (
                          <TableRow key={row.id} {...rowProps}>
                            {row.cells.map((cell) => (
                              <TableCell key={cell.id}>{cell.value}</TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </>
              )}
            </DataTable>
            <Pagination
              totalItems={total}
              pageSize={pageSize}
              page={page}
              pageSizes={[25, 50, 100]}
              onChange={({ page: p, pageSize: ps }) => { setPage(p); setPageSize(ps); }}
            />
          </>
        )}
      </Column>

      {editing && (
        <AdminBookingEditModal
          booking={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </Grid>
  );
}
