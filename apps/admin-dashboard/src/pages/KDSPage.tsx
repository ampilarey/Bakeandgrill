import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchKdsOrders } from '../api';
import type { KdsTicket } from '../api';
import { fetchMenuGroups, fetchAdminItems } from '../api/menu';
import { Badge, Btn, Card, ErrorMsg, PageHeader, PageShell, Spinner, StatCard, statColor } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSse } from '../hooks/useSse';
import { playChime, playLateAlert } from '../utils/audio';

function elapsed(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function urgencyColor(iso: string): { solid: string; faint: string } {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { solid: '#22c55e', faint: 'rgba(34,197,94,0.13)' };
  const m = Math.floor((Date.now() - t) / 60000);
  if (m >= 15) return { solid: '#ef4444', faint: 'rgba(239,68,68,0.13)' };
  if (m >= 8)  return { solid: '#f97316', faint: 'rgba(249,115,22,0.13)' };
  return        { solid: '#22c55e', faint: 'rgba(34,197,94,0.13)' };
}

function minutesSince(iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / 60000);
}

const PREP_TARGET_DEFAULT = 12;

function ticketPrepTarget(ticket: KdsTicket, itemPrepMap: Record<number, number>): number {
  const times = (ticket.items ?? [])
    .map((line) => (line.item_id != null ? itemPrepMap[line.item_id] : null))
    .filter((v): v is number => v != null && v > 0);
  return times.length ? Math.max(...times) : PREP_TARGET_DEFAULT;
}

export function KDSPage() {
  usePageTitle('Kitchen Display');
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTicketFlash, setNewTicketFlash] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stationFilter, setStationFilter] = useState<number | 'all'>('all');
  const [menuGroups, setMenuGroups] = useState<{ id: number; name: string }[]>([]);
  const [itemGroupMap, setItemGroupMap] = useState<Record<number, number>>({});
  const [itemPrepMap, setItemPrepMap] = useState<Record<number, number>>({});
  const prevPendingIdsRef = useRef<Set<number>>(new Set());
  const lateAlertedRef = useRef<Set<number>>(new Set());
  const isFirstKdsLoad = useRef(true);
  const kdsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void (kdsRef.current ?? document.documentElement).requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetchKdsOrders();
      const incoming = res.orders ?? [];
      setTickets(incoming);
      setError('');

      const newIds = incoming
        .filter((t) => ['pending', 'paid', 'partial'].includes(t.status) && !prevPendingIdsRef.current.has(t.id))
        .map((t) => t.id);
      const nextSet = new Set(incoming.filter((t) => ['pending', 'paid', 'partial'].includes(t.status)).map((t) => t.id));
      prevPendingIdsRef.current = nextSet;

      if (!isFirstKdsLoad.current && newIds.length > 0) {
        playChime();
        setNewTicketFlash(true);
        setTimeout(() => setNewTicketFlash(false), 2500);
      }
      isFirstKdsLoad.current = false;

      const pendingLike = incoming.filter((t) => ['pending', 'paid', 'partial'].includes(t.status));
      for (const ticket of pendingLike) {
        const target = ticketPrepTarget(ticket, itemPrepMap);
        if (minutesSince(ticket.created_at) >= target && !lateAlertedRef.current.has(ticket.id)) {
          lateAlertedRef.current.add(ticket.id);
          playLateAlert();
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [itemPrepMap]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void fetchMenuGroups().then((r) => setMenuGroups(r.data ?? [])).catch(() => undefined);
    void fetchAdminItems({ per_page: 500 }).then((r) => {
      const map: Record<number, number> = {};
      const prepMap: Record<number, number> = {};
      for (const item of r.data ?? []) {
        if (item.id && item.menu_group_id) map[item.id] = item.menu_group_id;
        if (item.id && item.prep_time_minutes) prepMap[item.id] = item.prep_time_minutes;
      }
      setItemGroupMap(map);
      setItemPrepMap(prepMap);
    }).catch(() => undefined);
  }, []);

  const handleSseEvent = useCallback(() => { void load(); }, [load]);
  const { connected: sseConnected } = useSse('/stream/kds', { onEvent: handleSseEvent });

  useEffect(() => {
    if (sseConnected) return;
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [sseConnected, load]);

  const filteredTickets = useMemo(() => {
    if (stationFilter === 'all') return tickets;
    return tickets.filter((t) => (t.items ?? []).some((line) => {
      const itemId = line.item_id;
      return itemId != null && itemGroupMap[itemId] === stationFilter;
    }));
  }, [tickets, stationFilter, itemGroupMap]);

  const pending = filteredTickets.filter((t) => ['pending', 'paid', 'partial'].includes(t.status));
  const cooking = filteredTickets.filter((t) => ['in_progress', 'preparing'].includes(t.status));
  const ready   = filteredTickets.filter((t) => t.status === 'ready');

  const avgWait = (items: KdsTicket[]) => items.length
    ? Math.round(items.reduce((sum, t) => sum + minutesSince(t.created_at), 0) / items.length)
    : 0;

  const Column = ({ title, items, color, flash, children }: {
    title: string; items: KdsTicket[]; color: string; flash?: boolean;
    children: (t: KdsTicket) => React.ReactNode;
  }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        padding: '6px 10px', borderRadius: 10,
        background: flash ? 'rgba(245,158,11,0.12)' : 'transparent',
        transition: 'background 0.3s',
        animation: flash ? 'kds-pulse 0.5s ease-in-out 4' : 'none',
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: flash ? '#f59e0b' : color, boxShadow: flash ? '0 0 6px #f59e0b' : 'none', transition: 'box-shadow 0.3s' }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: flash ? '#92400E' : '#1C1408', transition: 'color 0.3s' }}>{title}</span>
        <span style={{
          background: flash ? '#f59e0b' : '#F8F6F3',
          color: flash ? '#fff' : '#6B5D4F', borderRadius: 999,
          padding: '1px 8px', fontSize: 12, fontWeight: 700,
          border: `1px solid ${flash ? '#f59e0b' : '#E8E0D8'}`,
          transition: 'all 0.3s',
        }}>{items.length}</span>
        {flash && <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', marginLeft: 2 }}>NEW!</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.length === 0
          ? <div style={{ color: '#9C8E7E', fontSize: 13, padding: '20px 0' }}>Nothing here</div>
          : items.map((t) => (
            <div key={t.id} style={{
              background: '#fff', borderRadius: 14, padding: '16px',
              border: `2px solid ${urgencyColor(t.created_at).faint}`,
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            }}>
              {children(t)}
            </div>
          ))
        }
      </div>
    </div>
  );

  return (
    <PageShell>
    <div ref={kdsRef} style={isFullscreen ? { background: '#F8F6F3', padding: 20, minHeight: '100vh' } : undefined}>
      <PageHeader section="Monitor"
        title="Kitchen Display"
        subtitle={sseConnected ? '● Live monitor' : '○ Polling every 15s'}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={load} variant="secondary">↻ Refresh</Btn>
            <Btn onClick={toggleFullscreen} variant="secondary" title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
              {isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}
            </Btn>
          </div>
        }
      />
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6B5D4F', lineHeight: 1.45 }}>
        Kitchen staff run tickets on the <strong>KDS app</strong> (<code style={{ fontSize: 12 }}>/kds</code>) — this screen is a live monitor for managers.
      </p>
      {error && <ErrorMsg message={error} />}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: '#6B5D4F', display: 'flex', alignItems: 'center', gap: 8 }}>
          Station
          <select
            value={stationFilter === 'all' ? 'all' : String(stationFilter)}
            onChange={(e) => setStationFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit' }}
          >
            <option value="all">All stations</option>
            {menuGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Pending avg wait" value={`${avgWait(pending)}m`} accent="#f59e0b" />
        <StatCard label="Cooking avg wait" value={`${avgWait(cooking)}m`} accent="#3b82f6" />
        <StatCard label="Ready queue" value={String(ready.length)} accent="#22c55e" />
        <StatCard label="Over prep target" value={String([...pending, ...cooking].filter((t) => minutesSince(t.created_at) >= ticketPrepTarget(t, itemPrepMap)).length)} accent="#ef4444" />
      </div>

      {loading && tickets.length === 0 ? (
        <Card style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></Card>
      ) : (
        <div className="kds-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <Column title="Pending" items={pending} color="#f59e0b" flash={newTicketFlash}>
            {(t) => (
              <TicketHeader ticket={t} prepTargetMin={ticketPrepTarget(t, itemPrepMap)} />
            )}
          </Column>

          <Column title="Cooking" items={cooking} color="#3b82f6">
            {(t) => (
              <>
                <TicketHeader ticket={t} prepTargetMin={ticketPrepTarget(t, itemPrepMap)} />
                <div
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: '10px 12px',
                    background: '#EFF6FF',
                    border: '1px dashed #BFDBFE',
                    borderRadius: 8,
                    color: '#1E40AF',
                    fontSize: 12,
                    textAlign: 'center',
                    fontWeight: 600,
                    lineHeight: 1.3,
                  }}
                >
                  Ready? Cashier marks ready from POS — tickets update here automatically.
                </div>
              </>
            )}
          </Column>

          <Column title="Ready" items={ready} color="#22c55e">
            {(t) => (
              <TicketHeader ticket={t} prepTargetMin={ticketPrepTarget(t, itemPrepMap)} />
            )}
          </Column>
        </div>
      )}
    </div>

    </PageShell>
  );
}

