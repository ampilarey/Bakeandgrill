/**
 * Item customisation sheet. Phase 3 PR2: same UI;
 * edit-mode props call CartContext.updateEntry when editIndex is set.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCartRecommendations, getItemReviews, getItemPhotos } from '../api';
import type { Item, Modifier, ItemReview, ItemPhoto } from '../api';
import type { Variant } from '@shared/types';
import { useCart } from '../context/CartContext';
import { buildItemSlideUrls } from '../utils/itemMedia';
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
}: ItemSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const { addItem } = useCart();
  const activeVariants = (item.variants ?? []).filter((v) => v.is_active);
  const packagingOptions = (item.packaging_options ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const showPackagingPicker = packagingOptions.length > 1;
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
  const canAdd = (!item.has_variants || selectedVariant !== null)
    && (!showPackagingPicker || selectedPackagingId != null);

  const [reviews, setReviews] = useState<ItemReview[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [photos, setPhotos] = useState<ItemPhoto[]>(() => item.photos ?? []);
  const [pairings, setPairings] = useState<Item[]>([]);

  const slides = useMemo(
    () => buildItemSlideUrls({ image_url: item.image_url, photos }),
    [item.image_url, photos],
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
    fetchCartRecommendations([item.id], 3)
      .then(({ items: recs }) => { if (!cancelled) setPairings(recs ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [item.id, item.photos]);

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

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)' as unknown as number, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: '1rem' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        id="item-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ width: '100%', maxWidth: '440px', background: 'var(--color-surface)', borderRadius: '20px', padding: '1.75rem', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 id={titleId} style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-dark)', marginBottom: '0.25rem' }}>
              {item.name}
            </h3>
            <p style={{ fontSize: '1.1rem', color: 'var(--color-primary)', fontWeight: 700 }}>
              {item.has_variants && !selectedVariant && activeVariants.length > 0
                ? `From MVR ${Math.min(...activeVariants.map((v) => Number(v.effective_price ?? v.price))).toFixed(2)}`
                : (
                  <>
                    MVR {totalPrice.toFixed(2)}
                    {originalCatalog != null && originalCatalog > catalogPrice && (
                      <span style={{ marginLeft: '0.4rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', textDecoration: 'line-through', fontWeight: 500 }}>
                        MVR {originalCatalog.toFixed(2)}
                      </span>
                    )}
                  </>
                )
              }
            </p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            style={{ background: 'var(--color-primary-light)', border: 'none', borderRadius: '50%', width: '44px', height: '44px', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--color-text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Photo gallery — main Image + Photos, auto-slides when 2+ */}
        {slides.length > 0 && (
          <div style={{ marginBottom: '1.25rem', borderRadius: 12, overflow: 'hidden' }}>
            <MenuImageSlider slides={slides} alt={item.name} aspectRatio="16 / 9" />
          </div>
        )}

        {item.description && (
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {item.description}
          </p>
        )}

        {item.is_combo && item.combo_items && item.combo_items.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-dark)', marginBottom: '0.5rem' }}>
              Includes:
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.125rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              {item.combo_items.map((entry) => (
                <li key={`${entry.item_id}-${entry.quantity}`}>
                  {entry.quantity > 1 ? `${entry.quantity}× ` : ''}{entry.item_name}
                  {entry.is_optional ? ' (optional)' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Rating summary */}
        {avgRating !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} style={{ fontSize: 14, color: i < Math.round(avgRating) ? '#F59E0B' : 'var(--color-border)' }}>★</span>
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>
              {avgRating.toFixed(1)} ({reviews.length} review{reviews.length !== 1 ? 's' : ''})
            </span>
          </div>
        )}

        {/* Variant selector */}
        {item.has_variants && activeVariants.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-dark)', marginBottom: '0.75rem' }}>
              Choose option <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {activeVariants.map((v) => {
                const isSelected = selectedVariant?.id === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariant(v)}
                    style={{
                      padding: '0.5rem 1rem',
                      border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: '999px',
                      background: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                    aria-pressed={isSelected}
                  >
                    {v.name}
                    <span style={{ marginLeft: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                      MVR {Number(v.effective_price ?? v.price).toFixed(2)}
                      {v.effective_price != null && v.original_price != null && (
                        <span style={{ marginLeft: '0.25rem', textDecoration: 'line-through', opacity: 0.7 }}>
                          {Number(v.original_price).toFixed(2)}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {!selectedVariant && (
              <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '0.4rem' }}>Please select an option to continue.</p>
            )}
          </div>
        )}

        {showPackagingPicker && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-dark)', marginBottom: '0.75rem' }}>
              Packaging <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {packagingOptions.map((opt) => {
                const isSelected = selectedPackagingId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedPackagingId(opt.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: '999px',
                      background: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                    aria-pressed={isSelected}
                  >
                    {opt.name}
                    <span style={{ marginLeft: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                      {Number(opt.fee) > 0 ? `+MVR ${Number(opt.fee).toFixed(2)}` : 'No fee'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Modifiers */}
        {item.modifiers && item.modifiers.length > 0 ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-dark)', marginBottom: '0.75rem' }}>
              Add-ons
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {item.modifiers.map((modifier) => {
                const checked = selectedModifiers.some((m) => m.id === modifier.id);
                return (
                  <label
                    key={modifier.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      border: `1.5px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: '10px',
                      cursor: 'pointer',
                      background: checked ? 'var(--color-primary-light)' : 'var(--color-surface)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: '0.9rem', color: 'var(--color-dark)' }}>
                      {modifier.name}
                      <span style={{ color: 'var(--color-primary)', marginLeft: '0.5rem', fontWeight: 600 }}>
                        +MVR {Number(modifier.price).toFixed(2)}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleModifier(modifier)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
            No add-ons available for this item.
          </p>
        )}

        <button
          ref={addRef}
          onClick={handleConfirm}
          disabled={!canAdd}
          className="modal-add-btn"
          style={{
            width: '100%',
            padding: '0.9rem',
                background: canAdd ? 'var(--color-primary)' : 'var(--color-surface-alt)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: canAdd ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
          }}
        >
          {canAdd
            ? (isEdit
              ? `Update item — MVR ${(totalPrice * qty).toFixed(2)}`
              : `Add${qty > 1 ? ` ${qty}×` : ''} to Cart — MVR ${(totalPrice * qty).toFixed(2)}`)
            : 'Select an option first'
          }
        </button>

        {pairings.length > 0 && (
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

        {/* Customer reviews */}
        {reviews.length > 0 && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-dark)', margin: '0 0 0.75rem' }}>Customer Reviews</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 200, overflowY: 'auto' }}>
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
  );
}
