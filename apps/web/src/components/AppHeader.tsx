import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Header, HeaderName, HeaderNavigation, HeaderMenuItem,
  HeaderGlobalBar, HeaderGlobalAction,
} from '@carbon/react';
import { UserAvatar, Logout, Settings } from '@carbon/icons-react';
import { TEST_MODE, MOCK_USER } from '../mockData.js';  // DELETE with mockData.ts

interface Me {
  sub: string;
  email: string;
  name: string;
  certifications: string[];
  isAdmin?: boolean;
}

export default function AppHeader() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(TEST_MODE ? (MOCK_USER as unknown as Me) : null);

  useEffect(() => {
    if (TEST_MODE) return;
    fetch('/auth/me', { credentials: 'include' })
      .then(async (r) => {
        if (r.ok) return r.json() as Promise<Me>;
        // Not logged in — check provider then redirect
        const providerRes = await fetch('/auth/provider').catch(() => null);
        const providerData = providerRes?.ok ? await providerRes.json() as { provider: string } : null;
        const provider = providerData?.provider ?? 'local';
        if (provider === 'local') {
          navigate('/login');
        } else {
          window.location.href = '/auth/login';
        }
        return null;
      })
      .then((data) => { if (data) setMe(data); })
      .catch(() => {});
  }, [navigate]);

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    navigate('/');
  };

  return (
    <Header aria-label="MakeNashville Booking System">
      <HeaderName href="/" prefix="MakeNashville">
        {TEST_MODE ? 'Resource Ecosystem — TEST MODE' : 'Resource Ecosystem'}
      </HeaderName>
      <HeaderNavigation aria-label="Primary navigation">
        <HeaderMenuItem>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
            Facility Overview
          </Link>
        </HeaderMenuItem>
        <HeaderMenuItem>
          <Link to="/my-bookings" style={{ color: 'inherit', textDecoration: 'none' }}>
            My Bookings
          </Link>
        </HeaderMenuItem>
        {me?.isAdmin && (
          <HeaderMenuItem>
            <Link to="/admin" style={{ color: 'inherit', textDecoration: 'none' }}>
              Admin
            </Link>
          </HeaderMenuItem>
        )}
      </HeaderNavigation>
      <HeaderGlobalBar>
        {me && (
          <HeaderGlobalAction
            aria-label={me.name}
            tooltipAlignment="end"
            isActive={false}
          >
            <UserAvatar size={20} />
          </HeaderGlobalAction>
        )}
        {me?.isAdmin && (
          <HeaderGlobalAction
            aria-label="Admin console"
            tooltipAlignment="end"
            onClick={() => navigate('/admin')}
          >
            <Settings size={20} />
          </HeaderGlobalAction>
        )}
        <HeaderGlobalAction
          aria-label="Log out"
          tooltipAlignment="end"
          onClick={handleLogout}
        >
          <Logout size={20} />
        </HeaderGlobalAction>
      </HeaderGlobalBar>
    </Header>
  );
}
