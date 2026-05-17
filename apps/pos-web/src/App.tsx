import { useEffect, useMemo, useState, useRef } from "react";
import { fetchTables, setAuthToken, staffLogin, selfRegisterDevice, selfDeviceStatus } from "./api";
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
  const [username, setUsername]       = useState("");
  const [pin, setPin]                 = useState("");
  const [deviceId]                    = useState(() => {
      const stored = localStorage.getItem("pos_device_id");
      if (stored) return stored;
      const generated = `POS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      localStorage.setItem("pos_device_id", generated);
      return generated;
    },
  );
  const [authError, setAuthError]     = useState("");
  const [deviceStatus, setDeviceStatus] = useState<'unknown' | 'checking' | 'pending' | 'approved' | 'rejected'>('unknown');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // ── Detect device being disabled/rejected mid-session ──────────────────────
  useEffect(() => {
    const onBlocked = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail ?? '';
      if (msg.includes('pending'))  setDeviceStatus('pending');
      else if (msg.includes('rejected')) setDeviceStatus('rejected');
      else setDeviceStatus('rejected'); // disabled = treated as rejected for UX
    };
    window.addEventListener('pos_device_blocked', onBlocked);
    return () => window.removeEventListener('pos_device_blocked', onBlocked);
  }, []);

  // ── Device registration & approval polling ─────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;

    const checkAndRegister = async () => {
      setDeviceStatus('checking');
      try {
        const res = await selfRegisterDevice(deviceId, `POS ${deviceId}`);
        if (res.status === 'approved') {
          setDeviceStatus('approved');
        } else if (res.status === 'rejected') {
          setDeviceStatus('rejected');
        } else {
          setDeviceStatus('pending');
          // Start polling every 4 seconds
          pollRef.current = setInterval(async () => {
            try {
              const s = await selfDeviceStatus(deviceId);
              if (s.status === 'approved') {
                setDeviceStatus('approved');
                if (pollRef.current) clearInterval(pollRef.current);
              } else if (s.status === 'rejected') {
                setDeviceStatus('rejected');
                if (pollRef.current) clearInterval(pollRef.current);
              }
            } catch { /* network error — keep polling */ }
          }, 4000);
        }
      } catch {
        // If self-register fails, assume approved (backward compat for existing devices)
        setDeviceStatus('approved');
      }
    };

    void checkAndRegister();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isLoggedIn, deviceId]);

  // ── Login handler ───────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setAuthError("");
    if (!username.trim()) { setAuthError("Enter your email address."); return; }
    if (pin.trim().length < 4) { setAuthError("Enter a valid PIN."); return; }
    try {
      const response = await staffLogin(username.trim(), pin.trim(), deviceId.trim());
      localStorage.setItem("pos_token", response.token);
      setAuthToken(response.token);
      setIsLoggedIn(true);
      setPin("");
    } catch {
      setAuthError("Login failed. Check your email and PIN.");
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
        username={username} setUsername={setUsername}
        pin={pin} setPin={setPin}
        deviceId={deviceId}
        authError={authError} onLogin={handleLogin}
      />
    );
  }

  if (deviceStatus === 'checking' || deviceStatus === 'unknown') {
    return (
      <div style={{ minHeight: '100vh', background: '#1C1408', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 24, margin: '0 0 12px' }}>⏳</p>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#2A1E0C', margin: '0 0 8px' }}>Checking device…</p>
          <p style={{ color: '#8B7355', fontSize: 13, margin: 0 }}>Please wait</p>
        </div>
      </div>
    );
  }

  if (deviceStatus === 'pending') {
    return (
      <div style={{ minHeight: '100vh', background: '#1C1408', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <p style={{ fontSize: 40, margin: '0 0 16px' }}>🔒</p>
          <p style={{ fontWeight: 700, fontSize: 18, color: '#2A1E0C', margin: '0 0 10px' }}>Waiting for approval</p>
          <p style={{ color: '#8B7355', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 }}>
            This device hasn't been approved yet.<br />
            Ask the owner to approve it in the admin panel.
          </p>
          <div style={{ background: '#FEF3E8', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#8B7355', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Device ID</p>
            <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: '#D4813A', fontFamily: 'monospace' }}>{deviceId}</p>
          </div>
          <p style={{ color: '#9C8E7E', fontSize: 12, margin: 0 }}>Checking automatically every few seconds…</p>
          <button onClick={handleLogout} style={{ marginTop: 20, background: 'none', border: 'none', color: '#9C8E7E', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
            Log out
          </button>
        </div>
      </div>
    );
  }

  if (deviceStatus === 'rejected') {
    return (
      <div style={{ minHeight: '100vh', background: '#1C1408', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 40, margin: '0 0 16px' }}>🚫</p>
          <p style={{ fontWeight: 700, fontSize: 18, color: '#2A1E0C', margin: '0 0 10px' }}>Device disabled</p>
          <p style={{ color: '#8B7355', fontSize: 14, margin: '0 0 20px' }}>This device has been disabled by the owner. Contact the owner to re-enable it.</p>
          <button onClick={handleLogout} style={{ padding: '10px 24px', background: '#D4813A', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Log out
          </button>
        </div>
      </div>
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
