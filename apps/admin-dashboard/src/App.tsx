import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { getMe, logout as apiLogout, type StaffUser } from './api';
import { ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';

const OrdersPage              = lazy(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const KDSPage                 = lazy(() => import('./pages/KDSPage').then((m) => ({ default: m.KDSPage })));
const DeliveryPage            = lazy(() => import('./pages/DeliveryPage').then((m) => ({ default: m.DeliveryPage })));
const PromotionsPage          = lazy(() => import('./pages/PromotionsPage').then((m) => ({ default: m.PromotionsPage })));
const LoyaltyPage             = lazy(() => import('./pages/LoyaltyPage').then((m) => ({ default: m.LoyaltyPage })));
const SmsPage                 = lazy(() => import('./pages/SmsPage').then((m) => ({ default: m.SmsPage })));
const ReportsPage             = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const MenuPage                = lazy(() => import('./pages/MenuPage').then((m) => ({ default: m.MenuPage })));
const StaffPage               = lazy(() => import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })));
const ReservationsPage        = lazy(() => import('./pages/ReservationsPage'));
const AnalyticsPage           = lazy(() => import('./pages/AnalyticsPage'));
const InvoicesPage            = lazy(() => import('./pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage })));
const ExpensesPage            = lazy(() => import('./pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const ProfitLossPage          = lazy(() => import('./pages/ProfitLossPage').then((m) => ({ default: m.ProfitLossPage })));
const SupplierIntelligencePage = lazy(() => import('./pages/SupplierIntelligencePage').then((m) => ({ default: m.SupplierIntelligencePage })));
const ForecastPage            = lazy(() => import('./pages/ForecastPage').then((m) => ({ default: m.ForecastPage })));
const PurchaseOrdersPage      = lazy(() => import('./pages/PurchaseOrdersPage').then((m) => ({ default: m.PurchaseOrdersPage })));
const WebhooksPage            = lazy(() => import('./pages/WebhooksPage').then((m) => ({ default: m.WebhooksPage })));
const DashboardPage           = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const TestChecklistPage       = lazy(() => import('./pages/TestChecklistPage'));
const SettingsPage            = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const GiftCardsPage           = lazy(() => import('./pages/GiftCardsPage'));
const ReviewsPage             = lazy(() => import('./pages/ReviewsPage'));
const SpecialsPage            = lazy(() => import('./pages/SpecialsPage'));
const RefundsPage             = lazy(() => import('./pages/RefundsPage'));
const WasteLogsPage           = lazy(() => import('./pages/WasteLogsPage'));
const CustomersPage           = lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const InventoryPage           = lazy(() => import('./pages/InventoryPage'));
const TablesPage              = lazy(() => import('./pages/TablesPage'));
const ShiftsPage              = lazy(() => import('./pages/ShiftsPage'));
const TimeClockPage           = lazy(() => import('./pages/TimeClockPage'));
const DevicesPage             = lazy(() => import('./pages/DevicesPage'));
const ReferralsPage           = lazy(() => import('./pages/ReferralsPage'));

function PageFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: '#94a3b8', fontSize: 14 }}>
      Loading…
    </div>
  );
}

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

