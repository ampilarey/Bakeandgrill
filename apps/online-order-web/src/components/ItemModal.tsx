import { useEffect, useRef } from 'react';
import type { Item, Modifier } from '../api';

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
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: '1rem' }}
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

        {item.description && (
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {item.description}
          </p>
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
                      background: checked ? 'var(--color-primary-light)' : 'white',
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
      </div>
    </div>
  );
}
