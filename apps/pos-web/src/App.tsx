import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTables, setAuthToken, staffLogin, selfRegisterDevice, selfDeviceStatus, fetchReceipts } from "./api";
import { getQueueCount } from "./offlineQueue";
import type { RestaurantTable } from "./types";

import { useMenu }          from "./hooks/useMenu";
import { useCart }          from "./hooks/useCart";
import { useOrderCreation } from "./hooks/useOrderCreation";
import { useOps }           from "./hooks/useOps";
import { useShift }         from "./hooks/useShift";
import { useIdleLock, getIdleLockMinutes } from "./hooks/useIdleLock";

import { LoginPage }         from "./pages/LoginPage";
import { MenuGrid }          from "./components/MenuGrid";
import { OrderCart }         from "./components/OrderCart";
import { OpsPanel }          from "./components/OpsPanel";
import { SendBillPanel }     from "./components/SendBillPanel";
import { OpenShiftModal }    from "./components/OpenShiftModal";
import { CloseShiftModal }   from "./components/CloseShiftModal";
import { ShiftClosedGate }   from "./components/ShiftClosedGate";
import { ChargeOverlay }     from "./components/ChargeOverlay";
import { SaveTicketModal }   from "./components/SaveTicketModal";
import { OpenTicketsPanel }  from "./components/OpenTicketsPanel";
import { ReceiptsPanel }     from "./components/ReceiptsPanel";
import { ShiftPanel }        from "./components/ShiftPanel";
import { ShiftHistoryPanel } from "./components/ShiftHistoryPanel";
import { SideDrawer }        from "./components/SideDrawer";
import { TimeClockPanel }    from "./components/TimeClockPanel";
import { LockScreen }        from "./components/LockScreen";
import { ReceiptActionsBanner } from "./components/ReceiptActionsBanner";

const orderTypes = ["Dine-in", "Takeaway", "Online Pickup"] as const;
type OrderType = (typeof orderTypes)[number];

type DeviceStatus = 'unknown' | 'checking' | 'pending' | 'approved' | 'rejected' | 'registration_failed';

type Pane = "sales" | "receipts" | "shift" | "open_tickets" | "shift_history" | "ops";

