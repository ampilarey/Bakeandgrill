import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { getMe, logout as apiLogout, type StaffUser } from './api';
import { ToastProvider } from './components/ui';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { CommandPalette } from './components/CommandPalette';
import { can as userCan, getDefaultNavPath, canAny as userCanAny } from './components/navConfig';
import { clearCurrentUserPermissionCache, primeCurrentUserPermissionCache } from './hooks/usePermissions';
import { lazyWithRetry } from './utils/lazyWithRetry';

const OrdersPage              = lazyWithRetry(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const KDSPage                 = lazyWithRetry(() => import('./pages/KDSPage').then((m) => ({ default: m.KDSPage })));
const DeliveryPage            = lazyWithRetry(() => import('./pages/DeliveryPage').then((m) => ({ default: m.DeliveryPage })));
const PromotionsPage          = lazyWithRetry(() => import('./pages/PromotionsPage').then((m) => ({ default: m.PromotionsPage })));
const LoyaltyPage             = lazyWithRetry(() => import('./pages/LoyaltyPage').then((m) => ({ default: m.LoyaltyPage })));
const SmsPage                 = lazyWithRetry(() => import('./pages/SmsPage').then((m) => ({ default: m.SmsPage })));
const SmsControlCenterPage    = lazyWithRetry(() => import('./pages/SmsControlCenterPage').then((m) => ({ default: m.SmsControlCenterPage })));
const DiscountControlsPage    = lazyWithRetry(() => import('./pages/DiscountControlsPage').then((m) => ({ default: m.DiscountControlsPage })));
const ReportsPage             = lazyWithRetry(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const MenuPage                = lazyWithRetry(() => import('./pages/MenuPage').then((m) => ({ default: m.MenuPage })));
const StaffPage               = lazyWithRetry(() => import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })));
const ReservationsPage        = lazyWithRetry(() => import('./pages/ReservationsPage'));
const AnalyticsPage           = lazyWithRetry(() => import('./pages/AnalyticsPage'));
const InvoicesPage            = lazyWithRetry(() => import('./pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage })));
const ExpensesPage            = lazyWithRetry(() => import('./pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const GstPage                 = lazyWithRetry(() => import('./pages/GstPage'));
const ProfitLossPage          = lazyWithRetry(() => import('./pages/ProfitLossPage').then((m) => ({ default: m.ProfitLossPage })));
const SupplierIntelligencePage = lazyWithRetry(() => import('./pages/SupplierIntelligencePage').then((m) => ({ default: m.SupplierIntelligencePage })));
const ForecastPage            = lazyWithRetry(() => import('./pages/ForecastPage').then((m) => ({ default: m.ForecastPage })));
const ProcurementReportPage   = lazyWithRetry(() => import('./pages/ProcurementReportPage'));
const PurchaseOrdersPage      = lazyWithRetry(() => import('./pages/PurchaseOrdersPage').then((m) => ({ default: m.PurchaseOrdersPage })));
const PurchaseRequestsPage    = lazyWithRetry(() => import('./pages/PurchaseRequestsPage'));
const ShoppingListsPage       = lazyWithRetry(() => import('./pages/ShoppingListsPage'));
const KitchenProductionPage   = lazyWithRetry(() => import('./pages/KitchenProductionPage'));
const WebhooksPage            = lazyWithRetry(() => import('./pages/WebhooksPage').then((m) => ({ default: m.WebhooksPage })));
const DashboardPage           = lazyWithRetry(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const TestChecklistPage       = lazyWithRetry(() => import('./pages/TestChecklistPage'));
const SettingsPage            = lazyWithRetry(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ContentHubPage          = lazyWithRetry(() => import('./pages/ContentHub/ContentHubPage'));
const ContentHubChooser       = lazyWithRetry(() => import('./pages/ContentHub/ContentHubChooser').then((m) => ({ default: m.ContentHubChooser })));
const BusinessDetailsPage     = lazyWithRetry(() => import('./pages/BusinessDetailsPage'));
const GiftCardsPage           = lazyWithRetry(() => import('./pages/GiftCardsPage'));
const DiscountCardsPage       = lazyWithRetry(() => import('./pages/DiscountCardsPage'));
const ReviewsPage             = lazyWithRetry(() => import('./pages/ReviewsPage'));
const SpecialsPage            = lazyWithRetry(() => import('./pages/SpecialsPage'));
const RefundsPage             = lazyWithRetry(() => import('./pages/RefundsPage'));
const ComplaintsPage          = lazyWithRetry(() => import('./pages/ComplaintsPage'));
const WasteLogsPage           = lazyWithRetry(() => import('./pages/WasteLogsPage'));
const CustomersPage           = lazyWithRetry(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const CustomerGrowthPage      = lazyWithRetry(() => import('./pages/CustomerGrowthPage').then((m) => ({ default: m.CustomerGrowthPage })));
const CateringPage            = lazyWithRetry(() => import('./pages/CateringPage').then((m) => ({ default: m.CateringPage })));
const CateringDetailPage      = lazyWithRetry(() => import('./pages/CateringDetailPage').then((m) => ({ default: m.CateringDetailPage })));
const InventoryPage           = lazyWithRetry(() => import('./pages/InventoryPage'));
const TablesPage              = lazyWithRetry(() => import('./pages/TablesPage'));
const ActivityPage            = lazyWithRetry(() => import('./pages/ActivityPage'));
const ShiftsPage              = lazyWithRetry(() => import('./pages/ShiftsPage'));
const TimeClockPage           = lazyWithRetry(() => import('./pages/TimeClockPage'));
const DevicesPage             = lazyWithRetry(() => import('./pages/DevicesPage'));
const ReferralsPage           = lazyWithRetry(() => import('./pages/ReferralsPage'));
const PrintJobsPage           = lazyWithRetry(() => import('./pages/PrintJobsPage'));
const XeroPage                = lazyWithRetry(() => import('./pages/XeroPage'));
const OnlineOrderingPage      = lazyWithRetry(() => import('./pages/OnlineOrderingPage'));
const ServiceAvailabilityPage = lazyWithRetry(() => import('./pages/ServiceAvailabilityPage'));
const DeliverySettingsPage    = lazyWithRetry(() => import('./pages/DeliverySettingsPage'));
const SystemHealthPage        = lazyWithRetry(() => import('./pages/SystemHealthPage').then((m) => ({ default: m.SystemHealthPage })));
const MyAccountPage           = lazyWithRetry(() => import('./pages/MyAccountPage').then((m) => ({ default: m.MyAccountPage })));
const MediaLibraryPage        = lazyWithRetry(() => import('./pages/MediaLibraryPage').then((m) => ({ default: m.MediaLibraryPage })));
const SignagePage             = lazyWithRetry(() => import('./pages/SignagePage').then((m) => ({ default: m.SignagePage })));
const WholesalePage           = lazyWithRetry(() => import('./pages/WholesalePage'));
const WholesaleAccountPage    = lazyWithRetry(() => import('./pages/WholesaleAccountPage'));
const WholesaleDeliveriesPage = lazyWithRetry(() => import('./pages/WholesaleDeliveriesPage'));
const WholesaleInvoicingPage  = lazyWithRetry(() => import('./pages/WholesaleInvoicingPage'));
const WholesaleStatementPage  = lazyWithRetry(() => import('./pages/WholesaleStatementPage'));
const WholesaleReportsPage    = lazyWithRetry(() => import('./pages/WholesaleReportsPage'));

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
            <AppShell user={user!} onLogout={handleLogout} onSearch={() => setPaletteOpen(true)}>
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
                <Route path="promotions" element={
                  <PermissionGuard user={user} permission="promotions.manage">
                    <PromotionsPage />
                  </PermissionGuard>
                } />
                <Route path="loyalty" element={
                  <PermissionGuard user={user} permission="loyalty.manage">
                    <LoyaltyPage />
                  </PermissionGuard>
                } />
                <Route path="sms" element={
                  <PermissionGuard user={user} permissions={['integrations.sms', 'sms_marketing.manage']}>
                    <SmsPage />
                  </PermissionGuard>
                } />
                <Route path="sms/control-center" element={
                  <PermissionGuard user={user} permissions={['sms.settings.manage', 'sms.logs.view', 'integrations.sms', 'sms_marketing.manage']}>
                    <SmsControlCenterPage />
                  </PermissionGuard>
                } />
                <Route path="discount-controls" element={
                  <PermissionGuard user={user} permission="discounts.settings.manage">
                    <DiscountControlsPage />
                  </PermissionGuard>
                } />
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
                  <PermissionGuard user={user} permission="reports.financial">
                    <ProfitLossPage />
                  </PermissionGuard>
                } />
                <Route path="gst" element={
                  <PermissionGuard user={user} permission="reports.financial">
                    <GstPage />
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
                <Route path="procurement-report" element={
                  <PermissionGuard user={user} permission="reports.financial">
                    <ProcurementReportPage />
                  </PermissionGuard>
                } />
                <Route path="purchase-orders" element={
                  <PermissionGuard user={user} permission="suppliers.purchases">
                    <PurchaseOrdersPage />
                  </PermissionGuard>
                } />
                <Route path="purchase-requests" element={
                  <PermissionGuard user={user} permission="purchase_requests.view_all">
                    <PurchaseRequestsPage />
                  </PermissionGuard>
                } />
                <Route path="shopping-lists" element={
                  <PermissionGuard user={user} permission="purchase_requests.create">
                    <ShoppingListsPage />
                  </PermissionGuard>
                } />
                <Route path="kitchen-production" element={
                  <PermissionGuard user={user} permission="kitchen.production.view_all">
                    <KitchenProductionPage />
                  </PermissionGuard>
                } />
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
                <Route path="business-details" element={
                  <PermissionGuard user={user} permission="website.manage">
                    <BusinessDetailsPage />
                  </PermissionGuard>
                } />
                {/* Settings hub */}
                <Route path="settings/*" element={
                  <PermissionGuard user={user} permissions={['website.manage', 'settings.update', 'roles_permissions.manage']}>
                    <SettingsPage />
                  </PermissionGuard>
                } />
                {/* New feature pages */}
                <Route path="wholesale" element={
                  <PermissionGuard user={user} permission="trade.view">
                    <WholesalePage />
                  </PermissionGuard>
                } />
                <Route path="wholesale/deliveries" element={
                  <PermissionGuard user={user} permission="trade.view">
                    <WholesaleDeliveriesPage />
                  </PermissionGuard>
                } />
                <Route path="wholesale/deliveries/:id" element={
                  <PermissionGuard user={user} permission="trade.view">
                    <WholesaleDeliveriesPage />
                  </PermissionGuard>
                } />
                <Route path="wholesale/invoicing" element={
                  <PermissionGuard user={user} permission="trade.view">
                    <WholesaleInvoicingPage />
                  </PermissionGuard>
                } />
                <Route path="wholesale/reports" element={
                  <PermissionGuard user={user} permission="trade.view">
                    <WholesaleReportsPage />
                  </PermissionGuard>
                } />
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
                <Route path="gift-cards" element={
                  <PermissionGuard user={user} permission="promotions.manage">
                    <GiftCardsPage />
                  </PermissionGuard>
                } />
                <Route path="discount-cards" element={
                  <PermissionGuard user={user} permission="promotions.discount_cards">
                    <DiscountCardsPage />
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
                  <PermissionGuard user={user} permission="orders.refund">
                    <RefundsPage />
                  </PermissionGuard>
                } />
                <Route path="complaints" element={
                  <PermissionGuard user={user} permission="complaints.view">
                    <ComplaintsPage />
                  </PermissionGuard>
                } />
                <Route path="waste-logs" element={
                  <PermissionGuard user={user} permission="inventory.manage">
                    <WasteLogsPage />
                  </PermissionGuard>
                } />
                <Route path="customers/growth" element={
                  <PermissionGuard user={user} permission="customers.manage">
                    <CustomerGrowthPage />
                  </PermissionGuard>
                } />
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
                <Route path="customers" element={
                  <PermissionGuard user={user} permission="customers.manage">
                    <CustomersPage />
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
                <Route path="referrals" element={
                  <PermissionGuard user={user} permission="customers.manage">
                    <ReferralsPage />
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
                <Route path="online-ordering" element={
                  <PermissionGuard user={user} permission="settings.update">
                    <OnlineOrderingPage />
                  </PermissionGuard>
                } />
                <Route path="service-availability" element={
                  <PermissionGuard user={user} permission="service_availability.view">
                    <ServiceAvailabilityPage />
                  </PermissionGuard>
                } />
                <Route path="delivery-settings" element={
                  <PermissionGuard user={user} permission="settings.update">
                    <DeliverySettingsPage />
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
