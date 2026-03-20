import { useState } from 'react';
import { API_ORIGIN } from '../api';
import type { Item } from '../api';

type Props = {
  item: Item;
  onSelectItem: (item: Item) => void;
  onAddToCart: (item: Item, quantity: number) => void;
};

// Spice level to label/color
const SPICE_MAP: Record<string, { label: string; icon: string }> = {
  mild:      { label: 'Mild', icon: '🌶' },
  medium:    { label: 'Medium', icon: '🌶🌶' },
  hot:       { label: 'Hot', icon: '🌶🌶🌶' },
  extra_hot: { label: 'Extra Hot', icon: '🔥' },
};

const MAX_QTY = 99;

export function MenuCard({ item, onSelectItem, onAddToCart }: Props) {
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

  return (
    <article
      className={`menu-card-article${isUnavailable ? ' unavailable' : ''}`}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        opacity: isUnavailable ? 0.6 : 1,
        position: 'relative',
      }}
    >
      {/* ── Image ──────────────────────────────────────────── */}
      <div
        role={isUnavailable ? undefined : 'button'}
        tabIndex={isUnavailable ? undefined : 0}
        onClick={() => { if (!isUnavailable) onSelectItem(item); }}
        onKeyDown={(e) => { if (!isUnavailable && e.key === 'Enter') onSelectItem(item); }}
        style={{
          width: '100%',
          aspectRatio: '4 / 3',
          background: imgSrc ? undefined : 'linear-gradient(135deg, var(--color-primary-light), #f7e4c8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isUnavailable ? 'default' : 'pointer',
          overflow: 'hidden', flexShrink: 0, position: 'relative',
        }}
        aria-label={isUnavailable ? undefined : `View details for ${item.name}`}
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
            <span className="badge badge-unavail">Unavailable</span>
          </div>
        )}

        {/* Badges */}
        {!isUnavailable && (
          <div style={{ position: 'absolute', top: '0.625rem', left: '0.625rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
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

        {/* Prep time */}
        {item.prep_time_minutes && (
          <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: 0 }}>
            ⏱ {item.prep_time_minutes} min
          </p>
        )}

        {/* Price — visually dominant */}
        <div style={{ marginTop: 'auto', paddingTop: '0.375rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>MVR</span>
            <span style={{ fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-primary)' }}>
              {Number(item.base_price).toFixed(2)}
            </span>
          </div>

          {/* Quantity + add — only when available */}
          {isUnavailable ? (
            <button
              disabled
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
              Out of stock
            </button>
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

          {/* Customise link if has modifiers */}
          {!isUnavailable && item.modifiers && item.modifiers.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectItem(item); }}
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
