import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchKdsOrders, kdsStart, kdsBump, kdsRecall } from '../api';
import type { KdsTicket } from '../api';
import { Badge, Btn, Card, ErrorMsg, PageHeader, Spinner, statColor } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSse } from '../hooks/useSse';
import { playChime } from '../utils/audio';

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

export function KDSPage() {
    usePageTitle('Kitchen Display');
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState<number | null>(null);
  const [newTicketFlash, setNewTicketFlash] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const prevPendingIdsRef = useRef<Set<number>>(new Set());
  const isFirstKdsLoad    = useRef(true);
  const kdsRef = useRef<HTMLDivElement>(null);

  // Sync fullscreen state with browser events
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

      // Detect new pending/paid tickets
      const newIds = incoming
        .filter((t) => ['pending', 'paid'].includes(t.status) && !prevPendingIdsRef.current.has(t.id))
        .map((t) => t.id);
      const nextSet = new Set(incoming.filter((t) => ['pending', 'paid'].includes(t.status)).map((t) => t.id));
      prevPendingIdsRef.current = nextSet;

      if (!isFirstKdsLoad.current && newIds.length > 0) {
        playChime();
        setNewTicketFlash(true);
        setTimeout(() => setNewTicketFlash(false), 2500);
      }
      isFirstKdsLoad.current = false;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { void load(); }, [load]);

  // SSE: reload whenever the kitchen stream fires any order event
  const handleSseEvent = useCallback(() => { void load(); }, [load]);
  const { connected: sseConnected } = useSse('/stream/kds', { onEvent: handleSseEvent });

  // Fallback polling — only active when SSE is disconnected (degraded mode)
  useEffect(() => {
    if (sseConnected) return;
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [sseConnected, load]);

  const act = async (id: number, fn: (id: number) => Promise<void>) => {
    setActing(id);
    try { await fn(id); await load(); } catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  };

  // Backend statuses: pending → in_progress → ready → completed
  // paid = online order waiting for kitchen
  const pending = tickets.filter((t) => ['pending', 'paid'].includes(t.status));
  // 'preparing' is used by POS/online-order flows; treat it the same as in_progress.
  const cooking = tickets.filter((t) => ['in_progress', 'preparing'].includes(t.status));
  const ready   = tickets.filter((t) => t.status === 'ready');

  const Column = ({ title, items, color, flash, children }: {
    title: string; items: KdsTicket[]; color: string; flash?: boolean;
    children: (t: KdsTicket) => React.ReactNode;
  }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        padding: flash ? '6px 10px' : '6px 10px', borderRadius: 10,
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
    <div ref={kdsRef} style={isFullscreen ? { background: '#F8F6F3', padding: 20, minHeight: '100vh' } : undefined}>
      <PageHeader
        title="Kitchen Display"
        subtitle={sseConnected ? '● Live' : '○ Polling (reconnecting…)'}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={load} variant="secondary">↻ Refresh</Btn>
            <Btn onClick={toggleFullscreen} variant="secondary" title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
              {isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}
            </Btn>
          </div>
        }
      />
      {error && <ErrorMsg message={error} />}

      {loading && tickets.length === 0 ? (
        <Card style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></Card>
      ) : (
        <div className="kds-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <Column title="Pending" items={pending} color="#f59e0b" flash={newTicketFlash}>
            {(t) => (
              <>
                <TicketHeader ticket={t} />
                <Btn
                  small onClick={() => act(t.id, kdsStart)}
                  disabled={acting === t.id}
                  style={{ marginTop: 12, width: '100%', background: '#f59e0b', color: '#fff', border: 'none' }}
                >
                  {acting === t.id ? '…' : 'Start Cooking'}
                </Btn>
              </>
            )}
          </Column>

          <Column title="Cooking" items={cooking} color="#3b82f6">
            {(t) => (
              <>
                <TicketHeader ticket={t} />
                {/*
                  Marking ready moved to POS — cashier owns the
                  "Ready for pickup!" SMS so the call to notify the
                  customer can't fire without someone at the till.
                  Kitchen finishes cooking → tells the cashier
                  verbally / hands the bag over → cashier hits Mark
                  ready in POS → SMS goes → order shows up in the
                  Ready column here automatically.
                  We render a passive label instead of a button so
                  the chef knows the workflow has shifted without
                  having to read release notes.
                */}
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
                  ⏳ Ready? Tell the cashier — they mark ready from POS
                </div>
              </>
            )}
          </Column>

          <Column title="Ready" items={ready} color="#22c55e">
            {(t) => (
              <>
                <TicketHeader ticket={t} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <Btn
                    small onClick={() => act(t.id, kdsBump)}
                    disabled={acting === t.id}
                    style={{ flex: 1, background: '#22c55e', color: '#fff', border: 'none' }}
                  >
                    Complete
                  </Btn>
                  <Btn
                    small onClick={() => act(t.id, kdsRecall)}
                    disabled={acting === t.id}
                    variant="ghost"
                  >
                    Recall
                  </Btn>
                </div>
              </>
            )}
          </Column>
        </div>
      )}
    </div>
  );
}

function TicketHeader({ ticket }: { ticket: KdsTicket }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#1C1408' }}>#{ticket.order_number}</span>
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
