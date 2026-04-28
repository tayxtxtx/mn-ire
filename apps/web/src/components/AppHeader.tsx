import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Header, HeaderName, HeaderNavigation, HeaderMenuItem,
  HeaderGlobalBar, HeaderGlobalAction,
} from '@carbon/react';
import { UserAvatar, Logout, Settings } from '@carbon/icons-react';

interface Me {
  sub: string;
  email: string;
  name: string;
  certifications: string[];
  isAdmin?: boolean;
}

export default function AppHeader() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setMe(data as Me | null))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    navigate('/');
  };

  return (
    <Header aria-label="MakeNashville Booking System">
      <HeaderName href="/" prefix="MakeNashville">
        Resource Ecosystem
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
