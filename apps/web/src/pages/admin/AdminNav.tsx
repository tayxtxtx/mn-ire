import { useNavigate } from 'react-router-dom';
import { Tabs, TabList, Tab } from '@carbon/react';

interface Props {
  active: 'bookings' | 'shops' | 'users' | 'settings';
}

const TAB_INDEX = { bookings: 0, shops: 1, users: 2, settings: 3 };

export default function AdminNav({ active }: Props) {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: '1rem' }}>
      <Tabs selectedIndex={TAB_INDEX[active]}>
        <TabList aria-label="Admin sections">
          <Tab onClick={() => navigate('/admin')}>Bookings</Tab>
          <Tab onClick={() => navigate('/admin/shops')}>Shops &amp; Resources</Tab>
          <Tab onClick={() => navigate('/admin/users')}>Users</Tab>
          <Tab onClick={() => navigate('/admin/settings')}>Settings</Tab>
        </TabList>
      </Tabs>
    </div>
  );
}
