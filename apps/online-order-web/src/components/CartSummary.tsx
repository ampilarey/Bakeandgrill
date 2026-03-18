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
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
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
  card:         { background: 'var(--color-surface)', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border)' },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: 'var(--color-text)', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--color-border)' },
  cartRow:      { display: 'flex', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--color-border)', marginBottom: 10 },
} as const;
