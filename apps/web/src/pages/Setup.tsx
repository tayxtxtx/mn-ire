import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid, Column, Form, TextInput, PasswordInput,
  Button, InlineNotification, Loading,
} from '@carbon/react';

export default function Setup() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // If setup isn't required, redirect to home
  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json() as Promise<{ required: boolean }>)
      .then(({ required }) => { if (!required) navigate('/'); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/setup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ displayName: name.trim(), email: email.trim(), password }),
      });
      if (!res.ok) {
        const d = await res.json() as { message?: string };
        setError(d.message ?? 'Setup failed.');
        return;
      }
      navigate('/');
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  };

  if (checking) return <Loading description="Checking setup status…" withOverlay />;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#161616' }}>
      <Grid style={{ maxWidth: '480px', width: '100%', padding: '2rem' }}>
        <Column lg={16} md={8} sm={4}>
          <h1 style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '1.75rem', fontWeight: 600, color: '#f4f4f4', marginBottom: '0.5rem' }}>
            Welcome to MakeNashville
          </h1>
          <p style={{ color: '#c6c6c6', marginBottom: '2rem', fontSize: '0.875rem' }}>
            Create your admin account to get started. You can invite other members from the admin dashboard.
          </p>

          {error && (
            <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton style={{ marginBottom: '1.5rem' }} />
          )}

          <Form onSubmit={(e) => { void handleSubmit(e); }}>
            <TextInput
              id="setup-name"
              labelText="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ marginBottom: '1rem' }}
              required
            />
            <TextInput
              id="setup-email"
              labelText="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ marginBottom: '1rem' }}
              required
            />
            <PasswordInput
              id="setup-password"
              labelText="Password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ marginBottom: '1rem' }}
              required
            />
            <PasswordInput
              id="setup-confirm"
              labelText="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{ marginBottom: '2rem' }}
              required
            />
            <Button type="submit" disabled={saving} style={{ width: '100%' }}>
              {saving ? 'Creating account…' : 'Create Admin Account'}
            </Button>
          </Form>
        </Column>
      </Grid>
    </div>
  );
}
