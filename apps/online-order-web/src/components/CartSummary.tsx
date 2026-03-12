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
      {cart.map((item) => (
        <div key={item.id} style={styles.cartRow}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600 }}>{item.name}</span>
            {item.modifiers && item.modifiers.length > 0 && (
              <div style={{ fontSize: 12, color: "#6c757d" }}>
                + {item.modifiers.map((m) => m.name).join(", ")}
              </div>
            )}
          </div>
          <span style={{ color: "#6c757d", marginRight: 8 }}>×{item.quantity}</span>
          <span style={{ fontWeight: 600, color: "#D4813A" }}>
            MVR {((item.price + (item.modifiers ?? []).reduce((s, m) => s + m.price, 0)) * item.quantity).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

const styles = {
  card:         { background: "#fff", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)" },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: "#212529", marginBottom: 12 },
  cartRow:      { display: "flex", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid #f1f3f5", marginBottom: 8 },
};
