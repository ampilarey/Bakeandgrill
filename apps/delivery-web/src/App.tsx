import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { Driver } from './types';
import { api } from './api';
import LoginPage from './pages/LoginPage';
import ActivePage from './pages/ActivePage';
import DetailPage from './pages/DetailPage';
import HistoryPage from './pages/HistoryPage';
import ProfilePage from './pages/ProfilePage';
import BottomNav from './components/BottomNav';
import LocationTracker from './components/LocationTracker';

function App() {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('driver_token');
    if (!token) { setLoading(false); return; }

    api.me()
      .then(({ driver: d }) => setDriver(d))
      .catch(() => localStorage.removeItem('driver_token'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <div className="animate-spin" style={{ fontSize: '2rem', color: 'var(--color-primary)' }}>⟳</div>
      </div>
    );
  }

  return (
    <BrowserRouter basename="/driver">
      {driver ? (
        <>
          <LocationTracker />
          <Routes>
            <Route path="/" element={<ActivePage driver={driver} />} />
            <Route path="/delivery/:id" element={<DetailPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/profile" element={<ProfilePage driver={driver} onLogout={() => setDriver(null)} />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <BottomNav />
        </>
      ) : (
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={setDriver} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}

export default App;
