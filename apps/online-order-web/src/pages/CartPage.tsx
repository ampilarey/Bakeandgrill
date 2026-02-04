import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export function CartPage() {
  const { items, updateQuantity, removeItem, totalItems, totalAmount } = useCart();

  if (items.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Cart</h1>
        <p className="text-gray-600 mb-4">Your cart is empty.</p>
        <Link to="/menu" className="text-amber-600 hover:underline font-medium">
          Browse menu
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Cart ({totalItems} items)</h1>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
            <div>
              <p className="font-medium text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-500">MVR {item.price.toFixed(2)} each</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200"
                  aria-label="Decrease"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200"
                  aria-label="Increase"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="text-red-600 hover:underline text-sm"
              >
                Remove
              </button>
            </div>
            <p className="font-medium text-gray-900 w-20 text-right">
              MVR {(item.price * item.quantity).toFixed(2)}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xl font-bold text-gray-900">Total: MVR {totalAmount.toFixed(2)}</p>
      <Link
        to="/menu"
        className="inline-block mt-4 text-amber-600 hover:underline font-medium"
      >
        Continue shopping
      </Link>
    </div>
  );
}
