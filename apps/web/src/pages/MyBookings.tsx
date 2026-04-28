import { useEffect, useState } from 'react';
import {
  Grid,
  Column,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
  SkeletonText,
  InlineNotification,
  Button,
} from '@carbon/react';
import type { BookingDto } from '@makenashville/shared';
import { bookingStatusIntent } from '@makenashville/shared';

const INTENT_TO_CARBON: Record<string, 'green' | 'blue' | 'red' | 'gray'> = {
  green: 'green',
  blue: 'blue',
  red: 'red',
  gray: 'gray',
};

const headers = [
  { key: 'resourceName', header: 'Resource' },
  { key: 'shopName', header: 'Shop' },
  { key: 'startsAt', header: 'Start' },
  { key: 'endsAt', header: 'End' },
  { key: 'status', header: 'Status' },
  { key: 'actions', header: '' },
];

export default function MyBookings() {
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch('/api/bookings', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setBookings(data as BookingDto[]))
      .catch(() => setError('Failed to load bookings.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const cancel = async (id: string) => {
    await fetch(`/api/bookings/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    load();
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const rows = bookings.map((b) => ({
    id: b.id,
    resourceName: b.resourceName,
    shopName: b.shopName,
    startsAt: fmt(b.startsAt),
    endsAt: fmt(b.endsAt),
    status: (
      <Tag type={INTENT_TO_CARBON[bookingStatusIntent(b.status)]} size="sm">
        {b.status}
      </Tag>
    ),
    actions:
      b.status === 'CONFIRMED' || b.status === 'PENDING' ? (
        <Button kind="danger--ghost" size="sm" onClick={() => cancel(b.id)}>
          Cancel
        </Button>
      ) : null,
  }));

  return (
    <Grid fullWidth>
      <Column lg={16} md={8} sm={4} style={{ padding: '1rem 0 0.5rem' }}>
        <h1
          style={{
            fontFamily: 'IBM Plex Sans, sans-serif',
            fontSize: '1.5rem',
            fontWeight: 600,
          }}
        >
          My Bookings
        </h1>
      </Column>

      {error && (
        <Column lg={16} md={8} sm={4}>
          <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />
        </Column>
      )}

      <Column lg={16} md={8} sm={4}>
        {loading ? (
          <SkeletonText paragraph lineCount={6} />
        ) : (
          <DataTable rows={rows} headers={headers}>
            {({ rows: tableRows, headers: tableHeaders, getTableProps, getRowProps }) => (
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    {tableHeaders.map((h) => (
                      <TableHeader key={h.key}>{h.header}</TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableRows.map((row) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            )}
          </DataTable>
        )}
      </Column>
    </Grid>
  );
}