function PermissionGuard({
  user,
  permission,
  children,
}: {
  user: StaffUser | null;
  permission: string;
  children: React.ReactNode;
}) {
  if (!user) return <Navigate to="/login" replace />;
  // Owner bypasses all permission checks
  if (user.role === 'owner') return <>{children}</>;
  if (!user.permissions?.includes(permission)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1C1408', margin: 0 }}>Access Denied</h2>
        <p style={{ color: '#8B7355', margin: 0 }}>You don't have permission to view this page.</p>
      </div>
    );
  }
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
    <ToastProvider>
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
      <Route
        path="/*"
        element={
          <AuthGuard user={user}>
            <Layout user={user!} onLogout={handleLogout}>
              <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={
                  <PermissionGuard user={user} permission="dashboard.view">
                    <DashboardPage />
                  </PermissionGuard>
                } />
                <Route path="orders" element={
                  <PermissionGuard user={user} permission="orders.view">
                    <OrdersPage />
                  </PermissionGuard>
                } />
                <Route path="kds" element={
                  <PermissionGuard user={user} permission="orders.view">
                    <KDSPage />
                  </PermissionGuard>
                } />
                <Route path="delivery" element={
                  <PermissionGuard user={user} permission="delivery.view">
                    <DeliveryPage />
                  </PermissionGuard>
                } />
                <Route path="promotions" element={
                  <PermissionGuard user={user} permission="promotions.view">
                    <PromotionsPage />
                  </PermissionGuard>
                } />
                <Route path="loyalty" element={
                  <PermissionGuard user={user} permission="loyalty.view">
                    <LoyaltyPage />
                  </PermissionGuard>
                } />
                <Route path="sms" element={
                  <PermissionGuard user={user} permission="integrations.sms">
                    <SmsPage />
                  </PermissionGuard>
                } />
                <Route path="reports" element={
                  <PermissionGuard user={user} permission="reports.view">
                    <ReportsPage />
                  </PermissionGuard>
                } />
                <Route path="menu" element={
                  <PermissionGuard user={user} permission="menu.view">
                    <MenuPage />
                  </PermissionGuard>
                } />
                {/* Staff management */}
                <Route path="staff" element={
                  <PermissionGuard user={user} permission="staff.view">
                    <StaffPage />
                  </PermissionGuard>
                } />
                <Route path="reservations" element={
                  <PermissionGuard user={user} permission="reservations.view">
                    <ReservationsPage />
                  </PermissionGuard>
                } />
                <Route path="analytics" element={
                  <PermissionGuard user={user} permission="customers.analytics">
                    <AnalyticsPage />
                  </PermissionGuard>
                } />
                {/* Finance */}
                <Route path="invoices" element={
                  <PermissionGuard user={user} permission="finance.invoices">
                    <InvoicesPage />
                  </PermissionGuard>
                } />
                <Route path="expenses" element={
                  <PermissionGuard user={user} permission="finance.expenses">
                    <ExpensesPage />
                  </PermissionGuard>
                } />
                <Route path="profit-loss" element={
                  <PermissionGuard user={user} permission="finance.profit_loss">
                    <ProfitLossPage />
                  </PermissionGuard>
                } />
                <Route path="supplier-intelligence" element={
                  <PermissionGuard user={user} permission="suppliers.view">
                    <SupplierIntelligencePage />
                  </PermissionGuard>
                } />
                <Route path="forecasts" element={
                  <PermissionGuard user={user} permission="reports.financial">
                    <ForecastPage />
                  </PermissionGuard>
                } />
                <Route path="purchase-orders" element={
                  <PermissionGuard user={user} permission="suppliers.purchases">
                    <PurchaseOrdersPage />
                  </PermissionGuard>
                } />
                {/* Webhooks */}
                <Route path="webhooks" element={
                  <PermissionGuard user={user} permission="integrations.webhooks">
                    <WebhooksPage />
                  </PermissionGuard>
                } />
                <Route path="checklist" element={
                  <PermissionGuard user={user} permission="website.manage">
                    <TestChecklistPage />
                  </PermissionGuard>
                } />
                {/* Settings hub */}
                <Route path="settings/*" element={
                  <PermissionGuard user={user} permission="website.manage">
                    <SettingsPage />
                  </PermissionGuard>
                } />
                {/* New feature pages */}
                <Route path="gift-cards" element={
                  <PermissionGuard user={user} permission="promotions.manage">
                    <GiftCardsPage />
                  </PermissionGuard>
                } />
                <Route path="reviews" element={
                  <PermissionGuard user={user} permission="customers.manage">
                    <ReviewsPage />
                  </PermissionGuard>
                } />
                <Route path="specials" element={
                  <PermissionGuard user={user} permission="menu.manage">
                    <SpecialsPage />
                  </PermissionGuard>
                } />
                <Route path="refunds" element={
                  <PermissionGuard user={user} permission="orders.manage">
                    <RefundsPage />
                  </PermissionGuard>
                } />
                <Route path="waste-logs" element={
                  <PermissionGuard user={user} permission="menu.manage">
                    <WasteLogsPage />
                  </PermissionGuard>
                } />
                <Route path="customers" element={
                  <PermissionGuard user={user} permission="customers.manage">
                    <CustomersPage />
                  </PermissionGuard>
                } />
                <Route path="inventory" element={
                  <PermissionGuard user={user} permission="inventory.manage">
                    <InventoryPage />
                  </PermissionGuard>
                } />
                <Route path="tables" element={
                  <PermissionGuard user={user} permission="orders.view">
                    <TablesPage />
                  </PermissionGuard>
                } />
                <Route path="shifts" element={
                  <PermissionGuard user={user} permission="orders.view">
                    <ShiftsPage />
                  </PermissionGuard>
                } />
                <Route path="time-clock" element={
                  <PermissionGuard user={user} permission="staff.view">
                    <TimeClockPage />
                  </PermissionGuard>
                } />
                <Route path="devices" element={
                  <PermissionGuard user={user} permission="device.manage">
                    <DevicesPage />
                  </PermissionGuard>
                } />
                <Route path="referrals" element={
                  <PermissionGuard user={user} permission="customers.manage">
                    <ReferralsPage />
                  </PermissionGuard>
                } />
                <Route path="*"                     element={<Navigate to="/orders" replace />} />
              </Routes>
              </Suspense>
            </Layout>
          </AuthGuard>
        }
      />
    </Routes>
    </ToastProvider>
  );
}
