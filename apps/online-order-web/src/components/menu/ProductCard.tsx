/**
 * Compact ZUS-style menu card — circular media + 3 centered lines.
 * Whole card (except heart) opens the existing item detail sheet.
 */
import { useMemo } from 'react';
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
  /** grid = circular ZUS card; list = compact row with circular thumb */
  layout?: 'grid' | 'list';
};

const SPICE_MAP: Record<string, { label: string; icon: string }> = {
  mild: { label: 'Mild', icon: '🌶' },
  medium: { label: 'Medium', icon: '🌶🌶' },
  hot: { label: 'Hot', icon: '🌶🌶🌶' },
  extra_hot: { label: 'Extra Hot', icon: '🔥' },
};

export function ProductCard({
  item,
  onSelectItem,
  onAddToCart: _onAddToCart,
  isFavourite = false,
  onToggleFavourite,
  layout = 'grid',
}: ProductCardProps) {
  void _onAddToCart;
  const { t, lang } = useLanguage();
  const { settings: s } = useSiteSettingsContext();
  const isList = layout === 'list';
  const isDv = lang === 'dv';

  const mediaAlt =
    item.photos?.find((p) => p.is_primary)?.alt_text
    || item.photos?.find((p) => p.alt_text)?.alt_text
    || item.name;

  const slides = useMemo(
    () => buildItemSlides(item, {
      preferThumb: false,
      source: 'gallery',
      fallbackAlt: mediaAlt,
    }),
    [item.image_url, item.thumb_url, item.photos, mediaAlt],
  );

  const displayName = useMemo(() => {
    if (isDv) {
      return (item.card_name_dv || item.name_dv || item.card_name || item.name || '').trim();
    }
    return (item.card_name || item.name || '').trim();
  }, [item.card_name, item.card_name_dv, item.name, item.name_dv, isDv]);

  const detailLine = useMemo(() => {
    if (isDv) {
      const dv = (item.short_description_dv || '').trim();
      if (dv) return dv;
    }
    const en = (item.short_description || '').trim();
    if (en) return en;
    return cardDescriptionPreview(item.description).text;
  }, [item.short_description, item.short_description_dv, item.description, isDv]);

  const isUnavailable = item.is_available === false;
  const spice = item.spice_level && item.spice_level !== 'none' ? SPICE_MAP[item.spice_level] : null;
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
      : null);

  const priceNote = (item.price_note || '').trim();
  const logoSrc = s.logo || '/logo.png';
  const formatCardPrice = (n: number) => `${n.toFixed(2)}/-`;
  const fromPrefix = priceNote || (showFromPrice ? 'From' : '');

  const openItem = () => {
    if (!isUnavailable) onSelectItem(item, 1);
  };

  const badge = !isUnavailable && ((onSale && saleBadgeLabel) || spice)
    ? (
      <div className="menu-card-image-badges menu-card-image-badges--circle">
        {onSale && saleBadgeLabel
          ? <span className="badge badge-sale">{saleBadgeLabel}</span>
          : spice
            ? <span className="badge badge-spicy">{spice.icon}</span>
            : null}
      </div>
    )
    : null;

  return (
    <article
      className={`menu-card-article menu-card-article--zus${isUnavailable ? ' unavailable' : ''}${onSale ? ' menu-card-on-sale' : ''}${isList ? ' menu-card-article--list' : ''}`}
      role={isUnavailable ? undefined : 'button'}
      tabIndex={isUnavailable ? undefined : 0}
      onClick={openItem}
      onKeyDown={(e) => {
        if (!isUnavailable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          openItem();
        }
      }}
      aria-label={isUnavailable ? undefined : t('menu.view_item').replace('{name}', displayName)}
      data-testid="product-card"
    >
      <div className={`menu-card-media-circle${isList ? ' menu-card-media-circle--list' : ''}`}>
        <div
          className="menu-card-media-circle__frame"
          data-testid="menu-card-media-frame"
        >
          <MenuImageSlider
            slides={slides}
            alt={mediaAlt}
            posterOnly
            aspectRatio="1 / 1"
            logoSrc={logoSrc}
            showDots={false}
            className="menu-card-media-circle__slider"
          />
        </div>
        {isUnavailable && (
          <div className="menu-card-unavail-overlay">
            <span className="badge badge-unavail">{t('menu.unavailable')}</span>
          </div>
        )}
        {onToggleFavourite && (
          <button
            type="button"
            className="menu-card-fav-btn"
            style={{ minWidth: 44, minHeight: 44 }}
            onClick={(e) => { e.stopPropagation(); onToggleFavourite(item.id); }}
            aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
          >
            {isFavourite ? '❤️' : '🤍'}
          </button>
        )}
        {badge}
      </div>

      <div className="menu-card-body menu-card-body--zus">
        <h3 className="menu-card-name">{displayName}</h3>
        {detailLine ? (
          <p className="menu-card-desc">{detailLine}</p>
        ) : null}
        <div className="menu-card-price-row" data-testid="menu-card-price-row">
          <span className={onSale ? 'menu-card-price-sale' : 'menu-card-price'}>
            {fromPrefix ? `${fromPrefix} ${formatCardPrice(displayPrice)}` : formatCardPrice(displayPrice)}
          </span>
          {hasSale && originalPrice != null && (
            <span className="menu-card-price-was">{formatCardPrice(originalPrice)}</span>
          )}
        </div>
      </div>
    </article>
  );
}
