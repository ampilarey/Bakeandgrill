import { useEffect, useMemo, useState } from "react";
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

type DeviceStatus =
  | 'unknown'
  | 'checking'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'registration_failed';

function App() {
  const [showSendBill, setShowSendBill] = useState(false);
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn]   = useState(() => !!localStorage.getItem('pos_token'));
  const [username, setUsername]       = useState("");
  const [pin, setPin]                 = useState("");
  const [deviceId]                    = useState(() => {
    const stored = localStorage.getItem("pos_device_id");
    if (stored) return stored;
    const generated = `POS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    localStorage.setItem("pos_device_id", generated);
    return generated;
  });
  const [authError, setAuthError]     = useState("");
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('unknown');

  // ── View + connectivity ─────────────────────────────────────────────────────
  const [viewMode, setViewMode]               = useState<"pos" | "ops">("pos");
  const [isOnline, setIsOnline]               = useState(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState(getQueueCount());

  // ── Tables / order type ─────────────────────────────────────────────────────
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

  // ── Device-blocked event (dispatched by api.ts when middleware rejects) ────
  useEffect(() => {
    const onBlocked = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail ?? '';
      if (msg.includes('pending')) setDeviceStatus('pending');
      else setDeviceStatus('rejected');
    };
    window.addEventListener('pos_device_blocked', onBlocked);
    return () => window.removeEventListener('pos_device_blocked', onBlocked);
  }, []);

  // Map server status string → UI device state, in one place so the polling
  // and the one-shot register both produce consistent results.
  const applyDeviceStatus = (apiStatus: string, isActive?: boolean) => {
    if (apiStatus === 'pending')                            setDeviceStatus('pending');
    else if (apiStatus === 'rejected')                      setDeviceStatus('rejected');
    else if (apiStatus === 'unregistered')                  setDeviceStatus('pending');
    else if (apiStatus === 'approved' && isActive === false) setDeviceStatus('rejected');
    else if (apiStatus === 'approved')                      setDeviceStatus('approved');
  };

  // (1) One-shot self-register on login. Crucially this effect does NOT
  // depend on deviceStatus — otherwise we'd flicker forever.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setDeviceStatus('checking');
    void (async () => {
      try {
        const res = await selfRegisterDevice(deviceId, `POS ${deviceId}`);
        if (!cancelled) applyDeviceStatus(res.status);
      } catch {
        if (!cancelled) setDeviceStatus('registration_failed');
      }
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn, deviceId]);

  // (2) Poll the server for status changes (approval / disable) — cadence
  // depends on the current status: 4 s while pending, 20 s once approved.
  useEffect(() => {
    if (!isLoggedIn) return;
    if (deviceStatus !== 'pending' && deviceStatus !== 'approved') return;
    const cadence = deviceStatus === 'approved' ? 20000 : 4000;
    const interval = setInterval(() => {
      void (async () => {
        try {
          const s = await selfDeviceStatus(deviceId);
          applyDeviceStatus(s.status, s.is_active);
        } catch { /* network blip — retry next tick */ }
      })();
    }, cadence);
    return () => clearInterval(interval);
  }, [isLoggedIn, deviceId, deviceStatus]);

  // ── Login handler ───────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setAuthError("");
    if (!username.trim()) { setAuthError("Enter your mobile or email."); return; }
    if (pin.trim().length < 4) { setAuthError("Enter a valid PIN."); return; }
    try {
      const response = await staffLogin(username.trim(), pin.trim(), deviceId.trim());
      localStorage.setItem("pos_token", response.token);
      setAuthToken(response.token);
      setIsLoggedIn(true);
      setPin("");
    } catch {
      setAuthError("Login failed. Check your mobile/email and PIN.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("pos_token");
    setAuthToken(null);
    setIsLoggedIn(false);
    setDeviceStatus('unknown');
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
      <FullScreenCard
        emoji="⏳"
        title="Checking device…"
        body="Please wait"
      />
    );
  }

  if (deviceStatus === 'registration_failed') {
    return (
      <FullScreenCard
        emoji="📡"
        title="Device check failed"
        body={"We could not contact the server to verify this device.\nCheck the internet connection and try again."}
        primaryAction={{ label: 'Retry', onClick: () => setDeviceStatus('unknown') }}
        secondaryAction={{ label: 'Log out', onClick: handleLogout }}
      />
    );
  }

  if (deviceStatus === 'pending') {
    return (
      <FullScreenCard
        emoji="🔒"
        title="Waiting for approval"
        body={"This device hasn't been approved yet.\nAsk the owner to approve it in the admin panel."}
        deviceId={deviceId}
        secondaryAction={{ label: 'Log out', onClick: handleLogout }}
        footer="Checking automatically every few seconds…"
      />
    );
  }

  if (deviceStatus === 'rejected') {
    return (
      <FullScreenCard
        emoji="🚫"
        title="Device disabled"
        body="This device has been disabled by the owner. Contact the owner to re-enable it."
        primaryAction={{ label: 'Log out', onClick: handleLogout }}
      />
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F6F8',
      color: '#1E293B',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: '#D4813A', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16,
          }}>B&G</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>Bake & Grill POS</div>
            <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.1, marginTop: 2 }}>Device {deviceId}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* POS / OPS toggle */}
          <div style={{ display: 'inline-flex', background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
            {(["pos", "ops"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: 'pointer', borderRadius: 6,
                  background: viewMode === mode ? '#FFFFFF' : 'transparent',
                  color: viewMode === mode ? '#0F172A' : '#64748B',
                  boxShadow: viewMode === mode ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                  letterSpacing: '0.04em',
                }}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Online indicator */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: isOnline ? '#DCFCE7' : '#FEE2E2',
            color: isOnline ? '#15803D' : '#B91C1C',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isOnline ? '#22C55E' : '#EF4444',
            }} />
            {isOnline ? 'Online' : 'Offline'}
          </span>

          {/* Queue + sync */}
          {offlineQueueCount > 0 && (
            <button
              onClick={order.handleSyncQueue}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', cursor: 'pointer',
              }}
            >
              🔄 Sync {offlineQueueCount}
            </button>
          )}

          {/* Log out + site */}
          <button
            onClick={handleLogout}
            style={{
              padding: '6px 10px', fontSize: 12, fontWeight: 600,
              background: 'transparent', color: '#64748B', border: 'none', cursor: 'pointer',
            }}
          >
            Log out
          </button>
          <a href="/" style={{ fontSize: 12, color: '#94A3B8', textDecoration: 'none' }}>← Site</a>
        </div>
      </header>

      {/* ── Status banners ─────────────────────────────────────────── */}
      {(order.statusMessage || ops.opsMessage) && (
        <div style={{ padding: '8px 16px 0' }}>
          {order.statusMessage && (
            <div style={{
              background: '#FFFFFF', borderRadius: 8, padding: '10px 14px',
              fontSize: 13, color: '#475569', border: '1px solid #E2E8F0', marginBottom: 6,
            }}>
              {order.statusMessage}
            </div>
          )}
          {ops.opsMessage && (
            <div style={{
              background: '#FFFFFF', borderRadius: 8, padding: '10px 14px',
              fontSize: 13, color: '#475569', border: '1px solid #E2E8F0',
            }}>
              {ops.opsMessage}
            </div>
          )}
        </div>
      )}

      {/* ── Main body ──────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', minHeight: 0, padding: 12, gap: 12 }}>
        {viewMode === 'ops' ? (
          <div style={{ flex: 1, overflow: 'auto', background: '#FFFFFF', borderRadius: 12, padding: 16 }}>
            <div className="grid grid-cols-12 gap-4">
              <OpsPanel {...ops} />
            </div>
          </div>
        ) : (
          <>
            {/* LEFT: Cart panel (Loyverse-style) */}
            <OrderCart
              orderType={orderType}
              setOrderType={setOrderType}
              tables={tables}
              selectedTableId={selectedTableId}
              setSelectedTableId={setSelectedTableId}
              cartItems={cart.cartItems}
              setCartItems={cart.setCartItems}
              cartSubtotal={cart.cartSubtotal}
              cartTotal={cart.cartTotal}
              discountValue={cart.discountValue}
              payments={cart.payments}
              discountAmount={cart.discountAmount}
              setDiscountAmount={cart.setDiscountAmount}
              lastHeldOrderId={order.lastHeldOrderId}
              isSubmitting={order.isSubmitting}
              pendingPaymentForOrderId={order.pendingPaymentForOrderId}
              onAddPaymentRow={cart.addPaymentRow}
              onUpdatePaymentRow={cart.updatePaymentRow}
              onRemovePaymentRow={cart.removePaymentRow}
              onClearCart={cart.clearCart}
              onHoldOrder={order.handleHoldOrder}
              onResumeLastHold={order.handleResumeLastHold}
              onCheckout={order.handleCheckout}
              onRetryPayment={order.handleRetryPayment}
              lastCreatedOrderId={order.lastCreatedOrderId}
              onOpenSendBill={() => setShowSendBill(true)}
            />

            {/* RIGHT: Menu */}
            <MenuGrid
              categories={menu.categories}
              selectedCategoryId={menu.selectedCategoryId}
              setSelectedCategoryId={menu.setSelectedCategoryId}
              filteredItems={filteredItems}
              isLoading={menu.isLoading}
              dataError={menu.dataError}
              selectedItem={cart.selectedItem}
              selectedModifiers={cart.selectedModifiers}
              handleSelectItem={cart.handleSelectItem}
              toggleModifier={cart.toggleModifier}
              addToCart={cart.addToCart}
              clearSelectedItem={() => cart.setSelectedItem(null)}
              barcode={order.barcode}
              setBarcode={order.setBarcode}
              onBarcodeSubmit={(e) => order.handleBarcodeSubmit(e, menu.items, cart.addToCart)}
            />
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

// ─────────────────────────────────────────────────────────────────────────────
// Tiny shared full-screen card for device-status screens. Replaces the four
// near-duplicate inline blocks the previous version had.
function FullScreenCard({
  emoji,
  title,
  body,
  deviceId,
  primaryAction,
  secondaryAction,
  footer,
}: {
  emoji: string;
  title: string;
  body: string;
  deviceId?: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  footer?: string;
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#1C1408', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <p style={{ fontSize: 40, margin: '0 0 16px' }}>{emoji}</p>
        <p style={{ fontWeight: 700, fontSize: 18, color: '#2A1E0C', margin: '0 0 10px' }}>{title}</p>
        <p style={{ color: '#8B7355', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{body}</p>

        {deviceId && (
          <div style={{ background: '#FEF3E8', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#8B7355', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Device ID</p>
            <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: '#D4813A', fontFamily: 'monospace' }}>{deviceId}</p>
          </div>
        )}

        {footer && <p style={{ color: '#9C8E7E', fontSize: 12, margin: '0 0 12px' }}>{footer}</p>}

        {primaryAction && (
          <button
            onClick={primaryAction.onClick}
            style={{ padding: '10px 24px', background: '#D4813A', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginRight: secondaryAction ? 10 : 0 }}
          >
            {primaryAction.label}
          </button>
        )}
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            style={{ background: 'none', border: 'none', color: '#9C8E7E', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
