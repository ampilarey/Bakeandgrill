import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchItems, fetchCartRecommendations, getLoyaltyAccount, getMyFavourites, toggleFavourite, getWaitTimeEstimate } from '../api';
import type { Item, Modifier } from '../api';
import type { Variant } from '@shared/types';
import { useAuth } from '../context/AuthContext';
import { useCart, type CartEntry } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { estimateEarnPointsForSubtotalMvr } from '../utils/loyalty';
import { formatCardPrice, formatSavingsLabel } from '../utils/money';
import { cartCheckoutCta } from '../utils/collectOn';
import { ItemSheet } from './ItemSheet';

const DEFAULT_FREE_DELIVERY_MVR = 200;

function parseFreeDeliveryThreshold(raw: string | undefined): number {
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FREE_DELIVERY_MVR;
}

type Props = {
  isOpen?: boolean;
  closedMessage?: string | null;
  /** Mobile sheet already shows a title — hide inner heading to save space and surface checkout */
  compact?: boolean;
  /**
   * When provided (FloatingCartBar → CartSheet), use the parent-derived CTA
   * so both surfaces cannot disagree. Otherwise derive from cart + isOpen.
   */
  canCheckout?: boolean;
  checkoutForTomorrow?: boolean;
};

export function CartDrawer({
  isOpen = true,
  closedMessage,
  compact,
  canCheckout: canCheckoutProp,
  checkoutForTomorrow: checkoutForTomorrowProp,
}: Props) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { cart, cartTotal, updateQuantity, addItem, updateEntry } = useCart();
  const { t } = useLanguage();
  const s = useSiteSettings();
  const freeDeliveryMvr = parseFreeDeliveryThreshold(s.delivery_free_threshold);
  const [upsellItems, setUpsellItems] = useState<Item[]>([]);
  const [earnRatePerMvr, setEarnRatePerMvr] = useState(1);
  const [favouriteIds, setFavouriteIds] = useState<Set<number>>(new Set());
  const [waitMinutes, setWaitMinutes] = useState<number | null>(null);
  const hasFetched = useRef(false);
  const [editLine, setEditLine] = useState<{ index: number; entry: CartEntry } | null>(null);
  const [editMods, setEditMods] = useState<Modifier[]>([]);
  const [editQty, setEditQty] = useState(1);

  const startEditLine = (index: number, entry: CartEntry) => {
    setEditLine({ index, entry });
    setEditMods([...entry.modifiers]);
    setEditQty(entry.quantity);
  };

  const toggleEditModifier = (mod: Modifier) => {
    setEditMods((prev) => {
      const exists = prev.some((m) => m.id === mod.id);
      return exists ? prev.filter((m) => m.id !== mod.id) : [...prev, mod];
    });
  };

  const handleUpdateEntry = (variant?: Variant | null, packagingOptionId?: number | null) => {
    if (!editLine) return;
    updateEntry(editLine.index, {
      quantity: editQty,
      modifiers: editMods,
      variant: variant ?? null,
      packagingOptionId,
      item: editLine.entry.item,
    });
    setEditLine(null);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setFavouriteIds(new Set());
      return;
    }
    getMyFavourites()
      .then((res) => setFavouriteIds(new Set((res.data ?? []).map((f) => f.id))))
      .catch(() => { /* non-fatal */ });
  }, [isAuthenticated]);

  useEffect(() => {
    if (cart.length === 0) {
      setWaitMinutes(null);
      return;
    }
    getWaitTimeEstimate()
      .then(({ wait_minutes, queue_depth }) => {
        if (queue_depth > 0) setWaitMinutes(wait_minutes);
        else setWaitMinutes(null);
      })
      .catch(() => setWaitMinutes(null));
  }, [cart.length]);

  const handleToggleFavourite = (itemId: number) => {
    if (!isAuthenticated) return;
    setFavouriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
    toggleFavourite(itemId).catch(() => {
      setFavouriteIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
        return next;
      });
    });
  };

  const [tierMultiplier, setTierMultiplier] = useState(1);

  useEffect(() => {
    if (!isAuthenticated || cart.length === 0) {
      setEarnRatePerMvr(1);
      setTierMultiplier(1);
      return;
    }
    let cancelled = false;
    getLoyaltyAccount()
      .then((res) => {
        if (!cancelled && (res.program?.enabled ?? true)) {
          setEarnRatePerMvr(res.rates?.earn_per_mvr ?? 1);
          setTierMultiplier(res.rates?.tier_multiplier ?? 1);
        }
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [isAuthenticated, cart.length]);

  const earnPreviewPoints = useMemo(() => {
    if (!isAuthenticated || cart.length === 0) return 0;
    return estimateEarnPointsForSubtotalMvr(cartTotal, earnRatePerMvr, tierMultiplier);
  }, [isAuthenticated, cart.length, cartTotal, earnRatePerMvr, tierMultiplier]);

  useEffect(() => {
    if (cart.length === 0) {
      setUpsellItems([]);
      return;
    }
    const cartIds = cart.map((e) => e.item.id);
    fetchCartRecommendations(cartIds, 3)
      .then(({ items }) => {
        if (items.length > 0) {
          setUpsellItems(items);
          return;
        }
        if (hasFetched.current) return;
        hasFetched.current = true;
        return fetchItems().then(({ data }) => {
          const inCartIds = new Set(cartIds);
          const candidates = data
            .filter((item) => !inCartIds.has(item.id) && item.is_available !== false && !item.has_variants && Number(item.base_price) < 50)
            .sort((a, b) => Number(a.base_price) - Number(b.base_price))
            .slice(0, 3);
          setUpsellItems(candidates);
        });
      })
      .catch(() => { /* non-fatal */ });
  }, [cart]);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    navigate('/checkout');
  };

  const derivedCta = cartCheckoutCta({
    shopOpen: isOpen,
    lines: cart.map((e) => ({ allow_pre_order: e.item?.allow_pre_order })),
  });
  const canCheckout = canCheckoutProp ?? derivedCta.canCheckout;
  const checkoutForTomorrow = checkoutForTomorrowProp ?? derivedCta.checkoutForTomorrow;

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
            {cart.some((e) => e.item.is_catering === true) && (
              <a
                href="/order/events"
                data-testid="cart-event-banner"
                style={{
                  display: 'block',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.8rem',
                  lineHeight: 1.4,
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  background: 'var(--color-primary-light, #FEF3E8)',
                  borderRadius: 10,
                  textDecoration: 'none',
                  border: '1px solid rgba(212,129,58,0.25)',
                }}
              >
                Ordering for a future event? Use Event ordering for quotes, deposits and scheduling →
              </a>
            )}
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
                    {entry.packagingOptionName && (
                      <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.8rem', display: 'block' }}>
                        + {entry.packagingOptionName}
                      </span>
                    )}
                  </p>
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={() => handleToggleFavourite(entry.item.id)}
                      aria-label={favouriteIds.has(entry.item.id) ? 'Remove from favourites' : 'Save to favourites'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0.15rem', flexShrink: 0 }}
                    >
                      {favouriteIds.has(entry.item.id) ? '❤️' : '🤍'}
                    </button>
                  )}
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
                <div style={{ marginTop: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  {(() => {
                    const modSum = entry.modifiers.reduce((s, m) => s + parseFloat(String(m.price)), 0);
                    const unitSale = (entry.variantPrice != null ? entry.variantPrice : parseFloat(String(entry.item.base_price))) + modSum;
                    const unitWas = entry.originalPrice != null
                      ? entry.originalPrice + modSum
                      : null;
                    const lineSale = unitSale * entry.quantity;
                    const lineWas = unitWas != null ? unitWas * entry.quantity : null;
                    const onSale = unitWas != null && unitWas > unitSale;
                    const savings = onSale ? formatSavingsLabel(unitWas!, unitSale) : null;
                    return (
                      <p
                        data-testid="cart-line-price"
                        style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem' }}
                      >
                        {onSale && lineWas != null ? (
                          <span className="menu-card-price-was" style={{ fontWeight: 500 }}>
                            {formatCardPrice(lineWas)}
                          </span>
                        ) : null}
                        <span className={onSale ? 'menu-card-price-sale' : undefined}>
                          {formatCardPrice(lineSale)}
                        </span>
                        {savings ? (
                          <span className="badge badge-sale" data-testid="cart-line-savings">{savings}</span>
                        ) : null}
                      </p>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => startEditLine(index, entry)}
                    style={{
                      minHeight: 44,
                      padding: '0 0.65rem',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      background: 'var(--color-surface)',
                      color: 'var(--color-primary)',
                      fontFamily: 'inherit',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    {t('cart.edit')}
                  </button>
                </div>
              </div>
            ))}

            {/* Subtotal (tax & delivery calculated at checkout) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)', fontWeight: 700, color: 'var(--color-text)' }}>
              <span>{t('cart.subtotal')} <span style={{ fontWeight: 500, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t('cart.subtotal_excl')}</span></span>
              <span style={{ color: 'var(--color-primary)', fontSize: '1.05rem' }}>MVR {cartTotal.toFixed(2)}</span>
            </div>

            {/* Free delivery progress — cart merchandise only; checkout confirms after discounts */}
            {cartTotal < freeDeliveryMvr && (
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
                  <span>🛵 {t('cart.free_delivery_add').replace('{amount}', (freeDeliveryMvr - cartTotal).toFixed(2))}</span>
                  <span>MVR {freeDeliveryMvr}</span>
                </div>
                <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (cartTotal / freeDeliveryMvr) * 100)}%`, background: 'var(--color-primary)', borderRadius: 999, transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}
            {cartTotal >= freeDeliveryMvr && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--color-success)', fontWeight: 600, textAlign: 'center', padding: '0.35rem', background: 'var(--color-success-bg)', borderRadius: 8 }}>
                {t('cart.free_delivery_met')}
              </div>
            )}

            {earnPreviewPoints > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '0.35rem 0.5rem', background: 'var(--color-warning-bg, #FFFBEB)', borderRadius: 8, border: '1px solid rgba(252, 211, 77, 0.35)' }}>
                ⭐ {t('cart.earn_preview').replace('{n}', earnPreviewPoints.toLocaleString())}
              </div>
            )}
          </div>
        )}

        {/* Closed copy lives on the checkout button only — avoid a second identical banner. */}

        {waitMinutes != null && cart.length > 0 && (
          <p style={{ marginTop: '0.75rem', marginBottom: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            {t('cart.kitchen_wait').replace('{n}', String(waitMinutes))}
          </p>
        )}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={!canCheckout}
          style={{
            marginTop: '1rem',
            width: '100%',
            minHeight: 44,
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
          {checkoutForTomorrow
            ? `${t('cart.checkout_tomorrow')} — MVR ${cartTotal.toFixed(2)} →`
            : !isOpen
              ? (closedMessage?.trim() || t('cart.closed_cta_short'))
              : cart.length === 0
                ? t('cart.add_items_cta')
                : `${t('cart.checkout')} — MVR ${cartTotal.toFixed(2)} →`}
        </button>
      </div>

      {/* ── Upsell block ────────────────────────────────────────── */}
      {upsellItems.length > 0 && cart.length > 0 && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '1rem' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', margin: '0 0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('cart.upsell_title')}
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

      {editLine && (
        <ItemSheet
          open
          item={editLine.entry.item}
          qty={editQty}
          selectedModifiers={editMods}
          onToggleModifier={toggleEditModifier}
          onAddToCart={handleUpdateEntry}
          onClose={() => setEditLine(null)}
          editIndex={editLine.index}
          initialVariantId={editLine.entry.variantId ?? null}
          initialPackagingOptionId={editLine.entry.packagingOptionId ?? null}
          onUpdateEntry={handleUpdateEntry}
        />
      )}
    </div>
  );
}
