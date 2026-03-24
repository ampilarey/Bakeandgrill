import { useEffect, useMemo, useState } from "react";
import { fetchTables, setAuthToken, staffLogin } from "./api";
import { getQueueCount } from "./offlineQueue";
import type { RestaurantTable } from "./types";

import { useMenu }          from "./hooks/useMenu";
import { useCart }          from "./hooks/useCart";
import { useOrderCreation } from "./hooks/useOrderCreation";
import { useOps }           from "./hooks/useOps";

import { LoginPage }      from "./pages/LoginPage";
import { MenuGrid }       from "./components/MenuGrid";
import { OrderCart }      from "./components/OrderCart";
import { OpsPanel }       from "./components/OpsPanel";
import { SendBillPanel }  from "./components/SendBillPanel";

const orderTypes = ["Dine-in", "Takeaway", "Online Pickup"] as const;
type OrderType = (typeof orderTypes)[number];

function App() {
  const [showSendBill, setShowSendBill] = useState(false);
  // ── Auth ────────────────────────────────────────────────────────────────────
  // Restore session from localStorage so page refresh doesn't log out the POS.
  const [isLoggedIn, setIsLoggedIn]   = useState(() => !!localStorage.getItem('pos_token'));
  const [pin, setPin]                 = useState("");
  const [deviceId, setDeviceId]       = useState(() => {
      const stored = localStorage.getItem("pos_device_id");
      if (stored) return stored;
      const generated = `POS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      localStorage.setItem("pos_device_id", generated);
      return generated;
    },
  );
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
    clearCart:        cart.clearCart,
    setCartItems:     cart.setCartItems,
    setSelectedItem:  cart.setSelectedItem,
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

  // ── Logout handler ──────────────────────────────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem("pos_token");
    setAuthToken(null);
    setIsLoggedIn(false);
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
    <div className="min-h-screen" style={{ background: '#FFFDF9', color: '#2A1E0C' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm" style={{ borderBottom: '1px solid #EDE4D4' }}>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#2A1E0C' }}>Bake & Grill POS</h1>
          <p className="text-sm" style={{ color: '#8B7355' }}>Device {deviceId}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: '#EDE4D4' }}>
            {(["pos", "ops"] as const).map((mode) => (
              <button
                key={mode}
                className={`rounded-md px-3 py-1 text-xs font-semibold`}
                style={viewMode === mode
                  ? { background: 'white', color: '#2A1E0C', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                  : { color: '#8B7355' }}
                onClick={() => setViewMode(mode)}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isOnline ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {isOnline ? "Online" : "Offline"}
          </span>
          <span className="text-xs" style={{ color: '#8B7355' }}>Queue: {offlineQueueCount}</span>
          <button className="text-xs font-semibold" style={{ color: '#8B7355', background: 'none', border: 'none', cursor: 'pointer' }} onClick={order.handleSyncQueue}>
            Sync
          </button>
          <button className="text-xs font-semibold" style={{ color: '#8B7355', background: 'none', border: 'none', cursor: 'pointer' }} onClick={handleLogout}>
            Log out
          </button>
          <a href="/" className="text-xs" style={{ color: '#8B7355', textDecoration: 'none' }}>← Site</a>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-4 p-6">
        {order.statusMessage && (
          <div className="col-span-12">
            <div className="bg-white rounded-xl px-4 py-3 text-sm" style={{ border: '1px solid #EDE4D4', color: '#8B7355' }}>
              {order.statusMessage}
            </div>
          </div>
        )}
        {ops.opsMessage && (
          <div className="col-span-12">
            <div className="bg-white rounded-xl px-4 py-3 text-sm" style={{ border: '1px solid #EDE4D4', color: '#8B7355' }}>
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
            {order.lastCreatedOrderId && (
              <div className="col-span-12" style={{ textAlign: "right", marginTop: -8 }}>
                <button
                  onClick={() => setShowSendBill(true)}
                  style={{
                    padding: "8px 18px", borderRadius: 8,
                    background: "#1C1408", color: "#fff",
                    border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  📱 Send Bill
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {showSendBill && (
        <SendBillPanel
          orderId={order.lastCreatedOrderId}
          onClose={() => setShowSendBill(false)}
        />
      )}
    </div>
  );
}

export default App;
