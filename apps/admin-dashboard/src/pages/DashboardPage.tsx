import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChefHat, Clock, CreditCard, DollarSign, Monitor, Package, Play, Receipt, ShoppingBag, Trash2, TrendingUp, Users } from 'lucide-react';
import { playChime } from '../utils/audio';
import { pushNotification } from '../utils/notifications';
import {
  fetchOrders,
  fetchLowStockItems,
  getCurrentShift,
  getDailySummary,
  getSystemHealth,
  kdsStart,
  fetchPosOverview,
  formatAuditAction,
  type InventoryItem,
  type Order,
  type Shift,
  type SystemHealth,
  type PosOverview,
} from '../api';
import { Card, ErrorMsg, PageHeader, SectionLabel, Spinner, StatCard, TD, TH, TableCard } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

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
  pending:    '#f59e0b',
  confirmed:  '#3b82f6',
  preparing:  '#8b5cf6',
  ready:      '#22c55e',
  delivering: '#0ea5e9',
  delivered:  '#10b981',
  completed:  '#6B5D4F',
  cancelled:  '#ef4444',
};

const STATUS_BG: Record<string, string> = {
  pending:    '#FEF3C7',
  confirmed:  '#DBEAFE',
  preparing:  '#EDE9FE',
  ready:      '#DCFCE7',
  delivering: '#E0F2FE',
  delivered:  '#D1FAE5',
  completed:  '#F8F6F3',
  cancelled:  '#FEE2E2',
};

type DailySummary = {
  date: string; revenue: number; tax: number; orders: number;
  avg_order: number; expenses: number; purchases: number;
  waste_cost: number; net_profit: number;
  by_type: { type: string; count: number; revenue: number }[];
  top_items: { name: string; qty: number; revenue: number }[];
};

// ── sub-components ────────────────────────────────────────────────────────────


