import { useEffect, useState } from 'react';
import { fetchKdsOrders, kdsStart, kdsBump, kdsRecall } from '../api';
import type { KdsTicket } from '../api';
import { Badge, Btn, Card, EmptyState, ErrorMsg, PageHeader, statColor } from '../components/Layout';

function elapsed(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function urgencyColor(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m >= 15) return '#ef4444';
  if (m >= 8) return '#f97316';
  return '#22c55e';
}

export function KDSPage() {
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState<number | null>(null);

  const load = async () => {
    try {
      const res = await fetchKdsOrders();
      setTickets(res.orders);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, []);

  const act = async (id: number, fn: (id: number) => Promise<void>) => {
    setActing(id);
    try { await fn(id); await load(); } catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  };

  // Backend statuses: pending → in_progress → completed
  // paid = online order waiting for kitchen
  const pending = tickets.filter((t) => ['pending', 'paid'].includes(t.status));
  const cooking = tickets.filter((t) => t.status === 'in_progress');
  const ready:   KdsTicket[] = []; // bumped orders go straight to completed

  const Column = ({ title, items, color, children }: {
    title: string; items: KdsTicket[]; color: string;
    children: (t: KdsTicket) => React.ReactNode;
  }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{title}</span>
        <span style={{
          background: '#f1f5f9', color: '#64748b', borderRadius: 999,
          padding: '1px 8px', fontSize: 12, fontWeight: 600,
        }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.length === 0
          ? <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>Nothing here</div>
          : items.map((t) => (
            <div key={t.id} style={{
              background: '#fff', borderRadius: 14, padding: '16px',
              border: `2px solid ${urgencyColor(t.created_at)}22`,
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
    <>
      <PageHeader
        title="Kitchen Display"
        subtitle="Live ticket board — auto-refreshes every 10s"
        action={<Btn onClick={load} variant="secondary">↻ Refresh</Btn>}
      />
      {error && <ErrorMsg message={error} />}

      {loading && tickets.length === 0 ? (
        <Card><EmptyState message="Loading kitchen tickets…" /></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          <Column title="Pending" items={pending} color="#f59e0b">
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
                <Btn
                  small onClick={() => act(t.id, kdsBump)}
                  disabled={acting === t.id}
                  style={{ marginTop: 12, width: '100%', background: '#3b82f6', color: '#fff', border: 'none' }}
                >
                  {acting === t.id ? '…' : 'Mark Ready ✓'}
                </Btn>
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
    </>
  );
}

function TicketHeader({ ticket }: { ticket: KdsTicket }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>#{ticket.order_number}</span>
          {ticket.table_number && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>Table {ticket.table_number}</span>
          )}
          {ticket.delivery_island && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#0ea5e9' }}>🛵 {ticket.delivery_island}</span>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: urgencyColor(ticket.created_at), fontSize: 13, fontWeight: 700 }}>
            {elapsed(ticket.created_at)}
          </div>
          <Badge label={ticket.type} color={statColor(ticket.status)} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ticket.items.map((item, i) => (
          <div key={i} style={{ fontSize: 13, color: '#374151' }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{item.quantity}×</span> {item.item_name}
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
