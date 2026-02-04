import { useState } from 'react';
import type { MenuItem } from '../types';
import { useCart } from '../context/CartContext';

interface ItemCardProps {
  item: MenuItem;
  /** Show quantity selector and add to cart (for menu). Event page can use same with showQuantityControls */
  showQuantityControls?: boolean;
}

export function ItemCard({ item, showQuantityControls = true }: ItemCardProps) {
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();

  const handleAddToCart = () => {
    addItem(item, quantity);
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-col h-full">
      <div className="flex-1">
        <h3 className="font-semibold text-gray-900">{item.name}</h3>
        {item.category && (
          <p className="text-xs text-gray-500 mt-0.5">{item.category}</p>
        )}
        <p className="text-lg font-medium text-gray-800 mt-2">
          MVR {item.price.toFixed(2)}
        </p>
      </div>

      {showQuantityControls && (
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-10 text-center font-medium text-gray-900" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={handleAddToCart}
            className="flex-1 min-w-[100px] py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-sm"
          >
            Add to cart ({quantity})
          </button>
        </div>
      )}
    </div>
  );
}