function OrderCard({ order, now, onPrepare }: { order: Order; now: number; onPrepare: (id: number) => void }) {
  void now;
  const [preparing, setPreparing] = useState(false);
  const color  = STATUS_COLOR[order.status] ?? '#9C8E7E';
  const bg     = STATUS_BG[order.status]    ?? '#F8F6F3';
  const urgent = ['pending', 'confirmed'].includes(order.status) &&
    (Date.now() - new Date(order.created_at).getTime()) > 10 * 60 * 1000;
  const canPrepare = ['pending', 'paid'].includes(order.status);

  const handlePrepare = async () => {
    setPreparing(true);
    try { await kdsStart(order.id); onPrepare(order.id); }
    catch { /* non-critical */ }
    finally { setPreparing(false); }
  };

  return (
    <div style={{
      background: '#fff',
      border: `1.5px solid ${urgent ? '#ef4444' : '#E8E0D8'}`,
      borderRadius: 12,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1C1408' }}>#{order.order_number}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, color, background: bg,
          borderRadius: 20, padding: '2px 9px', textTransform: 'capitalize',
        }}>{order.status}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#6B5D4F' }}>
        <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>
          {(order.type ?? '').replace('_', ' ')}
          {order.table_number ? ` · T${order.table_number}` : ''}
        </span>
        <span style={{ marginLeft: 'auto', color: urgent ? '#ef4444' : '#9C8E7E' }}>
          {urgent && <AlertTriangle size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />}
          {elapsed(order.created_at)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#D4813A' }}>{fmt(order.total)}</span>
        {canPrepare && (
          <button
            onClick={() => void handlePrepare()}
            disabled={preparing}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 8, border: 'none',
              background: preparing ? '#F0EBE5' : '#FEF3E8',
              color: preparing ? '#9C8E7E' : '#D4813A',
              fontSize: 12, fontWeight: 700, cursor: preparing ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          >
            <Play size={11} />
            {preparing ? 'Starting…' : 'Prepare'}
          </button>
        )}
      </div>
    </div>
  );
}

function ShiftBanner({ shift }: { shift: Shift | null }) {
  if (!shift) return (
    <div style={{
      background: '#FEF3C7', border: '1.5px solid #fbbf24', borderRadius: 12,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
    }}>
      <AlertTriangle size={16} color="#d97706" />
      <span style={{ color: '#92400e', fontWeight: 600 }}>No shift open — cash drawer is untracked.</span>
    </div>
  );
  // Shift model exposes open/closed via `closed_at` (no `status`
  // column). Using `status` here always evaluated false so a closed
  // shift never showed the "Last shift closed" banner.
  if (shift.closed_at) return (
    <div style={{
      background: '#F8F6F3', border: '1.5px solid #E8E0D8', borderRadius: 12,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
    }}>
      <Clock size={16} color="#9C8E7E" />
      <span style={{ color: '#6B5D4F', fontWeight: 600 }}>Last shift closed.</span>
    </div>
  );
  const opened = new Date(shift.opened_at);
  const dur = Math.floor((Date.now() - opened.getTime()) / 60000);
  const hrs = Math.floor(dur / 60), mins = dur % 60;
  const stale = hrs >= 24;
  return (
    <div style={{
      background: stale ? '#FEF3C7' : '#F0FDF4',
      border: `1.5px solid ${stale ? '#fbbf24' : '#86efac'}`,
      borderRadius: 12,
      padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {stale ? <AlertTriangle size={16} color="#d97706" /> : <CheckCircle2 size={16} color="#22c55e" />}
        <span style={{ fontWeight: 700, fontSize: 13, color: stale ? '#92400e' : '#166534' }}>
          Shift Open{stale ? ' — close this shift' : ''}
        </span>
        <span style={{ fontSize: 12, color: stale ? '#92400e' : '#15803d' }}>
          {hrs > 0 ? `${hrs}h ` : ''}{mins}m · by {shift.opened_by ?? 'Unknown'}
        </span>
        {stale && (
          <span style={{ fontSize: 12, color: '#92400e' }}>
            Left open too long — close from Shifts so cash totals stay accurate.
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, marginLeft: 'auto', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: stale ? '#92400e' : '#15803d' }}>
          <strong>Opening: </strong>{fmt(shift.opening_cash)}
        </span>
        <span style={{ fontSize: 12, color: stale ? '#92400e' : '#15803d' }}>
          <strong>Expected: </strong>{fmt(shift.expected_cash ?? shift.opening_cash)}
        </span>
        {(shift.cash_movements?.length ?? 0) > 0 && (
          <span style={{ fontSize: 12, color: '#15803d' }}>
            <strong>Movements: </strong>{shift.cash_movements.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DashboardPage() {
  usePageTitle('Dashboard');
  const now = useNow();
  const navigate = useNavigate();
  const { can } = useCurrentUserPermissions();
  const showPosOverview = can('reports.view');
  const [summaryDate, setSummaryDate] = useState(localToday);

  const [summary, setSummary]       = useState<DailySummary | null>(null);
  const [summaryErr, setSummaryErr] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [activeOrders, setActiveOrders]   = useState<Order[]>([]);
  const [ordersErr, setOrdersErr]         = useState('');
  const [ordersLoading, setOrdersLoading] = useState(true);

  const [lowStock, setLowStock]       = useState<InventoryItem[]>([]);
  const [lowStockErr, setLowStockErr] = useState('');

  const [shift, setShift]     = useState<Shift | null>(null);
  const [shiftErr, setShiftErr] = useState('');

  // Tracks orders that changed status since the last poll — drives the "recent changes" panel
  const [liveEvents, setLiveEvents] = useState<{ id: number; order_number: string; status: string; ts: number }[]>([]);
  const prevOrdersRef  = useRef<Record<number, string>>({});
  const isFirstLoadRef = useRef(true);

  // ── load daily summary ──
  useEffect(() => {
    setSummaryLoading(true); setSummaryErr('');
    getDailySummary(summaryDate)
      .then(setSummary)
      .catch((e: Error) => setSummaryErr(e.message))
      .finally(() => setSummaryLoading(false));
  }, [summaryDate]);

  // ── load active orders (poll every 10s) — diff drives the live feed ──
  const loadOrders = () => {
    fetchOrders({ status: 'pending,paid,confirmed,preparing,in_progress,ready', per_page: 50 })
      .then((r) => {
        setActiveOrders(r.data ?? []);
        setOrdersErr('');
        // Detect status changes and brand-new orders since last poll
        const changed: typeof liveEvents = [];
        const newPending: typeof liveEvents = [];
        (r.data ?? []).forEach((o) => {
          if (prevOrdersRef.current[o.id] === undefined) {
            // Brand-new order appeared in the feed
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
      })
      .catch((e: Error) => setOrdersErr(e.message))
      .finally(() => setOrdersLoading(false));
  };
  useEffect(() => {
    loadOrders();
    const t = setInterval(loadOrders, 10_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── load low stock ──
  useEffect(() => {
    fetchLowStockItems()
      .then((r) => {
        const items = r.data ?? [];
        setLowStock(items.slice(0, 8));
        if (items.length > 0) {
          const key = 'admin_low_stock_notified_count';
          const prev = sessionStorage.getItem(key);
          if (prev !== String(items.length)) {
            pushNotification({ type: 'stock', title: 'Low Stock', body: `${items.length} item${items.length !== 1 ? 's' : ''} below reorder level` });
            sessionStorage.setItem(key, String(items.length));
          }
        }
      })
      .catch((e: Error) => setLowStockErr(e.message));
  }, []);

  // ── load shift ──
  useEffect(() => {
    getCurrentShift()
      .then((r) => setShift(r.shift))
      .catch((e: Error) => setShiftErr(e.message));
  }, []);

  const [health, setHealth] = useState<SystemHealth | null>(null);
  useEffect(() => {
    getSystemHealth()
      .then(setHealth)
      .catch(() => { /* non-blocking — requires website.manage permission */ });
  }, []);

  const [posOverview, setPosOverview] = useState<PosOverview | null>(null);
  const [posOverviewErr, setPosOverviewErr] = useState('');

  useEffect(() => {
    if (!showPosOverview) return;
    const load = () => {
      fetchPosOverview()
        .then(setPosOverview)
        .catch((e: Error) => setPosOverviewErr(e.message));
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [showPosOverview]);


  // ── derived ──
  const pendingCount   = activeOrders.filter((o) => o.status === 'pending').length;
  const preparingCount = activeOrders.filter((o) => ['confirmed', 'preparing'].includes(o.status)).length;
  const readyCount     = activeOrders.filter((o) => o.status === 'ready').length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={new Date(summaryDate + 'T00:00:00').toLocaleDateString('en-MV', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="date"
              value={summaryDate}
              max={localToday()}
              onChange={(e) => e.target.value && setSummaryDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #E8E0D8', fontSize: 13, fontFamily: 'inherit', background: '#F8F6F3', color: '#1C1408', cursor: 'pointer' }}
            />
            {summaryDate !== localToday() && (
              <button
                onClick={() => setSummaryDate(localToday())}
                style={{ fontSize: 12, fontWeight: 700, color: '#D4813A', background: 'rgba(212,129,58,0.1)', border: '1px solid rgba(212,129,58,0.3)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ← Today
              </button>
            )}
          </div>
        }
      />

      {/* ── Shift banner ── */}
      {shiftErr ? <ErrorMsg message={shiftErr} /> : <ShiftBanner shift={shift} />}

      {showPosOverview && (
        <>
          <div style={{ height: 20 }} />
          <SectionLabel>POS live</SectionLabel>
          {posOverviewErr && <ErrorMsg message={posOverviewErr} />}
          {posOverview && (
            <>
              <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14, marginBottom: 16 }}>
                <StatCard label="Open Shifts" value={String(posOverview.open_shifts_count)} accent="#22c55e" icon={Users} />
                <StatCard label="Open Tickets" value={String(posOverview.active_tickets)} sub="Not completed yet" accent="#D4813A" icon={ShoppingBag} />
                <StatCard label="Clocked In" value={String(posOverview.clocked_in_count)} accent="#8b5cf6" icon={Clock} />
                <StatCard label="Pending Devices" value={String(posOverview.pending_devices)} accent="#f59e0b" icon={Monitor} />
                <StatCard label="Voids Today" value={String(posOverview.today_voids)} accent="#ef4444" icon={Trash2} />
                <StatCard label="Refunds Today" value={String(posOverview.today_refunds)} accent="#6B5D4F" icon={Receipt} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1408' }}>Open shifts</span>
                    <button
                      type="button"
                      onClick={() => navigate('/shifts')}
                      style={{ fontSize: 12, color: '#D4813A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      View all →
                    </button>
                  </div>
                  {posOverview.open_shifts.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>No open shifts.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {posOverview.open_shifts.slice(0, 5).map((s) => (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ fontWeight: 600, color: '#1C1408' }}>{s.user_name ?? 'Unknown'}</span>
                          <span style={{ color: '#9C8E7E' }}>{s.device_name ?? 'No device'} · {elapsed(s.opened_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1408' }}>Recent POS activity</span>
                    <button
                      type="button"
                      onClick={() => navigate('/activity')}
                      style={{ fontSize: 12, color: '#D4813A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Full log →
                    </button>
                  </div>
                  {posOverview.recent_activity.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>No recent activity.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {posOverview.recent_activity.map((a) => (
                        <div key={a.id} style={{ fontSize: 12 }}>
                          <span style={{ fontWeight: 600, color: '#1C1408' }}>{formatAuditAction(a.action)}</span>
                          <span style={{ color: '#9C8E7E' }}> · {a.user_name ?? 'System'} · {elapsed(a.created_at)}</span>
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
      <SectionLabel>Today at a glance</SectionLabel>
      <p style={{ margin: '-8px 0 12px', fontSize: 12, color: '#9C8E7E' }}>
        Completed sales for {summaryDate === localToday() ? 'today' : summaryDate}. Open tickets below are not included until the order is completed.
      </p>
      {summaryErr && <ErrorMsg message={summaryErr} />}
      {summaryLoading ? <Spinner /> : summary && (
        <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard label="Completed Sales" value={fmt(summary.revenue)} sub="Finished orders only" accent="#D4813A" icon={DollarSign} />
          <StatCard label="Net Profit" value={fmt(summary.net_profit)}
            accent={summary.net_profit >= 0 ? '#22c55e' : '#ef4444'}
            icon={TrendingUp}
            trend={summary.net_profit >= 0
              ? { value: 'Profit', positive: true }
              : { value: 'Loss', positive: false }}
          />
          <StatCard label="Orders"     value={String(summary.orders)}  sub={`Avg ${fmt(summary.avg_order)}`} accent="#8b5cf6" icon={ShoppingBag} />
          <StatCard label="Tax"        value={fmt(summary.tax)}        accent="#f59e0b" icon={Receipt} />
          <StatCard label="Expenses"   value={fmt(summary.expenses)}   accent="#f97316" icon={CreditCard} />
          <StatCard label="Waste Cost" value={fmt(summary.waste_cost)} accent="#ef4444" icon={Trash2} />
        </div>
      )}

      {/* ── Two-column grid: active orders + live feed ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>

        {/* Active orders */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Active Orders</span>
            <span style={{ fontSize: 12, color: '#9C8E7E', marginLeft: 'auto' }}>
              {ordersLoading ? '…' : `${activeOrders.length} orders`}
            </span>
          </div>

          {/* Status quick-counts */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Pending',   count: pendingCount,   color: '#f59e0b', bg: '#FEF3C7', icon: <Clock size={12} /> },
              { label: 'Preparing', count: preparingCount, color: '#8b5cf6', bg: '#EDE9FE', icon: <ChefHat size={12} /> },
              { label: 'Ready',     count: readyCount,     color: '#22c55e', bg: '#DCFCE7', icon: <CheckCircle2 size={12} /> },
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
              <div style={{ textAlign: 'center', padding: '28px 0', color: '#9C8E7E', fontSize: 13 }}>
                No active orders right now.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
              {activeOrders.map((o) => (
                <OrderCard key={o.id} order={o} now={now} onPrepare={() => { void loadOrders(); }} />
              ))}
            </div>
          )}
        </div>

        {/* Live event feed */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recent Changes</span>
            <span style={{ fontSize: 11, color: '#9C8E7E', marginLeft: 'auto' }}>polls every 10s</span>
          </div>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {liveEvents.length === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', color: '#9C8E7E', fontSize: 13 }}>
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
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1C1408', minWidth: 70 }}>
                      #{ev.order_number}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: STATUS_COLOR[ev.status] ?? '#6B5D4F',
                      background: STATUS_BG[ev.status] ?? '#F8F6F3',
                      borderRadius: 20, padding: '2px 8px', textTransform: 'capitalize',
                    }}>{ev.status}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9C8E7E' }}>
                      {elapsed(new Date(ev.ts).toISOString())}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

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
                      <td style={{ ...TD, color: '#9C8E7E', width: 28 }}>{i + 1}</td>
                      <td style={TD}>{item.name}</td>
                      <td style={{ ...TD, textAlign: 'right', color: '#6B5D4F' }}>{item.qty}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#D4813A' }}>
                        {fmt(item.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          </div>
        )}

        {/* Low stock alerts */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Low Stock Alerts</span>
            {lowStock.length > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#ef4444',
                background: '#FEE2E2', borderRadius: 20, padding: '2px 8px',
              }}>{lowStock.length} items</span>
            )}
          </div>
          {lowStockErr && <ErrorMsg message={lowStockErr} />}
          {lowStock.length === 0 && !lowStockErr ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '28px 0', color: '#22c55e', fontSize: 13 }}>
                <Package size={20} style={{ display: 'block', margin: '0 auto 8px' }} />
                All stock levels are healthy.
              </div>
            </Card>
          ) : (
            <TableCard>
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
                        <td style={{ ...TD, textAlign: 'right', color: critical ? '#ef4444' : '#f97316', fontWeight: 700 }}>
                          {item.quantity_on_hand} {item.unit}
                        </td>
                        <td style={{ ...TD, textAlign: 'right', color: '#9C8E7E' }}>
                          {item.reorder_level ?? '—'} {item.reorder_level ? item.unit : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableCard>
          )}
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
                    background: '#fff', borderRadius: 10, padding: '11px 16px',
                    border: '1px solid #E8E0D8',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ flex: 1, fontSize: 13, textTransform: 'capitalize', color: '#1C1408', fontWeight: 600 }}>
                        {t.type.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: 12, color: '#9C8E7E' }}>{t.count} orders</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#D4813A' }}>{fmt(t.revenue)}</span>
                    </div>
                    <div style={{ height: 4, background: '#F3EDE4', borderRadius: 4 }}>
                      <div style={{ height: 4, background: '#D4813A', borderRadius: 4, width: `${pct}%`, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── System Health (owner/admin) ── */}
      {health && (
        <Card style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1C1408' }}>System Health</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: health.status === 'ok' ? '#22c55e' : '#ef4444',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: health.status === 'ok' ? '#15803D' : '#991B1B', textTransform: 'uppercase' }}>
                {health.status}
              </span>
            </div>
          </div>
          {health.env_mismatch && (
            <div style={{
              marginBottom: 12, padding: '10px 14px', borderRadius: 10,
              background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B',
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
                <p style={{ margin: '0 0 2px', fontSize: 11, color: '#9C8E7E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1C1408', textTransform: 'capitalize' }}>{value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
