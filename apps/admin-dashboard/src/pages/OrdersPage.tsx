import { useEffect, useState } from 'react';
import { fetchOrders, fetchOrder, type Order } from '../api';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg,
  PageHeader, Select, Spinner, statColor,
} from '../components/Layout';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'paid', label: 'Paid' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'dine_in', label: 'Dine In' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'online_pickup', label: 'Online Pickup' },
  { value: 'delivery', label: 'Delivery' },
];

function typeLabel(t: string) {
  const m: Record<string, string> = {
    dine_in: 'Dine In', takeaway: 'Takeaway',
    online_pickup: 'Online', delivery: 'Delivery', preorder: 'Pre-order',
  };
  return m[t] ?? t;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function OrderDrawer({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder(orderId).then((r) => { setOrder(r.order); setLoading(false); }).catch(() => setLoading(false));
  }, [orderId]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'stretch', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div style={{
        width: 420, background: '#fff', height: '100%',
        overflowY: 'auto', padding: 24, boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>
            {order ? `#${order.order_number}` : 'Order Details'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {loading && <Spinner />}
        {!loading && !order && <EmptyState message="Order not found." />}
        {order && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <Badge label={order.status} color={statColor(order.status)} />
              <Badge label={typeLabel(order.type)} color="blue" />
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <Row label="Order #" value={order.order_number} />
              <Row label="Type" value={typeLabel(order.type)} />
              <Row label="Time" value={new Date(order.created_at).toLocaleString()} />
              {order.table_number && <Row label="Table" value={order.table_number} />}
              {(order.customer?.name ?? order.customer_name) && (
                <Row label="Customer" value={(order.customer?.name ?? order.customer_name)!} />
              )}
              {(order.customer?.phone ?? order.customer_phone) && (
                <Row label="Phone" value={(order.customer?.phone ?? order.customer_phone)!} />
              )}
              {order.paid_at && <Row label="Paid at" value={new Date(order.paid_at).toLocaleString()} />}
            </div>

            {order.type === 'delivery' && order.delivery_address_line1 && (
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#1e40af', marginBottom: 8 }}>Delivery Address</p>
                <p style={{ fontSize: 14 }}>{order.delivery_address_line1}</p>
                {order.delivery_island && <p style={{ fontSize: 13, color: '#475569' }}>{order.delivery_island}</p>}
                {order.delivery_contact_name && (
                  <p style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
                    {order.delivery_contact_name} · {order.delivery_contact_phone}
                  </p>
                )}
              </div>
            )}

            {order.items && order.items.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#475569', marginBottom: 8 }}>Items</p>
                {order.items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                    <span>{item.quantity}× {item.item_name}</span>
                    <span style={{ color: '#0ea5e9', fontWeight: 600 }}>MVR {(item.total_price ?? 0).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, paddingTop: 8 }}>
                  <span>Total</span>
                  <span>MVR {order.total.toFixed(2)}</span>
                </div>
              </div>
            )}

            {order.notes && (
              <div style={{ background: '#fefce8', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#713f12' }}>
                📝 {order.notes}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#0f172a' }}>{value}</span>
    </div>
  );
}

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchOrders({ status: statusFilter || undefined, type: typeFilter || undefined, page });
      setOrders(res.data);
      setTotalPages(res.meta?.last_page ?? 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [statusFilter, typeFilter, page]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [statusFilter, typeFilter, page]);

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="All customer and POS orders"
        action={<Btn onClick={load} variant="secondary">↻ Refresh</Btn>}
      />

      {error && <ErrorMsg message={error} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={STATUS_OPTIONS} style={{ width: 160 }} />
        <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} options={TYPE_OPTIONS} style={{ width: 160 }} />
      </div>

      {loading && orders.length === 0 ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <Card><EmptyState message="No orders found." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Order #', 'Type', 'Status', 'Customer', 'Total', 'Time', ''].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>
                    #{o.order_number}
                    {o.type === 'delivery' && <span style={{ marginLeft: 6, fontSize: 12 }}>🛵</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge label={typeLabel(o.type)} color="blue" />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge label={o.status} color={statColor(o.status)} />
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>
                    {o.customer_name ?? o.table_number ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0ea5e9' }}>
                    MVR {o.total.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12 }}>
                    {timeAgo(o.created_at)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Btn small onClick={() => setSelectedId(o.id)} variant="ghost">View</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px' }}>
              <Btn small variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Btn>
              <span style={{ lineHeight: '30px', fontSize: 13, color: '#64748b' }}>Page {page} of {totalPages}</span>
              <Btn small variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Btn>
            </div>
          )}
        </Card>
      )}

      {selectedId && <OrderDrawer orderId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
