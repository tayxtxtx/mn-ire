import { Routes, Route, Navigate } from 'react-router-dom';
import { Content, Theme } from '@carbon/react';
import AppHeader from './components/AppHeader.js';
import Login from './pages/Login.js';
import AcceptInvite from './pages/AcceptInvite.js';
import FacilityOverview from './pages/FacilityOverview.js';
import ShopDetail from './pages/ShopDetail.js';
import MyBookings from './pages/MyBookings.js';
import AdminBookings from './pages/admin/AdminBookings.js';
import AdminShops from './pages/admin/AdminShops.js';
import AdminUsers from './pages/admin/AdminUsers.js';
import AdminSettings from './pages/admin/AdminSettings.js';

export default function App() {
  return (
    <Theme theme="g100">
      <Routes>
        {/* ── Public routes (no header, no auth required) ─────────────────── */}
        <Route path="/login"         element={<Login />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />

        {/* ── Authenticated app shell ──────────────────────────────────────── */}
        <Route
          path="*"
          element={
            <>
              <AppHeader />
              <Content>
                <Routes>
                  <Route path="/"             element={<FacilityOverview />} />
                  <Route path="/shop/:slug"   element={<ShopDetail />} />
                  <Route path="/my-bookings"  element={<MyBookings />} />
                  <Route path="/admin"        element={<AdminBookings />} />
                  <Route path="/admin/shops"  element={<AdminShops />} />
                  <Route path="/admin/users"     element={<AdminUsers />} />
                  <Route path="/admin/settings" element={<AdminSettings />} />
                  <Route path="*"               element={<Navigate to="/" replace />} />
                </Routes>
              </Content>
            </>
          }
        />
      </Routes>
    </Theme>
  );
}
