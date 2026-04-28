import { useNavigate } from 'react-router-dom';
import { Tabs, TabList, Tab } from '@carbon/react';

interface Props {
  active: 'bookings' | 'shops';
}

export default function AdminNav({ active }: Props) {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: '1rem' }}>
      <Tabs selectedIndex={active === 'bookings' ? 0 : 1}>
        <TabList aria-label="Admin sections">
          <Tab onClick={() => navigate('/admin')}>Bookings</Tab>
          <Tab onClick={() => navigate('/admin/shops')}>Shops & Resources</Tab>
        </TabList>
      </Tabs>
    </div>
  );
}
