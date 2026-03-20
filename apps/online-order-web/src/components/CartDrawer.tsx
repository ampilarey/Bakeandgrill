import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

type Props = {
  isOpen?: boolean;
  closedMessage?: string | null;
  /** Mobile sheet already shows a title — hide inner heading to save space and surface checkout */
  compact?: boolean;
};

export function CartDrawer({ isOpen = true, closedMessage, compact }: Props) {
  const navigate = useNavigate();
  const { cart, cartTotal, updateQuantity } = useCart();
  const { t } = useLanguage();

  const handleCheckout = () => {
    if (cart.length === 0) return;
    navigate('/checkout');
  };

  const canCheckout = cart.length > 0 && isOpen;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.5rem' : '1rem' }}>
      <div style={{ background: 'var(--color-surface)', border: compact ? 'none' : '1px solid var(--color-border)', borderRadius: '16px', padding: compact ? '0' : '1.25rem' }}>
        {!compact && (
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '1rem' }}>
            {t('cart.title')}
            {cart.length > 0 && (
              <span style={{ marginLeft: '0.5rem', background: 'var(--color-primary)', color: 'white', borderRadius: '999px', padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}>
                {cart.reduce((s, e) => s + e.quantity, 0)}
              </span>
            )}
          </h2>
        )}

        {cart.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem 0' }}>
            {t('cart.empty')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {cart.map((entry, index) => (
              <div
                key={`${entry.item.id}-${index}`}
                style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '0.75rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
                    {entry.item.name}
                  </p>
                  {/* Qty controls — 32px minimum touch target */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                    <button
                      onClick={() => updateQuantity(index, entry.quantity - 1)}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, minWidth: '1.5rem', textAlign: 'center' }}>
                      {entry.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(index, entry.quantity + 1)}
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #EDE4D4', background: 'white', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, color: '#5C4A2A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>
                {entry.modifiers.length > 0 && (
                  <p style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    + {entry.modifiers.map((m) => m.name).join(', ')}
                  </p>
                )}
                <p style={{ marginTop: '0.375rem', fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                  MVR {((parseFloat(String(entry.item.base_price)) + entry.modifiers.reduce((s, m) => s + parseFloat(String(m.price)), 0)) * entry.quantity).toFixed(2)}
                </p>
              </div>
            ))}

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)', fontWeight: 700, color: 'var(--color-text)' }}>
              <span>Total</span>
              <span style={{ color: 'var(--color-primary)', fontSize: '1.05rem' }}>MVR {cartTotal.toFixed(2)}</span>
            </div>
          </div>
        )}

        {closedMessage && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--color-warning-bg)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--color-warning)', border: '1px solid rgba(202,138,4,0.25)' }}>
            {closedMessage}
          </div>
        )}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={!canCheckout}
          style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.875rem',
            background: canCheckout ? 'var(--color-primary)' : 'var(--color-text-muted)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: canCheckout ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { if (canCheckout) e.currentTarget.style.background = 'var(--color-primary-hover)'; }}
          onMouseLeave={(e) => { if (canCheckout) e.currentTarget.style.background = 'var(--color-primary)'; }}
        >
          {!isOpen ? "We're Closed" : cart.length === 0 ? t('cart.empty') : `${t('cart.checkout')} — MVR ${cartTotal.toFixed(2)} →`}
        </button>
      </div>
    </div>
  );
}
