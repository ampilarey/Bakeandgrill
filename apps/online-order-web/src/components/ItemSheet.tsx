/**
 * Item customisation sheet. Phase 3 PR2: same UI;
 * edit-mode props call CartContext.updateEntry when editIndex is set.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { fetchCartRecommendations, getItemReviews, getItemPhotos } from '../api';
import type { Item, Modifier, ItemReview, ItemPhoto } from '../api';
import type { Variant } from '@shared/types';
import { useCart } from '../context/CartContext';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';
import { useLanguage } from '../context/LanguageContext';
import {
  isItemAvailableNow,
  itemLowStockLabel,
  itemUnavailableLabel,
} from '../utils/itemAvailability';
import { buildItemSlides } from '../utils/itemMedia';
import { formatCardPrice, formatSavingsLabel } from '../utils/money';
import { MenuImageSlider } from './menu/MenuImageSlider';

export type ItemSheetProps = {
  open: boolean;
  item: Item;
  qty: number;
  selectedModifiers: Modifier[];
  onToggleModifier: (modifier: Modifier) => void;
  onAddToCart: (variant?: Variant | null, packagingOptionId?: number | null) => void;
  onClose: () => void;
  /** Cart edit-in-place */
  editIndex?: number | null;
  initialVariantId?: number | null;
  initialPackagingOptionId?: number | null;
  onUpdateEntry?: (variant?: Variant | null, packagingOptionId?: number | null) => void;
  /** Dine-in / browse-only — hide cart actions, show variants & packaging as text. */
  viewOnly?: boolean;
};

