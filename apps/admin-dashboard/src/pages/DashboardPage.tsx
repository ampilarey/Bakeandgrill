import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChefHat, ClipboardList, Clock, CreditCard, DollarSign, MessageSquare, Monitor, Package, Printer, Receipt, ShoppingBag, Trash2, TrendingUp, Truck, Users } from 'lucide-react';
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
  fetchPosOverview,
  formatAuditAction,
  fetchMaintenancePreview,
  cleanupStaleTickets,
  fetchPrintJobs,
  fetchSmsLogStats,
  getCreditExposureReport,
  type MaintenancePreview,
  type InventoryItem,
  type Order,
  type Shift,
} from '../api';
import { Card, ErrorMsg, PageHeader, PageShell, SectionLabel, Spinner, StatCard, TD, TH, TableCard } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { monthStart, today } from '../utils/dateHelpers';
import { readRestockDefaults } from '../utils/restockDefaults';
import { showDevNavItems } from '../components/navConfig';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(val: unknown) { return 'MVR ' + parseFloat(String(val ?? 0)).toFixed(2); }

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

const STATUS_COLOR: Record<string, string> = {
  pending:    'var(--color-warning)',
  confirmed:  '#3b82f6',
  preparing:  '#8b5cf6',
  ready:      'var(--color-success)',
  delivering: '#0ea5e9',
  delivered:  '#10b981',
  completed:  'var(--color-text-secondary)',
  cancelled:  'var(--color-danger)',
};

const STATUS_BG: Record<string, string> = {
  pending:    'var(--color-warning-bg)',
  confirmed:  '#DBEAFE',
  preparing:  '#EDE9FE',
  ready:      'var(--color-success-bg)',
  delivering: '#E0F2FE',
  delivered:  '#D1FAE5',
  completed:  'var(--color-bg)',
  cancelled:  'var(--color-danger-bg)',
};

// ── sub-components ────────────────────────────────────────────────────────────


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
          borderRadius: 20, padding: '2px 9px', textTransform: 'capitalize',
        }}>{order.status}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
        <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>
          {(order.type ?? '').replace('_', ' ')}
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

