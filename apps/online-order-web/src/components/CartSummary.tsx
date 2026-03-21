type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  modifiers?: Array<{ id: number; name: string; price: number }>;
};

type Props = { cart: CartItem[] };

export function CartSummary({ cart }: Props) {
  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>Your Order</h2>
      {cart.map((item, idx) => (
        <div key={`${item.id}-${idx}`} style={styles.cartRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{item.name}</span>
            {item.modifiers && item.modifiers.length > 0 && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                + {item.modifiers.map((m) => m.name).join(', ')}
              </div>
            )}
          </div>
          <span style={{ color: 'var(--color-text-muted)', marginRight: 8, flexShrink: 0 }}>×{item.quantity}</span>
          <span style={{ fontWeight: 600, color: 'var(--color-primary)', flexShrink: 0 }}>
            MVR {((item.price + (item.modifiers ?? []).reduce((s, m) => s + m.price, 0)) * item.quantity).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

const styles = {
  card:         { background: 'var(--color-surface)', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1rem', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border)' },
  sectionTitle: { fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.75rem', paddingBottom: '0.625rem', borderBottom: '1px solid var(--color-border)' },
  cartRow:      { display: 'flex', alignItems: 'center', paddingBottom: '0.625rem', borderBottom: '1px solid var(--color-border)', marginBottom: '0.625rem' },
} as const;
