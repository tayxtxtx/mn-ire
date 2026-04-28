import { Link, useNavigate } from 'react-router-dom';
import {
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  HeaderGlobalBar,
  HeaderGlobalAction,
} from '@carbon/react';
import { UserAvatar, Logout } from '@carbon/icons-react';

export default function AppHeader() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    navigate('/');
  };

  return (
    <Header aria-label="MN-IRE">
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
      </HeaderNavigation>
      <HeaderGlobalBar>
        <HeaderGlobalAction aria-label="Profile" tooltipAlignment="end">
          <UserAvatar size={20} />
        </HeaderGlobalAction>
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
