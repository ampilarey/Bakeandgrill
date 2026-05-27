import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchItems } from '../api';
import type { Item } from '../api';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

// MVR threshold for free delivery — must match backend config/delivery.php DELIVERY_FREE_THRESHOLD
const FREE_DELIVERY_MVR = 200;

type Props = {
  isOpen?: boolean;
  closedMessage?: string | null;
  /** Mobile sheet already shows a title — hide inner heading to save space and surface checkout */
  compact?: boolean;
};

export function CartDrawer({ isOpen = true, closedMessage, compact }: Props) {
  const navigate = useNavigate();
  const { cart, cartTotal, updateQuantity, addItem } = useCart();
  const { t } = useLanguage();
  const [upsellItems, setUpsellItems] = useState<Item[]>([]);
  const hasFetched = useRef(false);

  // Fetch upsell candidates once (browser caches the GET — same request as MenuPage)
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchItems().then(({ data }) => {
      const inCartIds = new Set(cart.map((e) => e.item.id));
      const candidates = data
        .filter((item) => !inCartIds.has(item.id) && item.is_available !== false && !item.has_variants && Number(item.base_price) < 50)
        .sort((a, b) => Number(a.base_price) - Number(b.base_price))
        .slice(0, 3);
      setUpsellItems(candidates);
    }).catch(() => { /* non-fatal */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
                    {entry.variantName && (
                      <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.8rem', display: 'block' }}>
                        {entry.variantName}
                      </span>
                    )}
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
                      style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
                  {entry.originalPrice != null && entry.originalPrice > (entry.variantPrice ?? Number(entry.item.base_price)) && (
                    <span style={{ color: 'var(--color-text-muted)', textDecoration: 'line-through', marginRight: '0.35rem', fontWeight: 500 }}>
                      MVR {(((entry.originalPrice) + entry.modifiers.reduce((s, m) => s + parseFloat(String(m.price)), 0)) * entry.quantity).toFixed(2)}
                    </span>
                  )}
                  MVR {(((entry.variantPrice != null ? entry.variantPrice : parseFloat(String(entry.item.base_price))) + entry.modifiers.reduce((s, m) => s + parseFloat(String(m.price)), 0)) * entry.quantity).toFixed(2)}
                </p>
              </div>
            ))}

            {/* Subtotal (tax & delivery calculated at checkout) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)', fontWeight: 700, color: 'var(--color-text)' }}>
              <span>Subtotal</span>
              <span style={{ color: 'var(--color-primary)', fontSize: '1.05rem' }}>MVR {cartTotal.toFixed(2)}</span>
            </div>

            {/* Free delivery progress bar */}
            {cartTotal < FREE_DELIVERY_MVR && (
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
                  <span>🛵 Add <strong style={{ color: 'var(--color-primary)' }}>MVR {(FREE_DELIVERY_MVR - cartTotal).toFixed(2)}</strong> for free delivery</span>
                  <span>MVR {FREE_DELIVERY_MVR}</span>
                </div>
                <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (cartTotal / FREE_DELIVERY_MVR) * 100)}%`, background: 'var(--color-primary)', borderRadius: 999, transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}
            {cartTotal >= FREE_DELIVERY_MVR && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--color-success)', fontWeight: 600, textAlign: 'center', padding: '0.35rem', background: 'var(--color-success-bg)', borderRadius: 8 }}>
                🎉 You qualify for free delivery!
              </div>
            )}
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
          {!isOpen ? "Closed — not taking orders right now" : cart.length === 0 ? "Add items to continue" : `${t('cart.checkout')} — MVR ${cartTotal.toFixed(2)} →`}
        </button>
      </div>

      {/* ── Upsell block ────────────────────────────────────────── */}
      {upsellItems.length > 0 && cart.length > 0 && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '1rem' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', margin: '0 0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Add to your order
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {upsellItems.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', flex: 1, lineHeight: 1.3 }}>{item.name}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>MVR {Number(item.base_price).toFixed(2)}</span>
                <button
                  type="button"
                  onClick={() => {
                    addItem(item as any, 1, [], null);
                    setUpsellItems((prev) => prev.filter((u) => u.id !== item.id));
                  }}
                  style={{ flexShrink: 0, padding: '0.3rem 0.7rem', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  aria-label={`Add ${item.name} to cart`}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
