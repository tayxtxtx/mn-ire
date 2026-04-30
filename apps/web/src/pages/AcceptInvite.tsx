import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Grid, Column, Tile,
  TextInput, Button, InlineNotification, InlineLoading, SkeletonText,
} from '@carbon/react';

interface InviteInfo {
  valid:        boolean;
  reason?:      'already_used' | 'expired';
  displayName:  string;
  email:        string;
}

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [invite, setInvite]   = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`/api/invites/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setInvite(d as InviteInfo))
      .catch(() => setInvite(null))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ password }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setError(err.message ?? 'Could not accept invite.');
        return;
      }
      navigate('/', { replace: true });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
            Set up your account
          </p>
        </div>

        <Tile style={{ padding: '1.75rem' }}>
          {loading ? (
            <SkeletonText paragraph lineCount={4} />
          ) : !token || !invite ? (
            <InlineNotification
              kind="error" title="Invalid link" hideCloseButton
              subtitle="This invite link is invalid. Please ask an admin for a new one."
            />
          ) : !invite.valid ? (
            <InlineNotification
              kind="error" title={invite.reason === 'expired' ? 'Link expired' : 'Already used'} hideCloseButton
              subtitle={
                invite.reason === 'expired'
                  ? 'This invite link has expired. Please ask an admin for a new one.'
                  : 'This invite link has already been used. Try signing in instead.'
              }
            />
          ) : (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <p style={{ margin: '0 0 0.25rem' }}>
                  Welcome, <strong>{invite.displayName}</strong>!
                </p>
                <p style={{ margin: 0, color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
                  {invite.email}
                </p>
              </div>

              {error && (
                <InlineNotification
                  kind="error" title="Error" subtitle={error} hideCloseButton
                  style={{ marginBottom: '1rem' }}
                />
              )}

              <form onSubmit={handleSubmit}>
                <TextInput
                  id="invite-password"
                  labelText="Choose a password (min. 8 characters)"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ marginBottom: '1rem' }}
                  size="lg"
                />
                <TextInput
                  id="invite-confirm"
                  labelText="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                    ? <InlineLoading description="Creating account…" status="active" />
                    : 'Create Account & Sign In'}
                </Button>
              </form>
            </>
          )}
        </Tile>

        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)', textAlign: 'center' }}>
          Already have an account?{' '}
          <button
            style={{ background: 'none', border: 'none', color: 'var(--cds-link-primary)', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
            onClick={() => navigate('/login')}
          >
            Sign in
          </button>
        </p>
      </Column>
    </Grid>
  );
}
