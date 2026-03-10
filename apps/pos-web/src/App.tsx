import { useEffect, useMemo, useState } from "react";
import { fetchTables, setAuthToken, staffLogin } from "./api";
import { getQueueCount } from "./offlineQueue";
import type { RestaurantTable } from "./types";

import { useMenu }          from "./hooks/useMenu";
import { useCart }          from "./hooks/useCart";
import { useOrderCreation } from "./hooks/useOrderCreation";
import { useOps }           from "./hooks/useOps";

import { LoginPage } from "./pages/LoginPage";
import { MenuGrid }  from "./components/MenuGrid";
import { OrderCart } from "./components/OrderCart";
import { OpsPanel }  from "./components/OpsPanel";

const orderTypes = ["Dine-in", "Takeaway", "Online Pickup"] as const;
type OrderType = (typeof orderTypes)[number];

function App() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn]   = useState(false);
  const [pin, setPin]                 = useState("");
  const [deviceId, setDeviceId]       = useState("POS-001");
  const [authError, setAuthError]     = useState("");

  // ── View + connectivity ─────────────────────────────────────────────────────
  const [viewMode, setViewMode]               = useState<"pos" | "ops">("pos");
  const [isOnline, setIsOnline]               = useState(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState(getQueueCount());

  // ── Tables ──────────────────────────────────────────────────────────────────
  const [orderType, setOrderType]           = useState<OrderType>("Takeaway");
  const [tables, setTables]                 = useState<RestaurantTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  // ── Online / offline events ─────────────────────────────────────────────────
  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => { setOfflineQueueCount(getQueueCount()); }, [isOnline]);

  // ── Load tables after login ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    fetchTables()
      .then((r) => {
        setTables(r.tables);
        setSelectedTableId(r.tables.find((t) => t.is_active)?.id ?? null);
      })
        .catch(() => { setTables([]); setSelectedTableId(null); });
  }, [isLoggedIn]);

  // ── Hooks ───────────────────────────────────────────────────────────────────
  const menu = useMenu(isLoggedIn);

  const cart = useCart();

  const filteredItems = useMemo(
    () => menu.items.filter((item) => item.category_id === menu.selectedCategoryId),
    [menu.items, menu.selectedCategoryId],
  );

  const ops = useOps(isLoggedIn, viewMode);

  const order = useOrderCreation({
    isOnline,
    deviceId,
    orderType,
    selectedTableId,
    cartItems:     cart.cartItems,
    cartTotal:     cart.cartTotal,
    payments:      cart.payments,
    discountAmount: cart.discountAmount,
    clearCart:     cart.clearCart,
    setSelectedItem: cart.setSelectedItem,
    setOfflineQueueCount,
  });

  // ── Login handler ───────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setAuthError("");
    if (pin.trim().length < 4) { setAuthError("Enter a valid PIN."); return; }
    try {
      const response = await staffLogin(pin.trim(), deviceId.trim());
      localStorage.setItem("pos_token", response.token);
      setAuthToken(response.token);
      setIsLoggedIn(true);
      setPin("");
    } catch {
      setAuthError("Login failed. Check your PIN.");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <LoginPage
        pin={pin} setPin={setPin}
        deviceId={deviceId} setDeviceId={setDeviceId}
        authError={authError} onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Bake & Grill POS</h1>
          <p className="text-sm text-slate-500">Device {deviceId}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(["pos", "ops"] as const).map((mode) => (
              <button
                key={mode}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${
                  viewMode === mode ? "bg-white text-slate-900 shadow" : "text-slate-500"
                }`}
                onClick={() => setViewMode(mode)}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isOnline ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {isOnline ? "Online" : "Offline"}
          </span>
          <span className="text-xs text-slate-500">Offline queue: {offlineQueueCount}</span>
          <button className="text-xs font-semibold text-slate-600 hover:text-slate-900" onClick={order.handleSyncQueue}>
            Sync
          </button>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-4 p-6">
        {order.statusMessage && (
          <div className="col-span-12">
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
              {order.statusMessage}
            </div>
          </div>
        )}
        {ops.opsMessage && (
          <div className="col-span-12">
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
              {ops.opsMessage}
            </div>
          </div>
        )}

        {viewMode === "ops" ? (
          <OpsPanel {...ops} />
        ) : (
          <>
            <MenuGrid
              orderType={orderType}         setOrderType={setOrderType}
              tables={tables}               selectedTableId={selectedTableId}
              setSelectedTableId={setSelectedTableId}
              categories={menu.categories}  selectedCategoryId={menu.selectedCategoryId}
              setSelectedCategoryId={menu.setSelectedCategoryId}
              filteredItems={filteredItems} isLoading={menu.isLoading}
              dataError={menu.dataError}    selectedItem={cart.selectedItem}
              selectedModifiers={cart.selectedModifiers}
              handleSelectItem={cart.handleSelectItem}
              toggleModifier={cart.toggleModifier}
              addToCart={cart.addToCart}
              barcode={order.barcode}       setBarcode={order.setBarcode}
              onBarcodeSubmit={(e) =>
                order.handleBarcodeSubmit(
                  e,
                  menu.items as unknown as Parameters<typeof order.handleBarcodeSubmit>[1],
                  cart.addToCart,
                )
              }
            />
            <OrderCart
              cartItems={cart.cartItems}         setCartItems={cart.setCartItems}
              cartTotal={cart.cartTotal}         payments={cart.payments}
              setPayments={cart.setPayments}     discountAmount={cart.discountAmount}
              setDiscountAmount={cart.setDiscountAmount}
              lastHeldOrderId={order.lastHeldOrderId}
              onAddPaymentRow={cart.addPaymentRow}
              onUpdatePaymentRow={cart.updatePaymentRow}
              onRemovePaymentRow={cart.removePaymentRow}
              onHoldOrder={order.handleHoldOrder}
              onResumeLastHold={order.handleResumeLastHold}
              onCheckout={order.handleCheckout}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