export function ItemSheet({
  open,
  item,
  qty,
  selectedModifiers,
  onToggleModifier,
  onAddToCart,
  onClose,
  editIndex = null,
  initialVariantId = null,
  initialPackagingOptionId = null,
  onUpdateEntry,
  viewOnly = false,
}: ItemSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const { addItem } = useCart();
  const { t } = useLanguage();
  const { settings: siteSettings } = useSiteSettingsContext();
  const itemAvailable = isItemAvailableNow(item);
  const unavailLabel = !itemAvailable ? itemUnavailableLabel(item, t) : null;
  const lowStockLabel = itemAvailable ? itemLowStockLabel(item, t) : null;
  const activeVariants = (item.variants ?? []).filter((v) => v.is_active);
  const packagingOptions = (item.packaging_options ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const showPackagingPicker = !viewOnly && packagingOptions.length > 1;
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(() => {
    if (!item.has_variants || activeVariants.length === 0) return null;
    if (initialVariantId != null) {
      return activeVariants.find((v) => v.id === initialVariantId) ?? null;
    }
    return activeVariants.length === 1 ? activeVariants[0] : null;
  });
  const [selectedPackagingId, setSelectedPackagingId] = useState<number | null>(() => {
    if (initialPackagingOptionId != null) return initialPackagingOptionId;
    return packagingOptions.find((o) => o.is_default)?.id ?? packagingOptions[0]?.id ?? null;
  });

  const modifierTotal = selectedModifiers.reduce((s, m) => s + Number(m.price), 0);
  const catalogPrice = selectedVariant
    ? Number(selectedVariant.effective_price ?? selectedVariant.price)
    : Number(item.special?.effective_price ?? item.base_price);
  const originalCatalog = selectedVariant
    ? (selectedVariant.effective_price != null && selectedVariant.original_price != null
      ? Number(selectedVariant.original_price)
      : null)
    : (item.special?.original_price != null ? Number(item.special.original_price) : null);
  const totalPrice = catalogPrice + modifierTotal;
  const unitSavingsLabel =
    originalCatalog != null && originalCatalog > catalogPrice
      ? formatSavingsLabel(originalCatalog, catalogPrice)
      : (item.special?.discount_pct
        ? `${item.special.discount_pct}% OFF`
        : null);
  const canAdd = itemAvailable
    && (!item.has_variants || selectedVariant !== null)
    && (!showPackagingPicker || selectedPackagingId != null);

  const [reviews, setReviews] = useState<ItemReview[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [photos, setPhotos] = useState<ItemPhoto[]>(() => item.photos ?? []);
  const [pairings, setPairings] = useState<Item[]>([]);

  const slides = useMemo(
    () => buildItemSlides(
      { image_url: item.image_url, thumb_url: item.thumb_url, name: item.name, photos },
      { source: 'gallery', defaultImageUrl: siteSettings.default_item_image || null },
    ),
    [item.image_url, item.thumb_url, item.name, photos, siteSettings.default_item_image],
  );

  useEffect(() => {
    let cancelled = false;
    setPhotos(item.photos ?? []);
    setReviews([]);
    setAvgRating(null);
    setPairings([]);
    getItemReviews(item.id)
      .then((res) => { if (!cancelled) { setReviews(res.reviews?.slice(0, 5) ?? []); setAvgRating(res.average_rating ?? null); } })
      .catch(() => {});
    getItemPhotos(item.id)
      .then((res) => { if (!cancelled) setPhotos(res.photos ?? []); })
      .catch(() => {});
    if (!viewOnly) {
      fetchCartRecommendations([item.id], 3)
        .then(({ items: recs }) => { if (!cancelled) setPairings(recs ?? []); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [item.id, item.photos, viewOnly]);

  useEffect(() => {
    if (!item.has_variants || activeVariants.length === 0) {
      setSelectedVariant(null);
      return;
    }
    if (initialVariantId != null) {
      setSelectedVariant(activeVariants.find((v) => v.id === initialVariantId) ?? null);
      return;
    }
    setSelectedVariant(activeVariants.length === 1 ? activeVariants[0] : null);
  }, [item.id, initialVariantId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialPackagingOptionId != null) {
      setSelectedPackagingId(initialPackagingOptionId);
      return;
    }
    setSelectedPackagingId(
      packagingOptions.find((o) => o.is_default)?.id ?? packagingOptions[0]?.id ?? null,
    );
  }, [item.id, initialPackagingOptionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus close button and trap focus within modal (BUG-09)
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        document.getElementById('item-modal')?.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const titleId = `modal-title-${item.id}`;

  if (!open) return null;

  const isEdit = editIndex != null && editIndex >= 0;
  const handleConfirm = () => {
    if (isEdit && onUpdateEntry) onUpdateEntry(selectedVariant, selectedPackagingId);
    else onAddToCart(selectedVariant, selectedPackagingId);
  };

  const spice = item.spice_level && item.spice_level !== 'none' ? SPICE_MAP[item.spice_level] : null;
  const dietary = item.dietary_tags ?? [];
  const allergens = item.allergens ?? [];
  const metaBits: string[] = [];
  if (spice) metaBits.push(`${spice.icon} ${spice.label}`);
  if (item.prep_time_minutes != null && item.prep_time_minutes > 0) {
    metaBits.push(`⏱ ${item.prep_time_minutes} min`);
  }
  if (item.calories != null && item.calories > 0) {
    metaBits.push(`~${item.calories} kcal`);
  }

  const chip = (selected: boolean): CSSProperties => ({
    padding: '0.55rem 1rem',
    border: `2px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
    borderRadius: 999,
    background: selected ? 'var(--color-primary-light)' : 'var(--color-surface)',
    color: selected ? 'var(--color-primary)' : 'var(--color-text)',
    fontWeight: selected ? 700 : 500,
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  });

  return (
    <div
      className="item-detail-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-modal)' as unknown as number,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(15,23,42,0.5)', padding: 0,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        id="item-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="item-detail-sheet"
        style={{
          width: '100%', maxWidth: 480,
          maxHeight: 'min(92vh, 860px)',
          background: 'var(--color-surface)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -12px 48px rgba(15,23,42,0.22)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {/* Hero photo */}
          <div style={{ position: 'relative' }}>
            {slides.length > 0 ? (
              <MenuImageSlider slides={slides} alt={item.name} aspectRatio="16 / 10" />
            ) : (
              <div style={{
                aspectRatio: '16 / 10',
                background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-surface-alt))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2.75rem', opacity: 0.45,
              }}>
                🍽️
              </div>
            )}
            <button
              ref={closeRef}
              onClick={onClose}
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 4,
                background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: '50%',
                width: 40, height: 40, cursor: 'pointer', fontSize: '1.15rem',
                color: 'var(--color-text)', boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div style={{ padding: '1.15rem 1.25rem 1.5rem' }}>
            <h3 id={titleId} style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-dark)', margin: '0 0 0.2rem', lineHeight: 1.25 }}>
              {item.name}
            </h3>
            {item.name_dv && (
              <p style={{ margin: '0 0 0.45rem', fontSize: '0.95rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                {item.name_dv}
              </p>
            )}
            <div
              data-testid="item-sheet-price"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.45rem',
                margin: '0 0 0.75rem',
              }}
            >
              <p style={{ fontSize: '1.15rem', color: 'var(--color-primary)', fontWeight: 800, margin: 0 }}>
                {item.has_variants && !selectedVariant && activeVariants.length > 0
                  ? `From ${formatCardPrice(Math.min(...activeVariants.map((v) => Number(v.effective_price ?? v.price))))}`
                  : (
                    <>
                      <span className="menu-card-price-sale">{formatCardPrice(totalPrice)}</span>
                      {originalCatalog != null && originalCatalog > catalogPrice && (
                        <span
                          className="menu-card-price-was"
                          style={{ marginLeft: '0.4rem', fontSize: '0.85rem', fontWeight: 500 }}
                        >
                          {formatCardPrice(originalCatalog)}
                        </span>
                      )}
                    </>
                  )}
              </p>
              {unitSavingsLabel && !(item.has_variants && !selectedVariant) ? (
                <span className="badge badge-sale" data-testid="item-sheet-savings">
                  {unitSavingsLabel}
                </span>
              ) : null}
            </div>

            {!itemAvailable && unavailLabel && (
              <p
                data-testid="item-sheet-unavail"
                style={{
                  margin: '0 0 0.85rem',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color: '#b91c1c',
                }}
              >
                {unavailLabel}
              </p>
            )}
            {itemAvailable && lowStockLabel && (
              <p
                data-testid="item-sheet-low-stock"
                style={{
                  margin: '0 0 0.85rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#b45309',
                }}
              >
                {lowStockLabel}
              </p>
            )}

            {(metaBits.length > 0 || avgRating !== null) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '0.85rem', alignItems: 'center' }}>
                {metaBits.map((bit) => (
                  <span
                    key={bit}
                    style={{
                      fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text)',
                      background: 'var(--color-surface-alt)', padding: '0.28rem 0.65rem',
                      borderRadius: 999, border: '1px solid var(--color-border)',
                    }}
                  >
                    {bit}
                  </span>
                ))}
                {avgRating !== null && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                    ★ {avgRating.toFixed(1)}
                    {item.review_count != null ? ` (${item.review_count})` : ''}
                  </span>
                )}
              </div>
            )}

            {dietary.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '0.85rem' }}>
                {dietary.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: '0.7rem', fontWeight: 700, textTransform: 'capitalize',
                      color: 'var(--color-primary)', background: 'var(--color-primary-light)',
                      padding: '0.22rem 0.55rem', borderRadius: 999,
                    }}
                  >
                    {tag.replace(/-/g, ' ')}
                  </span>
                ))}
              </div>
            )}

            {item.description && (
              <p style={{
                fontSize: '0.92rem',
                color: 'var(--color-text-muted)',
                margin: '0 0 1rem',
                lineHeight: 1.55,
                whiteSpace: 'pre-line',
              }}>
                {item.description.trim()}
              </p>
            )}

            {allergens.length > 0 && (
              <div style={{
                marginBottom: '1.1rem', padding: '0.75rem 0.9rem',
                background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 12,
              }}>
                <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 800, color: '#9A3412', letterSpacing: '0.02em' }}>
                  CONTAINS
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#7C2D12', textTransform: 'capitalize', lineHeight: 1.4 }}>
                  {allergens.map((a) => a.replace(/-/g, ' ')).join(' · ')}
                </p>
              </div>
            )}

            {item.is_combo && item.combo_items && item.combo_items.length > 0 && (
              <div style={{ marginBottom: '1.1rem' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-dark)', margin: '0 0 0.45rem' }}>
                  Includes
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.125rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
                  {item.combo_items.map((entry) => (
                    <li key={`${entry.item_id}-${entry.quantity}`}>
                      {entry.quantity > 1 ? `${entry.quantity}× ` : ''}
                      {entry.item_name || entry.item?.name || `Item #${entry.item_id}`}
                      {entry.is_optional ? ' (optional)' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(item.has_variants && activeVariants.length > 0)
              || showPackagingPicker
              || (viewOnly && packagingOptions.length > 0)
              || (item.modifiers && item.modifiers.length > 0) ? (
              <div style={{ height: 1, background: 'var(--color-border)', margin: '0.25rem 0 1.1rem' }} />
            ) : null}

            {item.has_variants && activeVariants.length > 0 && (
              <div style={{ marginBottom: '1.15rem' }} data-testid="item-sheet-variants">
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.65rem' }}>
                  {viewOnly ? 'Options' : <>Choose option <span style={{ color: '#ef4444' }}>*</span></>}
                </p>
                {viewOnly ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {activeVariants.map((v) => (
                      <li
                        key={v.id}
                        style={{
                          display: 'flex', justifyContent: 'space-between', gap: '0.75rem',
                          padding: '0.65rem 0.85rem', borderRadius: 12,
                          border: '1px solid var(--color-border)', background: 'var(--color-surface-alt)',
                          fontSize: '0.9rem', color: 'var(--color-dark)',
                        }}
                      >
                        <span>{v.name}</span>
                        <span style={{ fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                          {formatCardPrice(Number(v.effective_price ?? v.price))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {activeVariants.map((v) => {
                        const isSelected = selectedVariant?.id === v.id;
                        return (
                          <button key={v.id} type="button" onClick={() => setSelectedVariant(v)} style={chip(isSelected)} aria-pressed={isSelected}>
                            {v.name}
                            <span style={{ marginLeft: '0.35rem', fontSize: '0.8rem', fontWeight: 600, opacity: 0.9 }}>
                              {formatCardPrice(Number(v.effective_price ?? v.price))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {!selectedVariant && (
                      <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '0.4rem' }}>Please select an option to continue.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {viewOnly && packagingOptions.length > 0 && (
              <div style={{ marginBottom: '1.15rem' }} data-testid="item-sheet-packaging">
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.65rem' }}>
                  Packaging
                </p>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {packagingOptions.map((opt) => (
                    <li
                      key={opt.id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', gap: '0.75rem',
                        padding: '0.65rem 0.85rem', borderRadius: 12,
                        border: '1px solid var(--color-border)', background: 'var(--color-surface-alt)',
                        fontSize: '0.9rem', color: 'var(--color-dark)',
                      }}
                    >
                      <span>{opt.name}{opt.is_default ? ' (default)' : ''}</span>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {Number(opt.fee) > 0 ? `+${formatCardPrice(Number(opt.fee))}` : 'No fee'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {showPackagingPicker && (
              <div style={{ marginBottom: '1.15rem' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.65rem' }}>
                  Packaging <span style={{ color: '#ef4444' }}>*</span>
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {packagingOptions.map((opt) => {
                    const isSelected = selectedPackagingId === opt.id;
                    return (
                      <button key={opt.id} type="button" onClick={() => setSelectedPackagingId(opt.id)} style={chip(isSelected)} aria-pressed={isSelected}>
                        {opt.name}
                        <span style={{ marginLeft: '0.35rem', fontSize: '0.8rem', fontWeight: 600, opacity: 0.9 }}>
                          {Number(opt.fee) > 0 ? `+MVR ${Number(opt.fee).toFixed(2)}` : 'No fee'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {item.modifiers && item.modifiers.length > 0 && (
              <div style={{ marginBottom: '0.5rem' }} data-testid="item-sheet-addons">
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.65rem' }}>
                  Add-ons
                </p>
                {viewOnly ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {item.modifiers.map((modifier) => (
                      <li
                        key={modifier.id}
                        style={{
                          display: 'flex', justifyContent: 'space-between', gap: '0.75rem',
                          padding: '0.65rem 0.85rem', borderRadius: 12,
                          border: '1px solid var(--color-border)', background: 'var(--color-surface-alt)',
                          fontSize: '0.9rem', color: 'var(--color-dark)',
                        }}
                      >
                        <span>{modifier.name}</span>
                        <span style={{ fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                          +{formatCardPrice(Number(modifier.price))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {item.modifiers.map((modifier) => {
                      const checked = selectedModifiers.some((m) => m.id === modifier.id);
                      return (
                        <label
                          key={modifier.id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.75rem 1rem',
                            border: `1.5px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: 12, cursor: 'pointer',
                            background: checked ? 'var(--color-primary-light)' : 'var(--color-surface)',
                          }}
                        >
                          <span style={{ fontSize: '0.9rem', color: 'var(--color-dark)' }}>
                            {modifier.name}
                            <span style={{ color: 'var(--color-primary)', marginLeft: '0.5rem', fontWeight: 700 }}>
                              +MVR {Number(modifier.price).toFixed(2)}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleModifier(modifier)}
                            style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!viewOnly && pairings.length > 0 && (
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-dark)', margin: '0 0 0.75rem' }}>
                  Goes well with
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pairings.map((rec) => (
                    <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', flex: 1, lineHeight: 1.3 }}>{rec.name}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        MVR {Number(rec.base_price).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => addItem(rec, 1, [], null)}
                        style={{
                          flexShrink: 0, padding: '0.3rem 0.7rem', background: 'var(--color-primary)', color: 'white',
                          border: 'none', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                        aria-label={`Add ${rec.name} to cart`}
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reviews.length > 0 && (
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-dark)', margin: '0 0 0.75rem' }}>Customer reviews</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {reviews.map((rv) => (
                    <div key={rv.id} style={{ background: 'var(--color-surface-alt)', borderRadius: 10, padding: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} style={{ fontSize: 11, color: i < rv.rating ? '#F59E0B' : 'var(--color-border)' }}>★</span>
                        ))}
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 4 }}>
                          {new Date(rv.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {rv.comment && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{rv.comment}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky add bar — hidden on dine-in view-only */}
        {!viewOnly && (
          <div
            data-testid="item-sheet-add-bar"
            style={{
              flexShrink: 0, padding: '0.85rem 1.15rem calc(0.85rem + env(safe-area-inset-bottom, 0px))',
              borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)',
            }}
          >
            <button
              ref={addRef}
              onClick={handleConfirm}
              disabled={!canAdd}
              className="modal-add-btn"
              style={{
                width: '100%', padding: '0.95rem',
                background: canAdd ? 'var(--color-primary)' : 'var(--color-surface-alt)',
                color: canAdd ? '#fff' : 'var(--color-text-muted)',
                border: 'none', borderRadius: 14, fontSize: '1rem', fontWeight: 800,
                cursor: canAdd ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              }}
            >
              {!itemAvailable
                ? (unavailLabel ?? t('menu.unavailable'))
                : canAdd
                  ? (isEdit
                    ? `Update — MVR ${(totalPrice * qty).toFixed(2)}`
                    : `Add${qty > 1 ? ` ${qty}×` : ''} to cart — MVR ${(totalPrice * qty).toFixed(2)}`)
                  : 'Select an option first'}
            </button>
            {item.is_catering && !isEdit && (
              <a
                href={`/order/events?add=${item.id}`}
                data-testid="item-sheet-event-link"
                style={{
                  display: 'block',
                  marginTop: 10,
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  textDecoration: 'none',
                }}
              >
                Planning an event? Order this for a future date →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const SPICE_MAP: Record<string, { label: string; icon: string }> = {
  mild: { label: 'Mild', icon: '🌶' },
  medium: { label: 'Medium', icon: '🌶🌶' },
  hot: { label: 'Hot', icon: '🌶🌶🌶' },
  extra_hot: { label: 'Extra Hot', icon: '🔥' },
};
