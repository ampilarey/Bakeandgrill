import { useEffect, useMemo, useState } from "react";
import {
  Category,
  Item,
  Modifier,
  createCustomerOrder,
  fetchCategories,
  fetchCustomerOrders,
  fetchItems,
  getCustomerMe,
  requestOtp,
  verifyOtp,
} from "./api";

type CartItem = {
  item: Item;
  quantity: number;
  modifiers: Modifier[];
};

function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pickupNotes, setPickupNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("online_token");
  });
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [orders, setOrders] = useState<
    Array<{ id: number; order_number: string; status: string; total: number }>
  >([]);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    Promise.all([fetchCategories(), fetchItems()])
      .then(([categoriesResponse, itemsResponse]) => {
        setCategories(categoriesResponse.data);
        setItems(itemsResponse.data);
        setActiveCategoryId(categoriesResponse.data[0]?.id ?? null);
      })
      .catch(() => {
        setStatusMessage("Unable to load the menu.");
      });
  }, []);

  useEffect(() => {
    if (!token) {
      setCustomerName(null);
      setOrders([]);
      return;
    }

    getCustomerMe(token)
      .then((response) => {
        setCustomerName(response.customer.name || response.customer.phone);
      })
      .catch(() => setCustomerName(null));

    fetchCustomerOrders(token)
      .then((response) => setOrders(response.data))
      .catch(() => setOrders([]));
  }, [token]);

  const filteredItems = useMemo(() => {
    if (!activeCategoryId) {
      return items;
    }
    return items.filter((item) => item.category_id === activeCategoryId);
  }, [items, activeCategoryId]);

  const cartTotal = useMemo(() => {
    return cart.reduce((total, entry) => {
      const modifiersTotal = entry.modifiers.reduce(
        (sum, modifier) => sum + modifier.price,
        0
      );
      return total + (entry.item.base_price + modifiersTotal) * entry.quantity;
    }, 0);
  }, [cart]);

  const handleRequestOtp = async () => {
    setIsLoading(true);
    setAuthError("");
    setOtpHint(null);
    try {
      const response = await requestOtp(phone);
      setOtpRequested(true);
      setStatusMessage("OTP sent. Please check your SMS.");
      if (response.otp) {
        setOtpHint(`Dev OTP: ${response.otp}`);
      }
    } catch (error) {
      setAuthError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setIsLoading(true);
    setAuthError("");
    try {
      const response = await verifyOtp({ phone, otp });
      setToken(response.token);
      localStorage.setItem("online_token", response.token);
      setOtpRequested(false);
      setOtp("");
      setStatusMessage("Logged in successfully.");
    } catch (error) {
      setAuthError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("online_token");
  };

  const handleSelectItem = (item: Item) => {
    setSelectedItem(item);
    setSelectedModifiers([]);
  };

  const toggleModifier = (modifier: Modifier) => {
    setSelectedModifiers((current) => {
      const exists = current.some((entry) => entry.id === modifier.id);
      if (exists) {
        return current.filter((entry) => entry.id !== modifier.id);
      }
      return [...current, modifier];
    });
  };

  const addSelectedToCart = () => {
    if (!selectedItem) {
      return;
    }
    setCart((current) => {
      const existingIndex = current.findIndex(
        (entry) =>
          entry.item.id === selectedItem.id &&
          entry.modifiers.map((m) => m.id).join(",") ===
            selectedModifiers.map((m) => m.id).join(",")
      );

      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + 1,
        };
        return next;
      }

      return [
        ...current,
        { item: selectedItem, quantity: 1, modifiers: selectedModifiers },
      ];
    });
    setSelectedItem(null);
    setSelectedModifiers([]);
  };

  const updateCartQuantity = (index: number, quantity: number) => {
    setCart((current) => {
      const next = [...current];
      if (quantity <= 0) {
        next.splice(index, 1);
        return next;
      }
      next[index] = { ...next[index], quantity };
      return next;
    });
  };

  const handleCheckout = async () => {
    if (!token || cart.length === 0) {
      return;
    }
    setIsLoading(true);
    setStatusMessage("");
    try {
      await createCustomerOrder(token, {
        customer_notes: pickupNotes || undefined,
        items: cart.map((entry) => ({
          item_id: entry.item.id,
          name: entry.item.name,
          quantity: entry.quantity,
          modifiers: entry.modifiers.map((modifier) => ({
            modifier_id: modifier.id,
            name: modifier.name,
            price: modifier.price,
          })),
        })),
      });
      setCart([]);
      setPickupNotes("");
      setStatusMessage("Order placed! We will start preparing it.");
      const history = await fetchCustomerOrders(token);
      setOrders(history.data);
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">
            Bake & Grill Online
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with your phone to place pickup orders.
          </p>

          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Phone (+960XXXXXXX)
            </label>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="+9607712345"
            />

            {otpRequested && (
              <>
                <label className="block text-sm font-medium text-slate-700">
                  OTP
                </label>
                <input
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tracking-widest"
                  placeholder="6-digit code"
                />
              </>
            )}

            {otpHint && (
              <p className="text-xs text-amber-600">{otpHint}</p>
            )}
            {authError && <p className="text-xs text-red-600">{authError}</p>}
            {statusMessage && (
              <p className="text-xs text-emerald-600">{statusMessage}</p>
            )}

            <div className="flex gap-2">
              {!otpRequested ? (
                <button
                  onClick={handleRequestOtp}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                >
                  Send OTP
                </button>
              ) : (
                <button
                  onClick={handleVerifyOtp}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                >
                  Verify OTP
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Bake & Grill Online</h1>
          <p className="text-sm text-slate-500">
            {customerName ? `Hi ${customerName}` : "Pickup orders"}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
        >
          Logout
        </button>
      </header>

      <main className="grid gap-6 px-6 py-6 lg:grid-cols-12">
        <section className="lg:col-span-3 space-y-3">
          <h2 className="text-sm font-semibold text-slate-500">Categories</h2>
          <div className="space-y-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategoryId(category.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  activeCategoryId === category.id
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5">
          <h2 className="text-sm font-semibold text-slate-500">Menu</h2>
          <div className="mt-3 grid gap-3">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelectItem(item)}
                className="flex items-center justify-between rounded-xl bg-white p-4 text-left shadow-sm"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {item.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    MVR {item.base_price.toFixed(2)}
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  Add
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="lg:col-span-4 space-y-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-500">Your Cart</h2>
            {cart.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Your cart is empty.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {cart.map((entry, index) => (
                  <div
                    key={`${entry.item.id}-${index}`}
                    className="rounded-lg border border-slate-100 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">
                        {entry.item.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            updateCartQuantity(index, entry.quantity - 1)
                          }
                          className="h-6 w-6 rounded-full border border-slate-200 text-xs"
                        >
                          -
                        </button>
                        <span className="text-xs">{entry.quantity}</span>
                        <button
                          onClick={() =>
                            updateCartQuantity(index, entry.quantity + 1)
                          }
                          className="h-6 w-6 rounded-full border border-slate-200 text-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {entry.modifiers.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        + {entry.modifiers.map((modifier) => modifier.name).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>MVR {cartTotal.toFixed(2)}</span>
                </div>
              </div>
            )}
            <textarea
              value={pickupNotes}
              onChange={(event) => setPickupNotes(event.target.value)}
              placeholder="Pickup notes (optional)"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={3}
            />
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || isLoading}
              className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Place Pickup Order
            </button>
            {statusMessage && (
              <p className="mt-2 text-xs text-emerald-600">{statusMessage}</p>
            )}
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-500">
              Order History
            </h2>
            {orders.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No orders yet.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-lg border border-slate-100 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{order.order_number}</span>
                      <span className="text-xs text-slate-500">
                        {order.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      MVR {order.total?.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {selectedItem && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{selectedItem.name}</h3>
                <p className="text-sm text-slate-500">
                  MVR {selectedItem.base_price.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-sm text-slate-400"
              >
                Close
              </button>
            </div>
            {selectedItem.modifiers && selectedItem.modifiers.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-semibold text-slate-700">
                  Modifiers
                </p>
                {selectedItem.modifiers.map((modifier) => (
                  <label
                    key={modifier.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <span>
                      {modifier.name} (+MVR {modifier.price.toFixed(2)})
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedModifiers.some(
                        (entry) => entry.id === modifier.id
                      )}
                      onChange={() => toggleModifier(modifier)}
                      className="h-4 w-4"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                No modifiers for this item.
              </p>
            )}
            <button
              onClick={addSelectedToCart}
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Add to Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
