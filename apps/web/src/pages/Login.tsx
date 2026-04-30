import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid, Column, Tile,
  TextInput, Button, InlineNotification, InlineLoading,
} from '@carbon/react';

export default function Login() {
  const navigate = useNavigate();
  const [provider, setProvider] = useState<string | null>(null);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discover which auth provider is active
  useEffect(() => {
    fetch('/auth/provider')
      .then((r) => r.json())
      .then((d: { provider: string }) => {
        if (d.provider !== 'local') {
          // OAuth provider — kick off the redirect immediately
          window.location.href = '/auth/login';
        } else {
          setProvider('local');
        }
      })
      .catch(() => setProvider('local')); // fallback: show the form
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/auth/login', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setError(err.message ?? 'Login failed.');
        return;
      }
      navigate('/', { replace: true });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Show nothing while checking provider (avoids flash)
  if (!provider) return null;

  return (
    <Grid fullWidth style={{ minHeight: '100vh', alignContent: 'center', background: 'var(--cds-background)' }}>
      <Column
        lg={{ span: 6, offset: 5 }}
        md={{ span: 6, offset: 1 }}
        sm={4}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            MakeNashville
          </h1>
          <p style={{ color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
            Sign in to your account
          </p>
        </div>

        <Tile style={{ padding: '1.75rem' }}>
          {error && (
            <InlineNotification
              kind="error" title="Sign-in failed" subtitle={error} hideCloseButton
              style={{ marginBottom: '1rem' }}
            />
          )}

          <form onSubmit={handleSubmit}>
            <TextInput
              id="login-email"
              labelText="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ marginBottom: '1rem' }}
              size="lg"
            />
            <TextInput
              id="login-password"
              labelText="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ marginBottom: '1.5rem' }}
              size="lg"
            />
            <Button
              type="submit"
              size="lg"
              style={{ width: '100%' }}
              disabled={submitting}
            >
              {submitting
                ? <InlineLoading description="Signing in…" status="active" />
                : 'Sign In'}
            </Button>
          </form>
        </Tile>

        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)', textAlign: 'center' }}>
          Need an account? Ask an admin for an invite link.
        </p>
      </Column>
    </Grid>
  );
}
