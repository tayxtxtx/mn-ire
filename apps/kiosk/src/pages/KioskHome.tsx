import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid, Column, Tile, Button,
  TextInput, Checkbox,
  Select, SelectItem,
  InlineNotification, InlineLoading,
} from '@carbon/react';
import { TEST_MODE, MOCK_RESOURCES } from '../mockData.js';  // DELETE with mockData.ts
import type { SessionState } from './ActiveSession.js';

interface KioskResource {
  id:   string;
  name: string;
  shop: { name: string };
}

export default function KioskHome() {
  const navigate = useNavigate();

  // ── Resource list ──────────────────────────────────────────────────────────
  const [resources, setResources] = useState<KioskResource[]>([]);
  useEffect(() => {
    if (TEST_MODE) { setResources(MOCK_RESOURCES); return; }
    fetch('/api/walkin/resources')
      .then((r) => r.json())
      .then((d) => setResources(d as KioskResource[]))
      .catch(() => {});
  }, []);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [firstName,         setFirstName]         = useState('');
  const [lastName,          setLastName]           = useState('');
  const [email,             setEmail]             = useState('');
  const [phone,             setPhone]             = useState('');
  const [passedOrientation, setPassedOrientation] = useState(false);
  const [resourceId,        setResourceId]        = useState('');

  // ── Submission state ───────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const resetForm = () => {
    setFirstName(''); setLastName(''); setEmail('');
    setPhone(''); setPassedOrientation(false); setResourceId('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Please fill in first name, last name, and email.');
      return;
    }
    setSubmitting(true);
    setError(null);

    if (TEST_MODE) {
      await new Promise((r) => setTimeout(r, 500));
      const sessionState: SessionState = {
        type:         'walkin',
        id:           'mock-walkin-001',
        name:         firstName.trim(),
        resourceName: resourceId ? (resources.find((r) => r.id === resourceId)?.name ?? null) : null,
        endsAt:       new Date(Date.now() + 120 * 60_000).toISOString(),
      };
      navigate('/session', { state: sessionState });
      return;
    }

    try {
      const res = await fetch('/api/walkin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          email:     email.trim(),
          phone:     phone.trim() || undefined,
          passedOrientation,
          resourceId: resourceId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setError(err.message ?? 'Sign-in failed. Please see the front desk.');
        setSubmitting(false);
        return;
      }
      const data = await res.json() as { id: string; endsAt: string | null; resource?: { name: string } | null };
      const sessionState: SessionState = {
        type:         'walkin',
        id:           data.id,
        name:         firstName.trim(),
        resourceName: data.resource?.name ?? (resourceId ? (resources.find((r) => r.id === resourceId)?.name ?? null) : null),
        endsAt:       data.endsAt ?? new Date(Date.now() + 120 * 60_000).toISOString(),
      };
      navigate('/session', { state: sessionState });
    } catch {
      setError('Network error. Please see the front desk.');
      setSubmitting(false);
    }
  };

  // ── Sign-in form ───────────────────────────────────────────────────────────
  return (
    <Grid fullWidth style={{ minHeight: '100vh', alignContent: 'start', padding: '2rem 0' }}>
      <Column
        lg={{ span: 10, offset: 3 }}
        md={{ span: 6, offset: 1 }}
        sm={4}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '1.75rem', fontWeight: 700 }}>
            MakeNashville Sign-In{TEST_MODE ? ' — TEST MODE' : ''}
          </h1>
          <p style={{ color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
            Please fill out this form before using any equipment.
          </p>
        </div>

        {error && (
          <InlineNotification
            kind="error" title="Error" subtitle={error} hideCloseButton
            style={{ marginBottom: '1rem' }}
          />
        )}

        <Tile style={{ padding: '1.5rem' }}>
          {/* Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <TextInput
              id="first-name"
              labelText="First name *"
              placeholder="Jane"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              size="lg"
            />
            <TextInput
              id="last-name"
              labelText="Last name *"
              placeholder="Smith"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              size="lg"
            />
          </div>

          {/* Contact row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <TextInput
              id="email"
              labelText="Email *"
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="lg"
            />
            <TextInput
              id="phone"
              labelText="Phone (optional)"
              type="tel"
              placeholder="(615) 555-0100"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              size="lg"
            />
          </div>

          {/* Tool selector */}
          <div style={{ marginBottom: '1.25rem' }}>
            <Select
              id="resource"
              labelText="Tool you'll be using today (optional)"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              size="lg"
            >
              <SelectItem value=""    text="— Not selected —" />
              {resources.map((r) => (
                <SelectItem key={r.id} value={r.id} text={`${r.shop.name} — ${r.name}`} />
              ))}
            </Select>
          </div>

          {/* Orientation checkbox */}
          <div style={{ marginBottom: '1.5rem' }}>
            <Checkbox
              id="orientation"
              labelText="I have completed MakeNashville facility orientation"
              checked={passedOrientation}
              onChange={(_: unknown, { checked }: { checked: boolean }) => setPassedOrientation(checked)}
            />
          </div>

          {/* Submit */}
          <Button
            size="xl"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ width: '100%' }}
          >
            {submitting
              ? <InlineLoading description="Signing in…" status="active" />
              : 'Sign In'}
          </Button>
        </Tile>

        {/* Secondary actions */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <Button kind="ghost" size="lg" onClick={() => navigate('/checkin')}>
            I have a reservation
          </Button>
          <Button kind="ghost" size="lg" onClick={() => navigate('/whos-in')}>
            Who's In
          </Button>
        </div>
      </Column>
    </Grid>
  );
}
