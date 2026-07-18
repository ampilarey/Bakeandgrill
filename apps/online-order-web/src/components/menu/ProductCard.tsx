/**
 * Menu product card — whole card is one tap target (§15); quick-add/favourite stopPropagation.
 */
import { useState } from 'react';
import { API_ORIGIN } from '../../api';
import type { Item, Variant } from '../../api';
import { useLanguage } from '../../context/LanguageContext';

export type ProductCardProps = {
  item: Item;
  onSelectItem: (item: Item, qty: number) => void;
  onAddToCart: (item: Item, quantity: number, variant?: Variant | null) => void;
  isFavourite?: boolean;
  onToggleFavourite?: (itemId: number) => void;
};

type Props = ProductCardProps;

// Spice level to label/color
const SPICE_MAP: Record<string, { label: string; icon: string }> = {
  mild:      { label: 'Mild', icon: '🌶' },
  medium:    { label: 'Medium', icon: '🌶🌶' },
  hot:       { label: 'Hot', icon: '🌶🌶🌶' },
  extra_hot: { label: 'Extra Hot', icon: '🔥' },
};

const MAX_QTY = 99;

export function ProductCard({ item, onSelectItem, onAddToCart, isFavourite = false, onToggleFavourite }: Props) {
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [imgError, setImgError] = useState(false);

  const imgSrc = (!imgError && item.image_url)
    ? item.image_url.startsWith('http')
      ? item.image_url
      : `${API_ORIGIN}${item.image_url.startsWith('/') ? '' : '/'}${item.image_url}`
    : null;

  const isUnavailable = item.is_available === false;
  const spice = item.spice_level && item.spice_level !== 'none' ? SPICE_MAP[item.spice_level] : null;

  // Primary badge — prefer bestseller heuristic (top items from API are often bestsellers)
  // Use spice, combo, or MTO as secondary
  const isCombo = item.is_combo;
  const special = item.special;
  const activeVariants = (item.variants ?? []).filter((v) => v.is_active);
  const discountedVariants = activeVariants.filter(
    (v) => v.effective_price != null && Number(v.effective_price) < Number(v.price),
  );
  const lowestVariantPrice = activeVariants.length > 0
    ? Math.min(...activeVariants.map((v) => Number(v.effective_price ?? v.price)))
    : null;
  const showFromPrice = item.has_variants && lowestVariantPrice != null;
  const displayPrice = showFromPrice
    ? lowestVariantPrice
    : Number(special?.effective_price ?? item.base_price);
  const originalPrice = showFromPrice
    ? (discountedVariants.length > 0
      ? Math.min(...discountedVariants.map((v) => Number(v.original_price ?? v.price)))
      : null)
    : (special?.original_price != null ? Number(special.original_price) : null);
  const hasSale = originalPrice != null && originalPrice > displayPrice;
  const onSale = hasSale || !!special || discountedVariants.length > 0;
  const saleBadgeLabel = special?.badge_label
    ?? (special?.discount_pct ? `${special.discount_pct}% OFF` : null)
    ?? (hasSale && originalPrice && originalPrice > 0
      ? `${Math.round((1 - displayPrice / originalPrice) * 100)}% OFF`
      : null)
    ?? (discountedVariants.length > 0 ? 'Special Offer' : null);

  const openItem = () => {
    if (!isUnavailable) onSelectItem(item, quantity);
  };

  return (
    <article
      className={`menu-card-article${isUnavailable ? ' unavailable' : ''}${onSale ? ' menu-card-on-sale' : ''}`}
      role={isUnavailable ? undefined : 'button'}
      tabIndex={isUnavailable ? undefined : 0}
      onClick={openItem}
      onKeyDown={(e) => {
        if (!isUnavailable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          openItem();
        }
      }}
      aria-label={isUnavailable ? undefined : t('menu.view_item').replace('{name}', item.name)}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        opacity: isUnavailable ? 0.6 : 1,
        position: 'relative',
        cursor: isUnavailable ? 'default' : 'pointer',
      }}
    >
      {/* ── Image ──────────────────────────────────────────── */}
      <div
        style={{
          width: '100%',
          aspectRatio: '4 / 3',
          background: imgSrc ? undefined : 'linear-gradient(135deg, var(--color-primary-light), var(--color-surface-alt))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', flexShrink: 0, position: 'relative',
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        ) : (
          <span style={{ fontSize: '2.5rem', opacity: 0.35 }}>🍽️</span>
        )}

        {/* Unavailable overlay */}
        {isUnavailable && (
          <div className="menu-card-unavail-overlay">
            <span className="badge badge-unavail">{t('menu.unavailable')}</span>
          </div>
        )}

        {/* Favourite button */}
        {onToggleFavourite && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleFavourite(item.id); }}
            style={{
              position: 'absolute', top: '0.625rem', right: '0.625rem',
              background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%',
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 15, boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              zIndex: 1,
            }}
            aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
          >
            {isFavourite ? '❤️' : '🤍'}
          </button>
        )}

        {/* Badges — kept inside image bounds (no diagonal ribbon overflow) */}
        {!isUnavailable && ((onSale && saleBadgeLabel) || isCombo || spice) && (
          <div className="menu-card-image-badges">
            {onSale && saleBadgeLabel && (
              <span className="badge badge-sale">{saleBadgeLabel}</span>
            )}
            {isCombo && <span className="badge badge-combo">Bundle</span>}
            {spice && <span className="badge badge-spicy">{spice.icon} {spice.label}</span>}
          </div>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div style={{ padding: '0.875rem 1rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

        {/* Category label if available */}
        {item.dietary_tags && item.dietary_tags.length > 0 && (
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {item.dietary_tags.slice(0, 2).map((tag) => (
              <span key={tag} style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-surface-alt)', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)', textTransform: 'capitalize', letterSpacing: '0.02em' }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Name */}
        <h3 style={{
          fontSize: '0.9375rem',
          fontWeight: 700,
          color: 'var(--color-text)',
          margin: 0,
          lineHeight: 1.3,
        }}>
          {item.name}
        </h3>

        {/* Description */}
        {item.description && (
          <p style={{
            fontSize: '0.78rem',
            color: 'var(--color-text-muted)',
            lineHeight: 1.45,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {item.description}
          </p>
        )}

        {/* Star rating */}
        {item.avg_rating != null && item.review_count != null && item.review_count > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ color: '#f59e0b', fontSize: '0.78rem', letterSpacing: '-0.02em' }}>
              {'★'.repeat(Math.round(item.avg_rating))}{'☆'.repeat(5 - Math.round(item.avg_rating))}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              {item.avg_rating.toFixed(1)} ({item.review_count})
            </span>
          </div>
        )}

        {/* Prep time */}
        {item.prep_time_minutes && (
          <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: 0 }}>
            ⏱ {item.prep_time_minutes} min
          </p>
        )}

        {/* Price — visually dominant */}
        <div style={{ marginTop: 'auto', paddingTop: '0.375rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {showFromPrice ? (
              <>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>From MVR</span>
                <span className={onSale ? 'menu-card-price-sale' : undefined} style={onSale ? undefined : { fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-primary)' }}>
                  {displayPrice.toFixed(2)}
                </span>
                {hasSale && originalPrice != null && (
                  <span className="menu-card-price-was">MVR {originalPrice.toFixed(2)}</span>
                )}
              </>
            ) : (
              <>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>MVR</span>
                <span className={onSale ? 'menu-card-price-sale' : undefined} style={onSale ? undefined : { fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-primary)' }}>
                  {displayPrice.toFixed(2)}
                </span>
                {hasSale && originalPrice != null && (
                  <span className="menu-card-price-was">MVR {originalPrice.toFixed(2)}</span>
                )}
              </>
            )}
          </div>

          {/* Quantity + add — only when available */}
          {isUnavailable ? (
            <button
              type="button"
              disabled
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', padding: '0.625rem',
                background: 'var(--color-surface-alt)',
                color: 'var(--color-text-muted)',
                border: 'none', borderRadius: 'var(--radius-lg)',
                fontSize: '0.875rem', fontWeight: 600,
                cursor: 'not-allowed', fontFamily: 'inherit',
              }}
              aria-disabled="true"
            >
              {t('menu.out_of_stock')}
            </button>
          ) : item.has_variants ? (
            /* Variant items: − qty + on left, + opens modal on right */
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)', overflow: 'hidden', flexShrink: 0,
              }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); setQuantity((q) => Math.max(1, q - 1)); }}
                  style={{ width: '32px', height: '32px', background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  aria-label="Decrease quantity">−</button>
                <span style={{ minWidth: '1.625rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>{quantity}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); setQuantity((q) => Math.min(MAX_QTY, q + 1)); }}
                  style={{ width: '32px', height: '32px', background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  aria-label="Increase quantity">+</button>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectItem(item, quantity); setQuantity(1); }}
                className="card-add-btn"
                style={{
                  flex: 1, padding: '0.5rem', height: '32px',
                  background: 'var(--color-primary)', color: 'white',
                  border: 'none', borderRadius: 'var(--radius-lg)',
                  fontSize: '0.85rem', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                }}
                aria-label={`Select options for ${item.name}`}
              >
                Add{quantity > 1 ? ` (${quantity})` : ''}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Quantity stepper */}
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden', flexShrink: 0,
              }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setQuantity((q) => Math.max(1, q - 1)); }}
                  style={{ width: '32px', height: '32px', background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span style={{ minWidth: '1.625rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setQuantity((q) => Math.min(MAX_QTY, q + 1)); }}
                  style={{ width: '32px', height: '32px', background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              {/* Add button */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAddToCart(item, quantity); setQuantity(1); }}
                className="card-add-btn"
                style={{
                  flex: 1, padding: '0.5rem',
                  background: 'var(--color-primary)', color: 'white',
                  border: 'none', borderRadius: 'var(--radius-lg)',
                  fontSize: '0.85rem', fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit', height: '32px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label={`Add ${quantity} ${item.name} to cart`}
              >
                Add {quantity > 1 ? `(${quantity})` : ''}
              </button>
            </div>
          )}

          {/* Customise link if has modifiers (only for non-variant products) */}
          {!isUnavailable && !item.has_variants && item.modifiers && item.modifiers.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectItem(item, quantity); }}
              className="card-customise-btn"
              style={{
                width: '100%', marginTop: '0.4rem',
                padding: '0.35rem',
                background: 'transparent',
                color: 'var(--color-primary)',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                fontSize: '0.78rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Customise options
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
