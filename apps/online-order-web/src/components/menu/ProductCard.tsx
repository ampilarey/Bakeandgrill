/**
 * Menu product card — whole card is one tap target (§15); quick-add/favourite stopPropagation.
 */
import { useMemo, useState } from 'react';
import { cardDescriptionPreview } from '@shared/utils';
import type { Item, Variant } from '../../api';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { buildItemSlides } from '../../utils/itemMedia';
import { MenuImageSlider } from './MenuImageSlider';

export type ProductCardProps = {
  item: Item;
  onSelectItem: (item: Item, qty: number) => void;
  onAddToCart: (
    item: Item,
    quantity: number,
    variant?: Variant | null,
    packagingOptionId?: number | null,
  ) => void;
  isFavourite?: boolean;
  onToggleFavourite?: (itemId: number) => void;
  /** grid = image on top; list = left square thumb + compact copy */
  layout?: 'grid' | 'list';
};

type Props = ProductCardProps;

const SPICE_MAP: Record<string, { label: string; icon: string }> = {
  mild: { label: 'Mild', icon: '🌶' },
  medium: { label: 'Medium', icon: '🌶🌶' },
  hot: { label: 'Hot', icon: '🌶🌶🌶' },
  extra_hot: { label: 'Extra Hot', icon: '🔥' },
};

const MAX_QTY = 99;