function ShiftBanner({ shift }: { shift: Shift | null }) {
  if (!shift) return (
    <div style={{
      background: 'var(--color-warning-bg)', border: '1.5px solid #fbbf24', borderRadius: 12,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
    }}>
      <AlertTriangle size={16} color="#d97706" />
      <span style={{ color: 'var(--color-warning-strong)', fontWeight: 600 }}>No shift open — cash drawer is untracked.</span>
    </div>
  );
  // Shift model exposes open/closed via `closed_at` (no `status`
  // column). Using `status` here always evaluated false so a closed
  // shift never showed the "Last shift closed" banner.
  if (shift.closed_at) return (
    <div style={{
      background: 'var(--color-bg)', border: '1.5px solid var(--color-border)', borderRadius: 12,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
    }}>
      <Clock size={16} color="var(--color-text-muted)" />
      <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Last shift closed.</span>
    </div>
  );
  const opened = new Date(shift.opened_at);
  const dur = Math.floor((Date.now() - opened.getTime()) / 60000);
  const hrs = Math.floor(dur / 60), mins = dur % 60;
  const stale = hrs >= 24;
  return (
    <div style={{
      background: stale ? 'var(--color-warning-bg)' : '#F0FDF4',
      border: `1.5px solid ${stale ? '#fbbf24' : '#86efac'}`,
      borderRadius: 12,
      padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {stale ? <AlertTriangle size={16} color="#d97706" /> : <CheckCircle2 size={16} color="var(--color-success)" />}
        <span style={{ fontWeight: 700, fontSize: 13, color: stale ? 'var(--color-warning-strong)' : 'var(--color-success-strong)' }}>
          Shift Open{stale ? ' — close this shift' : ''}
        </span>
        <span style={{ fontSize: 12, color: stale ? 'var(--color-warning-strong)' : 'var(--color-success-strong)' }}>
          {hrs > 0 ? `${hrs}h ` : ''}{mins}m · by {shift.opened_by ?? 'Unknown'}
        </span>
        {stale && (
          <span style={{ fontSize: 12, color: 'var(--color-warning-strong)' }}>
            Left open too long — close from Shifts so cash totals stay accurate.
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, marginLeft: 'auto', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: stale ? 'var(--color-warning-strong)' : 'var(--color-success-strong)' }}>
          <strong>Opening: </strong>{fmt(shift.opening_cash)}
        </span>
        <span style={{ fontSize: 12, color: stale ? 'var(--color-warning-strong)' : 'var(--color-success-strong)' }}>
          <strong>Expected: </strong>{fmt(shift.expected_cash ?? shift.opening_cash)}
        </span>
        {(shift.cash_movements?.length ?? 0) > 0 && (
          <span style={{ fontSize: 12, color: 'var(--color-success-strong)' }}>
            <strong>Movements: </strong>{shift.cash_movements.length}
          </span>
        )}
      </div>
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
            style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 12, fontFamily: 'inherit' }}
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
              background: 'var(--color-warning-bg)', border: '1px solid #fbbf24', fontSize: 13, color: 'var(--color-warning-strong)',
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
  const canOrders = can('orders.view');
  const canInventory = can('inventory.view');
  const canViewShifts = can('shifts.view_all_history');
  const canSms = can('sms_marketing.view');
  const canPrintJobs = can('devices.view');
  const canDelivery = can('delivery.view');
  const showChecklist = showDevNavItems() || can('website.manage');
  const [summaryDate, setSummaryDate] = useState(today);

  // Tracks orders that changed status since the last poll — drives the "recent changes" panel
  const [liveEvents, setLiveEvents] = useState<{ id: number; order_number: string; status: string; ts: number }[]>([]);
  const prevOrdersRef  = useRef<Record<number, string>>({});
  const isFirstLoadRef = useRef(true);

  const viewingToday = summaryDate === today();

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

  const {
    data: activeOrders = [],
    isLoading: ordersLoading,
    error: ordersQueryError,
  } = useQuery({
    queryKey: ['dashboard', 'active-orders'],
    queryFn: async () => {
      const r = await fetchOrders({ status: 'pending,paid,confirmed,preparing,in_progress,ready', per_page: 50 });
      return r.data ?? [];
    },
    enabled: canOrders,
    refetchInterval: canOrders ? 10_000 : false,
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

  const { data: printPending = 0 } = useQuery({
    queryKey: ['dashboard', 'print-jobs-pending'],
    queryFn: async () => {
      const r = await fetchPrintJobs({ status: 'pending' });
      return r.meta?.total ?? r.data?.length ?? 0;
    },
    enabled: canPrintJobs,
  });

  const { data: smsStats = { sent: 0, failed: 0 } } = useQuery({
    queryKey: ['dashboard', 'sms-stats'],
    queryFn: fetchSmsLogStats,
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
  const pendingCount   = activeOrders.filter((o) => o.status === 'pending').length;
  const preparingCount = activeOrders.filter((o) => ['confirmed', 'preparing'].includes(o.status)).length;
  const readyCount     = activeOrders.filter((o) => o.status === 'ready').length;
  const onlinePending  = activeOrders.filter((o) =>
    o.status === 'pending' && (o.type === 'online_pickup' || o.type.startsWith('online')),
  ).length;
  const deliveryPending = activeOrders.filter((o) =>
    o.type === 'delivery' && !['completed', 'cancelled', 'delivered'].includes(o.status),
  ).length;
  const pickupPending = activeOrders.filter((o) =>
    (o.type === 'pickup' || o.type === 'takeaway' || o.type === 'online_pickup')
    && !['completed', 'cancelled', 'delivered'].includes(o.status),
  ).length;

  const opsCards: { key: string; label: string; value: string; sub?: string; accent: string; icon: React.ElementType; onClick: () => void }[] = [];
  if (canFinancialSummary && summary) {
    opsCards.push({
      key: 'sales', label: "Today's Sales", value: fmt(summary.revenue),
      sub: `${summary.orders} completed orders`, accent: 'var(--color-primary)', icon: DollarSign,
      onClick: () => navigate('/reports'),
    });
  }
  if (canOrders) {
    opsCards.push({
      key: 'active', label: 'Active Orders', value: String(activeOrders.length),
      sub: `${pendingCount} pending · ${readyCount} ready`, accent: '#8b5cf6', icon: ShoppingBag,
      onClick: () => navigate('/orders'),
    });
    if (onlinePending > 0) {
      opsCards.push({
        key: 'online', label: 'Online Pending', value: String(onlinePending),
        sub: 'Awaiting confirmation', accent: '#3b82f6', icon: Monitor,
        onClick: () => navigate('/orders'),
      });
    }
  }
  if (canInventory && (lowStockTotal > 0 || stockRunway.length > 0)) {
    opsCards.push({
      key: 'stock', label: 'Inventory Alerts', value: String(lowStockTotal + stockRunway.length),
      sub: `${lowStockTotal} reorder · ${stockRunway.length} runway`, accent: 'var(--color-danger)', icon: Package,
      onClick: () => navigate('/inventory'),
    });
  }
  if (canViewShifts) {
    opsCards.push({
      key: 'shift', label: shift ? 'Shift Open' : 'No Open Shift',
      value: shift ? fmt(shift.expected_cash ?? shift.opening_cash) : '—',
      sub: shift ? `Since ${elapsed(shift.opened_at)}` : 'Open shifts on POS',
      accent: shift ? 'var(--color-success)' : 'var(--color-text-muted)', icon: CreditCard,
      onClick: () => navigate('/shifts'),
    });
  }
  if (canSms) {
    opsCards.push({
      key: 'sms', label: 'SMS Today', value: String(smsSent),
      sub: smsFailed > 0 ? `${smsFailed} failed` : 'Messages sent', accent: '#0ea5e9', icon: MessageSquare,
      onClick: () => navigate('/sms'),
    });
  }
  if (canPrintJobs && printPending > 0) {
    opsCards.push({
      key: 'print', label: 'Print Queue', value: String(printPending),
      sub: 'Pending jobs', accent: 'var(--color-warning)', icon: Printer,
      onClick: () => navigate('/print-jobs'),
    });
  }
  if (canDelivery && deliveryPending > 0) {
    opsCards.push({
      key: 'delivery', label: 'Delivery Active', value: String(deliveryPending),
      sub: 'In progress', accent: 'var(--color-primary)', icon: Truck,
      onClick: () => navigate('/delivery'),
    });
  } else if (canOrders && pickupPending > 0) {
    opsCards.push({
      key: 'pickup', label: 'Pickup Waiting', value: String(pickupPending),
      sub: 'Ready or in queue', accent: 'var(--color-success)', icon: CheckCircle2,
      onClick: () => navigate('/orders'),
    });
  }

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
                fontSize: 12, fontWeight: 700, color: 'var(--color-primary)',
                background: 'rgba(212,129,58,0.1)', border: '1px solid rgba(212,129,58,0.3)',
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <ClipboardList size={14} />
              Go-live checklist
            </button>
            )}
            <input
              type="date"
              value={summaryDate}
              max={today()}
              onChange={(e) => e.target.value && setSummaryDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--color-bg)', color: 'var(--color-text)', cursor: 'pointer' }}
            />
            {summaryDate !== today() && (
              <button
                onClick={() => setSummaryDate(today())}
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(212,129,58,0.1)', border: '1px solid rgba(212,129,58,0.3)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ← Today
              </button>
            )}
          </div>
        }
      />

      {opsCards.length > 0 && (
        <>
          <SectionLabel>Operations</SectionLabel>
          <div className="stat-grid" data-responsive-grid style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
            {opsCards.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.onClick}
                style={{
                  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'inherit', width: '100%',
                }}
              >
                <StatCard label={c.label} value={c.value} sub={c.sub} accent={c.accent} icon={c.icon} />
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Shift banner ── */}
      {canViewShifts && (shiftErr ? <ErrorMsg message={shiftErr} /> : <ShiftBanner shift={shift} />)}

      {showPosOverview && (
        <>
          <div style={{ height: 20 }} />
          <SectionLabel>POS live</SectionLabel>
          {posOverviewErr && <ErrorMsg message={posOverviewErr} />}
          {posOverview && (
            <>
              <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14, marginBottom: 16 }}>
                <StatCard label="Open Shifts" value={String(posOverview.open_shifts_count)} accent="var(--color-success)" icon={Users} />
                <StatCard label="Open Tickets" value={String(posOverview.active_tickets)} sub="Not completed yet" accent="var(--color-primary)" icon={ShoppingBag} />
                <StatCard label="Clocked In" value={String(posOverview.clocked_in_count)} accent="#8b5cf6" icon={Clock} />
                <StatCard label="Pending Devices" value={String(posOverview.pending_devices)} accent="var(--color-warning)" icon={Monitor} />
                <StatCard label="Voids Today" value={String(posOverview.today_voids)} accent="var(--color-danger)" icon={Trash2} />
                <StatCard label="Refunds Today" value={String(posOverview.today_refunds)} accent="var(--color-text-secondary)" icon={Receipt} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Open shifts</span>
                    <button
                      type="button"
                      onClick={() => navigate('/shifts')}
                      style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      View all →
                    </button>
                  </div>
                  {posOverview.open_shifts.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>No open shifts.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {posOverview.open_shifts.slice(0, 5).map((s) => {
                        const hrsOpen = (Date.now() - new Date(s.opened_at).getTime()) / 3_600_000;
                        const stale = hrsOpen >= 24;
                        return (
                          <Link
                            key={s.id}
                            to={`/shifts?shift=${s.id}`}
                            style={{
                              display: 'flex', justifyContent: 'space-between', fontSize: 13,
                              color: stale ? 'var(--color-warning-strong)' : undefined,
                              textDecoration: 'none',
                            }}
                          >
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

                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Recent POS activity</span>
                    <button
                      type="button"
                      onClick={() => navigate('/activity')}
                      style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Full log →
                    </button>
                  </div>
                  {posOverview.recent_activity.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>No recent activity.</p>
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
            </>
          )}
        </>
      )}

      <div style={{ height: 20 }} />

      {/* ── Today KPIs ── */}
      {canFinancialSummary && (
      <>
      <SectionLabel>Today at a glance</SectionLabel>
      <p style={{ margin: '-8px 0 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
        Completed sales for {summaryDate === today() ? 'today' : summaryDate}. Open tickets below are not included until the order is completed.
      </p>
      {summaryErr && <ErrorMsg message={summaryErr} />}
      {summaryLoading ? <Spinner /> : summary && (
        <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard label="Completed Sales" value={fmt(summary.revenue)} sub="Finished orders only" accent="var(--color-primary)" icon={DollarSign} />
          <StatCard label="Net Profit" value={fmt(summary.net_profit)}
            accent={summary.net_profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}
            icon={TrendingUp}
            trend={summary.net_profit >= 0
              ? { value: 'Profit', positive: true }
              : { value: 'Loss', positive: false }}
          />
          <StatCard label="Orders"     value={String(summary.orders)}  sub={`Avg ${fmt(summary.avg_order)}`} accent="#8b5cf6" icon={ShoppingBag} />
          <StatCard label="Tax"        value={fmt(summary.tax)}        accent="var(--color-warning)" icon={Receipt} />
          <StatCard label="Expenses"   value={fmt(summary.expenses)}   accent="#f97316" icon={CreditCard} />
          <StatCard label="Waste Cost" value={fmt(summary.waste_cost)} accent="var(--color-danger)" icon={Trash2} />
          {creditExposure && creditExposure.total_balance > 0 && (
            <StatCard
              label="Credit Exposure"
              value={fmt(creditExposure.total_balance)}
              sub={`${creditExposure.customers_count} customer${creditExposure.customers_count !== 1 ? 's' : ''} with balance`}
              accent="var(--color-danger)"
              icon={CreditCard}
            />
          )}
        </div>
      )}

      </>
      )}

      {/* ── Two-column grid: active orders + live feed ── */}
      {canOrders && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>

        {/* Active orders */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Active Orders</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
              {ordersLoading ? '…' : `${activeOrders.length} orders`}
            </span>
          </div>

          {/* Status quick-counts */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Pending',   count: pendingCount,   color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: <Clock size={12} /> },
              { label: 'Preparing', count: preparingCount, color: '#8b5cf6', bg: '#EDE9FE', icon: <ChefHat size={12} /> },
              { label: 'Ready',     count: readyCount,     color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: <CheckCircle2 size={12} /> },
            ].map(({ label, count, color, bg, icon }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: bg, borderRadius: 20, padding: '4px 10px',
                fontSize: 12, fontWeight: 700, color,
              }}>
                {icon} {count} {label}
              </div>
            ))}
          </div>

          {ordersErr && <ErrorMsg message={ordersErr} />}
          {ordersLoading ? <Spinner /> : activeOrders.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                No active orders right now.
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

        {/* Live event feed */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recent Changes</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>polls every 10s</span>
          </div>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {liveEvents.length === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                <Users size={20} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
                Waiting for order events…
              </div>
            ) : (
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {liveEvents.map((ev) => (
                  <div key={`${ev.id}-${ev.ts}`} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', borderBottom: '1px solid #F3EDE4',
                    animation: 'fadeSlideIn 0.25s ease',
                  }}>
                    <Link
                      to={`/orders?order=${ev.id}`}
                      style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none', minWidth: 70 }}
                    >
                      #{ev.order_number}
                    </Link>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: STATUS_COLOR[ev.status] ?? 'var(--color-text-secondary)',
                      background: STATUS_BG[ev.status] ?? 'var(--color-bg)',
                      borderRadius: 20, padding: '2px 8px', textTransform: 'capitalize',
                    }}>{ev.status}</span>
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

      {/* ── Bottom row: top items + low stock ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>

        {/* Top selling items */}
        {summary && (summary.top_items ?? []).length > 0 && (
          <div>
            <SectionLabel>Top Selling Today</SectionLabel>
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={TH}>#</th>
                    <th style={TH}>Item</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Qty</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary.top_items ?? []).slice(0, 8).map((item, i) => (
                    <tr key={i}>
                      <td style={{ ...TD, color: 'var(--color-text-muted)', width: 28 }}>{i + 1}</td>
                      <td style={TD}>{item.name}</td>
                      <td style={{ ...TD, textAlign: 'right', color: 'var(--color-text-secondary)' }}>{item.qty}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>
                        {fmt(item.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          </div>
        )}

        {/* Inventory intelligence */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Inventory Intelligence</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => navigate('/inventory')} style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Inventory →</button>
              <button type="button" onClick={() => navigate('/forecasts?section=restock')} style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Restock Plan →</button>
              <button type="button" onClick={() => navigate('/reports?tab=Spend%20Hub')} style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Spend Hub →</button>
              {poSuggestCount > 0 && (
                <button type="button" onClick={() => navigate('/purchase-orders')} style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {poSuggestCount} PO suggestions →
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
            <StatCard label="Below Reorder" value={String(lowStockTotal)} accent="var(--color-danger)" icon={Package} />
            <StatCard label="Runway Risk" value={String(stockRunway.length)} sub="≤7 days stock" accent="#f97316" icon={AlertTriangle} />
            <StatCard label="PO Suggestions" value={String(poSuggestCount)} accent="#8b5cf6" icon={TrendingUp} />
            {spendRestock && (
              <>
                <StatCard
                  label="Due Soon"
                  value={String(spendRestock.dueSoon)}
                  sub="Restock plan"
                  accent={spendRestock.dueSoon > 0 ? '#c2410c' : 'var(--color-success)'}
                  icon={ClipboardList}
                />
                <StatCard
                  label="Already on PO"
                  value={String(spendRestock.withOpenPo)}
                  sub="Open draft/ordered"
                  accent="var(--color-warning-strong)"
                  icon={ShoppingBag}
                />
                {(spendRestock.openAlerts ?? 0) > 0 && (
                  <StatCard
                    label="Reorder Alerts"
                    value={String(spendRestock.openAlerts)}
                    sub="Open below-ROP alerts"
                    accent="var(--color-danger-strong)"
                    icon={AlertTriangle}
                  />
                )}
                <StatCard
                  label="MTD Purchases"
                  value={fmt(spendRestock.mtdPurchases)}
                  sub="Received POs"
                  accent="var(--color-primary)"
                  icon={Package}
                />
                <StatCard
                  label="MTD Waste"
                  value={fmt(spendRestock.mtdWaste)}
                  sub={`Expenses ${fmt(spendRestock.mtdExpenses)}`}
                  accent="var(--color-danger)"
                  icon={Trash2}
                />
              </>
            )}
          </div>

          {lowStockErr && <ErrorMsg message={lowStockErr} />}

          {spendRestock && spendRestock.dueSoonItems.length > 0 && (
            <Card style={{ marginBottom: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#9a3412' }}>Restock due soon</p>
                <button
                  type="button"
                  onClick={() => navigate('/forecasts?section=restock')}
                  style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Open Restock Plan →
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {spendRestock.dueSoonItems.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
                    <Link to={`/inventory?item=${item.id}`} style={{ fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}>{item.name}</Link>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      Order {item.suggested_order_qty} {item.unit}
                      {item.open_purchase ? (
                        <>
                          {' · '}
                          <Link
                            to={`/purchase-orders?search=${encodeURIComponent(item.open_purchase)}`}
                            style={{ color: 'var(--color-warning-strong)', fontWeight: 700, textDecoration: 'none' }}
                          >
                            On {item.open_purchase}
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {spendRestock && spendRestock.dueSoonItems.length === 0 && (spendRestock.mtdWithWaste > 0 || spendRestock.mtdPurchases > 0) && (
            <Card style={{ marginBottom: 12, padding: 14 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Month to date: purchases {fmt(spendRestock.mtdPurchases)} · expenses {fmt(spendRestock.mtdExpenses)} · waste {fmt(spendRestock.mtdWaste)} · with waste {fmt(spendRestock.mtdWithWaste)}
                {' · '}
                <button type="button" onClick={() => navigate('/reports?tab=Spend%20Hub')} style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                  Spend Hub →
                </button>
              </p>
            </Card>
          )}

          {stockRunway.length > 0 && (
            <Card style={{ marginBottom: 12, padding: 14 }}>
              <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--color-warning-strong)' }}>Stock-out runway (consumption rate)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stockRunway.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{item.name}</span>
                    <span style={{ color: item.status === 'out_of_stock' ? 'var(--color-danger)' : '#f97316', fontWeight: 700 }}>
                      {item.days_of_stock == null ? 'Out' : `${item.days_of_stock.toFixed(1)}d left`}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {lowStock.length === 0 && stockRunway.length === 0 && !lowStockErr ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--color-success)', fontSize: 13 }}>
                <Package size={20} style={{ display: 'block', margin: '0 auto 8px' }} />
                All stock levels look healthy.
              </div>
            </Card>
          ) : lowStock.length > 0 ? (
            <TableCard>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Below reorder point</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={TH}>Item</th>
                    <th style={{ ...TH, textAlign: 'right' }}>On Hand</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Reorder At</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((item) => {
                    const critical = item.reorder_level !== null && item.quantity_on_hand <= 0;
                    return (
                      <tr key={item.id}>
                        <td style={{ ...TD, fontWeight: 600 }}>{item.name}</td>
                        <td style={{ ...TD, textAlign: 'right', color: critical ? 'var(--color-danger)' : '#f97316', fontWeight: 700 }}>
                          {item.quantity_on_hand} {item.unit}
                        </td>
                        <td style={{ ...TD, textAlign: 'right', color: 'var(--color-text-muted)' }}>
                          {item.reorder_level ?? '—'} {item.reorder_level ? item.unit : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>
          ) : null}
        </div>

        {/* Orders by channel */}
        {summary && (summary.by_type ?? []).length > 0 && (
          <div>
            <SectionLabel>Today by Channel</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(summary.by_type ?? []).map((t) => {
                const pct = summary.revenue > 0 ? (t.revenue / summary.revenue) * 100 : 0;
                return (
                  <div key={t.type} style={{
                    background: 'var(--color-surface)', borderRadius: 10, padding: '11px 16px',
                    border: '1px solid var(--color-border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ flex: 1, fontSize: 13, textTransform: 'capitalize', color: 'var(--color-text)', fontWeight: 600 }}>
                        {t.type.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.count} orders</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(t.revenue)}</span>
                    </div>
                    <div style={{ height: 4, background: '#F3EDE4', borderRadius: 4 }}>
                      <div style={{ height: 4, background: 'var(--color-primary)', borderRadius: 4, width: `${pct}%`, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {canFinancialSummary && salesSummary && (
        <>
          <div style={{ height: 20 }} />
          <SectionLabel>Revenue breakdown</SectionLabel>
          <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
            <StatCard
              label="Service charge"
              value={fmt(salesSummary.service_charge_total ?? 0)}
              sub="Completed orders"
              accent="#0ea5e9"
              icon={Receipt}
            />
            <StatCard
              label="Delivery fees"
              value={fmt(salesSummary.delivery_fee_total ?? 0)}
              sub="Completed orders"
              accent="var(--color-primary)"
              icon={Truck}
            />
            {(salesSummary.payment_commission?.totals.net_settlement ?? 0) > 0 && (
              <>
                {(salesSummary.payment_commission?.by_channel ?? []).filter((row) => row.net > 0).map((row) => (
                  <StatCard
                    key={row.channel}
                    label={`Net ${row.label}`}
                    value={fmt(row.net)}
                    sub={`Gross ${fmt(row.gross)} · Fee ${fmt(row.commission)}`}
                    accent="var(--color-success-strong)"
                    icon={Receipt}
                  />
                ))}
              </>
            )}
          </div>
          {salesSummary.payments && Object.keys(salesSummary.payments).length > 0 && (
            <Card style={{ marginBottom: 24 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Payment methods</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(salesSummary.payments)
                  .sort(([, a], [, b]) => Number(b) - Number(a))
                  .map(([method, amount]) => (
                    <div key={method} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--color-text)' }}>{method.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(amount)}</span>
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── System Health (owner/admin) ── */}
      {health && (
        <Card style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>System Health</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {showMaintenance && (
                <button
                  type="button"
                  onClick={() => navigate('/system-health')}
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Full report →
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: health.status === 'ok' ? 'var(--color-success)' : 'var(--color-danger)',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: health.status === 'ok' ? 'var(--color-success-strong)' : 'var(--color-danger-strong)', textTransform: 'uppercase' }}>
                {health.status}
              </span>
              </div>
            </div>
          </div>
          {health.env_mismatch && (
            <div style={{
              marginBottom: 12, padding: '10px 14px', borderRadius: 10,
              background: 'var(--color-danger-bg)', border: '1px solid #FECACA', color: 'var(--color-danger-strong)',
              fontSize: 13, fontWeight: 600,
            }}>
              Staging host ({health.host}) but APP_ENV is &quot;{health.environment}&quot; — set APP_ENV=staging on this server.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { label: 'Environment', value: health.environment },
              { label: 'Host', value: health.host ?? '—' },
              { label: 'Database', value: health.database },
              { label: 'Last Check', value: new Date(health.timestamp).toLocaleTimeString() },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#F9F5F0', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ margin: '0 0 2px', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)', textTransform: 'capitalize' }}>{value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {showMaintenance && (
        <MaintenancePanel onDone={() => { void queryClient.invalidateQueries({ queryKey: ['dashboard', 'pos-overview'] }); }} />
      )}
    </>

    </PageShell>
  );
}
