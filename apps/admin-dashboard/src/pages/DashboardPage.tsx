import { useInbox } from '../hooks/useInbox';
import { InboxList } from '../components/InboxList';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChefHat, ClipboardList, Clock, CreditCard, DollarSign, MessageSquare, Monitor, Package, Printer, Receipt, ShoppingBag, TrendingUp, Truck, Users } from 'lucide-react';
import { playChime } from '../utils/audio';
import { pushNotification } from '../utils/notifications';
import {
  fetchOrders,
  fetchLowStockItems,
  fetchSalesSummary,
  getCurrentShift,
  getDailySummary,
  getInventoryForecast,
  getPurchaseSuggestions,
  getRestockPlan,
  getSpendHub,
  getSystemHealth,
  systemHealthComponentLabel,
  fetchPosOverview,
  formatAuditAction,
  fetchMaintenancePreview,
  cleanupStaleTickets,
  fetchPrintJobs,
  fetchSmsLogStats,
  fetchPriceChanges,
  fetchPayables,
  getCreditExposureReport,
  type MaintenancePreview,
  type InventoryItem,
  type Order,
} from '../api';
import {
  Card, ErrorMsg, PageHeader, PageShell, SectionLabel, Spinner, StatCard, TD, TD_NOWRAP, TH, TableCard,
} from '../components/SharedUI';
import { SiteStatsSection } from '../components/SiteStatsSection';
import { SalesInsights } from '../components/dashboard/SalesInsights';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { monthStart, today } from '../utils/dateHelpers';
import { readRestockDefaults } from '../utils/restockDefaults';
import { showDevNavItems } from '../components/navConfig';
import { inputFont } from '../utils/cssVars';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(val: unknown) {
  const n = parseFloat(String(val ?? 0));
  // A no-break space keeps "MVR" with its number when a line wraps.
  return 'MVR\u00a0' + (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function elapsed(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// Brand tones along the order's way (owner, 2026-10-08: the admin should
// follow the branding): amber waiting, rust confirmed, cocoa in the kitchen,
// green ready, gold on the road. Blue, violet and sky were never ours.
const STATUS_COLOR: Record<string, string> = {
  pending:    'var(--color-warning)',
  confirmed:  'var(--color-tone-rust-text)',
  preparing:  'var(--color-tone-brown-text)',
  ready:      'var(--color-success)',
  delivering: 'var(--color-tone-gold-text)',
  delivered:  'var(--color-success-strong)',
  completed:  'var(--color-text-secondary)',
  cancelled:  'var(--color-danger)',
};

const STATUS_BG: Record<string, string> = {
  pending:    'var(--color-warning-bg)',
  confirmed:  'var(--color-tone-rust-bg)',
  preparing:  'var(--color-tone-brown-bg)',
  ready:      'var(--color-success-bg)',
  delivering: 'var(--color-tone-gold-bg)',
  delivered:  'var(--color-success-bg)',
  completed:  'var(--color-bg)',
  cancelled:  'var(--color-danger-bg)',
};

// ── sub-components ────────────────────────────────────────────────────────────


/** Needs attention (feature 14): the top rows on the dashboard. */
function DashboardInbox() {
  const { rows, loaded } = useInbox();
  if (!loaded || rows.length === 0) return null;
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <strong style={{ fontSize: 15 }}>Needs attention</strong>
        <Link to="/needs-attention" style={{ fontSize: 13, color: 'var(--color-primary)' }}>See all</Link>
      </div>
      <InboxList rows={rows} limit={4} />
    </Card>
  );
}

function OrderCard({ order, now }: { order: Order; now: number }) {
  void now;
  const color  = STATUS_COLOR[order.status] ?? 'var(--color-text-muted)';
  const bg     = STATUS_BG[order.status]    ?? 'var(--color-bg)';
  const urgent = ['pending', 'confirmed'].includes(order.status) &&
    (Date.now() - new Date(order.created_at).getTime()) > 10 * 60 * 1000;

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: `1.5px solid ${urgent ? 'var(--color-danger)' : 'var(--color-border)'}`,
      borderRadius: 12,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <Link to={`/orders?order=${order.id}`} style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>#{order.order_number}</Link>
        <span style={{
          fontSize: 11, fontWeight: 700, color, background: bg,
          borderRadius: 20, padding: '2px 9px',
        }}>{statusWord(order.status)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
        <span style={{ fontWeight: 600 }}>
          {typeWord(order.type ?? '')}
          {order.table_number ? ` · T${order.table_number}` : ''}
        </span>
        <span style={{ marginLeft: 'auto', color: urgent ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
          {urgent && <AlertTriangle size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />}
          {elapsed(order.created_at)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-primary)' }}>{fmt(order.total)}</span>
      </div>
    </div>
  );
}

/** No till open anywhere: the cash drawer is not being counted. */
function NoShiftBanner() {
  return (
    <div style={{
      background: 'var(--color-warning-bg)', border: '1.5px solid color-mix(in srgb, var(--color-warning) 55%, transparent)', borderRadius: 12,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
    }}>
      <AlertTriangle size={16} color="var(--color-warning)" />
      <span style={{ color: 'var(--color-warning-strong)', fontWeight: 600 }}>No shift is open, so the cash drawer is not being counted.</span>
    </div>
  );
}

function MaintenancePanel({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<MaintenancePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState('');

  const load = (olderThanDays: number) => {
    setLoading(true);
    setError('');
    fetchMaintenancePreview(olderThanDays)
      .then(setPreview)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(days); }, [days]);

  const handleCleanup = async () => {
    if (!preview || preview.eligible_count === 0) return;
    const ok = window.confirm(
      `Cancel ${preview.eligible_count} unpaid open ticket(s) older than ${days} day(s)? Paid orders are skipped automatically.`,
    );
    if (!ok) return;

    setRunning(true);
    setError('');
    setResult('');
    try {
      const res = await cleanupStaleTickets(days);
      setResult(res.message);
      load(days);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>POS maintenance</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Older than</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={inputFont({ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 12, fontFamily: 'inherit' })}
          >
            {[1, 2, 3, 7, 14].map((d) => (
              <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <ErrorMsg message={error} />}
      {loading ? <Spinner /> : preview && (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {preview.open_tickets_total} open ticket(s) before {new Date(preview.cutoff).toLocaleString()} —
            {' '}{preview.eligible_count} can be voided safely, {preview.skipped_count} skipped (paid or settled).
          </p>

          {preview.stale_shifts_count > 0 && (
            <div style={{
              marginBottom: 12, padding: '10px 14px', borderRadius: 10,
              background: 'var(--color-warning-bg)', border: '1px solid color-mix(in srgb, var(--color-warning) 55%, transparent)', fontSize: 13, color: 'var(--color-warning-strong)',
            }}>
              <strong>{preview.stale_shifts_count} shift(s)</strong> open more than 24 hours.
              {' '}
              <button
                type="button"
                onClick={() => navigate('/shifts')}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                Force close from Shifts →
              </button>
            </div>
          )}

          {result && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-success-strong)', fontWeight: 600 }}>{result}</p>
          )}

          <button
            type="button"
            onClick={() => void handleCleanup()}
            disabled={running || preview.eligible_count === 0}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: running || preview.eligible_count === 0 ? 'var(--color-border)' : 'var(--color-primary)',
              color: running || preview.eligible_count === 0 ? 'var(--color-text-muted)' : '#fff',
              fontWeight: 700, fontSize: 13, cursor: running || preview.eligible_count === 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {running ? 'Cleaning up…' : `Void ${preview.eligible_count} stale ticket(s)`}
          </button>
        </>
      )}
    </Card>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function DashboardPage() {
  usePageTitle('Dashboard');
  const now = useNow();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useCurrentUserPermissions();
  const showPosOverview = can('reports.view');
  const showMaintenance = can('website.manage');
  const canFinancialSummary = can('reports.financial');
  const canReports = can('reports.view');
  const canOrders = can('orders.view');
  const canInventory = can('inventory.view');
  const canViewShifts = can('shifts.view_all_history');
  const canSms = can('sms_marketing.view');
  const canPrintJobs = can('devices.view');
  const canDelivery = can('delivery.view');
  const canPriceChanges = can('suppliers.purchases') || can('reports.financial');
  const showChecklist = showDevNavItems() || can('website.manage');
  const [summaryDate, setSummaryDate] = useState(today);

  // Tracks orders that changed status since the last poll — drives the "recent changes" panel
  const [liveEvents, setLiveEvents] = useState<{ id: number; order_number: string; status: string; ts: number }[]>([]);
  const prevOrdersRef  = useRef<Record<number, string>>({});
  const isFirstLoadRef = useRef(true);

  const viewingToday = summaryDate === today();
  // Left open past midnight on today, the page moves on to the new day by
  // itself (owner, 2026-10-28: at 00:15 it still showed yesterday and offered
  // Back to today). A day picked by hand stays put.
  const followToday = useRef(true);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (followToday.current && summaryDate !== today()) setSummaryDate(today());
    }, 30_000);
    return () => window.clearInterval(id);
  }, [summaryDate]);

  const {
    data: summary = null,
    isLoading: summaryLoading,
    error: summaryQueryError,
  } = useQuery({
    queryKey: ['dashboard', 'daily-summary', summaryDate],
    queryFn: () => getDailySummary(summaryDate),
    enabled: canFinancialSummary,
    // Keep today's KPIs fresh while the page is open (orders complete every few minutes).
    refetchInterval: canFinancialSummary && viewingToday ? 30_000 : false,
  });
  const summaryErr = summaryQueryError?.message ?? '';

  const { data: salesSummary = null } = useQuery({
    queryKey: ['dashboard', 'sales-summary', summaryDate],
    queryFn: () => fetchSalesSummary({ from: summaryDate, to: summaryDate }),
    enabled: canFinancialSummary,
    refetchInterval: canFinancialSummary && viewingToday ? 30_000 : false,
  });

  const { data: creditExposure = null } = useQuery({
    queryKey: ['dashboard', 'credit-exposure'],
    queryFn: getCreditExposureReport,
    enabled: canFinancialSummary,
  });

  // The till's own Active orders (2026-10-25): work still to do, the same list the cashier sees.
  // It was every order in seven statuses, first 50, so paid tickets from past days piled up and
  // the card always read 50 (the page size).
  const {
    data: activeFeed = { orders: [] as Order[], total: 0 },
    isLoading: ordersLoading,
    error: ordersQueryError,
  } = useQuery({
    queryKey: ['dashboard', 'active-orders'],
    queryFn: async () => {
      const r = await fetchOrders({ active_only: true, per_page: 100 });
      const orders = r.data ?? [];
      return { orders, total: r.meta?.total ?? orders.length };
    },
    enabled: canOrders,
    refetchInterval: canOrders ? 10_000 : false,
  });
  const activeOrders = activeFeed.orders;
  const activeTotal = activeFeed.total;

  // The same day last week, for the comparison under today's figures.
  const lastWeekDate = (() => {
    const d = new Date(summaryDate + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const { data: lastWeek = null } = useQuery({
    queryKey: ['dashboard', 'daily-summary', lastWeekDate],
    queryFn: () => getDailySummary(lastWeekDate),
    enabled: canFinancialSummary,
    staleTime: 10 * 60_000,
  });
  const ordersErr = ordersQueryError?.message ?? '';

  useEffect(() => {
    if (!canOrders || (activeOrders.length === 0 && ordersLoading)) return;
    const changed: typeof liveEvents = [];
    const newPending: typeof liveEvents = [];
    const currentIds = new Set(activeOrders.map((o) => o.id));
    let leftActiveQueue = false;

    // Orders that dropped off the active poll likely completed / were cancelled —
    // refresh revenue KPIs so the dashboard doesn't sit on stale totals.
    for (const idStr of Object.keys(prevOrdersRef.current)) {
      const id = Number(idStr);
      if (!currentIds.has(id)) {
        leftActiveQueue = true;
        delete prevOrdersRef.current[id];
      }
    }

    activeOrders.forEach((o) => {
      if (prevOrdersRef.current[o.id] === undefined) {
        if (!isFirstLoadRef.current && ['pending', 'paid'].includes(o.status)) {
          newPending.push({ id: o.id, order_number: o.order_number, status: o.status, ts: Date.now() });
        }
      } else if (prevOrdersRef.current[o.id] !== o.status) {
        changed.push({ id: o.id, order_number: o.order_number, status: o.status, ts: Date.now() });
      }
      prevOrdersRef.current[o.id] = o.status;
    });
    isFirstLoadRef.current = false;
    if (newPending.length > 0) {
      playChime();
      newPending.forEach((o) =>
        pushNotification({ type: 'order', title: 'New Order', body: `Order #${o.order_number} is waiting` })
      );
    }
    if (newPending.length > 0 || changed.length > 0) {
      setLiveEvents((prev) => [...newPending, ...changed, ...prev].slice(0, 20));
    }
    if (leftActiveQueue || changed.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'daily-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'sales-summary'] });
    }
  }, [activeOrders, canOrders, ordersLoading, queryClient]);

  const {
    data: inventoryIntel = { lowStock: [] as InventoryItem[], lowStockTotal: 0, stockRunway: [] as Array<{ id: number; name: string; days_of_stock: number | null; status: string; unit: string }>, poSuggestCount: 0 },
    error: lowStockQueryError,
  } = useQuery({
    queryKey: ['dashboard', 'inventory-intelligence'],
    enabled: canInventory,
    queryFn: async () => {
      const [lowStockRes, forecastRes, suggestRes] = await Promise.all([
        fetchLowStockItems(),
        getInventoryForecast().catch(() => ({ items: [] as Awaited<ReturnType<typeof getInventoryForecast>>['items'] })),
        getPurchaseSuggestions().catch(() => ({ items: [] as Awaited<ReturnType<typeof getPurchaseSuggestions>>['items'], by_supplier: [] })),
      ]);
      const items = lowStockRes.data ?? [];
      if (items.length > 0) {
        const key = 'admin_low_stock_notified_count';
        const prev = sessionStorage.getItem(key);
        if (prev !== String(items.length)) {
          pushNotification({ type: 'stock', title: 'Low Stock', body: `${items.length} item${items.length !== 1 ? 's' : ''} below reorder level` });
          sessionStorage.setItem(key, String(items.length));
        }
      }
      return {
        lowStock: items.slice(0, 8),
        lowStockTotal: items.length,
        stockRunway: (forecastRes.items ?? [])
          .filter((i) => ['out_of_stock', 'critical', 'low'].includes(i.status))
          .filter((i) => i.days_of_stock == null || i.days_of_stock <= 7)
          .sort((a, b) => (a.days_of_stock ?? 999) - (b.days_of_stock ?? 999))
          .slice(0, 5),
        poSuggestCount: (suggestRes.items ?? []).length,
      };
    },
  });
  const { lowStock, lowStockTotal, stockRunway, poSuggestCount } = inventoryIntel;
  const lowStockErr = lowStockQueryError?.message ?? '';

  const mtdFrom = monthStart();
  const mtdTo = today();
  const { data: spendRestock = null } = useQuery({
    queryKey: ['dashboard', 'spend-restock', mtdFrom, mtdTo],
    enabled: canFinancialSummary,
    queryFn: async () => {
      const [restock, spend] = await Promise.all([
        getRestockPlan(readRestockDefaults())
          .catch(() => null),
        getSpendHub(mtdFrom, mtdTo).catch(() => null),
      ]);
      const dueSoonItems = (restock?.items ?? [])
        .filter((i) => i.due_soon)
        .slice(0, 5)
        .map((i) => ({
          id: i.id,
          name: i.name,
          suggested_order_qty: i.suggested_order_qty,
          unit: i.unit,
          open_purchase: i.open_purchase?.purchase_number ?? null,
        }));
      return {
        dueSoon: restock?.totals.due_soon ?? 0,
        withOpenPo: restock?.totals.with_open_po ?? 0,
        openAlerts: restock?.totals.open_alerts ?? 0,
        dueSoonItems,
        mtdPurchases: spend?.totals.purchases ?? 0,
        mtdExpenses: spend?.totals.expenses_approved ?? 0,
        mtdWaste: spend?.totals.waste_cost ?? 0,
        mtdWithWaste: spend?.totals.total_with_waste ?? 0,
      };
    },
    refetchInterval: canFinancialSummary ? 60_000 : false,
  });

  const {
    data: shift = null,
    error: shiftQueryError,
  } = useQuery({
    queryKey: ['dashboard', 'current-shift'],
    queryFn: async () => (await getCurrentShift()).shift,
    enabled: canViewShifts,
  });
  const shiftErr = shiftQueryError?.message ?? '';

  // Owner, 2026-09-19: "Where i can see the price difference of each product
  // over time" — the count of items up 10%+ on their last buy, when there
  // are any, leading to Purchasing → Price changes.
  const { data: priceRises = 0 } = useQuery({
    queryKey: ['dashboard', 'price-rises'],
    queryFn: async () => (await fetchPriceChanges()).summary.up_over_10,
    enabled: canPriceChanges,
    staleTime: 5 * 60_000,
  });

  // Owner, 2026-09-21: what is owed to suppliers, when anything is.
  const { data: owedToSuppliers = 0 } = useQuery({
    queryKey: ['dashboard', 'payables'],
    queryFn: async () => (await fetchPayables()).total_owed,
    enabled: canPriceChanges,
    staleTime: 5 * 60_000,
  });

  const { data: printPending = 0 } = useQuery({
    queryKey: ['dashboard', 'print-jobs-pending'],
    queryFn: async () => {
      const r = await fetchPrintJobs({ status: 'pending' });
      return r.meta?.total ?? r.data?.length ?? 0;
    },
    enabled: canPrintJobs,
  });

  const { data: smsStats = { sent: 0, failed: 0 } } = useQuery({
    queryKey: ['dashboard', 'sms-stats', 'today'],
    queryFn: () => fetchSmsLogStats({ today: true }),
    enabled: canSms,
  });
  const { sent: smsSent, failed: smsFailed } = smsStats;

  const { data: health = null } = useQuery({
    queryKey: ['dashboard', 'system-health'],
    queryFn: getSystemHealth,
  });

  const {
    data: posOverview = null,
    error: posOverviewQueryError,
  } = useQuery({
    queryKey: ['dashboard', 'pos-overview'],
    queryFn: fetchPosOverview,
    enabled: showPosOverview,
    refetchInterval: showPosOverview ? 30_000 : false,
  });
  const posOverviewErr = posOverviewQueryError?.message ?? '';



  // ── derived ──
  // Stages as the kitchen and the till move an order: waiting, being made, ready (2026-10-25:
  // "in_progress", the kitchen's own word, was missing from Preparing).
  const pendingCount   = activeOrders.filter((o) => ['pending', 'paid', 'confirmed'].includes(o.status)).length;
  const preparingCount = activeOrders.filter((o) => ['preparing', 'in_progress'].includes(o.status)).length;
  const readyCount     = activeOrders.filter((o) => o.status === 'ready').length;
  const onlineWaiting  = activeOrders.filter((o) => !o.user && ['pending', 'paid', 'confirmed'].includes(o.status)).length;
  const deliveryOut    = activeOrders.filter((o) => o.type === 'delivery' && ['ready', 'on_the_way', 'out_for_delivery'].includes(o.status)).length;
  const pickupReady    = activeOrders.filter((o) => o.type !== 'delivery' && o.type !== 'dine_in' && o.status === 'ready').length;

  // Things that want someone's eye, shown only when there is something to see.
  const alerts: { key: string; label: string; value: string; sub: string; accent: string; icon: React.ElementType; to: string }[] = [];
  if (canInventory && (lowStockTotal > 0 || stockRunway.length > 0)) {
    alerts.push({ key: 'stock', label: 'Stock to reorder', value: String(lowStockTotal), sub: stockRunway.length > 0 ? `${stockRunway.length} run out within 7 days` : 'Below their reorder level', accent: 'var(--color-danger)', icon: Package, to: '/inventory' });
  }
  if (canPriceChanges && priceRises > 0) {
    alerts.push({ key: 'prices', label: 'Price rises', value: String(priceRises), sub: 'Items up 10% or more on the last buy', accent: 'var(--color-warning)', icon: TrendingUp, to: '/purchasing/price-changes' });
  }
  if (canPriceChanges && owedToSuppliers > 0) {
    alerts.push({ key: 'payables', label: 'Owed to suppliers', value: fmt(owedToSuppliers), sub: 'Received, not paid yet', accent: 'var(--color-warning)', icon: Truck, to: '/purchasing/suppliers' });
  }
  if (canPrintJobs && printPending > 0) {
    alerts.push({ key: 'print', label: 'Waiting to print', value: String(printPending), sub: 'Slips not printed yet', accent: 'var(--color-warning)', icon: Printer, to: '/devices/print-queue' });
  }
  if (canSms && smsFailed > 0) {
    alerts.push({ key: 'sms-failed', label: 'Texts that failed', value: String(smsFailed), sub: 'Today', accent: 'var(--color-danger)', icon: MessageSquare, to: can('sms.logs.view') ? '/notifications/log' : '/sms' });
  }
  if (creditExposure && creditExposure.total_balance > 0) {
    alerts.push({ key: 'credit', label: 'Owed on credit', value: fmt(creditExposure.total_balance), sub: `${creditExposure.customers_count} customer${creditExposure.customers_count !== 1 ? 's' : ''} with a balance`, accent: 'var(--color-tone-brown-text)', icon: CreditCard, to: '/customers?credit=1' });
  }

  // Every open till, from the POS overview (anyone's); /shifts/current is the signed-in person's own.
  const openShifts = posOverview ? posOverview.open_shifts : null;

  const linkBtn: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 };
  const dayWord = viewingToday ? 'today' : new Date(summaryDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const lastWeekWord = new Date(lastWeekDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <PageShell>
    <>
      <PageHeader section="Monitor"
        title="Dashboard"
        subtitle={new Date(summaryDate + 'T00:00:00').toLocaleDateString('en-MV', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {showChecklist && (
            <button
              type="button"
              onClick={() => navigate('/checklist')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 700, color: 'var(--color-tone-rust-text)',
                background: 'var(--color-tone-rust-bg)', border: '1px solid var(--color-tone-rust-border)',
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <ClipboardList size={14} />
              Go-live checklist
            </button>
            )}
            <input
              type="date"
              aria-label="Day to show"
              value={summaryDate}
              max={today()}
              onChange={(e) => { if (!e.target.value) return; followToday.current = e.target.value === today(); setSummaryDate(e.target.value); }}
              style={inputFont({ padding: '6px 10px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)', cursor: 'pointer' })}
            />
            {!viewingToday && (
              <button
                type="button"
                onClick={() => { followToday.current = true; setSummaryDate(today()); }}
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-tone-rust-text)', background: 'var(--color-tone-rust-bg)', border: '1px solid var(--color-tone-rust-border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Back to today
              </button>
            )}
          </div>
        }
      />
      <DashboardInbox />

      {/* ── 1. The day in money (2026-10-25) ── */}
      {canFinancialSummary && (
        <section data-testid="dash-today" style={{ marginBottom: 20 }}>
          <SectionLabel>{viewingToday ? 'Today so far' : `Sales on ${dayWord}`}</SectionLabel>
          <p style={{ margin: '-8px 0 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
            Every paid order counts, whatever stage it is at. {viewingToday ? `Compared with ${lastWeekWord}, the same day last week, once the day is done.` : `Compared with ${lastWeekWord}, the same day the week before.`}
          </p>
          {summaryErr && <ErrorMsg message={summaryErr} />}
          {summaryLoading ? <Spinner /> : summary && (
            <>
              <div className="stat-grid" data-responsive-grid style={{ display: 'grid', '--cols': 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 12 }}>
                <StatCard label="Sales" value={fmt(summary.revenue)} icon={DollarSign} accent="var(--color-primary)"
                  sub={lastWeek ? `${fmt(lastWeek.revenue)} on ${lastWeekWord}` : undefined}
                  trend={!viewingToday ? versus(summary.revenue, lastWeek?.revenue) : undefined} />
                <StatCard label="Orders" value={String(summary.orders)} icon={ShoppingBag} accent="var(--color-primary)"
                  sub={`Average ${fmt(summary.avg_order)}`}
                  trend={!viewingToday ? versus(summary.orders, lastWeek?.orders) : undefined} />
                <StatCard label="Net profit" value={fmt(summary.net_profit)} icon={TrendingUp}
                  accent={summary.net_profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}
                  sub="After tax, refunds, expenses and buying" />
                <StatCard label="Refunds and discounts" value={fmt((summary.refunds ?? 0) + (summary.discounts ?? 0))} icon={Receipt} accent="var(--color-text-secondary)"
                  sub={`Refunds ${fmt(summary.refunds ?? 0)} · discounts ${fmt(summary.discounts ?? 0)}`} />
              </div>
              <div data-testid="dash-today-more" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: 'GST', value: fmt(summary.tax) },
                  { label: 'Expenses', value: fmt(summary.expenses) },
                  { label: 'Waste', value: fmt(summary.waste_cost) },
                  ...(salesSummary ? [
                    { label: 'Service charge', value: fmt(salesSummary.service_charge_total ?? 0) },
                    { label: 'Delivery fees', value: fmt(salesSummary.delivery_fee_total ?? 0) },
                  ] : []),
                  ...((summary.wholesale_revenue ?? 0) > 0 ? [{ label: 'Wholesale', value: fmt(summary.wholesale_revenue) }] : []),
                  ...(canSms ? [{ label: 'Texts sent', value: String(smsSent) }] : []),
                ].map((p) => (
                  <span key={p.label} style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline', padding: '6px 12px', borderRadius: 999, background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 12 }}>
                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{p.label}</span>
                    <strong style={{ color: 'var(--color-text)' }}>{p.value}</strong>
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── 2. Right now: the floor ── */}
      {viewingToday && (canOrders || canViewShifts || showPosOverview) && (
        <section data-testid="dash-now" style={{ marginBottom: 20 }}>
          <SectionLabel>Right now</SectionLabel>
          <div className="stat-grid" data-responsive-grid style={{ display: 'grid', '--cols': 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
            {canOrders && (
              <CardLink to="/orders">
                <StatCard label="Open orders" value={String(activeTotal)} icon={ShoppingBag} accent="var(--color-primary)"
                  sub={`${pendingCount} waiting · ${preparingCount} cooking · ${readyCount} ready`} />
              </CardLink>
            )}
            {canOrders && onlineWaiting > 0 && (
              <CardLink to="/orders">
                <StatCard label="Online, not started" value={String(onlineWaiting)} icon={Monitor} accent="var(--color-tone-gold-text)" sub="From the order app" />
              </CardLink>
            )}
            {canOrders && pickupReady > 0 && (
              <CardLink to="/orders">
                <StatCard label="Ready to collect" value={String(pickupReady)} icon={CheckCircle2} accent="var(--color-success)" sub="Waiting at the counter" />
              </CardLink>
            )}
            {canDelivery && deliveryOut > 0 && (
              <CardLink to="/delivery">
                <StatCard label="Deliveries out" value={String(deliveryOut)} icon={Truck} accent="var(--color-primary)" sub="Ready or on the way" />
              </CardLink>
            )}
            {canViewShifts && openShifts !== null && (
              <CardLink to="/shifts">
                <StatCard label="Shifts open" value={String(openShifts.length)} icon={CreditCard}
                  accent={openShifts.length > 0 ? 'var(--color-success)' : 'var(--color-warning)'}
                  sub={openShifts.length > 0 ? openShifts.slice(0, 2).map((s) => `${s.user_name ?? 'Someone'} · ${elapsed(s.opened_at)}`).join(', ') : 'Nobody has opened the till'} />
              </CardLink>
            )}
            {canViewShifts && openShifts === null && shift && (
              <CardLink to="/shifts">
                <StatCard label="Your shift" value={fmt(shift.expected_cash ?? shift.opening_cash)} icon={CreditCard} accent="var(--color-success)" sub={`In the drawer · open ${elapsed(shift.opened_at)}`} />
              </CardLink>
            )}
            {posOverview && (
              <CardLink to="/time-clock">
                <StatCard label="Clocked in" value={String(posOverview.clocked_in_count)} icon={Clock} accent="var(--color-tone-brown-text)"
                  sub={`${posOverview.today_voids} void${posOverview.today_voids === 1 ? '' : 's'} · ${posOverview.today_refunds} refund${posOverview.today_refunds === 1 ? '' : 's'} today`} />
              </CardLink>
            )}
          </div>
          {/* The warning only when no till at all is open: the old banner read the signed-in person's own shift, so an owner not on the till always saw "No shift open". */}
          {canViewShifts && shiftErr && <ErrorMsg message={shiftErr} />}
          {canViewShifts && !shiftErr && (openShifts !== null ? openShifts.length === 0 : !shift) && <div style={{ marginTop: 12 }}><NoShiftBanner /></div>}
        </section>
      )}

      {/* ── 3. Worth a look (only what has something in it) ── */}
      {alerts.length > 0 && (
        <section data-testid="dash-alerts" style={{ marginBottom: 20 }}>
          <SectionLabel>Worth a look</SectionLabel>
          <div className="stat-grid" data-responsive-grid style={{ display: 'grid', '--cols': 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {alerts.map((a) => (
              <CardLink key={a.key} to={a.to}>
                <StatCard label={a.label} value={a.value} sub={a.sub} accent={a.accent} icon={a.icon} />
              </CardLink>
            ))}
          </div>
        </section>
      )}

      {/* ── 4. Sales over time: any period, against the one before (2026-10-27) ── */}
      {canReports && <SalesInsights />}

      {/* ── 5. Orders on the go + what changed ── */}
      {canOrders && viewingToday && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 20, marginBottom: 24 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <SectionLabel>Open orders</SectionLabel>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
              {ordersLoading ? '…' : activeTotal > activeOrders.length ? `${activeOrders.length} of ${activeTotal}` : `${activeTotal} order${activeTotal === 1 ? '' : 's'}`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Waiting',   count: pendingCount,   color: 'var(--color-warning-strong)', bg: 'var(--color-warning-bg)', icon: <Clock size={12} /> },
              { label: 'Cooking',   count: preparingCount, color: 'var(--color-tone-brown-text)', bg: 'var(--color-tone-brown-bg)', icon: <ChefHat size={12} /> },
              { label: 'Ready',     count: readyCount,     color: 'var(--color-success-strong)', bg: 'var(--color-success-bg)', icon: <CheckCircle2 size={12} /> },
            ].map(({ label, count, color, bg, icon }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, background: bg, borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 700, color }}>
                {icon} {count} {label}
              </div>
            ))}
          </div>
          {ordersErr && <ErrorMsg message={ordersErr} />}
          {ordersLoading ? <Spinner /> : activeOrders.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                Nothing open. Every order is done.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
              {activeOrders.map((o) => (
                <OrderCard key={o.id} order={o} now={now} />
              ))}
            </div>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <SectionLabel>Just changed</SectionLabel>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>checks every 10 seconds</span>
          </div>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {liveEvents.length === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                <Users size={20} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
                New orders and status changes appear here while this page is open.
              </div>
            ) : (
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {liveEvents.map((ev) => (
                  <div key={`${ev.id}-${ev.ts}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--color-border-light)', animation: 'fadeSlideIn 0.25s ease' }}>
                    <Link to={`/orders?order=${ev.id}`} style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none', minWidth: 70 }}>
                      #{ev.order_number}
                    </Link>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[ev.status] ?? 'var(--color-text-secondary)', background: STATUS_BG[ev.status] ?? 'var(--color-bg)', borderRadius: 20, padding: '2px 8px' }}>
                      {statusWord(ev.status)}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {elapsed(new Date(ev.ts).toISOString())}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      )}

      {/* ── 6. Where the day's money came from: Sales over time covers it for anyone who may read reports ── */}
      {!canReports && summary && ((summary.by_type ?? []).length > 0 || (summary.top_items ?? []).length > 0 || Object.keys(salesSummary?.payments ?? {}).length > 0) && (
        <section data-testid="dash-breakdown" style={{ marginBottom: 24 }}>
          <SectionLabel>{viewingToday ? "Today's sales in detail" : `Sales on ${dayWord} in detail`}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            {(summary.by_type ?? []).length > 0 && (
              <Card style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700 }}>By order type</p>
                <ShareBars rows={(summary.by_type ?? []).map((t) => ({ label: typeWord(t.type), sub: `${t.count} order${t.count === 1 ? '' : 's'}`, value: t.revenue }))} />
              </Card>
            )}
            {salesSummary?.payments && Object.keys(salesSummary.payments).length > 0 && (
              <Card style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700 }}>How it was paid</p>
                <ShareBars rows={Object.entries(salesSummary.payments).map(([method, amount]) => ({ label: methodWord(method), value: Number(amount) }))} />
                {(salesSummary.payment_commission?.by_channel ?? []).filter((row) => row.commission > 0).map((row) => (
                  <p key={row.channel} style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {row.label}: bank fee {fmt(row.commission)}, you receive {fmt(row.net)}
                  </p>
                ))}
              </Card>
            )}
            {(summary.top_items ?? []).length > 0 && (
              <TableCard>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Best sellers</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={TH}>#</th>
                      <th style={TH}>Item</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Sold</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.top_items ?? []).slice(0, 8).map((item, i) => (
                      <tr key={i}>
                        <td style={{ ...TD, color: 'var(--color-text-muted)', width: 28 }}>{i + 1}</td>
                        <td style={TD}>{item.name}</td>
                        <td style={{ ...TD_NOWRAP, textAlign: 'right', color: 'var(--color-text-secondary)' }}>{item.qty}</td>
                        <td style={{ ...TD_NOWRAP, textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            )}
          </div>
        </section>
      )}

      {/* ── 6. Stock and buying ── */}
      {canInventory && (
        <section data-testid="dash-stock" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <SectionLabel>Stock and buying</SectionLabel>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <button type="button" onClick={() => navigate('/inventory')} style={linkBtn}>Inventory</button>
              <button type="button" onClick={() => navigate('/forecasts?section=restock')} style={linkBtn}>Restock plan</button>
              <button type="button" onClick={() => navigate('/reports?tab=Spend%20Hub')} style={linkBtn}>Spending</button>
              {poSuggestCount > 0 && (
                <button type="button" onClick={() => navigate('/purchasing/orders')} style={linkBtn}>{poSuggestCount} suggested orders</button>
              )}
            </div>
          </div>
          {lowStockErr && <ErrorMsg message={lowStockErr} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            <Card style={{ minWidth: 0 }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700 }}>Running low</p>
              {lowStock.length === 0 && stockRunway.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-success-strong)', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={15} /> Every stock level looks fine.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stockRunway.map((item) => (
                    <div key={`r${item.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                      <Link to={`/inventory?item=${item.id}`} style={{ fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}>{item.name}</Link>
                      <span style={{ whiteSpace: 'nowrap', color: item.status === 'out_of_stock' ? 'var(--color-danger-strong)' : 'var(--color-warning-strong)', fontWeight: 700 }}>
                        {item.days_of_stock == null ? 'Out' : `${item.days_of_stock.toFixed(1)} days left`}
                      </span>
                    </div>
                  ))}
                  {lowStock.filter((i) => !stockRunway.some((r) => r.id === i.id)).map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                      <Link to={`/inventory?item=${item.id}`} style={{ fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}>{item.name}</Link>
                      <span style={{ whiteSpace: 'nowrap', color: item.quantity_on_hand <= 0 ? 'var(--color-danger-strong)' : 'var(--color-warning-strong)', fontWeight: 700 }}>
                        {item.quantity_on_hand} {item.unit}{item.reorder_level != null ? ` of ${item.reorder_level}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            {spendRestock && (
              <Card style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700 }}>To order soon</p>
                {spendRestock.dueSoonItems.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing due in the restock plan.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {spendRestock.dueSoonItems.map((item) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
                        <Link to={`/inventory?item=${item.id}`} style={{ fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}>{item.name}</Link>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          {item.suggested_order_qty} {item.unit}
                          {item.open_purchase && (
                            <>{' · '}<Link to={`/purchasing/orders?search=${encodeURIComponent(item.open_purchase)}`} style={{ color: 'var(--color-warning-strong)', fontWeight: 700, textDecoration: 'none' }}>on {item.open_purchase}</Link></>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  This month: bought {fmt(spendRestock.mtdPurchases)} · expenses {fmt(spendRestock.mtdExpenses)} · waste {fmt(spendRestock.mtdWaste)}
                </p>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* ── 7. The till ── */}
      {showPosOverview && viewingToday && posOverview && (posOverview.open_shifts.length > 0 || posOverview.recent_activity.length > 0 || posOverview.pending_devices > 0) && (
        <section data-testid="dash-till" style={{ marginBottom: 24 }}>
          <SectionLabel>At the till</SectionLabel>
          {posOverviewErr && <ErrorMsg message={posOverviewErr} />}
          {posOverview.pending_devices > 0 && (
            <p style={{ margin: '0 0 12px', fontSize: 13 }}>
              <Link to="/devices" style={{ color: 'var(--color-warning-strong)', fontWeight: 700 }}>{posOverview.pending_devices} device{posOverview.pending_devices === 1 ? '' : 's'} waiting to be allowed</Link>
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
            <Card style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Open shifts</span>
                <button type="button" onClick={() => navigate('/shifts')} style={linkBtn}>All shifts</button>
              </div>
              {posOverview.open_shifts.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>No shift is open.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {posOverview.open_shifts.slice(0, 5).map((s) => {
                    const stale = (Date.now() - new Date(s.opened_at).getTime()) / 3_600_000 >= 24;
                    return (
                      <Link key={s.id} to={`/shifts?shift=${s.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, textDecoration: 'none' }}>
                        <span style={{ fontWeight: 600, color: stale ? 'var(--color-warning-strong)' : 'var(--color-primary)' }}>
                          {stale && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                          {s.user_name ?? 'Unknown'}
                        </span>
                        <span style={{ color: stale ? 'var(--color-warning-strong)' : 'var(--color-text-muted)' }}>
                          {s.device_name ?? 'No device'} · {elapsed(s.opened_at)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Latest at the till</span>
                <button type="button" onClick={() => navigate('/activity')} style={linkBtn}>Full log</button>
              </div>
              {posOverview.recent_activity.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {posOverview.recent_activity.map((a) => (
                    <div key={a.id} style={{ fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{formatAuditAction(a.action)}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}> · {a.user_name ?? 'System'} · {elapsed(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
          {(summary?.foreign_currency_held?.length ?? 0) > 0 && (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
              Foreign currency held at shift close: {summary!.foreign_currency_held!.map((r) => `${r.currency} ${Number(r.denomination) * r.count}`).join(' · ')}
            </p>
          )}
        </section>
      )}

      {/* ── 8. The business as a whole ── */}
      <SiteStatsSection />

      {/* ── 9. System ── */}
      {health && (
        <Card style={{ marginTop: 8 }} data-testid="dash-health">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: health.status === 'ok' && !health.env_mismatch ? 0 : 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: health.status === 'ok' ? 'var(--color-success)' : 'var(--color-danger)', display: 'inline-block' }} />
              {health.status === 'ok' ? 'The system is running normally' : 'Something in the system needs attention'}
            </span>
            {showMaintenance && (
              <button type="button" onClick={() => navigate('/system-health')} style={linkBtn}>Full report</button>
            )}
          </div>
          {health.env_mismatch && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--color-danger-bg)', border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)', color: 'var(--color-danger-strong)', fontSize: 13, fontWeight: 600 }}>
              Staging host ({health.host}) but APP_ENV is &quot;{health.environment}&quot;: set APP_ENV=staging on this server.
            </div>
          )}
          {health.status !== 'ok' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 12 }}>
              {[
                { label: 'Database', value: systemHealthComponentLabel(health.database) },
                { label: 'Redis', value: systemHealthComponentLabel(health.redis) },
                { label: 'Queue', value: systemHealthComponentLabel(health.queue) },
                { label: 'Scheduler', value: systemHealthComponentLabel(health.scheduler) },
                { label: 'Storage', value: systemHealthComponentLabel(health.storage) },
                { label: 'Checked', value: new Date(health.timestamp).toLocaleTimeString() },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--color-bg)', borderRadius: 10, padding: '10px 14px' }}>
                  <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)', textTransform: 'capitalize' }}>{value}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {showMaintenance && (
        <MaintenancePanel onDone={() => { void queryClient.invalidateQueries({ queryKey: ['dashboard', 'pos-overview'] }); }} />
      )}
    </>

    </PageShell>
  );
}

// ── small parts ──────────────────────────────────────────────────────────────

/** A whole card that opens a page. */
function CardLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit', display: 'block', minWidth: 0 }}>
      {children}
    </Link>
  );
}

/** "+12%" against the same day last week; nothing when there is nothing to compare. */
export function versus(now: number, before: number | undefined): { value: string; positive?: boolean } | undefined {
  if (before === undefined || before <= 0) return undefined;
  const pct = Math.round(((now - before) / before) * 100);
  return { value: `${pct > 0 ? '+' : ''}${pct}% on last week`, positive: pct === 0 ? undefined : pct > 0 };
}

/** Rows as a share of their total, largest first, with a bar each. */
function ShareBars({ rows }: { rows: { label: string; sub?: string; value: number }[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[...rows].sort((a, b) => b.value - a.value).map((r) => {
        const pct = total > 0 ? (r.value / total) * 100 : 0;
        return (
          <div key={r.label}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, marginBottom: 4 }}>
              <span style={{ flex: 1, fontWeight: 600, minWidth: 0 }}>{r.label}</span>
              {r.sub && <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{r.sub}</span>}
              <span style={{ fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{fmt(r.value)}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 34, textAlign: 'right' }}>{Math.round(pct)}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--color-border-light)', borderRadius: 4 }}>
              <div style={{ height: 6, background: 'var(--color-primary)', borderRadius: 4, width: `${pct}%`, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TYPE_WORDS: Record<string, string> = {
  dine_in: 'Dine in', takeaway: 'Takeaway', online_pickup: 'Pickup', pickup: 'Pickup', delivery: 'Delivery',
  catering: 'Events', gift_card: 'Gift cards', wholesale: 'Wholesale',
};
export function typeWord(type: string): string {
  return TYPE_WORDS[type] ?? (type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' '));
}

const METHOD_WORDS: Record<string, string> = {
  cash: 'Cash', card: 'Card', qr: 'QR', qr_code: 'QR', bml_qr: 'QR', bml: 'BML online', bml_gateway: 'BML online', bml_connect: 'BML online',
  stripe: 'Card online', wallet: 'Wallet', customer_deposit: 'Wallet', house_account: 'Credit account', transfer: 'Bank transfer',
  bank_transfer: 'Bank transfer', gift_card: 'Gift card', loyalty: 'Points',
};
export function methodWord(method: string): string {
  return METHOD_WORDS[method] ?? (method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, ' '));
}

const STATUS_WORDS: Record<string, string> = {
  pending: 'Waiting', paid: 'Paid', confirmed: 'Confirmed', preparing: 'Cooking', in_progress: 'Cooking',
  ready: 'Ready', on_the_way: 'On the way', out_for_delivery: 'On the way', delivered: 'Delivered',
  completed: 'Done', cancelled: 'Cancelled', refunded: 'Refunded', held: 'On hold', payment_pending: 'Awaiting payment',
};
export function statusWord(status: string): string {
  return STATUS_WORDS[status] ?? (status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' '));
}