function TicketHeader({
  ticket,
  prepTargetMin = PREP_TARGET_DEFAULT,
}: {
  ticket: KdsTicket;
  prepTargetMin?: number;
}) {
  const overdue = minutesSince(ticket.created_at) >= prepTargetMin
    && !['ready', 'completed'].includes(ticket.status);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <Link to={`/orders?order=${ticket.id}`} style={{ fontWeight: 800, fontSize: 16, color: '#D4813A', textDecoration: 'none' }}>#{ticket.order_number}</Link>
          {overdue && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#ef4444', background: '#FEE2E2', padding: '2px 6px', borderRadius: 999 }}>
              OVERDUE
            </span>
          )}
          {ticket.table_number && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#9C8E7E' }}>Table {ticket.table_number}</span>
          )}
          {ticket.delivery_island && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#D4813A' }}>🛵 {ticket.delivery_island}</span>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: urgencyColor(ticket.created_at).solid, fontSize: 13, fontWeight: 700 }}>
            {elapsed(ticket.created_at)}
          </div>
          <Badge label={ticket.type} color={statColor(ticket.status)} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(ticket.items ?? []).map((item, i) => (
          <div key={i} style={{ fontSize: 13, color: '#6B5D4F' }}>
            <span style={{ fontWeight: 700, color: '#1C1408' }}>{item.quantity}×</span> {item.item_name}{item.variant_name ? ` – ${item.variant_name}` : ''}
            {item.modifiers && item.modifiers.length > 0 && (
              <span style={{ color: '#6b7280', fontSize: 11, display: 'block', marginLeft: 16 }}>
                + {item.modifiers.map((m) => m.modifier_name).join(', ')}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
