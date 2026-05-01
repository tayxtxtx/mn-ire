import { Routes, Route, Navigate } from 'react-router-dom';
import { Theme } from '@carbon/react';
import KioskHome from './pages/KioskHome.js';
import CheckIn from './pages/CheckIn.js';
import WhosIn from './pages/WhosIn.js';
import ActiveSession from './pages/ActiveSession.js';

export default function App() {
  return (
    // g100 (dark) for high ambient-light readability in the shop
    <Theme theme="g100">
      <Routes>
        <Route path="/" element={<KioskHome />} />
        <Route path="/checkin" element={<CheckIn />} />
        <Route path="/whos-in" element={<WhosIn />} />
        <Route path="/session" element={<ActiveSession />} />
        {/* Per-shop kiosk: /:shopSlug shows a sign-in form scoped to that shop */}
        <Route path="/:shopSlug" element={<KioskHome />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Theme>
  );
}
