import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getMe, logout as apiLogout, type StaffUser } from './api';
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
import { StaffPage } from './pages/StaffPage';
import ReservationsPage from './pages/ReservationsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ProfitLossPage } from './pages/ProfitLossPage';
import { SupplierIntelligencePage } from './pages/SupplierIntelligencePage';
import { ForecastPage } from './pages/ForecastPage';
import { PurchaseOrdersPage } from './pages/PurchaseOrdersPage';
import { WebhooksPage } from './pages/WebhooksPage';
import { DashboardPage } from './pages/DashboardPage';
import TestChecklistPage from './pages/TestChecklistPage';

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

function RoleGuard({
  user,
  allowed,
  children,
}: {
  user: StaffUser | null;
  allowed: string[];
  children: React.ReactNode;
}) {
  if (!user || !allowed.includes(user.role ?? '')) return <Navigate to="/orders" replace />;
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

  const handleLogout = async () => {
    try { await apiLogout(); } catch (_) { /* token already expired — still clear locally */ }
    localStorage.removeItem('admin_token');
    setUser(null);
    navigate('/login');
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
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard"  element={<DashboardPage />} />
                <Route path="orders"     element={<OrdersPage />} />
                <Route path="kds"        element={<KDSPage />} />
                <Route path="delivery"   element={<DeliveryPage />} />
                <Route path="promotions" element={<PromotionsPage />} />
                <Route path="loyalty"    element={<LoyaltyPage />} />
                <Route path="sms"        element={<SmsPage />} />
                <Route path="reports"    element={<ReportsPage />} />
                <Route path="menu"       element={<MenuPage />} />
                {/* Staff management — owner/admin only */}
                <Route path="staff" element={
                  <RoleGuard user={user} allowed={['owner', 'admin']}>
                    <StaffPage />
                  </RoleGuard>
                } />
                <Route path="reservations" element={<ReservationsPage />} />
                <Route path="analytics"   element={<AnalyticsPage />} />
                {/* Finance — manager, admin, owner */}
                <Route path="invoices" element={
                  <RoleGuard user={user} allowed={['manager', 'admin', 'owner']}>
                    <InvoicesPage />
                  </RoleGuard>
                } />
                <Route path="expenses" element={
                  <RoleGuard user={user} allowed={['manager', 'admin', 'owner']}>
                    <ExpensesPage />
                  </RoleGuard>
                } />
                <Route path="profit-loss" element={
                  <RoleGuard user={user} allowed={['manager', 'admin', 'owner']}>
                    <ProfitLossPage />
                  </RoleGuard>
                } />
                <Route path="supplier-intelligence" element={
                  <RoleGuard user={user} allowed={['manager', 'admin', 'owner']}>
                    <SupplierIntelligencePage />
                  </RoleGuard>
                } />
                <Route path="forecasts" element={
                  <RoleGuard user={user} allowed={['manager', 'admin', 'owner']}>
                    <ForecastPage />
                  </RoleGuard>
                } />
                <Route path="purchase-orders" element={
                  <RoleGuard user={user} allowed={['manager', 'admin', 'owner']}>
                    <PurchaseOrdersPage />
                  </RoleGuard>
                } />
                {/* Webhooks — owner only */}
                <Route path="webhooks" element={
                  <RoleGuard user={user} allowed={['owner', 'admin']}>
                    <WebhooksPage />
                  </RoleGuard>
                } />
                <Route path="checklist" element={
                  <RoleGuard user={user} allowed={['owner', 'admin']}>
                    <TestChecklistPage />
                  </RoleGuard>
                } />
                <Route path="*"                     element={<Navigate to="/orders" replace />} />
              </Routes>
            </Layout>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
