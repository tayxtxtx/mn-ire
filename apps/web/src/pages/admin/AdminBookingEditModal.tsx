import { useState } from 'react';
import {
  Modal, FormGroup, Select, SelectItem,
  DatePicker, DatePickerInput, InlineNotification,
} from '@carbon/react';
import type { BookingStatus } from '@makenashville/shared';
import { TEST_MODE } from '../../mockData.js';  // DELETE with mockData.ts

interface AdminBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  user:     { displayName: string; email: string } | null;
  resource: { name: string; shop: { name: string } | null } | null;
}

interface Props {
  booking: AdminBooking;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS: BookingStatus[] = [
  'PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW', 'CANCELLED',
];

function toDatetimeLocal(iso: string) {
  return new Date(iso).toISOString().slice(0, 16);
}

export default function AdminBookingEditModal({ booking, onClose, onSaved }: Props) {
  const [status,   setStatus]   = useState<BookingStatus>(booking.status);
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(booking.startsAt));
  const [endsAt,   setEndsAt]   = useState(toDatetimeLocal(booking.endsAt));
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSave = async () => {
    if (TEST_MODE) { onSaved(); return; }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (status !== booking.status) body['status'] = status;
      const newStart = new Date(startsAt).toISOString();
      const newEnd   = new Date(endsAt).toISOString();
      if (newStart !== booking.startsAt) body['startsAt'] = newStart;
      if (newEnd   !== booking.endsAt)   body['endsAt']   = newEnd;

      if (Object.keys(body).length === 0) { onClose(); return; }

      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setError(err.message ?? 'Save failed.');
        return;
      }
      onSaved();
    } catch {
      setError('Network error — could not save.');
    } finally {
      setSaving(false);
    }
  };

  const subtitle = `${booking.resource?.name ?? '?'} · ${booking.resource?.shop?.name ?? '?'} · ${booking.user?.displayName ?? '?'}`;

  return (
    <Modal
      open
      modalHeading={`Edit Booking — ${booking.id.slice(0, 8)}…`}
      primaryButtonText={saving ? 'Saving…' : 'Save'}
      secondaryButtonText="Cancel"
      onRequestSubmit={handleSave}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      primaryButtonDisabled={saving}
    >
      <p style={{ marginBottom: '1.5rem', color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
        {subtitle}
      </p>

      {error && (
        <InlineNotification
          kind="error" title="Error" subtitle={error} hideCloseButton
          style={{ marginBottom: '1rem' }}
        />
      )}

      <FormGroup legendText="Status">
        <Select
          id="edit-status"
          labelText="Booking status"
          value={status}
          onChange={(e) => setStatus(e.target.value as BookingStatus)}
        >
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} text={s} />
          ))}
        </Select>
      </FormGroup>

      <FormGroup legendText="Start time" style={{ marginTop: '1rem' }}>
        <DatePicker
          datePickerType="single"
          value={startsAt}
          onChange={(dates) => {
            if (dates[0]) {
              const d = dates[0];
              // Preserve the time component from the existing input
              const time = startsAt.slice(11);
              setStartsAt(`${d.toISOString().slice(0, 10)}T${time}`);
            }
          }}
        >
          <DatePickerInput
            id="edit-starts-at"
            labelText="Date"
            placeholder="MM/DD/YYYY"
          />
        </DatePicker>
      </FormGroup>

      <FormGroup legendText="End time" style={{ marginTop: '1rem' }}>
        <DatePicker
          datePickerType="single"
          value={endsAt}
          onChange={(dates) => {
            if (dates[0]) {
              const d = dates[0];
              const time = endsAt.slice(11);
              setEndsAt(`${d.toISOString().slice(0, 10)}T${time}`);
            }
          }}
        >
          <DatePickerInput
            id="edit-ends-at"
            labelText="Date"
            placeholder="MM/DD/YYYY"
          />
        </DatePicker>
      </FormGroup>
    </Modal>
  );
}
