import { useEffect, useState } from 'react';
import { fetchOrders, type Order } from '../api';
import { Badge, Btn, Card, EmptyState, ErrorMsg, PageHeader, Spinner, statColor } from '../components/Layout';

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function DeliveryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);

  const load = async () => {
    try {
      const res = await fetchOrders({ type: 'delivery' });
      setOrders(res.data);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, []);

  const active   = orders.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const finished = orders.filter((o) => ['completed', 'cancelled'].includes(o.status));

  return (
    <>
      <PageHeader
        title="Delivery Orders"
        subtitle="All delivery orders — auto-refreshes every 30s"
        action={<Btn onClick={load} variant="secondary">↻ Refresh</Btn>}
      />
      {error && <ErrorMsg message={error} />}
      {loading && orders.length === 0 ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <Card><EmptyState message="No delivery orders yet." /></Card>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#475569', marginBottom: 12 }}>
                ACTIVE ({active.length})
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 28 }}>
                {active.map((o) => <DeliveryCard key={o.id} order={o} onSelect={setSelected} />)}
              </div>
            </>
          )}

          {finished.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', marginBottom: 12 }}>
                COMPLETED ({finished.length})
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {finished.slice(0, 10).map((o) => <DeliveryCard key={o.id} order={o} onSelect={setSelected} />)}
              </div>
            </>
          )}
        </>
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setSelected(null)}>
          <Card style={{ width: '100%', maxWidth: 480 }} >
            <div onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ fontWeight: 800, fontSize: 18 }}>#{selected.order_number}</h2>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
              </div>
              <Badge label={selected.status} color={statColor(selected.status)} />
              <div style={{ background: '#f0f9ff', borderRadius: 10, padding: 16, marginTop: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#0369a1', marginBottom: 8 }}>Delivery Details</p>
                <p style={{ fontSize: 14, color: '#0f172a' }}>{selected.delivery_address_line1 ?? 'N/A'}</p>
                {selected.delivery_island && <p style={{ fontSize: 13, color: '#475569' }}>{selected.delivery_island}</p>}
                {selected.delivery_contact_name && (
                  <p style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
                    👤 {selected.delivery_contact_name} · {selected.delivery_contact_phone}
                  </p>
                )}
              </div>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
                <span>Total</span>
                <span style={{ color: '#0ea5e9' }}>MVR {selected.total.toFixed(2)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function DeliveryCard({ order, onSelect }: { order: Order; onSelect: (o: Order) => void }) {
  const urgent = order.status === 'pending' &&
    (Date.now() - new Date(order.created_at).getTime()) > 10 * 60 * 1000;

  return (
    <Card style={{ border: urgent ? '2px solid #ef4444' : undefined, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>#{order.order_number}</span>
        <Badge label={order.status} color={statColor(order.status)} />
      </div>
      <p style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>
        {order.delivery_address_line1 ?? '—'}
      </p>
      {order.delivery_island && (
        <p style={{ fontSize: 13, color: '#64748b' }}>📍 {order.delivery_island}</p>
      )}
      {order.delivery_contact_name && (
        <p style={{ fontSize: 13, color: '#64748b' }}>👤 {order.delivery_contact_name}</p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{timeAgo(order.created_at)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, color: '#0ea5e9' }}>MVR {order.total.toFixed(2)}</span>
          <Btn small variant="ghost" onClick={() => onSelect(order)}>Details</Btn>
        </div>
      </div>
    </Card>
  );
}
