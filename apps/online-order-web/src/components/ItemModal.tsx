import { useEffect, useRef, useState } from 'react';
import { getItemReviews, getItemPhotos, API_ORIGIN } from '../api';
import type { Item, Modifier, ItemReview, ItemPhoto } from '../api';

type Props = {
  item: Item;
  selectedModifiers: Modifier[];
  onToggleModifier: (modifier: Modifier) => void;
  onAddToCart: () => void;
  onClose: () => void;
};

export function ItemModal({ item, selectedModifiers, onToggleModifier, onAddToCart, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  const modifierTotal = selectedModifiers.reduce((s, m) => s + Number(m.price), 0);
  const totalPrice = Number(item.base_price) + modifierTotal;

  const [reviews, setReviews] = useState<ItemReview[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhotos([]);
    setActivePhoto(0);
    setReviews([]);
    setAvgRating(null);
    getItemReviews(item.id)
      .then((res) => { if (!cancelled) { setReviews(res.reviews?.slice(0, 5) ?? []); setAvgRating(res.average_rating ?? null); } })
      .catch(() => {});
    getItemPhotos(item.id)
      .then((res) => { if (!cancelled) setPhotos(res.photos ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [item.id]);

  // Auto-focus close button and trap focus within modal (BUG-09)
  useEffect(() => {
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
  }, [onClose]);

  const titleId = `modal-title-${item.id}`;

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
              MVR {totalPrice.toFixed(2)}
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

        {/* Photo gallery */}
        {photos.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', background: '#F9F5F0', position: 'relative' }}>
              <img
                src={photos[activePhoto].url.startsWith('http') ? photos[activePhoto].url : `${API_ORIGIN}${photos[activePhoto].url.startsWith('/') ? '' : '/'}${photos[activePhoto].url}`}
                alt={item.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {photos.length > 1 && (
                <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
                  {photos.map((_, i) => (
                    <button key={i} onClick={() => setActivePhoto(i)} aria-label={`Photo ${i + 1} of ${photos.length}`}
                      style={{ width: i === activePhoto ? 16 : 8, height: 8, borderRadius: 99, border: 'none', background: i === activePhoto ? '#fff' : 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 0, transition: 'all 0.2s' }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {item.description && (
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {item.description}
          </p>
        )}

        {/* Rating summary */}
        {avgRating !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} style={{ fontSize: 14, color: i < Math.round(avgRating) ? '#F59E0B' : '#D1D5DB' }}>★</span>
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>
              {avgRating.toFixed(1)} ({reviews.length} review{reviews.length !== 1 ? 's' : ''})
            </span>
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
          onClick={onAddToCart}
          className="modal-add-btn"
          style={{
            width: '100%',
            padding: '0.9rem',
            background: 'var(--color-primary)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          Add to Cart — MVR {totalPrice.toFixed(2)}
        </button>

        {/* Customer reviews */}
        {reviews.length > 0 && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-dark)', margin: '0 0 0.75rem' }}>Customer Reviews</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 200, overflowY: 'auto' }}>
              {reviews.map((rv) => (
                <div key={rv.id} style={{ background: 'var(--color-surface-alt)', borderRadius: 10, padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} style={{ fontSize: 11, color: i < rv.rating ? '#F59E0B' : '#D1D5DB' }}>★</span>
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
