import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchCustomerOrders } from '../api';
import type { Order } from '../api';

const STATUS: Record<string, { label: string; color: string; dot: string }> = {
  payment_pending: { label: 'Awaiting payment', color: '#92400e', dot: '#f59e0b' },
  pending:         { label: 'Payment received',  color: '#1e40af', dot: '#3b82f6' },
  paid:            { label: 'Confirmed',          color: '#065f46', dot: '#10b981' },
  preparing:       { label: 'Being prepared',     color: '#1e40af', dot: '#3b82f6' },
  ready:           { label: 'Ready for pickup',   color: '#065f46', dot: '#10b981' },
  completed:       { label: 'Completed',          color: '#374151', dot: '#9ca3af' },
  cancelled:       { label: 'Cancelled',          color: '#991b1b', dot: '#ef4444' },
};

const ACTIVE = new Set(['payment_pending', 'pending', 'paid', 'preparing', 'ready']);

function normalizeOrders(res: unknown): Order[] {
  if (Array.isArray(res)) return res as Order[];
  if (!res || typeof res !== 'object') return [];
  const o = res as Record<string, unknown>;
  if (Array.isArray(o.data)) return o.data as Order[];
  if (o.data && typeof o.data === 'object') {
    const inner = (o.data as Record<string, unknown>).data;
    if (Array.isArray(inner)) return inner as Order[];
  }
  if (Array.isArray(o.orders)) return o.orders as Order[];
  return [];
}

export function OrderStatusBar() {
  const { token, authReady } = useAuth();
  const location = useLocation();
  const [order, setOrder] = useState<Order | null | undefined>(undefined); // undefined = not loaded yet
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hide on checkout and per-order tracking pages (already showing full detail there)
  const skip =
    !token ||
    !authReady ||
    location.pathname.startsWith('/checkout') ||
    location.pathname.startsWith('/orders/');

  useEffect(() => {
    if (skip) { setOrder(null); return; }

    let cancelled = false;

    const load = () => {
      fetchCustomerOrders(token!)
        .then((res) => {
          if (cancelled) return;
          const orders = normalizeOrders(res);
          const active = orders.find((o) => ACTIVE.has(o.status));
          setOrder(active ?? orders[0] ?? null);
        })
        .catch(() => { if (!cancelled) setOrder(null); });
    };

    load();
    timerRef.current = setInterval(load, 30_000);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token, authReady, skip]);

  // Re-load when returning to the page
  useEffect(() => {
    if (skip || order === undefined) return;
    fetchCustomerOrders(token!)
      .then((res) => {
        const orders = normalizeOrders(res);
        const active = orders.find((o) => ACTIVE.has(o.status));
        setOrder(active ?? orders[0] ?? null);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Nothing to show
  if (!token || order === undefined || order === null) return null;

  const s = STATUS[order.status] ?? { label: order.status, color: '#374151', dot: '#9ca3af' };
  const isActive = ACTIVE.has(order.status);

  const barStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '0 0 0 1.5rem',
    background: isActive ? 'var(--color-primary-light)' : 'var(--color-surface-alt)',
    borderTop: '1px solid var(--color-border)',
    fontSize: '0.8rem',
    minHeight: '36px',
  };

  return (
    <div style={barStyle}>
      {/* Left — clicking "My orders" goes to full order history */}
      <Link
        to="/order-history"
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          minWidth: 0, flex: 1, textDecoration: 'none', color: 'inherit',
          padding: '0.45rem 0',
        }}
      >
        <span
          className={isActive ? 'status-dot-pulse' : undefined}
          style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.dot, flexShrink: 0 }}
        />
        <span style={{ fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
          My orders
        </span>
        <span style={{ color: 'var(--color-text-muted)' }}>·</span>
        <span style={{ fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
          #{order.order_number ?? order.id}
        </span>
        <span style={{ color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.label}
        </span>
      </Link>

      {/* Right — "Track" goes to the specific order; "View all" also goes to history */}
      <Link
        to={isActive ? `/orders/${order.id}` : '/order-history'}
        style={{
          flexShrink: 0, color: 'var(--color-primary)', fontWeight: 600,
          whiteSpace: 'nowrap', textDecoration: 'none',
          padding: '0.45rem 1.5rem 0.45rem 0.75rem',
          borderLeft: '1px solid var(--color-border)',
          fontSize: '0.8rem',
        }}
      >
        {isActive ? 'Track →' : 'View all →'}
      </Link>
    </div>
  );
}
