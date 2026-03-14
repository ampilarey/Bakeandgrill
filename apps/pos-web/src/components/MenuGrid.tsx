import type { Category, Item, Modifier, RestaurantTable } from "../types";

const orderTypes = ["Dine-in", "Takeaway", "Online Pickup"] as const;
type OrderType = (typeof orderTypes)[number];

type Props = {
  // Order type
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  tables: RestaurantTable[];
  selectedTableId: number | null;
  setSelectedTableId: (id: number | null) => void;

  // Menu
  categories: Category[];
  selectedCategoryId: number | null;
  setSelectedCategoryId: (id: number) => void;
  filteredItems: Item[];
  isLoading: boolean;
  dataError: string;

  // Item selection + modifiers
  selectedItem: Item | null;
  selectedModifiers: Modifier[];
  handleSelectItem: (item: Item) => void;
  toggleModifier: (mod: Modifier) => void;
  addToCart: (item: Item) => void;

  // Barcode
  barcode: string;
  setBarcode: (v: string) => void;
  onBarcodeSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
};

export function MenuGrid({
  orderType, setOrderType, tables, selectedTableId, setSelectedTableId,
  categories, selectedCategoryId, setSelectedCategoryId, filteredItems,
  isLoading, dataError, selectedItem, selectedModifiers, handleSelectItem,
  toggleModifier, addToCart, barcode, setBarcode, onBarcodeSubmit,
}: Props) {
  return (
    <>
      {/* Left: Order type + categories */}
      <section className="col-span-2 space-y-3">
        <div className="bg-white rounded-xl p-4 shadow-sm" style={{ border: '1px solid #EDE4D4' }}>
          <p className="text-sm font-semibold" style={{ color: '#2A1E0C' }}>Order Type</p>
          <div className="mt-3 space-y-2">
            {orderTypes.map((type) => (
              <button
                key={type}
                className="w-full rounded-lg px-3 py-2 text-sm font-medium"
                style={orderType === type
                  ? { background: '#FEF3E8', color: '#B86820', border: '1px solid rgba(212,129,58,0.3)' }
                  : { background: '#FFFDF9', color: '#8B7355', border: '1px solid #EDE4D4' }}
                onClick={() => setOrderType(type)}
              >
                {type}
              </button>
            ))}
          </div>
          {orderType === "Dine-in" && (
            <div className="mt-4 space-y-2">
              <label className="block text-xs" style={{ color: '#8B7355' }}>Table</label>
              <select
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: '1px solid #EDE4D4' }}
                value={selectedTableId ?? ""}
                onChange={(e) => setSelectedTableId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select table</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm" style={{ border: '1px solid #EDE4D4' }}>
          <p className="text-sm font-semibold" style={{ color: '#2A1E0C' }}>Categories</p>
          <div className="mt-3 space-y-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                className="w-full rounded-lg px-3 py-2 text-sm font-medium"
                style={selectedCategoryId === cat.id
                  ? { background: '#1C1408', color: 'white' }
                  : { background: '#FFFDF9', color: '#8B7355' }}
                onClick={() => setSelectedCategoryId(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Center: Barcode + items grid + modifier picker */}
      <section className="col-span-7 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm" style={{ border: '1px solid #EDE4D4' }}>
          <form onSubmit={onBarcodeSubmit} className="flex gap-2">
            <input
              className="flex-1 rounded-lg px-3 py-2"
              style={{ border: '1px solid #EDE4D4' }}
              placeholder="Scan barcode or type SKU"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
            <button className="rounded-lg text-white px-4 py-2 text-sm" style={{ background: '#1C1408' }}>Add</button>
          </form>
        </div>

        {dataError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
            {dataError}
          </div>
        )}
        {isLoading && (
          <div className="bg-white rounded-xl px-4 py-3 text-sm shadow-sm" style={{ color: '#8B7355' }}>
            Loading menu…
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition text-left"
              style={{ border: '1px solid #EDE4D4' }}
              onClick={() => handleSelectItem(item)}
            >
              <p className="font-semibold" style={{ color: '#2A1E0C' }}>{item.name}</p>
              <p className="text-sm" style={{ color: '#8B7355' }}>MVR {item.base_price.toFixed(2)}</p>
            </button>
          ))}
        </div>

        {selectedItem && (
          <div className="bg-white rounded-xl p-4 shadow-sm" style={{ border: '1px solid #EDE4D4' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold" style={{ color: '#2A1E0C' }}>{selectedItem.name}</p>
                <p className="text-sm" style={{ color: '#8B7355' }}>MVR {selectedItem.base_price.toFixed(2)}</p>
              </div>
              <button
                className="rounded-lg text-white px-4 py-2 text-sm"
                style={{ background: '#D4813A' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#B86820'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#D4813A'; }}
                onClick={() => addToCart(selectedItem)}
              >
                Add to cart
              </button>
            </div>
            {selectedItem.modifiers && selectedItem.modifiers.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold" style={{ color: '#2A1E0C' }}>Modifiers</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedItem.modifiers.map((mod) => {
                    const active = selectedModifiers.some((m) => m.id === mod.id);
                    return (
                      <button
                        key={mod.id}
                        className="rounded-full px-3 py-1 text-sm"
                        style={active
                          ? { background: '#1C1408', color: 'white', border: '1px solid #1C1408' }
                          : { background: '#FFFDF9', color: '#8B7355', border: '1px solid #EDE4D4' }}
                        onClick={() => toggleModifier(mod)}
                      >
                        {mod.name}{mod.price > 0 ? ` +${mod.price}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
