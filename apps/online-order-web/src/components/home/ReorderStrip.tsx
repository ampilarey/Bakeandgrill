import type { Order } from '../../api';
import { useLanguage } from '../../context/LanguageContext';

type Props = {
  orders: Order[];
  customerName: string | null;
  reorderingId: number | null;
  onReorder: (order: Order) => void;
};

/**
 * "Your usual" returning-customer strip.
 * Returns null when orders list is empty.
 */
export function ReorderStrip({ orders, customerName, reorderingId, onReorder }: Props) {
  const { t } = useLanguage();

  if (orders.length === 0) return null;

  return (
    <section
      aria-label={t('home.order_again')}
      style={{
        background: 'var(--color-surface-alt)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        padding: '1.25rem 0',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--layout-max)',
          margin: '0 auto',
          padding: '0 var(--page-gutter)',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <p
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-primary)',
            margin: '0 0 0.75rem',
          }}
        >
          {customerName ? `Welcome back, ${customerName}!` : t('home.order_again')}
        </p>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            paddingBottom: 2,
          }}
        >
          {orders.map((order) => {
            const busy = reorderingId === order.id;
            return (
              <div
                key={order.id}
                style={{
                  flex: '0 0 auto',
                  minWidth: 200,
                  maxWidth: 260,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-2xl)',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <p
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    color: 'var(--color-dark)',
                    margin: 0,
                  }}
                >
                  Order #{order.order_number}
                </p>
                {order.items && order.items.length > 0 && (
                  <p
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--color-text-muted)',
                      margin: 0,
                      lineHeight: 1.35,
                    }}
                  >
                    {order.items
                      .slice(0, 3)
                      .map((i) => i.item_name)
                      .join(', ')}
                    {order.items.length > 3 ? ` +${order.items.length - 3} more` : ''}
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy || reorderingId !== null}
                  onClick={() => onReorder(order)}
                  style={{
                    marginTop: 'auto',
                    padding: '0.5rem 0.875rem',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    cursor: busy ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    opacity:
                      reorderingId !== null && !busy ? 0.55 : busy ? 0.75 : 1,
                  }}
                >
                  {busy ? t('home.reordering') : t('home.reorder')}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
