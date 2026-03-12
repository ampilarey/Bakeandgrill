import type { Item, Modifier } from '../api';

type Props = {
  item: Item;
  selectedModifiers: Modifier[];
  onToggleModifier: (modifier: Modifier) => void;
  onAddToCart: () => void;
  onClose: () => void;
};

export function ItemModal({ item, selectedModifiers, onToggleModifier, onAddToCart, onClose }: Props) {
  const modifierTotal = selectedModifiers.reduce((s, m) => s + parseFloat(String(m.price)), 0);
  const totalPrice = parseFloat(String(item.base_price)) + modifierTotal;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: '1rem' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '100%', maxWidth: '440px', background: 'white', borderRadius: '20px', padding: '1.75rem', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1C1408', marginBottom: '0.25rem' }}>
              {item.name}
            </h3>
            <p style={{ fontSize: '1.1rem', color: '#D4813A', fontWeight: 700 }}>
              MVR {totalPrice.toFixed(2)}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#FEF3E8', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1rem', color: '#8B7355', flexShrink: 0 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {item.description && (
          <p style={{ fontSize: '0.9rem', color: '#8B7355', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {item.description}
          </p>
        )}

        {/* Modifiers */}
        {item.modifiers && item.modifiers.length > 0 ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1C1408', marginBottom: '0.75rem' }}>
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
                      border: `1.5px solid ${checked ? '#D4813A' : '#EDE4D4'}`,
                      borderRadius: '10px',
                      cursor: 'pointer',
                      background: checked ? 'rgba(212,129,58,0.06)' : 'white',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: '0.9rem', color: '#1C1408' }}>
                      {modifier.name}
                      <span style={{ color: '#D4813A', marginLeft: '0.5rem', fontWeight: 600 }}>
                        +MVR {parseFloat(String(modifier.price)).toFixed(2)}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleModifier(modifier)}
                      style={{ width: '18px', height: '18px', accentColor: '#D4813A' }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.9rem', color: '#8B7355', marginBottom: '1.5rem' }}>
            No add-ons available for this item.
          </p>
        )}

        <button
          onClick={onAddToCart}
          style={{
            width: '100%',
            padding: '0.9rem',
            background: '#D4813A',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#B86820'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#D4813A'; }}
        >
          Add to Cart — MVR {totalPrice.toFixed(2)}
        </button>
      </div>
    </div>
  );
}
