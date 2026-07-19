import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';
import { fetchCustomerOrders, getReorderPayload } from '../api';
import type { Order } from '../api';
import { AuthBlock } from '../components/AuthBlock';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { PageHeader } from '../components/shell/PageHeader';
import { isGiftCardOrder } from '../utils/giftCardOrder';

const STATUS_KEY: Record<string, string> = {
  payment_pending: 'order.status.payment_pending',
  pending: 'order.status.pending',
  paid: 'order.status.paid',
  preparing: 'order.status.preparing',
  ready: 'order.status.ready',
  completed: 'order.status.completed',
  cancelled: 'order.status.cancelled',
};

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  payment_pending: { color: 'var(--color-warning)',    bg: 'var(--color-warning-bg)' },
  pending:         { color: 'var(--color-primary)',    bg: 'var(--color-primary-light)' },
  paid:            { color: 'var(--color-success)',    bg: 'var(--color-success-bg)' },
  preparing:       { color: 'var(--color-primary)',    bg: 'var(--color-primary-light)' },
  ready:           { color: 'var(--color-success)',    bg: 'var(--color-success-bg)' },
  completed:       { color: 'var(--color-text-muted)', bg: 'var(--color-surface-alt)' },
  cancelled:       { color: 'var(--color-error)',      bg: 'var(--color-error-bg)' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
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
  const { t } = useLanguage();
  usePageTitle(t('nav.orders'));
  const { isAuthenticated, authReady, setAuth } = useAuth();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [reordering, setReordering] = useState<number | null>(null);

  useEffect(() => {
    if (!authReady) return; // wait for session check to resolve
    if (!isAuthenticated) { setOrders([]); return; }

    setLoading(true);
    setError('');
    fetchCustomerOrders()
      .then((res) => setOrders(ordersFromResponse(res)))
      .catch(() => setError(t('orders.load_fail')))
      .finally(() => setLoading(false));
  }, [isAuthenticated, authReady, t]);

  const handleAuthSuccess = (name: string) => setAuth(name);

  const handleReorder = async (orderId: number) => {
    if (!isAuthenticated) return;
    setReordering(orderId);
    try {
      const payload = await getReorderPayload(orderId);
      let added = 0;
      for (const line of payload.items) {
        // Backend returns item_name / unit_price
        const item = { id: line.item_id, name: line.item_name ?? line.name, base_price: line.unit_price ?? line.price } as Parameters<typeof addItem>[0];
        const mods = (line.modifiers ?? []).map((m) => ({ id: m.id, name: m.name, price: m.price ?? 0 })) as Parameters<typeof addItem>[2];
        addItem(item, line.quantity, mods);
        added += line.quantity;
      }
      showToast(t('orders.reorder_added').replace('{n}', String(added)));
    } catch {
      showToast(t('orders.reorder_fail'));
    } finally {
      setReordering(null);
    }
  };

  // Food orders only — gift card purchases live under Gifts.
  const foodOrders = orders.filter((o) => !isGiftCardOrder(o));
  const activeOrders = foodOrders.filter(
    (o) => !['completed', 'cancelled'].includes(o.status),
  );
  const pastOrders = foodOrders.filter(
    (o) => ['completed', 'cancelled'].includes(o.status),
  );

  const typeLabel = (type: string) => {
    if (type === 'gift_card') return t('orders.type_gift_card');
    if (type === 'delivery') return t('mode.delivery');
    if (type === 'dine_in') return t('orders.type_dine_in');
    if (type === 'takeaway') return t('orders.type_takeaway');
    if (type === 'online_pickup') return t('orders.type_online_pickup');
    if (type === 'pickup') return t('orders.type_pickup');
    return t('mode.pickup');
  };

  const orderDetailPath = (order: Order) =>
    isGiftCardOrder(order) ? `/gift-cards/success?orderId=${order.id}` : `/orders/${order.id}`;

  const statusPill = (status: string) => {
    const style = STATUS_STYLE[status] ?? { color: '#374151', bg: '#f3f4f6' };
    const key = STATUS_KEY[status];
    return { ...style, label: key ? t(key) : status };
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-muted)',
    margin: '0 0 0.625rem',
  };

  return (
    <div style={{ maxWidth: 'var(--shell-max)', margin: '0 auto', width: '100%', minHeight: '60vh' }}>
      <PageHeader title={t('nav.orders')} />

      {/* Waiting for session check — neutral skeleton, no flash of login form */}
      {!authReady && (
        <div style={{ padding: '1rem var(--page-gutter)' }}>
          <div className="skeleton" style={{ height: '88px', borderRadius: '14px', marginBottom: '0.75rem' }} />
          <div className="skeleton" style={{ height: '88px', borderRadius: '14px', marginBottom: '0.75rem' }} />
          <div className="skeleton" style={{ height: '88px', borderRadius: '14px' }} />
        </div>
      )}

      {/* Not logged in — show inline auth block */}
      {authReady && !loading && !isAuthenticated && (
        <div style={{ padding: '1rem var(--page-gutter)' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
            {t('orders.sign_in_prompt')}
          </p>
          <AuthBlock onSuccess={handleAuthSuccess} />
        </div>
      )}

      {/* Loading */}
      {authReady && loading && (
        <div style={{ padding: '1rem var(--page-gutter)' }}>
          <div className="skeleton" style={{ height: '88px', borderRadius: '14px', marginBottom: '0.75rem' }} />
          <div className="skeleton" style={{ height: '88px', borderRadius: '14px', marginBottom: '0.75rem' }} />
          <div className="skeleton" style={{ height: '88px', borderRadius: '14px' }} />
        </div>
      )}

      {/* Error */}
      {authReady && !loading && isAuthenticated && error && (
        <div style={{ textAlign: 'center', padding: '4rem 1.5rem' }}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>{error}</p>
          <Link to="/menu" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
            {t('orders.empty_cta')} →
          </Link>
        </div>
      )}

      {/* Empty state */}
      {authReady && !loading && isAuthenticated && !error && orders.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🧾</div>
          <p className="empty-state-title">{t('orders.empty_title')}</p>
          <p className="empty-state-sub">{t('orders.empty_body')}</p>
          <Link
            to="/menu"
            style={{
              display: 'inline-block',
              marginTop: '1rem',
              color: 'var(--color-primary)',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: '0.9375rem',
            }}
          >
            {t('orders.empty_cta')} →
          </Link>
        </div>
      )}

      {/* Orders list */}
      {authReady && !loading && isAuthenticated && !error && orders.length > 0 && (
        <div style={{ padding: '0.5rem var(--page-gutter) 2rem' }}>

          {/* ── Active orders ── */}
          {activeOrders.length > 0 && (
            <section style={{ marginBottom: '1.75rem' }}>
              <p style={sectionLabel}>{t('orders.active_section')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {activeOrders.map((order) => {
                  const s = statusPill(order.status);
                  return (
                    <div
                      key={order.id}
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '16px',
                        padding: '1rem 1.125rem',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Order number + type label */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                            <span style={{ fontWeight: 800, color: 'var(--color-text)', fontSize: '0.9375rem' }}>
                              #{order.order_number ?? order.id}
                            </span>
                            <span style={{
                              fontSize: '0.72rem', fontWeight: 600,
                              color: 'var(--color-text-muted)',
                              background: 'var(--color-surface-alt)',
                              padding: '0.1rem 0.5rem',
                              borderRadius: '999px',
                            }}>
                              {typeLabel(order.type)}
                            </span>
                          </div>
                          {/* Live status pill with pulse dot */}
                          <div style={{ marginBottom: '0.35rem' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: s.color,
                              background: s.bg,
                              padding: '0.2rem 0.6rem',
                              borderRadius: '999px',
                            }}>
                              <span style={{
                                width: '0.375rem', height: '0.375rem',
                                borderRadius: '50%',
                                background: s.color,
                                display: 'inline-block',
                                animation: 'pulse-dot 2s infinite',
                              }} />
                              {s.label}
                            </span>
                          </div>
                          {/* Total + credit badge */}
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            MVR {Number(order.total).toFixed(2)}
                            {order.payment_settlement?.paid_on_credit && (
                              <span style={{
                                marginLeft: 8,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                color: '#1D4ED8',
                                background: '#EFF6FF',
                                padding: '0.1rem 0.45rem',
                                borderRadius: 999,
                              }}>
                                {order.payment_settlement.short_label}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Track CTA */}
                        <Link
                          to={orderDetailPath(order)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--color-primary)',
                            color: 'white',
                            borderRadius: '10px',
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                            alignSelf: 'center',
                            boxShadow: '0 2px 8px var(--color-primary-glow)',
                          }}
                        >
                          {t('orders.track')} →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Past orders ── */}
          {pastOrders.length > 0 && (
            <section>
              <p style={sectionLabel}>{t('orders.past_section')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {pastOrders.map((order) => {
                  const gift = isGiftCardOrder(order);
                  const s = statusPill(gift && ['paid', 'completed'].includes(order.status) ? 'completed' : order.status);
                  const statusLabel = gift
                    ? (['paid', 'completed'].includes(order.status)
                        ? t('orders.gift_purchased')
                        : order.status === 'payment_pending'
                          ? t('orders.gift_payment_pending')
                          : s.label)
                    : s.label;
                  const sliced = order.items?.slice(0, 3);
                  const itemSummary = gift
                    ? t('orders.type_gift_card')
                    : sliced?.map(it => it.item_name).join(', ');
                  const extraCount = gift ? 0 : (order.items?.length ?? 0) - 3;
                  return (
                    <div
                      key={order.id}
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '14px',
                        padding: '0.875rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Order number + status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '0.875rem' }}>
                            #{order.order_number ?? order.id}
                          </span>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 600,
                            color: 'var(--color-text-muted)',
                            background: 'var(--color-surface-alt)',
                            padding: '0.1rem 0.45rem', borderRadius: '999px',
                          }}>
                            {typeLabel(order.type)}
                          </span>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 600,
                            color: s.color, background: s.bg,
                            padding: '0.1rem 0.45rem', borderRadius: '999px',
                          }}>
                            {statusLabel}
                          </span>
                        </div>
                        {/* Items summary */}
                        {itemSummary && (
                          <div style={{
                            fontSize: '0.78rem',
                            color: 'var(--color-text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginBottom: '0.15rem',
                          }}>
                            {itemSummary}{extraCount > 0 ? ` ${t('orders.more_items').replace('{n}', String(extraCount))}` : ''}
                          </div>
                        )}
                        {/* Total + date */}
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          MVR {Number(order.total).toFixed(2)}
                          {order.created_at ? ` · ${fmtDate(order.created_at)}` : ''}
                        </div>
                      </div>
                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <Link
                          to={orderDetailPath(order)}
                          style={{
                            padding: '0.4rem 0.75rem',
                            background: 'var(--color-surface-alt)',
                            color: 'var(--color-text)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t('orders.view')}
                        </Link>
                        {order.status === 'completed' && !isGiftCardOrder(order) && (
                          <button
                            onClick={() => void handleReorder(order.id)}
                            disabled={reordering === order.id}
                            style={{
                              padding: '0.4rem 0.75rem',
                              background: reordering === order.id ? 'var(--color-surface-alt)' : 'var(--color-surface)',
                              color: 'var(--color-primary)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '8px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              fontFamily: 'inherit',
                              cursor: reordering === order.id ? 'not-allowed' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {reordering === order.id ? '…' : t('home.reorder')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}
