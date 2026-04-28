import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, Column, Button, Tile, InlineLoading } from '@carbon/react';
import { QRCodeSVG } from 'qrcode.react';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

type AuthState = 'idle' | 'polling' | 'success' | 'error';

const AUTHENTIK_DEVICE_URL = '/auth/device';

export default function KioskHome() {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>('idle');
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const startDeviceFlow = async () => {
    setAuthState('polling');
    setErrorMsg('');

    try {
      const res = await fetch(AUTHENTIK_DEVICE_URL, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Device flow init failed: ${res.status}`);
      const data = (await res.json()) as DeviceCodeResponse;
      setDeviceCode(data);

      // Poll for token every `interval` seconds
      pollTimer.current = setInterval(async () => {
        const pollRes = await fetch('/auth/device/token', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: data.device_code }),
        });

        if (pollRes.status === 200) {
          stopPolling();
          setAuthState('success');
          // Redirect to check-in after brief success flash
          setTimeout(() => navigate('/checkin'), 1200);
        } else if (pollRes.status === 400) {
          const err = (await pollRes.json()) as { error: string };
          if (err.error !== 'authorization_pending' && err.error !== 'slow_down') {
            stopPolling();
            setAuthState('error');
            setErrorMsg(err.error === 'expired_token' ? 'Code expired. Try again.' : err.error);
          }
        }
      }, (data.interval ?? 5) * 1000);
    } catch (e) {
      setAuthState('error');
      setErrorMsg('Could not start login flow. Check network.');
    }
  };

  // Clean up on unmount
  useEffect(() => () => stopPolling(), []);

  return (
    <Grid fullWidth style={{ minHeight: '100vh', alignContent: 'center' }}>
      <Column
        lg={{ span: 8, offset: 4 }}
        md={{ span: 6, offset: 1 }}
        sm={4}
        style={{ textAlign: 'center' }}
      >
        <h1
          style={{
            fontFamily: 'IBM Plex Sans, sans-serif',
            fontSize: '2rem',
            fontWeight: 700,
            marginBottom: '0.25rem',
          }}
        >
          MakeNashville
        </h1>
        <p
          style={{
            color: 'var(--cds-text-secondary)',
            fontSize: '1rem',
            marginBottom: '2.5rem',
          }}
        >
          Resource Ecosystem — Kiosk
        </p>

        {authState === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <Button size="xl" onClick={startDeviceFlow} style={{ width: '100%', maxWidth: '360px' }}>
              Sign In with Member Badge
            </Button>
            <Button
              kind="secondary"
              size="xl"
              onClick={() => navigate('/whos-in')}
              style={{ width: '100%', maxWidth: '360px' }}
            >
              View Who's In
            </Button>
          </div>
        )}

        {authState === 'polling' && deviceCode && (
          <Tile style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
            <p style={{ marginBottom: '1.5rem', fontSize: '1rem' }}>
              Scan this QR code or visit{' '}
              <strong>{deviceCode.verification_uri}</strong> on your phone and
              enter the code:
            </p>
            <p
              style={{
                fontSize: '2.5rem',
                fontWeight: 700,
                letterSpacing: '0.5rem',
                fontFamily: 'IBM Plex Mono, monospace',
                marginBottom: '1.5rem',
              }}
            >
              {deviceCode.user_code}
            </p>
            <QRCodeSVG
              value={deviceCode.verification_uri}
              size={160}
              style={{ marginBottom: '1.5rem' }}
            />
            <InlineLoading description="Waiting for authentication…" status="active" />
            <Button
              kind="ghost"
              size="sm"
              onClick={() => { stopPolling(); setAuthState('idle'); setDeviceCode(null); }}
              style={{ marginTop: '1rem' }}
            >
              Cancel
            </Button>
          </Tile>
        )}

        {authState === 'success' && (
          <Tile style={{ maxWidth: '400px', margin: '0 auto' }}>
            <InlineLoading description="Authenticated! Loading…" status="finished" />
          </Tile>
        )}

        {authState === 'error' && (
          <Tile style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
            <p style={{ color: 'var(--cds-support-error)', marginBottom: '1rem' }}>
              {errorMsg || 'Authentication failed.'}
            </p>
            <Button size="xl" onClick={() => setAuthState('idle')}>
              Try Again
            </Button>
          </Tile>
        )}
      </Column>
    </Grid>
  );
}
