import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { fetchCustomerOrders } from '../api';
import type { Order } from '../api';

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  payment_pending: { label: 'Awaiting payment',  color: '#92400e', bg: '#fef3c7' },
  pending:         { label: 'Payment received',  color: '#1e40af', bg: '#dbeafe' },
  paid:            { label: 'Confirmed',          color: '#065f46', bg: '#d1fae5' },
  preparing:       { label: 'Being prepared',    color: '#1e40af', bg: '#dbeafe' },
  ready:           { label: 'Ready for pickup',  color: '#065f46', bg: '#d1fae5' },
  completed:       { label: 'Completed',         color: '#374151', bg: '#f3f4f6' },
  cancelled:       { label: 'Cancelled',         color: '#991b1b', bg: '#fee2e2' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Normalize Laravel paginated or plain list shapes */
function ordersFromResponse(res: unknown): Order[] {
  if (Array.isArray(res)) return res as Order[];
  if (!res || typeof res !== 'object') return [];
  const o = res as Record<string, unknown>;
  const d = o.data;
  if (Array.isArray(d)) return d as Order[];
  if (d && typeof d === 'object') {
    const inner = (d as Record<string, unknown>).data;
    if (Array.isArray(inner)) return inner as Order[];
  }
  if (Array.isArray(o.orders)) return o.orders as Order[];
  return [];
}

export function OrderHistoryPage() {
  usePageTitle('My Orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => {
      const token = localStorage.getItem('online_token');
      if (!token) {
        setOrders([]);
        setError('Please log in to view your orders.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      fetchCustomerOrders(token)
        .then((res) => {
          setOrders(ordersFromResponse(res));
        })
        .catch(() => setError('Could not load orders. Please try again.'))
        .finally(() => setLoading(false));
    };

    load();
    window.addEventListener('auth_change', load);
    return () => window.removeEventListener('auth_change', load);
  }, []);

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '2rem 1.25rem', minHeight: '60vh' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>My Orders</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>
          Your order history and live status
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '4rem 1.5rem', color: 'var(--color-text-muted)' }}>
          Loading orders…
        </div>
      )}

      {!loading && error && (
        <div style={{ textAlign: 'center', padding: '4rem 1.5rem' }}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>{error}</p>
          <Link to="/menu" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
            Browse the menu →
          </Link>
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 1.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>📋</div>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>No orders yet.</p>
          <Link to="/menu" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
            Browse the menu →
          </Link>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {orders.map((order) => {
            const s = STATUS_LABEL[order.status] ?? { label: order.status, color: '#374151', bg: '#f3f4f6' };
            const isActive = !['completed', 'cancelled'].includes(order.status);
            return (
              <div
                key={order.id}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '14px',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ fontSize: '1.75rem', flexShrink: 0 }}>
                  {order.type === 'delivery' ? '🛵' : '🥡'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '0.95rem' }}>
                      #{order.order_number ?? order.id}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: s.color, background: s.bg, padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                    MVR {Number(order.total).toFixed(2)}
                  </div>
                  {order.created_at && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
                      {fmtDate(order.created_at)}
                    </div>
                  )}
                </div>
                {isActive && (
                  <Link
                    to={`/orders/${order.id}`}
                    style={{
                      padding: '0.45rem 0.875rem',
                      background: 'var(--color-primary-light)',
                      color: 'var(--color-primary)',
                      border: '1px solid rgba(217,119,6,0.2)',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Track →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
