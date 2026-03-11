import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

type Props = {
  isOpen?: boolean;
  closedMessage?: string | null;
};

export function CartDrawer({ isOpen = true, closedMessage }: Props) {
  const navigate = useNavigate();
  const { cart, cartTotal, updateQuantity } = useCart();

  const handleCheckout = () => {
    if (cart.length === 0) return;
    navigate('/checkout');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Cart */}
      <div style={{ background: 'white', border: '1px solid #e9ecef', borderRadius: '16px', padding: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1c1e21', marginBottom: '1rem' }}>
          Your Cart
          {cart.length > 0 && (
            <span style={{ marginLeft: '0.5rem', background: '#1ba3b9', color: 'white', borderRadius: '999px', padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}>
              {cart.reduce((s, e) => s + e.quantity, 0)}
            </span>
          )}
        </h2>

        {cart.length === 0 ? (
          <p style={{ color: '#adb5bd', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem 0' }}>
            Your cart is empty
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {cart.map((entry, index) => (
              <div
                key={`${entry.item.id}-${index}`}
                style={{ border: '1px solid #f1f3f5', borderRadius: '10px', padding: '0.75rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1c1e21', flex: 1 }}>
                    {entry.item.name}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                    <button
                      onClick={() => updateQuantity(index, entry.quantity - 1)}
                      style={{ width: '22px', height: '22px', borderRadius: '50%', border: '1px solid #dee2e6', background: 'white', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, color: '#495057' }}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '1.25rem', textAlign: 'center' }}>
                      {entry.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(index, entry.quantity + 1)}
                      style={{ width: '22px', height: '22px', borderRadius: '50%', border: '1px solid #dee2e6', background: 'white', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, color: '#495057' }}
                    >
                      +
                    </button>
                  </div>
                </div>
                {entry.modifiers.length > 0 && (
                  <p style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: '#636e72' }}>
                    + {entry.modifiers.map((m) => m.name).join(', ')}
                  </p>
                )}
                <p style={{ marginTop: '0.375rem', fontSize: '0.8rem', color: '#1ba3b9', fontWeight: 600 }}>
                  MVR {((parseFloat(String(entry.item.base_price)) + entry.modifiers.reduce((s, m) => s + parseFloat(String(m.price)), 0)) * entry.quantity).toFixed(2)}
                </p>
              </div>
            ))}

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid #f1f3f5', fontWeight: 700, color: '#1c1e21' }}>
              <span>Total</span>
              <span style={{ color: '#1ba3b9' }}>MVR {cartTotal.toFixed(2)}</span>
            </div>
          </div>
        )}

        {closedMessage && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff3cd', borderRadius: '8px', fontSize: '0.8rem', color: '#856404' }}>
            {closedMessage}
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={cart.length === 0 || !isOpen}
          style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.875rem',
            background: cart.length === 0 || !isOpen ? '#dee2e6' : '#1ba3b9',
            color: cart.length === 0 || !isOpen ? '#adb5bd' : 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: cart.length === 0 || !isOpen ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {!isOpen ? "We're Closed" : cart.length === 0 ? 'Cart is Empty' : `Checkout — MVR ${cartTotal.toFixed(2)} →`}
        </button>
      </div>
    </div>
  );
}