function App() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn]   = useState(() => !!localStorage.getItem('pos_token'));
  // Username is the LOGIN IDENTIFIER (email/mobile) — kept in state for
  // the LoginPage form AND persisted to localStorage so PIN-unlock
  // continues to work after a page refresh (without it, `username`
  // would be empty on reload and the unlock flow couldn't call
  // staffLogin properly).
  const [username, setUsername]       = useState<string>(() => localStorage.getItem("pos_username") ?? "");
  const [pin, setPin]                 = useState("");
  const [cashierName, setCashierName] = useState<string>(() => localStorage.getItem("pos_cashier_name") ?? "");
  const [deviceId]                    = useState(() => {
    // Priority order:
    //  1. `?device=<id>` in the URL — set by the owner when pre-provisioning
    //     a headless device (KDS / display). This wins over any stored id
    //     so a single QR/link can re-bind a fresh browser profile.
    //  2. Previously persisted id in localStorage.
    //  3. Newly minted POS id for first-time interactive cashier flow.
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = (params.get("device") ?? params.get("device_id") ?? "").trim();
      if (fromUrl && /^[A-Za-z0-9\-_]+$/.test(fromUrl)) {
        localStorage.setItem("pos_device_id", fromUrl);
        params.delete("device");
        params.delete("device_id");
        // Strip the query param so a hard refresh doesn't keep re-binding
        // (e.g. after the cashier shares the screen).
        const cleanQs = params.toString();
        const cleanUrl = window.location.pathname + (cleanQs ? `?${cleanQs}` : "") + window.location.hash;
        window.history.replaceState({}, "", cleanUrl);
        return fromUrl;
      }
    } catch { /* ignore — fall through to existing logic */ }

    const stored = localStorage.getItem("pos_device_id");
    if (stored) return stored;
    const generated = `POS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    localStorage.setItem("pos_device_id", generated);
    return generated;
  });
  const [authError, setAuthError]     = useState("");
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('unknown');
  const [showTimeClock, setShowTimeClock] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // ── View + connectivity ─────────────────────────────────────────────────────
  const [pane, setPane] = useState<Pane>("sales");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState(getQueueCount());

  // Modals/overlays
  const [showSendBill, setShowSendBill] = useState(false);
  const [showCharge, setShowCharge] = useState(false);
  const [showSaveTicket, setShowSaveTicket] = useState(false);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [openShiftBusy, setOpenShiftBusy] = useState(false);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  // Captured by useOrderCreation.onOrderSettled so the post-charge action
  // banner can offer Print receipt / Resend SMS. Cleared when the cashier
  // dismisses or starts a new ticket. Phone is captured at charge time
  // because the cart (and the attached customer) gets reset right after.
  const [lastPaidOrder, setLastPaidOrder] = useState<{
    orderId: number;
    customerId: number | null;
    customerPhone: string | null;
  } | null>(null);

  // ── Tables / order type ─────────────────────────────────────────────────────
  const [orderType, setOrderType] = useState<OrderType>("Takeaway");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
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

  // ── Hooks ───────────────────────────────────────────────────────────────────
  const menu = useMenu(isLoggedIn);
  const cart = useCart();
  const ops  = useOps(isLoggedIn, pane === "ops" ? "ops" : "pos");
  const shift = useShift(isLoggedIn, deviceStatus === "approved");

  const filteredItems = useMemo(
    () => menu.items.filter((item) => item.category_id === menu.selectedCategoryId),
    [menu.items, menu.selectedCategoryId],
  );

  const refreshOpenTickets = useCallback(async () => {
    if (!isLoggedIn || deviceStatus !== "approved") return;
    try {
      const res = await fetchReceipts({ held_only: true, device_identifier: deviceId, per_page: 50 });
      setOpenTicketsCount(res.data.length);
    } catch { /* best-effort */ }
  }, [isLoggedIn, deviceStatus, deviceId]);

  useEffect(() => { void refreshOpenTickets(); }, [refreshOpenTickets, pane, shift.current?.id]);

  const order = useOrderCreation({
    isOnline,
    deviceId,
    orderType,
    selectedTableId,
    cartItems:     cart.cartItems,
    cartTotal:     cart.cartTotal,
    payments:      cart.payments,
    discountAmount: cart.discountAmount,
    customerId:    cart.attachedCustomer?.id ?? null,
    customerPhone: cart.attachedCustomer?.phone ?? null,
    clearCart:        cart.clearCart,
    setCartItems:     cart.setCartItems,
    setSelectedItem:  cart.setSelectedItem,
    setOfflineQueueCount,
    onOrderSettled: (orderId, customerId, customerPhone) => {
      void refreshOpenTickets();
      void shift.refreshSummary();
      // Stash the just-paid order so the post-charge action banner
      // can offer "Print receipt" / "Resend SMS" without a re-fetch.
      setLastPaidOrder({ orderId, customerId, customerPhone });
    },
  });

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

  const applyDeviceStatus = (apiStatus: string, isActive?: boolean) => {
    if (apiStatus === 'pending')                            setDeviceStatus('pending');
    else if (apiStatus === 'rejected')                      setDeviceStatus('rejected');
    else if (apiStatus === 'unregistered')                  setDeviceStatus('pending');
    else if (apiStatus === 'approved' && isActive === false) setDeviceStatus('rejected');
    else if (apiStatus === 'approved')                      setDeviceStatus('approved');
  };

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
      // Persist the login identifier so lock/unlock survives reloads.
      // We deliberately do NOT persist the PIN — unlock asks for it
      // every time.
      localStorage.setItem("pos_username", username.trim());
      const name = response.user?.name ?? username.trim();
      localStorage.setItem("pos_cashier_name", name);
      setCashierName(name);
      setAuthToken(response.token);
      setIsLoggedIn(true);
      setPin("");
    } catch {
      setAuthError("Login failed. Check your mobile/email and PIN.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_cashier_name");
    localStorage.removeItem("pos_username");
    setAuthToken(null);
    setIsLoggedIn(false);
    setDeviceStatus('unknown');
    setCashierName("");
    setUsername("");
    setIsLocked(false);
  };

  const handleOpenShift = async (openingCash: number, notes?: string) => {
    setOpenShiftBusy(true);
    try { await shift.open(openingCash, notes); setShowOpenShift(false); }
    finally { setOpenShiftBusy(false); }
  };
  const handleCloseShift = async (closingCash: number, notes?: string) => {
    await shift.close(closingCash, notes);
    setShowCloseShift(false);
    setPane("sales");
  };
  const handleSaveTicketSubmit = async (name: string, note?: string) => {
    await order.handleSaveTicket(name, note);
    setShowSaveTicket(false);
    void refreshOpenTickets();
  };

  /**
   * Unlock = re-verify PIN against the same cashier who locked the
   * screen. We use the persisted login identifier (`pos_username`),
   * NOT the display name (`cashierName`), because the staff PIN-login
   * endpoint expects the email/mobile, not the human name.
   *
   * Side-effects on success:
   *   - Token is re-bound (server may rotate it on each login).
   *   - localStorage `pos_token` is updated so a refresh stays logged in.
   *   - `isLocked` flips false → main UI re-renders (cart + shift
   *     preserved because the App component never unmounted).
   */
  const handleUnlock = async (testPin: string): Promise<boolean> => {
    const identifier = (
      localStorage.getItem("pos_username") || username || ""
    ).trim();
    if (!identifier) {
      // Can't reconstruct who's logged in — drop to login screen
      // instead of silently failing forever.
      handleLogout();
      return false;
    }
    try {
      const res = await staffLogin(identifier, testPin, deviceId);
      localStorage.setItem("pos_token", res.token);
      setAuthToken(res.token);
      setIsLocked(false);
      return true;
    } catch { return false; }
  };

  /**
   * Lock the screen without ending the session. Idempotent — safe to
   * call from the Lock button, the drawer "Lock screen" entry, the
   * Cmd/Ctrl+L shortcut, or the idle timeout.
   */
  const lockScreen = useCallback(() => {
    if (!isLoggedIn) return;
    setIsLocked(true);
  }, [isLoggedIn]);

  // ── Auto-lock on inactivity ─────────────────────────────────────
  // Default 5 minutes; cashier-configurable via localStorage
  // `pos_idle_lock_minutes` (0 disables). Disabled while already on
  // the lock screen, while not logged in, or while the cashier is on
  // the dedicated TimeClock punch screen.
  useIdleLock({
    enabled: isLoggedIn && !isLocked && !showTimeClock,
    timeoutMs: getIdleLockMinutes() * 60_000,
    onIdle: lockScreen,
  });

  // ── Cmd/Ctrl+L keyboard shortcut ────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || isLocked) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing into an input/textarea/contenteditable
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || t?.isContentEditable === true;
      if (inField) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lockScreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLoggedIn, isLocked, lockScreen]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (showTimeClock) {
    return <TimeClockPanel deviceId={deviceId} onBack={() => setShowTimeClock(false)} />;
  }

  if (!isLoggedIn) {
    return (
      <>
        <LoginPage
          username={username} setUsername={setUsername}
          pin={pin} setPin={setPin}
          deviceId={deviceId}
          authError={authError} onLogin={handleLogin}
        />
        <button
          onClick={() => setShowTimeClock(true)}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 5,
            padding: "12px 18px", borderRadius: 999,
            background: "#fff", border: "none", color: "#0F172A",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
          }}
        >⏰ Time Clock</button>
      </>
    );
  }

  if (isLocked) {
    return (
      <LockScreen
        cashierName={cashierName}
        onUnlock={handleUnlock}
        onSwitchUser={handleLogout}
      />
    );
  }

  if (deviceStatus === 'checking' || deviceStatus === 'unknown') {
    return <FullScreenCard emoji="⏳" title="Checking device…" body="Please wait" />;
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

  // Hard shift gate — POS UI is unreachable until a shift is open.
  if (!shift.loading && !shift.current) {
    return (
      <>
        <ShiftClosedGate
          onOpenShift={() => setShowOpenShift(true)}
          onLogout={handleLogout}
          onSwitchUser={lockScreen}
        />
        {showOpenShift && (
          <OpenShiftModal
            onConfirm={handleOpenShift}
            onCancel={() => setShowOpenShift(false)}
            busy={openShiftBusy}
          />
        )}
      </>
    );
  }

  const drawerItems = [
    { id: "sales",          label: "Sales",          icon: "🛒", group: "main" as const },
    { id: "receipts",       label: "Receipts",       icon: "🧾", group: "main" as const },
    { id: "open_tickets",   label: "Open Tickets",   icon: "🎫", group: "main" as const,
      badge: openTicketsCount > 0 ? String(openTicketsCount) : undefined },
    { id: "shift",          label: "Current Shift",  icon: "💰", group: "main" as const },
    { id: "shift_history",  label: "Shift History",  icon: "📚", group: "main" as const },
    { id: "ops",            label: "Operations",     icon: "🛠", group: "main" as const },
    { id: "lock",           label: "Lock screen",    icon: "🔒", group: "user" as const },
    { id: "logout",         label: "Log out",        icon: "↩",  group: "user" as const },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F6F8', color: '#1E293B',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header style={{
        background: '#FFFFFF', borderBottom: '1px solid #E2E8F0',
        padding: '10px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            style={{
              width: 40, height: 40, borderRadius: 10,
              background: '#F1F5F9', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 18,
            }}>☰</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>
              {paneTitle(pane)}
            </div>
            <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.1, marginTop: 2 }}>
              {cashierName || 'Cashier'} · {deviceId}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Sales chip — quick at-a-glance shift KPI */}
          {shift.summary && (
            <span style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: '#0F172A', color: '#fff',
            }}>
              {shift.summary.sales_summary.order_count} orders · MVR {shift.summary.sales_summary.net_sales.toFixed(0)}
            </span>
          )}

          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: isOnline ? '#DCFCE7' : '#FEE2E2',
            color: isOnline ? '#15803D' : '#B91C1C',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOnline ? '#22C55E' : '#EF4444' }} />
            {isOnline ? 'Online' : 'Offline'}
          </span>

          {/* Visible Lock button. Keeps shift + cart, requires PIN to
              re-open. Cmd/Ctrl+L also triggers this. */}
          <button
            onClick={lockScreen}
            aria-label="Lock screen"
            title="Lock screen (Ctrl/Cmd+L)"
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: '#F1F5F9', border: '1px solid #E2E8F0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 15,
            }}
          >🔒</button>

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
        </div>
      </header>

      {/* Status banners */}
      {(order.statusMessage || ops.opsMessage || lastPaidOrder) && (
        <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {order.statusMessage && <Banner text={order.statusMessage} />}
          {ops.opsMessage && <Banner text={ops.opsMessage} />}
          {lastPaidOrder && (
            <ReceiptActionsBanner
              orderId={lastPaidOrder.orderId}
              customerPhone={lastPaidOrder.customerPhone}
              onDismiss={() => setLastPaidOrder(null)}
            />
          )}
        </div>
      )}

      {/* Main body */}
      <main style={{ flex: 1, display: 'flex', minHeight: 0, padding: 12, gap: 12 }}>
        {pane === 'sales' && (
          <>
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
              isSubmitting={order.isSubmitting}
              pendingPaymentForOrderId={order.pendingPaymentForOrderId}
              lastCreatedOrderId={order.lastCreatedOrderId}
              openTicketsCount={openTicketsCount}
              attachedCustomer={cart.attachedCustomer}
              onAttachCustomer={cart.setAttachedCustomer}
              onDetachCustomer={() => cart.setAttachedCustomer(null)}
              resumedOrderId={order.resumedOrderId}
              onCancelResume={() => void order.handleCancelResume().then(refreshOpenTickets)}
              onClearCart={cart.clearCart}
              onSaveTicket={() => setShowSaveTicket(true)}
              onOpenTickets={() => setPane("open_tickets")}
              onCheckout={() => setShowCharge(true)}
              onRetryPayment={order.handleRetryPayment}
              onOpenSendBill={() => setShowSendBill(true)}
            />
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
              readOnly={order.resumedOrderId !== null}
            />
          </>
        )}

        {pane === 'receipts' && (
          <ReceiptsPanel
            onClose={() => setPane("sales")}
            shiftId={shift.current?.id ?? null}
          />
        )}

        {pane === 'open_tickets' && (
          <OpenTicketsPanel
            deviceId={deviceId}
            onClose={() => setPane("sales")}
            onResume={(t) => {
              void order.handleResumeTicket(t.id).then(() => {
                setPane("sales");
                void refreshOpenTickets();
              });
            }}
          />
        )}

        {pane === 'shift' && (
          <ShiftPanel
            shift={shift.current}
            summary={shift.summary}
            onCashMovement={shift.cashMovement}
            onClose={() => setPane("sales")}
            onCloseShift={() => setShowCloseShift(true)}
          />
        )}

        {pane === 'shift_history' && (
          <ShiftHistoryPanel onClose={() => setPane("sales")} />
        )}

        {pane === 'ops' && <OpsPanel {...ops} />}
      </main>

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={drawerItems}
        active={pane}
        cashierName={cashierName}
        shiftLabel={shift.current ? `Shift #${shift.current.id} · MVR ${(shift.summary?.cash_drawer.expected_cash ?? 0).toFixed(2)} in drawer` : 'No open shift'}
        onSelect={(id) => {
          setDrawerOpen(false);
          if (id === "logout") return handleLogout();
          if (id === "lock") return lockScreen();
          setPane(id as Pane);
        }}
      />

      {showSendBill && (
        <SendBillPanel
          orderId={order.lastCreatedOrderId}
          onClose={() => setShowSendBill(false)}
        />
      )}

      {showCharge && (
        <ChargeOverlay
          total={cart.cartTotal}
          submitting={order.isSubmitting}
          onClose={() => setShowCharge(false)}
          onConfirm={async (rows) => {
            const ok = await order.handleCharge(rows);
            if (ok) setShowCharge(false);
          }}
        />
      )}

      {showSaveTicket && (
        <SaveTicketModal
          onConfirm={handleSaveTicketSubmit}
          onCancel={() => setShowSaveTicket(false)}
        />
      )}

      {showCloseShift && (
        <CloseShiftModal
          summary={shift.summary}
          onConfirm={handleCloseShift}
          onCancel={() => setShowCloseShift(false)}
        />
      )}
    </div>
  );
}

function paneTitle(p: Pane): string {
  switch (p) {
    case "sales": return "Sale";
    case "receipts": return "Receipts";
    case "open_tickets": return "Open Tickets";
    case "shift": return "Current Shift";
    case "shift_history": return "Shift History";
    case "ops": return "Operations";
  }
}

function Banner({ text }: { text: string }) {
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 8, padding: '10px 14px',
      fontSize: 13, color: '#475569', border: '1px solid #E2E8F0', marginBottom: 6,
    }}>{text}</div>
  );
}

function FullScreenCard({
  emoji, title, body, deviceId, primaryAction, secondaryAction, footer,
}: {
  emoji: string; title: string; body: string;
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
