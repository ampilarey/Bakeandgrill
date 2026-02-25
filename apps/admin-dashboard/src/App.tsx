import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getMe, type StaffUser } from './api';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { KDSPage } from './pages/KDSPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { PromotionsPage } from './pages/PromotionsPage';
import { LoyaltyPage } from './pages/LoyaltyPage';
import { SmsPage } from './pages/SmsPage';
import { ReportsPage } from './pages/ReportsPage';
import { MenuPage } from './pages/MenuPage';

function AuthGuard({
  user,
  children,
}: {
  user: StaffUser | null;
  children: React.ReactNode;
}) {
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) { setChecking(false); return; }
    getMe()
      .then((r) => setUser(r.user))
      .catch(() => {
        localStorage.removeItem('admin_token');
        navigate('/login');
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = (_token: string, staffUser: StaffUser) => {
    setUser(staffUser);
    navigate('/orders');
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
      <Route
        path="/*"
        element={
          <AuthGuard user={user}>
            <Layout user={user!} onLogout={handleLogout}>
              <Routes>
                <Route index element={<Navigate to="/orders" replace />} />
                <Route path="orders"     element={<OrdersPage />} />
                <Route path="kds"        element={<KDSPage />} />
                <Route path="delivery"   element={<DeliveryPage />} />
                <Route path="promotions" element={<PromotionsPage />} />
                <Route path="loyalty"    element={<LoyaltyPage />} />
                <Route path="sms"        element={<SmsPage />} />
                <Route path="reports"    element={<ReportsPage />} />
                <Route path="menu"       element={<MenuPage />} />
                <Route path="*"          element={<Navigate to="/orders" replace />} />
              </Routes>
            </Layout>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
