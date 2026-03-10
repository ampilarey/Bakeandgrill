import type { Category, Item, Modifier, RestaurantTable } from "../types";
import { makeCartKey } from "../hooks/useCart";

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
  selectedCategoryId: number;
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
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Order Type</p>
          <div className="mt-3 space-y-2">
            {orderTypes.map((type) => (
              <button
                key={type}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium ${
                  orderType === type
                    ? "bg-orange-100 text-orange-700 border border-orange-200"
                    : "bg-slate-50 text-slate-600 border border-slate-200"
                }`}
                onClick={() => setOrderType(type)}
              >
                {type}
              </button>
            ))}
          </div>
          {orderType === "Dine-in" && (
            <div className="mt-4 space-y-2">
              <label className="block text-xs text-slate-500">Table</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Categories</p>
          <div className="mt-3 space-y-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium ${
                  selectedCategoryId === cat.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-50 text-slate-700"
                }`}
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
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <form onSubmit={onBarcodeSubmit} className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2"
              placeholder="Scan barcode or type SKU"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
            <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm">Add</button>
          </form>
        </div>

        {dataError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
            {dataError}
          </div>
        )}
        {isLoading && (
          <div className="bg-white rounded-xl px-4 py-3 text-sm text-slate-500 shadow-sm">
            Loading menu…
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition text-left"
              onClick={() => handleSelectItem(item)}
            >
              <p className="font-semibold">{item.name}</p>
              <p className="text-sm text-slate-500">MVR {item.base_price.toFixed(2)}</p>
            </button>
          ))}
        </div>

        {selectedItem && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{selectedItem.name}</p>
                <p className="text-sm text-slate-500">MVR {selectedItem.base_price.toFixed(2)}</p>
              </div>
              <button
                className="rounded-lg bg-orange-600 text-white px-4 py-2 text-sm"
                onClick={() => addToCart(selectedItem)}
              >
                Add to cart
              </button>
            </div>
            {selectedItem.modifiers && selectedItem.modifiers.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-700">Modifiers</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedItem.modifiers.map((mod) => {
                    const active = selectedModifiers.some((m) => m.id === mod.id);
                    return (
                      <button
                        key={mod.id}
                        className={`rounded-full px-3 py-1 text-sm border ${
                          active
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
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
