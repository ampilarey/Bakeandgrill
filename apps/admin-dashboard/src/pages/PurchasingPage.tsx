import { Suspense, lazy, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, PageShell, TabScrollRow } from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { PurchasingSettings } from './PurchasingPage/PurchasingSettings';
import { HubContext } from '../components/hubContext';

/*
 * Purchasing — one page for the whole of buying.
 *
 * Purchasing settings audit, 2026-09-05. The owner's picture of buying is one
 * line: staff ask → someone approves → someone buys → the box arrives → the
 * cost is booked. The admin had it as five sidebar entries (Purchase Requests,
 * Shopping Lists, Purchase Orders, Suppliers, Waste) plus a settings screen
 * under System and switches scattered inside two other pages. Now it is one
 * entry with tabs in that order, and every switch on the last tab.
 *
 * The tab pages are the existing ones, rendered without their own shell, so
 * nothing about how they work has changed — only where they live. Old URLs
 * redirect here (App.tsx), so bookmarks and the command palette still land.
 */

const PurchaseRequestsPage = lazy(() => import('./PurchaseRequestsPage'));
const PurchaseOrdersPage = lazy(() => import('./PurchaseOrdersPage').then((m) => ({ default: m.PurchaseOrdersPage })));
const ShoppingListsPage = lazy(() => import('./ShoppingListsPage'));
const PurchaseLinesPage = lazy(() => import('./PurchaseLinesPage'));
const SupplierIntelligencePage = lazy(() => import('./SupplierIntelligencePage').then((m) => ({ default: m.SupplierIntelligencePage })));
// Route audit, 2026-09-19: the procurement report (spend, price trends, quote
// savings) sat under Analyze; it is about the suppliers on this page.
const ProcurementReportPage = lazy(() => import('./ProcurementReportPage'));
// Owner, 2026-09-19: "Where i can see the price difference of each product
// over time. An easy way to" — every item, last price against before.
const PriceChangesPage = lazy(() => import('./PriceChangesPage'));

export const PURCHASING_TABS = [
  { id: 'requests', label: 'Requests', permissions: ['purchase_requests.view_all'], desc: 'What staff have asked for, and where each request is' },
  { id: 'orders', label: 'Purchase orders', permissions: ['suppliers.purchases'], desc: 'Orders placed with suppliers and shops, and what has arrived' },
  { id: 'lines', label: 'Purchase lines', permissions: ['suppliers.purchases'], desc: 'Every line bought — narrow it by shop, brand or item' },
  { id: 'lists', label: 'Shopping lists', permissions: ['purchase_requests.create'], desc: 'Staples that get requested on a schedule' },
  { id: 'suppliers', label: 'Suppliers', permissions: ['suppliers.view'], desc: 'Who you buy from, how they perform, and what they charge' },
  { id: 'price-changes', label: 'Price changes', permissions: ['suppliers.purchases', 'reports.financial'], desc: 'What each item costs now against before' },
  { id: 'reports', label: 'Reports', permissions: ['reports.financial'], desc: 'Spend, price trends and what the quotes saved' },
  { id: 'settings', label: 'Settings', permissions: ['settings.update', 'purchase_requests.view_all'], desc: 'Every switch that governs buying, in the order the work happens' },
] as const;

export type PurchasingTabId = (typeof PURCHASING_TABS)[number]['id'];

/** All the permissions that open the page at all — any one of them shows at least one tab. */
export const PURCHASING_PAGE_PERMISSIONS = Array.from(new Set(PURCHASING_TABS.flatMap((t) => t.permissions)));

function isTab(v: string | null): v is PurchasingTabId {
  return !!v && PURCHASING_TABS.some((t) => t.id === v);
}

export function purchasingPathTab(pathname: string): string | null {
  const m = pathname.match(/^\/purchasing\/([^/?#]+)/);
  return m?.[1] ?? null;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
  fontWeight: 600, fontSize: 14, fontFamily: 'inherit', whiteSpace: 'nowrap',
  background: active ? 'var(--color-primary)' : 'transparent',
  color: active ? 'var(--color-on-primary, #fff)' : 'var(--color-text-secondary)',
});

export function PurchasingPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { can, loading } = useCurrentUserPermissions();

  const visible = PURCHASING_TABS.filter((t) => t.permissions.some((p) => can(p)));
  const pathTab = purchasingPathTab(pathname);
  const active: PurchasingTabId | null = isTab(pathTab) && visible.some((t) => t.id === pathTab) ? pathTab : null;
  const current = PURCHASING_TABS.find((t) => t.id === active);

  usePageTitle(current ? `Purchasing · ${current.label}` : 'Purchasing');

  // Bare /purchasing, or a tab this user cannot see, lands on the first tab
  // they can. Settings is last on purpose: the sort order is the work order.
  useEffect(() => {
    if (loading) return;
    if (active === null && visible.length > 0) {
      navigate(`/purchasing/${visible[0].id}`, { replace: true });
    }
  }, [active, visible, loading, navigate]);

  if (loading || active === null) return null;

  return (
    <PageShell>
      <PageHeader section="Manage" title="Purchasing" subtitle={current?.desc} />

      <div style={{ marginBottom: 20 }}>
        <TabScrollRow
          role="tablist"
          aria-label="Purchasing"
          className="hub-tabs"
          fit
          style={{
            display: 'flex', gap: 4, background: 'var(--color-bg)',
            borderRadius: 10, padding: 4, maxWidth: '100%', overflowX: 'auto',
          }}
        >
          {visible.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={active === t.id}
              onClick={() => navigate(`/purchasing/${t.id}`)}
              style={tabStyle(active === t.id)}
            >
              {t.label}
            </button>
          ))}
        </TabScrollRow>
      </div>

      <Suspense fallback={<p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}>
        {active === 'requests' && <PurchaseRequestsPage embedded />}
        {active === 'orders' && <PurchaseOrdersPage embedded />}
        {active === 'lines' && <PurchaseLinesPage embedded />}
        {active === 'lists' && <ShoppingListsPage embedded />}
        {active === 'suppliers' && <SupplierIntelligencePage embedded />}
        {active === 'price-changes' && <HubContext.Provider value={true}><PriceChangesPage /></HubContext.Provider>}
        {active === 'reports' && <HubContext.Provider value={true}><ProcurementReportPage /></HubContext.Provider>}
        {active === 'settings' && <PurchasingSettings canEdit={can('settings.update')} />}
      </Suspense>
    </PageShell>
  );
}
