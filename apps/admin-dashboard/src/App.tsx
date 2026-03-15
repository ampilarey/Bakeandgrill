import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getMe, logout as apiLogout, type StaffUser } from './api';
import { ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { usePermissions } from './hooks/usePermissions';
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
import { SettingsPage } from './pages/SettingsPage';

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

/** Guard that checks a specific permission slug instead of just roles */
function PermissionGuard({
  can,
  permission,
  children,
}: {
  can: (slug: string) => boolean;
  permission: string;
  children: React.ReactNode;
}) {
  if (!can(permission)) return <Navigate to="/orders" replace />;
  return <>{children}</>;
}

export default function App() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const { can } = usePermissions(user?.id ?? null, user?.role);

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
    <ToastProvider>
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
      <Route
        path="/*"
        element={
          <AuthGuard user={user}>
            <Layout user={user!} onLogout={handleLogout} can={can}>
              <Routes>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard"  element={<DashboardPage />} />
                <Route path="orders"     element={<PermissionGuard can={can} permission="orders.view"><OrdersPage /></PermissionGuard>} />
                <Route path="kds"        element={<PermissionGuard can={can} permission="orders.view"><KDSPage /></PermissionGuard>} />
                <Route path="delivery"   element={<PermissionGuard can={can} permission="delivery.view"><DeliveryPage /></PermissionGuard>} />
                <Route path="promotions" element={<PermissionGuard can={can} permission="promotions.view"><PromotionsPage /></PermissionGuard>} />
                <Route path="loyalty"    element={<PermissionGuard can={can} permission="loyalty.view"><LoyaltyPage /></PermissionGuard>} />
                <Route path="sms"        element={<PermissionGuard can={can} permission="integrations.sms"><SmsPage /></PermissionGuard>} />
                <Route path="reports"    element={<PermissionGuard can={can} permission="reports.view"><ReportsPage /></PermissionGuard>} />
                <Route path="menu"       element={<PermissionGuard can={can} permission="menu.view"><MenuPage /></PermissionGuard>} />
                <Route path="staff"      element={<PermissionGuard can={can} permission="staff.view"><StaffPage /></PermissionGuard>} />
                <Route path="reservations" element={<PermissionGuard can={can} permission="reservations.view"><ReservationsPage /></PermissionGuard>} />
                <Route path="analytics"  element={<PermissionGuard can={can} permission="customers.analytics"><AnalyticsPage /></PermissionGuard>} />
                <Route path="invoices"   element={<PermissionGuard can={can} permission="finance.invoices"><InvoicesPage /></PermissionGuard>} />
                <Route path="expenses"   element={<PermissionGuard can={can} permission="finance.expenses"><ExpensesPage /></PermissionGuard>} />
                <Route path="profit-loss" element={<PermissionGuard can={can} permission="finance.profit_loss"><ProfitLossPage /></PermissionGuard>} />
                <Route path="supplier-intelligence" element={<PermissionGuard can={can} permission="suppliers.view"><SupplierIntelligencePage /></PermissionGuard>} />
                <Route path="forecasts"  element={<PermissionGuard can={can} permission="reports.financial"><ForecastPage /></PermissionGuard>} />
                <Route path="purchase-orders" element={<PermissionGuard can={can} permission="suppliers.purchases"><PurchaseOrdersPage /></PermissionGuard>} />
                <Route path="webhooks"   element={<PermissionGuard can={can} permission="integrations.webhooks"><WebhooksPage /></PermissionGuard>} />
                <Route path="checklist"  element={<PermissionGuard can={can} permission="website.manage"><TestChecklistPage /></PermissionGuard>} />
                <Route path="settings/*" element={<PermissionGuard can={can} permission="website.manage"><SettingsPage /></PermissionGuard>} />
                <Route path="*"          element={<Navigate to="/orders" replace />} />
              </Routes>
            </Layout>
          </AuthGuard>
        }
      />
    </Routes>
    </ToastProvider>
  );
}
