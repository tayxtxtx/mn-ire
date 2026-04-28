import { Routes, Route, Navigate } from 'react-router-dom';
import { Content, Theme } from '@carbon/react';
import AppHeader from './components/AppHeader.js';
import FacilityOverview from './pages/FacilityOverview.js';
import ShopDetail from './pages/ShopDetail.js';
import MyBookings from './pages/MyBookings.js';

export default function App() {
  return (
    <Theme theme="g100">
      <AppHeader />
      <Content>
        <Routes>
          <Route path="/" element={<FacilityOverview />} />
          <Route path="/shop/:slug" element={<ShopDetail />} />
          <Route path="/my-bookings" element={<MyBookings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Content>
    </Theme>
  );
}
