import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCustomerOrders } from '../../api';
import type { Order } from '../../api';
import { useLanguage } from '../../context/LanguageContext';

const STATUS_KEY: Record<string, string> = {
  payment_pending: 'order.status.payment_pending',
  pending: 'order.status.pending',
  paid: 'order.status.paid',
  preparing: 'order.status.preparing',
  ready: 'order.status.ready',
  completed: 'order.status.completed',
  cancelled: 'order.status.cancelled',
};

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

/**
 * Compact recent-orders list for Account hub (§21.4).
 * Full history lives on the Orders tab (`/order-history`).
 */
export function OrderHistorySection() {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCustomerOrders()
      .then((res) => {
        if (cancelled) return;
        const list = ordersFromResponse(res);
        setOrders(list.slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)' }}>
          {t('orders.recent_title')}
        </span>
        <Link
          to="/order-history"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--color-primary)',
            textDecoration: 'none',
          }}
        >
          {t('orders.see_all')}
        </Link>
      </div>

      {loading && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('common.loading')}…
        </p>
      )}

      {!loading && orders.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t('orders.none_recent')}
        </p>
      )}

      {!loading && orders.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.map((order) => {
            const statusKey = STATUS_KEY[order.status];
            const label = statusKey ? t(statusKey) : order.status;
            return (
              <li key={order.id}>
                <Link
                  to={`/orders/${order.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '12px 14px',
                    background: 'var(--color-surface-alt)',
                    borderRadius: 12,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-dark)' }}>
                      #{order.order_number ?? order.id}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {label} · MVR {Number(order.total).toFixed(2)}
                    </span>
                  </span>
                  <span aria-hidden style={{ color: 'var(--color-text-muted)', fontWeight: 700 }}>›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
