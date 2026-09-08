import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { getMe, logout as apiLogout, logoutEverywhere as apiLogoutEverywhere, type StaffUser } from './api';
import { ToastProvider } from './components/ui';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { CommandPalette } from './components/CommandPalette';
import { can as userCan, getDefaultNavPath, canAny as userCanAny } from './components/navConfig';
import { clearCurrentUserPermissionCache, primeCurrentUserPermissionCache } from './hooks/usePermissions';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { PURCHASING_PAGE_PERMISSIONS } from './pages/PurchasingPage';
import { KITCHEN_HUB_PERMISSIONS } from './pages/KitchenHub';
import { CUSTOMERS_HUB_PERMISSIONS } from './pages/CustomersHub';
import { PROMOTIONS_HUB_PERMISSIONS } from './pages/PromotionsHub';
import { FINANCE_HUB_PERMISSIONS } from './pages/FinanceHub';
import { WHOLESALE_HUB_PERMISSIONS } from './pages/WholesaleHub';

const OrdersPage              = lazyWithRetry(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const KDSPage                 = lazyWithRetry(() => import('./pages/KDSPage').then((m) => ({ default: m.KDSPage })));
const DeliveryPage            = lazyWithRetry(() => import('./pages/DeliveryPage').then((m) => ({ default: m.DeliveryPage })));
const LoyaltyPage             = lazyWithRetry(() => import('./pages/LoyaltyPage').then((m) => ({ default: m.LoyaltyPage })));
const SmsPage                 = lazyWithRetry(() => import('./pages/SmsPage').then((m) => ({ default: m.SmsPage })));
const ReportsPage             = lazyWithRetry(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const MenuPage                = lazyWithRetry(() => import('./pages/MenuPage').then((m) => ({ default: m.MenuPage })));
const StaffPage               = lazyWithRetry(() => import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })));
const ReservationsPage        = lazyWithRetry(() => import('./pages/ReservationsPage'));
const AnalyticsPage           = lazyWithRetry(() => import('./pages/AnalyticsPage'));
const GstPage                 = lazyWithRetry(() => import('./pages/GstPage'));
const ModifiersPage           = lazyWithRetry(() => import('./pages/ModifiersPage').then((m) => ({ default: m.ModifiersPage })));
const ForecastPage            = lazyWithRetry(() => import('./pages/ForecastPage').then((m) => ({ default: m.ForecastPage })));
const ProcurementReportPage   = lazyWithRetry(() => import('./pages/ProcurementReportPage'));
const PurchasingPage          = lazyWithRetry(() => import('./pages/PurchasingPage').then((m) => ({ default: m.PurchasingPage })));
const KitchenHub              = lazyWithRetry(() => import('./pages/KitchenHub').then((m) => ({ default: m.KitchenHub })));
const CustomersHub            = lazyWithRetry(() => import('./pages/CustomersHub').then((m) => ({ default: m.CustomersHub })));
const PromotionsHub           = lazyWithRetry(() => import('./pages/PromotionsHub').then((m) => ({ default: m.PromotionsHub })));
const FinanceHub              = lazyWithRetry(() => import('./pages/FinanceHub').then((m) => ({ default: m.FinanceHub })));
const WholesaleHub            = lazyWithRetry(() => import('./pages/WholesaleHub').then((m) => ({ default: m.WholesaleHub })));
const WebhooksPage            = lazyWithRetry(() => import('./pages/WebhooksPage').then((m) => ({ default: m.WebhooksPage })));
const DashboardPage           = lazyWithRetry(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const TestChecklistPage       = lazyWithRetry(() => import('./pages/TestChecklistPage'));
const SettingsPage            = lazyWithRetry(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ContentHubPage          = lazyWithRetry(() => import('./pages/ContentHub/ContentHubPage'));
const ContentHubChooser       = lazyWithRetry(() => import('./pages/ContentHub/ContentHubChooser').then((m) => ({ default: m.ContentHubChooser })));
const SpecialsPage            = lazyWithRetry(() => import('./pages/SpecialsPage'));
const RefundsPage             = lazyWithRetry(() => import('./pages/RefundsPage'));
const ComplaintsPage          = lazyWithRetry(() => import('./pages/ComplaintsPage'));
const CateringPage            = lazyWithRetry(() => import('./pages/CateringPage').then((m) => ({ default: m.CateringPage })));
const CateringDetailPage      = lazyWithRetry(() => import('./pages/CateringDetailPage').then((m) => ({ default: m.CateringDetailPage })));
const InventoryPage           = lazyWithRetry(() => import('./pages/InventoryPage'));
const TablesPage              = lazyWithRetry(() => import('./pages/TablesPage'));
const ActivityPage            = lazyWithRetry(() => import('./pages/ActivityPage'));
const ShiftsPage              = lazyWithRetry(() => import('./pages/ShiftsPage'));
const TimeClockPage           = lazyWithRetry(() => import('./pages/TimeClockPage'));
const DevicesPage             = lazyWithRetry(() => import('./pages/DevicesPage'));
const PrintJobsPage           = lazyWithRetry(() => import('./pages/PrintJobsPage'));
const XeroPage                = lazyWithRetry(() => import('./pages/XeroPage'));
const ServiceAvailabilityPage = lazyWithRetry(() => import('./pages/ServiceAvailabilityPage'));
const SystemHealthPage        = lazyWithRetry(() => import('./pages/SystemHealthPage').then((m) => ({ default: m.SystemHealthPage })));
const MyAccountPage           = lazyWithRetry(() => import('./pages/MyAccountPage').then((m) => ({ default: m.MyAccountPage })));
const MediaLibraryPage        = lazyWithRetry(() => import('./pages/MediaLibraryPage').then((m) => ({ default: m.MediaLibraryPage })));
const SignagePage             = lazyWithRetry(() => import('./pages/SignagePage').then((m) => ({ default: m.SignagePage })));
const SocialHubPage           = lazyWithRetry(() => import('./pages/SocialHubPage').then((m) => ({ default: m.SocialHubPage })));
const WholesaleAccountPage    = lazyWithRetry(() => import('./pages/WholesaleAccountPage'));
const WholesaleInvoicingPage  = lazyWithRetry(() => import('./pages/WholesaleInvoicingPage'));
const WholesaleStatementPage  = lazyWithRetry(() => import('./pages/WholesaleStatementPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function PageFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: '#94a3b8', fontSize: 14 }}>
      Loading…
    </div>
  );
}

/**
 * Redirect an old path to its new home, keeping the query string. The
 * purchasing pages moved under /purchasing (audit 2026-09-05) and links from
 * the dashboard, invoices and forecasts carry `?search=PO-…` or `?open=…`.
 * A plain <Navigate to="/x"> would drop those.
 */
function MovedTo({ to }: { to: string }) {
  const { search, hash } = useLocation();
  const [path, fixedQuery] = to.split('?');
  const query = fixedQuery
    ? `?${fixedQuery}${search ? `&${search.slice(1)}` : ''}`
    : search;
  return <Navigate to={`${path}${query}${hash}`} replace />;
}

function AuthGuard({
  user,
  children,
}: {
  user: StaffUser | null;
  children: React.ReactNode;
}) {
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function PermissionGuard({
  user,
  permission,
  permissions,
  children,
}: {
  user: StaffUser | null;
  permission?: string;
  permissions?: string[];
  children: React.ReactNode;
}) {
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'owner') return <>{children}</>;
  const allowed = permissions?.length
    ? userCanAny(user, permissions)
    : userCan(user, permission ?? '');
  if (!allowed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Access Denied</h2>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>You don't have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();

  // Global Ctrl+K / Cmd+K shortcut to open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (user) setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [user]);

  useEffect(() => {
    // Session cookie auth — probe /auth/me; 401 means not logged in.
    getMe()
      .then((r) => {
        primeCurrentUserPermissionCache(r.user);
        setUser(r.user);
      })
      .catch(() => {
        clearCurrentUserPermissionCache();
        setUser(null);
      })
      .finally(() => setChecking(false));
  }, []);

  // When any API call returns 401 (session expired mid-session), the shared client
  // dispatches an 'auth_expired' event. Handle it here so staff are immediately
  // redirected to the login page instead of being left on a broken screen.
  useEffect(() => {
    const onExpired = () => {
      clearCurrentUserPermissionCache();
      setUser(null);
      navigate('/login');
    };
    window.addEventListener('auth_expired', onExpired);
    return () => window.removeEventListener('auth_expired', onExpired);
  }, [navigate]);

  const handleLogin = (staffUser: StaffUser, returnTo?: string) => {
    clearCurrentUserPermissionCache();
    primeCurrentUserPermissionCache(staffUser);
    setUser(staffUser);
    navigate(returnTo ?? getDefaultNavPath(staffUser));
  };

  const handleLogout = async () => {
    try { await apiLogout(); } catch (_) { /* session already gone — still clear locally */ }
    clearCurrentUserPermissionCache();
    setUser(null);
    navigate('/login');
  };

  /**
   * For a lost or stolen device. Confirmed first because it signs the owner
   * out of every till as well, which mid-service is disruptive.
   */
  const handleLogoutEverywhere = async () => {
    if (!window.confirm(
      'Sign out on ALL devices? Every till and phone signed in as you will need to sign in again.',
    )) return;
    try { await apiLogoutEverywhere(); } catch (_) { /* still clear locally */ }
    clearCurrentUserPermissionCache();
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
    <QueryClientProvider client={queryClient}>
    <ToastProvider>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
      <Route
        path="/*"
        element={
          <AuthGuard user={user}>
            <AppShell user={user!} onLogout={handleLogout} onLogoutEverywhere={handleLogoutEverywhere} onSearch={() => setPaletteOpen(true)}>
              <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route index element={<Navigate to={user ? getDefaultNavPath(user) : '/dashboard'} replace />} />
                <Route path="dashboard" element={
                  <PermissionGuard user={user} permission="dashboard.view">
                    <DashboardPage />
                  </PermissionGuard>
                } />
                <Route path="account" element={<MyAccountPage />} />
                <Route path="orders" element={
                  <PermissionGuard user={user} permission="orders.view">
                    <OrdersPage />
                  </PermissionGuard>
                } />
                <Route path="activity" element={
                  <PermissionGuard user={user} permission="reports.view">
                    <ActivityPage />
                  </PermissionGuard>
                } />
                <Route path="kds" element={
                  <PermissionGuard user={user} permission="orders.view">
                    <KDSPage />
                  </PermissionGuard>
                } />
                <Route path="delivery" element={
                  <PermissionGuard user={user} permission="orders.manage">
                    <DeliveryPage />
                  </PermissionGuard>
                } />
                {/*
                  Promotions + Loyalty admin pages call /api/admin/promotions and
                  /api/admin/loyalty/* respectively, both of which require the
                  .manage slug server-side. Guarding on .view here let view-only
                  staff into a page where every API call 403s. Tighten to .manage
                  so the sidebar/route mirror the API contract.
                */}
                <Route path="promotions/*" element={
                  <PermissionGuard user={user} permissions={PROMOTIONS_HUB_PERMISSIONS}>
                    <PromotionsHub />
                  </PermissionGuard>
                } />
                <Route path="gift-cards" element={<MovedTo to="/promotions/gift-cards" />} />
                <Route path="discount-cards" element={<MovedTo to="/promotions/discount-cards" />} />
                <Route path="discount-controls" element={<MovedTo to="/promotions/controls" />} />
                <Route path="loyalty" element={
                  <PermissionGuard user={user} permission="loyalty.manage">
                    <LoyaltyPage />
                  </PermissionGuard>
                } />
                {/* The control center is the SMS page's settings tab now. */}
                <Route path="sms" element={
                  <PermissionGuard user={user} permissions={['integrations.sms', 'sms_marketing.manage', 'sms.settings.manage', 'sms.logs.view']}>
                    <SmsPage />
                  </PermissionGuard>
                } />
                <Route path="sms/control-center" element={<MovedTo to="/sms?tab=control-center" />} />
                <Route path="reports" element={
                  <PermissionGuard user={user} permission="reports.view">
                    <ReportsPage />
                  </PermissionGuard>
                } />
                <Route path="menu" element={
                  <PermissionGuard user={user} permission="menu.manage">
                    <MenuPage />
                  </PermissionGuard>
                } />
                <Route path="modifiers" element={
                  <PermissionGuard user={user} permission="menu.manage">
                    <ModifiersPage />
                  </PermissionGuard>
                } />
                {/* Staff management */}
                <Route path="staff" element={
                  <PermissionGuard user={user} permission="staff.view">
                    <StaffPage />
                  </PermissionGuard>
                } />
                <Route path="reservations" element={
                  <PermissionGuard user={user} permission="reservations.manage">
                    <ReservationsPage />
                  </PermissionGuard>
                } />
                <Route path="analytics" element={
                  <PermissionGuard user={user} permission="customers.analytics">
                    <AnalyticsPage />
                  </PermissionGuard>
                } />
                {/* Finance — six pages became one hub; the old paths redirect to their tab. */}
                <Route path="finance/*" element={
                  <PermissionGuard user={user} permissions={FINANCE_HUB_PERMISSIONS}>
                    <FinanceHub />
                  </PermissionGuard>
                } />
                <Route path="invoices" element={<MovedTo to="/finance/invoices" />} />
                <Route path="expenses" element={<MovedTo to="/finance/expenses" />} />
                <Route path="profit-loss" element={<MovedTo to="/finance/profit-loss" />} />
                <Route path="monthly-sheet" element={<MovedTo to="/finance/monthly-sheet" />} />
                <Route path="settlements" element={<MovedTo to="/finance/settlements" />} />
                <Route path="break-even" element={<MovedTo to="/finance/break-even" />} />
                <Route path="gst" element={
                  <PermissionGuard user={user} permission="reports.financial">
                    <GstPage />
                  </PermissionGuard>
                } />
                <Route path="supplier-intelligence" element={<MovedTo to="/purchasing/suppliers" />} />
                <Route path="forecasts" element={
                  <PermissionGuard user={user} permission="reports.financial">
                    <ForecastPage />
                  </PermissionGuard>
                } />
                <Route path="procurement-report" element={
                  <PermissionGuard user={user} permission="reports.financial">
                    <ProcurementReportPage />
                  </PermissionGuard>
                } />
                {/* Purchasing hub — audit 2026-09-05: five sidebar entries became one
                    page with tabs. The old paths redirect to their tab. */}
                <Route path="purchasing/*" element={
                  <PermissionGuard user={user} permissions={PURCHASING_PAGE_PERMISSIONS}>
                    <PurchasingPage />
                  </PermissionGuard>
                } />
                <Route path="purchase-orders" element={<MovedTo to="/purchasing/orders" />} />
                <Route path="purchase-requests" element={<MovedTo to="/purchasing/requests" />} />
                <Route path="shopping-lists" element={<MovedTo to="/purchasing/lists" />} />
                {/* Kitchen — the production plan and the handover under one roof. */}
                <Route path="kitchen/*" element={
                  <PermissionGuard user={user} permissions={KITCHEN_HUB_PERMISSIONS}>
                    <KitchenHub />
                  </PermissionGuard>
                } />
                <Route path="kitchen-production" element={<MovedTo to="/kitchen/handover" />} />
                <Route path="production-plan" element={<MovedTo to="/kitchen/plan" />} />
                {/* Webhooks */}
                <Route path="webhooks" element={
                  <PermissionGuard user={user} permission="integrations.webhooks">
                    <WebhooksPage />
                  </PermissionGuard>
                } />
                {/* Dev/staging only — hidden in production builds */}
                <Route path="checklist" element={
                  <PermissionGuard user={user} permission="website.manage">
                    <TestChecklistPage />
                  </PermissionGuard>
                } />
                {/* Content Hub — Website and Order App are separate destinations */}
                <Route path="content" element={
                  <PermissionGuard user={user} permission="website.manage">
                    <ContentHubChooser />
                  </PermissionGuard>
                } />
                <Route path="content/website" element={
                  <PermissionGuard user={user} permission="website.manage">
                    <ContentHubPage />
                  </PermissionGuard>
                } />
                <Route path="content/order-app" element={
                  <PermissionGuard user={user} permission="website.manage">
                    <ContentHubPage />
                  </PermissionGuard>
                } />
                <Route path="content-studio" element={<Navigate to="/content/website" replace />} />
                <Route path="business-details" element={<MovedTo to="/settings/business" />} />
                <Route path="online-ordering" element={<MovedTo to="/settings/ordering" />} />
                <Route path="delivery-settings" element={<MovedTo to="/settings/delivery" />} />
                {/* Settings hub */}
                <Route path="settings/*" element={
                  <PermissionGuard user={user} permissions={['website.manage', 'settings.update', 'roles_permissions.manage']}>
                    <SettingsPage />
                  </PermissionGuard>
                } />
                {/* Wholesale hub — the per-account pages below stay their own routes. */}
                {['wholesale', 'wholesale/shops', 'wholesale/deliveries', 'wholesale/deliveries/:id', 'wholesale/invoicing', 'wholesale/reports'].map((path) => (
                  <Route key={path} path={path} element={
                    <PermissionGuard user={user} permissions={WHOLESALE_HUB_PERMISSIONS}>
                      <WholesaleHub />
                    </PermissionGuard>
                  } />
                ))}
                <Route path="wholesale/:id/invoicing" element={
                  <PermissionGuard user={user} permission="trade.view">
                    <WholesaleInvoicingPage />
                  </PermissionGuard>
                } />
                <Route path="wholesale/:id/statement" element={
                  <PermissionGuard user={user} permission="trade.view">
                    <WholesaleStatementPage />
                  </PermissionGuard>
                } />
                <Route path="wholesale/:id" element={
                  <PermissionGuard user={user} permission="trade.view">
                    <WholesaleAccountPage />
                  </PermissionGuard>
                } />
                <Route path="reviews" element={<MovedTo to="/customers/reviews" />} />
                <Route path="referrals" element={<MovedTo to="/customers/referrals" />} />
                <Route path="specials" element={
                  <PermissionGuard user={user} permission="menu.manage">
                    <SpecialsPage />
                  </PermissionGuard>
                } />
                <Route path="refunds" element={
                  <PermissionGuard user={user} permission="orders.refund">
                    <RefundsPage />
                  </PermissionGuard>
                } />
                <Route path="complaints" element={
                  <PermissionGuard user={user} permission="complaints.view">
                    <ComplaintsPage />
                  </PermissionGuard>
                } />
                {/* Waste is a tab of Inventory now. */}
                <Route path="waste-logs" element={<MovedTo to="/inventory?tab=waste" />} />
                <Route path="catering" element={
                  <PermissionGuard user={user} permissions={['events.manage', 'customers.manage']}>
                    <CateringPage />
                  </PermissionGuard>
                } />
                <Route path="catering/:id" element={
                  <PermissionGuard user={user} permissions={['events.manage', 'customers.manage']}>
                    <CateringDetailPage />
                  </PermissionGuard>
                } />
                {/* Customers hub: directory, growth, referrals, reviews. */}
                <Route path="customers/*" element={
                  <PermissionGuard user={user} permissions={CUSTOMERS_HUB_PERMISSIONS}>
                    <CustomersHub />
                  </PermissionGuard>
                } />
                <Route path="inventory" element={
                  <PermissionGuard user={user} permission="inventory.view">
                    <InventoryPage />
                  </PermissionGuard>
                } />
                <Route path="tables" element={
                  <PermissionGuard user={user} permission="orders.view">
                    <TablesPage />
                  </PermissionGuard>
                } />
                <Route path="shifts" element={
                  <PermissionGuard user={user} permission="shifts.view_all_history">
                    <ShiftsPage />
                  </PermissionGuard>
                } />
                <Route path="time-clock" element={
                  <PermissionGuard user={user} permissions={['staff.view', 'pos.time_clock']}>
                    <TimeClockPage />
                  </PermissionGuard>
                } />
                <Route path="devices" element={
                  <PermissionGuard user={user} permission="devices.view">
                    <DevicesPage />
                  </PermissionGuard>
                } />
                <Route path="print-jobs" element={
                  <PermissionGuard user={user} permission="devices.view">
                    <PrintJobsPage />
                  </PermissionGuard>
                } />
                <Route path="xero" element={
                  <PermissionGuard user={user} permission="integrations.xero">
                    <XeroPage />
                  </PermissionGuard>
                } />
                <Route path="service-availability" element={
                  <PermissionGuard user={user} permission="service_availability.view">
                    <ServiceAvailabilityPage />
                  </PermissionGuard>
                } />
                <Route path="system-health" element={
                  <PermissionGuard user={user} permission="website.manage">
                    <SystemHealthPage />
                  </PermissionGuard>
                } />
                <Route path="media" element={
                  <PermissionGuard user={user} permission="media.view">
                    <MediaLibraryPage />
                  </PermissionGuard>
                } />
                <Route path="signage" element={
                  <PermissionGuard user={user} permission="signage.manage">
                    <SignagePage />
                  </PermissionGuard>
                } />
                <Route path="social" element={
                  <PermissionGuard user={user} permission="social.view">
                    <SocialHubPage />
                  </PermissionGuard>
                } />
                <Route path="*" element={<Navigate to={user ? getDefaultNavPath(user) : '/dashboard'} replace />} />
              </Routes>
              </Suspense>
            </AppShell>
          </AuthGuard>
        }
      />
    </Routes>
    </ToastProvider>
    </QueryClientProvider>
  );
}
