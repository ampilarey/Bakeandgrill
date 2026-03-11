import { useState } from 'react';
import { API_ORIGIN } from '../api';
import type { Item } from '../api';

type Props = {
  item: Item;
  onSelectItem: (item: Item) => void;
  onAddToCart: (item: Item, quantity: number) => void;
};

export function MenuCard({ item, onSelectItem, onAddToCart }: Props) {
  const [quantity, setQuantity] = useState(1);

  const imgSrc = item.image_url
    ? item.image_url.startsWith('http')
      ? item.image_url
      : `${API_ORIGIN}${item.image_url.startsWith('/') ? '' : '/'}${item.image_url}`
    : null;

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e9ecef',
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'all 0.3s',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.12)';
        e.currentTarget.style.borderColor = '#1ba3b9';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
        e.currentTarget.style.borderColor = '#e9ecef';
      }}
    >
      {/* Image */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectItem(item)}
        onKeyDown={(e) => e.key === 'Enter' && onSelectItem(item)}
        style={{
          width: '100%',
          height: '160px',
          background: imgSrc
            ? undefined
            : `linear-gradient(${45 + item.id * 30}deg, rgba(27,163,185,0.2), rgba(217,119,6,0.15))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(27,163,185,0.5)" strokeWidth="1.5" aria-hidden="true">
            <path d="M3 6h18v2a6 6 0 01-6 6H9a6 6 0 01-6-6V6z" />
            <path d="M6 18h12" />
            <path d="M9 14v4" />
            <path d="M15 14v4" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1c1e21', marginBottom: '0.25rem', lineHeight: 1.3 }}>
            {item.name}
          </h3>
          {item.description && (
            <p style={{ fontSize: '0.8rem', color: '#636e72', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {item.description}
            </p>
          )}
        </div>

        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#D97706' }}>
          MVR {parseFloat(String(item.base_price)).toFixed(2)}
        </div>

        {/* Quantity + Add */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e9ecef', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setQuantity((q) => Math.max(1, q - 1)); }}
              style={{ width: '32px', height: '32px', background: '#f8f9fa', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: '#495057' }}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span style={{ minWidth: '1.75rem', textAlign: 'center', fontSize: '0.9rem', fontWeight: 600, color: '#1c1e21' }}>
              {quantity}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setQuantity((q) => q + 1); }}
              style={{ width: '32px', height: '32px', background: '#f8f9fa', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: '#495057' }}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddToCart(item, quantity); setQuantity(1); }}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: '#D97706',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#B45309'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#D97706'; }}
          >
            Add ({quantity})
          </button>
        </div>

        {item.modifiers && item.modifiers.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectItem(item); }}
            style={{
              width: '100%',
              padding: '0.4rem',
              background: 'transparent',
              color: '#1ba3b9',
              border: '1px solid #1ba3b9',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Customize
          </button>
        )}
      </div>
    </div>
  );
}