export function ProductCard({
  item,
  onSelectItem,
  onAddToCart,
  isFavourite = false,
  onToggleFavourite,
  layout = 'grid',
}: Props) {
  const { t } = useLanguage();
  const { settings: s } = useSiteSettingsContext();
  const [quantity, setQuantity] = useState(1);
  const needsConfigure =
    !!item.has_variants || (item.packaging_options?.length ?? 0) > 1;
  const isList = layout === 'list';

  const mediaAlt =
    item.photos?.find((p) => p.is_primary)?.alt_text
    || item.photos?.find((p) => p.alt_text)?.alt_text
    || item.name;

  const slides = useMemo(
    () => buildItemSlides(item, {
      preferThumb: isList,
      source: 'gallery',
      fallbackAlt: mediaAlt,
    }),
    [item.image_url, item.thumb_url, item.photos, mediaAlt, isList],
  );
  const descPreview = useMemo(
    () => cardDescriptionPreview(item.description),
    [item.description],
  );

  const isUnavailable = item.is_available === false;
  const spice = item.spice_level && item.spice_level !== 'none' ? SPICE_MAP[item.spice_level] : null;
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

  const logoSrc = s.logo || '/logo.png';

  const priceBlock = (
    <div className="menu-card-price-row" style={{ marginTop: isList ? 0 : 'auto', paddingTop: isList ? 0 : '0.375rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', flexWrap: 'wrap', marginBottom: isList ? 0 : '0.75rem' }}>
        {showFromPrice ? (
          <>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>From MVR</span>
            <span className={onSale ? 'menu-card-price-sale' : undefined} style={onSale ? undefined : { fontSize: isList ? '1.05rem' : '1.375rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-primary)' }}>
              {displayPrice.toFixed(2)}
            </span>
            {hasSale && originalPrice != null && (
              <span className="menu-card-price-was">MVR {originalPrice.toFixed(2)}</span>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>MVR</span>
            <span className={onSale ? 'menu-card-price-sale' : undefined} style={onSale ? undefined : { fontSize: isList ? '1.05rem' : '1.375rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-primary)' }}>
              {displayPrice.toFixed(2)}
            </span>
            {hasSale && originalPrice != null && (
              <span className="menu-card-price-was">MVR {originalPrice.toFixed(2)}</span>
            )}
          </>
        )}
      </div>

      {!isList && (
        isUnavailable ? (
          <button
            type="button"
            disabled
            onClick={(e) => e.stopPropagation()}
            className="card-add-btn"
            style={{
              width: '100%', minHeight: 44, padding: '0.625rem',
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
        ) : needsConfigure ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              border: '1.5px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', overflow: 'hidden', flexShrink: 0,
            }}>
              <button type="button" onClick={(e) => { e.stopPropagation(); setQuantity((q) => Math.max(1, q - 1)); }}
                style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="Decrease quantity">−</button>
              <span style={{ minWidth: '1.625rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>{quantity}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setQuantity((q) => Math.min(MAX_QTY, q + 1)); }}
                style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="Increase quantity">+</button>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectItem(item, quantity); setQuantity(1); }}
              className="card-add-btn"
              style={{
                flex: 1, padding: '0.5rem', minHeight: 44, height: 44,
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
            <div style={{
              display: 'flex', alignItems: 'center',
              border: '1.5px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setQuantity((q) => Math.max(1, q - 1)); }}
                style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
                style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, background: 'var(--color-surface-alt)', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
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
                fontFamily: 'inherit', minHeight: 44, height: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label={`Add ${quantity} ${item.name} to cart`}
            >
              Add {quantity > 1 ? `(${quantity})` : ''}
            </button>
          </div>
        )
      )}

      {!isList && !isUnavailable && !needsConfigure && item.modifiers && item.modifiers.length > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelectItem(item, quantity); }}
          className="card-customise-btn"
          style={{
            width: '100%', marginTop: '0.4rem',
            padding: '0.35rem', minHeight: 44,
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
  );

  const badges = !isUnavailable && ((onSale && saleBadgeLabel) || isCombo || spice) ? (
    <div className="menu-card-image-badges">
      {onSale && saleBadgeLabel && (
        <span className="badge badge-sale">{saleBadgeLabel}</span>
      )}
      {isCombo && <span className="badge badge-combo">Bundle</span>}
      {spice && <span className="badge badge-spicy">{spice.icon} {spice.label}</span>}
    </div>
  ) : null;

  return (
    <article
      className={`menu-card-article${isUnavailable ? ' unavailable' : ''}${onSale ? ' menu-card-on-sale' : ''}${isList ? ' menu-card-article--list' : ''}`}
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
        flexDirection: isList ? 'row' : 'column',
        height: '100%',
        opacity: isUnavailable ? 0.6 : 1,
        position: 'relative',
        cursor: isUnavailable ? 'default' : 'pointer',
      }}
    >
      <div
        className={isList ? 'menu-card-media menu-card-media--list' : 'menu-card-media'}
        style={{ position: 'relative', flexShrink: 0 }}
      >
        <MenuImageSlider
          slides={slides}
          alt={mediaAlt}
          posterOnly
          aspectRatio={isList ? '1 / 1' : '4 / 3'}
          logoSrc={logoSrc}
          showDots={!isList}
        />

        {isUnavailable && (
          <div className="menu-card-unavail-overlay">
            <span className="badge badge-unavail">{t('menu.unavailable')}</span>
          </div>
        )}

        {onToggleFavourite && (
          <button
            type="button"
            className="menu-card-fav-btn"
            onClick={(e) => { e.stopPropagation(); onToggleFavourite(item.id); }}
            style={{
              position: 'absolute', top: '0.5rem', right: '0.5rem',
              background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: '50%',
              width: 44, height: 44, minWidth: 44, minHeight: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              zIndex: 3,
            }}
            aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
          >
            {isFavourite ? '❤️' : '🤍'}
          </button>
        )}

        {!isList && badges}
      </div>

      <div
        className="menu-card-body"
        style={{
          padding: isList ? '0.75rem 0.875rem' : '0.75rem 0.875rem 0.875rem',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: isList ? '0.25rem' : '0.4rem',
          minWidth: 0,
          justifyContent: isList ? 'center' : undefined,
        }}
      >
        {item.dietary_tags && item.dietary_tags.length > 0 && !isList && (
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {item.dietary_tags.slice(0, 2).map((tag) => (
              <span key={tag} style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-surface-alt)', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)', textTransform: 'capitalize', letterSpacing: '0.02em' }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <h3
          className="menu-card-name"
          style={{
            fontSize: '0.9375rem',
            fontWeight: 700,
            color: 'var(--color-text)',
            margin: 0,
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.name}
        </h3>

        {descPreview.text && (
          <p
            className="menu-card-desc"
            style={{
              fontSize: '0.78rem',
              color: 'var(--color-text-muted)',
              lineHeight: 1.45,
              margin: 0,
              whiteSpace: 'pre-line',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {descPreview.text}
          </p>
        )}

        {!isList && item.avg_rating != null && item.review_count != null && item.review_count > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ color: '#f59e0b', fontSize: '0.78rem', letterSpacing: '-0.02em' }}>
              {'★'.repeat(Math.round(item.avg_rating))}{'☆'.repeat(5 - Math.round(item.avg_rating))}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              {item.avg_rating.toFixed(1)} ({item.review_count})
            </span>
          </div>
        )}

        {!isList && item.prep_time_minutes && (
          <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: 0 }}>
            ⏱ {item.prep_time_minutes} min
          </p>
        )}

        {priceBlock}
      </div>
    </article>
  );
}
