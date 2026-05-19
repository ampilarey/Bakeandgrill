import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTables, setAuthToken, staffLogin, selfRegisterDevice, selfDeviceStatus, fetchReceipts, fetchPosQuickNotes } from "./api";
import { getQueueCount } from "./offlineQueue";
import type { RestaurantTable } from "./types";

import { useMenu }          from "./hooks/useMenu";
import { useCart }          from "./hooks/useCart";
import { useOrderCreation } from "./hooks/useOrderCreation";
import { useOps }           from "./hooks/useOps";
import { useShift }         from "./hooks/useShift";
import { useIdleLock, getIdleLockMinutes } from "./hooks/useIdleLock";
import { useOnlineOrderWatcher } from "./hooks/useOnlineOrderWatcher";
import { OnlineOrderToasts }     from "./components/OnlineOrderToasts";

import { LoginPage }         from "./pages/LoginPage";
import { MenuGrid }          from "./components/MenuGrid";
import { OrderCart }         from "./components/OrderCart";
import { OpsPanel }          from "./components/OpsPanel";
import { SendBillPanel }     from "./components/SendBillPanel";
import { NotePickerModal }   from "./components/NotePickerModal";
import { makeCartKey }       from "./hooks/useCart";
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

import { palette, radius, shadow, space, type as typeRamp, btnPrimary } from "./theme";

// Theme shortcut object so deeply-nested style blocks in this file
// don't get pulled apart with 6 import lines. `TH` is just a renamed
// re-export of the imports above.
const TH = {
  bg: palette.bg,
  bgAlt: palette.bgAlt,
  panel: palette.panel,
  panelInk: palette.panelInk,
  panelMuted: palette.panelMuted,
  panelSubtle: palette.panelSubtle,
  border: palette.border,
  ink: palette.ink,
  inkSoft: palette.inkSoft,
  primary: palette.primary,
  primaryDark: palette.primaryDark,
  primaryLight: palette.primaryLight,
  primaryBg: palette.primaryBg,
  radius,
  shadow,
  space,
  type: typeRamp,
};

const orderTypes = ["Dine-in", "Takeaway", "Pickup"] as const;
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
  // Dine-in is the most common ticket type for an in-store cashier
  // (someone walks up, picks a table, orders), so we default there.
  // Cashiers can flip to Takeaway / Pickup with the segmented control
  // at the top of the cart.
  const [orderType, setOrderType] = useState<OrderType>("Dine-in");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  // Owner-curated quick-note chip library (e.g. "No salt", "Extra
  // spicy"). Loaded once after login from the public site-settings
  // endpoint. Empty array hides the per-line Note button.
  const [quickNotes, setQuickNotes] = useState<string[]>([]);
  // When non-null, the NotePickerModal is open for this cart line key.
  // Stored at the app level (vs in OrderCart) so the modal sits above
  // the cart's overflow:auto clip and survives cart state churn.
  const [notePickerKey, setNotePickerKey] = useState<string | null>(null);

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
  // Passing orderType lets the menu refilter when the cashier flips
  // between Dine-in / Takeaway / Pickup — items the admin has
  // restricted via item_channel_availability disappear or reappear
  // automatically, so the cashier can't accidentally ring something
  // that doesn't belong on that channel.
  const menu = useMenu(isLoggedIn, orderType);
  const cart = useCart();
  const ops  = useOps(isLoggedIn, pane === "ops" ? "ops" : "pos");
  const shift = useShift(isLoggedIn, deviceStatus === "approved");
  // Background watcher for incoming online_pickup orders. Polls every
  // 30s when logged in + approved, shows a corner toast for any order
  // newer than the cashier's last-seen high-water mark. Enabled-flag
  // also pauses polling when the device is rejected/pending so we don't
  // hammer an endpoint we can't read from anyway.
  const onlineOrderWatch = useOnlineOrderWatcher(isLoggedIn && deviceStatus === "approved");

  /**
   * Items visible in the menu grid for the current category selection.
   *
   *   • `selectedCategoryId == null` → "All items" tab — return everything.
   *   • Selected id matches a TOP-LEVEL category that has sub-categories
   *     → show items in that parent AND in every descendant. (Previously
   *     selecting a parent like "Drinks" returned an empty grid because
   *     every drink was actually under "Drinks → Coffee" etc.)
   *   • Selected id is a leaf (no children, or a sub-category itself)
   *     → exact match only.
   *
   * Builds a `descendants` set once per render rather than recomputing
   * per item.
   */
  const filteredItems = useMemo(() => {
    if (menu.selectedCategoryId == null) return menu.items;
    const matchIds = new Set<number>([menu.selectedCategoryId]);
    // Recursively collect descendants — supports any nesting depth even
    // though admin currently only exposes one level.
    let frontier: number[] = [menu.selectedCategoryId];
    for (let depth = 0; depth < 16 && frontier.length; depth++) {
      const next: number[] = [];
      for (const c of menu.categories) {
        if (c.parent_id != null && frontier.includes(c.parent_id) && !matchIds.has(c.id)) {
          matchIds.add(c.id);
          next.push(c.id);
        }
      }
      frontier = next;
    }
    return menu.items.filter(
      (item) => item.category_id != null && matchIds.has(item.category_id),
    );
  }, [menu.items, menu.categories, menu.selectedCategoryId]);

  const refreshOpenTickets = useCallback(async () => {
    if (!isLoggedIn || deviceStatus !== "approved") return;
    try {
      // Use pagination metadata for the actual total — the badge was
      // showing `res.data.length` (capped to per_page=50) so a busy
      // station with 60+ parked tickets was permanently stuck at
      // "50" even after settling some. Pagination total is the truth.
      const res = await fetchReceipts({ held_only: true, device_identifier: deviceId, per_page: 1 });
      const total = (res as { meta?: { total?: number } }).meta?.total ?? res.data.length;
      setOpenTicketsCount(total);
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
    appliedPromoCode:     cart.appliedPromo?.code ?? null,
    appliedLoyaltyPoints: cart.appliedLoyalty?.points ?? null,
    appliedGiftCardCode:  cart.appliedGiftCard?.code ?? null,
    clearCart:        cart.clearCart,
    setCartItems:     cart.setCartItems,
    setSelectedItem:  cart.setSelectedItem,
    setOfflineQueueCount,
    // Resume-time setters so handleResumeTicket can rehydrate the
    // ticket's original context (customer / order type / table). Without
    // these, parking a Dine-in/Table 4/Aisha ticket and resuming it
    // landed you on a Takeaway cart with no customer attached — and
    // the receipt SMS at charge time went nowhere.
    setAttachedCustomer: cart.setAttachedCustomer,
    setOrderType,
    setSelectedTableId,
    onOrderSettled: (orderId, customerId, customerPhone) => {
      void refreshOpenTickets();
      void shift.refreshSummary();
      // Stash the just-paid order so the post-charge action banner
      // can offer "Print receipt" / "Resend SMS" without a re-fetch.
      setLastPaidOrder({ orderId, customerId, customerPhone });
    },
  });

  // ── Load tables after login ─────────────────────────────────────────────────
  // We load the list so the table picker has data, but we do NOT auto-
  // select the first active table. Auto-selecting silently routed
  // every Dine-in ticket to whatever table sorts first (usually #1)
  // unless the cashier remembered to flip the picker — and with the
  // default order type now being Dine-in, that was a near-100% way to
  // mis-tag a takeaway-at-counter ring. The pre-flight validation in
  // onCheckout already forces the cashier to pick a table before the
  // Charge overlay opens, so leaving this null is the safer default.
  const refreshTables = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const r = await fetchTables();
      setTables(r.tables);
    } catch {
      // Best-effort: keep last-known table list on transient failure so
      // a flaky network doesn't blank out the table picker mid-service.
    }
  }, [isLoggedIn]);

  useEffect(() => { void refreshTables(); }, [refreshTables]);

  // ── Quick-note chip refresh helper (used by refreshAll + visibility) ──
  // The owner edits the chip library from Admin → Settings → POS. We
  // pulled it out into a memoised helper so refreshAll() can call it
  // without spinning up a new closure on every render.
  const refreshQuickNotes = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const chips = await fetchPosQuickNotes();
      setQuickNotes(chips);
    } catch {
      // Same logic as refreshTables — keep showing the last-known list.
    }
  }, [isLoggedIn]);

  // ── Load quick-note chip library after login ───────────────────────────────
  // Re-fetch on isLoggedIn so a fresh sign-in picks up any chips the
  // owner added since the last session, and again whenever the tab
  // regains focus so an owner edit propagates without a relog. (The
  // manual ↻ button now also routes through refreshAll below, which
  // calls refreshQuickNotes alongside menu/tables/tickets.)
  useEffect(() => {
    void refreshQuickNotes();
    if (!isLoggedIn) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshQuickNotes();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isLoggedIn, refreshQuickNotes]);

  // ── One-tap "refresh everything" ─────────────────────────────────────────
  // Originally the top-banner ↻ only refetched the menu + chips. The
  // tables list (loaded once on login), the held-tickets badge, and the
  // shift summary were stale until the cashier re-installed the PWA.
  // That's the bug behind "I refreshed but tables didn't update".
  // Now every once-per-login data source is folded into a single
  // promise so the cashier doesn't have to think about which slice is
  // stale. A short status banner confirms the refresh ran.
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const refreshAll = useCallback(async () => {
    if (isRefreshingAll) return;
    setIsRefreshingAll(true);
    try {
      await Promise.allSettled([
        Promise.resolve(menu.refresh()),
        refreshTables(),
        refreshQuickNotes(),
        refreshOpenTickets(),
        shift.refreshSummary(),
      ]);
    } finally {
      setIsRefreshingAll(false);
    }
  }, [isRefreshingAll, menu, refreshTables, refreshQuickNotes, refreshOpenTickets, shift]);

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
    const baseCadence = deviceStatus === 'approved' ? 20000 : 4000;
    let cadence = baseCadence;
    let consecutiveFailures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      void (async () => {
        try {
          const s = await selfDeviceStatus(deviceId);
          applyDeviceStatus(s.status, s.is_active);
          // Success — reset cadence to the steady-state value.
          consecutiveFailures = 0;
          cadence = baseCadence;
        } catch {
          // Exponential backoff capped at 5 minutes so a long offline
          // window doesn't hammer the network every 4 seconds. The
          // foreground UI is already grey on a network blip; an
          // occasional retry is enough.
          consecutiveFailures += 1;
          cadence = Math.min(baseCadence * 2 ** consecutiveFailures, 300000);
        } finally {
          timer = setTimeout(tick, cadence);
        }
      })();
    };

    timer = setTimeout(tick, cadence);
    return () => { if (timer) clearTimeout(timer); };
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

  // api.ts and useOrderCreation both dispatch a window `auth_expired`
  // event when a request comes back 401 / the Sanctum token is gone.
  // Without this listener the token was getting cleared from
  // localStorage but the UI stayed "logged in" — cashier kept ringing
  // tickets that all silently 401'd. Catch the event, drop session
  // state, and force the LoginPage to render so the cashier knows.
  useEffect(() => {
    const onExpired = () => {
      // Don't blow away the cashier name / username — we re-show them
      // pre-filled on the login screen so the cashier just types the
      // PIN. Less friction than a totally blank form mid-shift.
      localStorage.removeItem("pos_token");
      setIsLoggedIn(false);
      setIsLocked(false);
      setAuthError("Your session expired. Please log back in.");
    };
    window.addEventListener("auth_expired", onExpired);
    return () => window.removeEventListener("auth_expired", onExpired);
  }, []);

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
   *
   * Dismisses any open overlay first so we don't leave an in-flight
   * payment / save-ticket / shift-open behind the lock screen — when
   * isLocked flips true the entire sales tree is replaced and any
   * async work continues silently. Cart, shift, and attached customer
   * are preserved (cart state lives in useCart, not in modals).
   */
  const lockScreen = useCallback(() => {
    if (!isLoggedIn) return;
    setShowCharge(false);
    setShowSendBill(false);
    setShowSaveTicket(false);
    setShowOpenShift(false);
    setShowCloseShift(false);
    setIsLocked(true);
  }, [isLoggedIn]);

  /**
   * Force the PWA shell (HTML + JS bundle) to reload from the server.
   *
   * Background: when the POS is installed as a PWA on iOS / Android
   * and a new deploy ships, the device keeps serving the cached
   * bundle until the user manually hard-refreshes — which is hard to
   * do from a home-screen app with no browser chrome. This action
   * gives the cashier a one-tap "get me the latest version" button.
   *
   * It clears every Cache Storage entry (in case a service worker
   * landed in a future deploy), unregisters any service workers,
   * then reloads the page. Cart/shift state is in-memory so closing
   * the tab loses it — we don't reload mid-ticket without warning.
   */
  const forceAppReload = useCallback(async () => {
    const hasCart = cart.cartItems.length > 0;
    if (hasCart) {
      const ok = window.confirm(
        'Reloading discards the current cart. Continue?',
      );
      if (!ok) return;
    }
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      // Best-effort cleanup — never block the reload on a cache API
      // hiccup. The reload below will still pick up new HTML thanks
      // to the no-cache meta tags in index.html.
    }
    // Cache-busting query so iOS Safari (which can be aggressive with
    // its memory cache even with no-cache headers) is forced to
    // re-fetch index.html. The browser strips the query for asset
    // resolution; only HTML sees it.
    const url = new URL(window.location.href);
    url.searchParams.set('_r', Date.now().toString(36));
    window.location.replace(url.toString());
  }, [cart.cartItems.length]);

  // ── Auto-lock on inactivity ─────────────────────────────────────
  // Default 5 minutes; cashier-configurable via localStorage
  // `pos_idle_lock_minutes` (0 disables). Auto-lock is also paused
  // while any blocking modal is open — taking >5min on the charge
  // overlay (counting cash, customer fishes for card) should not
  // yank the screen out from under the cashier mid-payment.
  const isAnyModalOpen = showCharge || showSendBill || showSaveTicket || showOpenShift || showCloseShift;
  useIdleLock({
    enabled: isLoggedIn && !isLocked && !showTimeClock && !isAnyModalOpen,
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
    { id: "refresh_menu",   label: "Refresh data",   icon: "↻",  group: "user" as const },
    { id: "check_update",   label: "Check for app update", icon: "⬇", group: "user" as const },
    { id: "lock",           label: "Lock screen",    icon: "🔒", group: "user" as const },
    { id: "logout",         label: "Log out",        icon: "↩",  group: "user" as const },
  ];

  return (
    <div className="pos-shell" style={{
      minHeight: '100vh',
      background: palette.bg,
      color: palette.panelInk,
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

          {/* Top-banner refresh button removed — the ↻ next to the
              menu search bar (also rewired to refreshAll) is the only
              one needed. Per-cashier feedback the duplicate buttons
              were just visual noise. The More-drawer "Refresh data"
              item still works for cashiers parked on a non-Sales
              pane. */}

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
      <main className="pos-main" style={{ flex: 1, display: 'flex', minHeight: 0, padding: 12, gap: 12 }}>
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
              cartTax={cart.cartTax}
              cartTotal={cart.cartTotal}
              discountValue={cart.discountValue}
              rewardsDiscount={cart.rewardsDiscount}
              appliedPromo={cart.appliedPromo}
              setAppliedPromo={cart.setAppliedPromo}
              appliedLoyalty={cart.appliedLoyalty}
              setAppliedLoyalty={cart.setAppliedLoyalty}
              appliedGiftCard={cart.appliedGiftCard}
              setAppliedGiftCard={cart.setAppliedGiftCard}
              payments={cart.payments}
              discountAmount={cart.discountAmount}
              setDiscountAmount={cart.setDiscountAmount}
              isSubmitting={order.isSubmitting}
              pendingPaymentForOrderId={order.pendingPaymentForOrderId}
              lastCreatedOrderId={order.lastCreatedOrderId}
              openTicketsCount={openTicketsCount}
              attachedCustomer={cart.attachedCustomer}
              onAttachCustomer={cart.setAttachedCustomer}
              onDetachCustomer={cart.detachCustomer}
              resumedOrderId={order.resumedOrderId}
              onCancelResume={() => void order.handleCancelResume().then(refreshOpenTickets)}
              onClearCart={cart.clearCart}
              onSaveTicket={() => setShowSaveTicket(true)}
              onOpenTickets={() => setPane("open_tickets")}
              onCheckout={() => {
                // Pre-flight checks BEFORE opening the charge overlay.
                // Once the overlay is up (z-index 900) it covers the
                // status banner area, so a silent handleCharge failure
                // looks like "the Confirm button does nothing". Catch
                // the most common ones inline so the cashier sees them.
                if (cart.cartItems.length === 0) return;
                if (orderType === "Dine-in" && tables.length > 0 && !selectedTableId) {
                  order.setStatusMessage("Select a table before charging a Dine-in ticket.");
                  setTimeout(() => order.setStatusMessage(""), 4000);
                  return;
                }
                // Clear any stale error from a previous attempt so the
                // overlay doesn't open with a red banner from a closed-
                // but-not-resolved earlier flow (e.g. cashier hit
                // Charge, got a network error, dismissed the overlay,
                // then opened it again — the banner would still show
                // the old message). ChargeOverlay's onConfirm clears
                // again for the in-flight attempt itself.
                order.setStatusMessage("");
                setShowCharge(true);
              }}
              onRetryPayment={order.handleRetryPayment}
              onOpenSendBill={() => setShowSendBill(true)}
              quickNotes={quickNotes}
              onOpenNotePicker={setNotePickerKey}
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
              onRefreshMenu={refreshAll}
              isRefreshingMenu={isRefreshingAll || menu.isRefreshing}
              lastRefreshedAt={menu.lastRefreshedAt}
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
            cartCustomerPhone={cart.attachedCustomer?.phone ?? null}
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
          if (id === "refresh_menu") {
            // One-tap full refresh — menu items + categories, tables,
            // kitchen-note chips, held-tickets badge, and the shift
            // summary. Replaces the old menu-only refresh which left
            // tables and other once-per-login data stale until the
            // cashier re-installed the PWA.
            void refreshAll();
            return;
          }
          if (id === "check_update") {
            void forceAppReload();
            return;
          }
          setPane(id as Pane);
        }}
      />

      <OnlineOrderToasts
        toasts={onlineOrderWatch.toasts}
        onDismiss={onlineOrderWatch.dismiss}
        onOpen={(id) => {
          // Tapping the toast jumps the cashier to the Receipts pane
          // (which already lists online orders) and dismisses the toast
          // so it doesn't keep nagging. We don't navigate deeper than
          // the pane switch — keeps any mid-ring cart untouched.
          onlineOrderWatch.dismiss(id);
          setPane("receipts");
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
          subtotal={cart.cartSubtotal}
          // Roll the manual cashier discount and every staged customer-
          // reward into one figure for the Charge screen. The cart sidebar
          // still itemises them so the cashier always knows where the
          // money went.
          discount={cart.discountValue + cart.rewardsDiscount}
          tax={cart.cartTax}
          total={cart.cartTotal}
          submitting={order.isSubmitting}
          errorMessage={order.statusMessage}
          onClose={() => setShowCharge(false)}
          onConfirm={async (rows) => {
            // Clear any stale error (e.g. from a previous attempt) so
            // a fresh confirm tap doesn't show the old message while
            // the new request is in flight.
            order.setStatusMessage("");
            const ok = await order.handleCharge(rows);
            if (ok) setShowCharge(false);
          }}
        />
      )}

      {showSaveTicket && (
        <SaveTicketModal
          attachedCustomer={cart.attachedCustomer}
          tables={tables}
          selectedTableId={selectedTableId}
          setSelectedTableId={setSelectedTableId}
          orderType={orderType}
          setOrderType={setOrderType}
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

      {/* Per-line kitchen note picker. We look up the active cart line
          by key so the picker stays correct even if other lines are
          added/removed underneath while the modal is open. If the line
          was removed entirely (rare race), we just dismiss. */}
      {notePickerKey !== null && (() => {
        const line = cart.cartItems.find(
          (ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes) === notePickerKey,
        );
        if (!line) {
          setNotePickerKey(null);
          return null;
        }
        const label = line.variant_name
          ? `${line.name} — ${line.variant_name}`
          : line.name;
        return (
          <NotePickerModal
            options={quickNotes}
            initialSelected={line.notes ?? []}
            itemLabel={label}
            onCancel={() => setNotePickerKey(null)}
            onSave={(selected) => {
              // Replacing notes on a line changes its cart key (notes
              // are part of makeCartKey), so we must also reconcile
              // duplicates: if there's already another line with the
              // exact same item/variant/modifiers/notes combo, merge
              // quantities into it and drop the original.
              const newKey = makeCartKey(line.id, line.modifiers, line.variant_id, selected);
              cart.setCartItems(
                cart.cartItems
                  .map((ci) => (ci === line ? { ...ci, notes: selected } : ci))
                  .reduce<typeof cart.cartItems>((acc, ci) => {
                    const k = makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes);
                    if (k === newKey) {
                      const existing = acc.find(
                        (a) => makeCartKey(a.id, a.modifiers, a.variant_id, a.notes) === newKey,
                      );
                      if (existing) {
                        existing.quantity += ci.quantity;
                        return acc;
                      }
                    }
                    acc.push(ci);
                    return acc;
                  }, []),
              );
              setNotePickerKey(null);
            }}
          />
        );
      })()}
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

/**
 * Generic gate card — used by device-pending / device-disabled /
 * shift-closed style screens. Rendered in front of the whole POS
 * when the cashier can't proceed.
 *
 * Slate background matches the rest of the POS chrome so transitions
 * in/out of these gates don't feel like switching apps.
 */
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
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${TH.ink} 0%, ${TH.inkSoft} 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: TH.space.xl,
    }}>
      <div style={{
        background: TH.panel,
        borderRadius: TH.radius.xxl,
        padding: `${TH.space.xxl}px ${TH.space.xxl}px ${TH.space.xl}px`,
        width: '100%',
        maxWidth: 440,
        textAlign: 'center',
        boxShadow: TH.shadow.xl,
        animation: 'pos-scale-in 200ms ease',
      }}>
        <p style={{ fontSize: 44, margin: `0 0 ${TH.space.m}px` }}>{emoji}</p>
        <p style={{ ...TH.type.title, color: TH.panelInk, margin: `0 0 ${TH.space.s}px` }}>{title}</p>
        <p style={{ ...TH.type.body, color: TH.panelMuted, margin: `0 0 ${TH.space.xl}px`, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {body}
        </p>

        {deviceId && (
          <div style={{
            background: TH.primaryBg,
            border: `1px solid ${TH.primaryLight}`,
            borderRadius: TH.radius.l,
            padding: `${TH.space.m}px ${TH.space.l}px`,
            marginBottom: TH.space.xl,
          }}>
            <p style={{ ...TH.type.label, margin: 0, color: TH.primaryDark }}>Device ID</p>
            <p style={{
              margin: `${TH.space.xxs}px 0 0`,
              fontSize: 16,
              fontWeight: 800,
              color: TH.primaryDark,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              letterSpacing: '0.04em',
            }}>{deviceId}</p>
          </div>
        )}

        {footer && (
          <p style={{ ...TH.type.caption, color: TH.panelSubtle, margin: `0 0 ${TH.space.m}px` }}>{footer}</p>
        )}

        <div style={{
          display: 'flex',
          gap: TH.space.s,
          justifyContent: 'center',
          flexDirection: secondaryAction ? 'column' : 'row',
        }}>
          {primaryAction && (
            <button onClick={primaryAction.onClick} style={btnPrimary()}>
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              style={{
                background: 'none',
                border: 'none',
                color: TH.panelMuted,
                fontSize: TH.type.bodySm.fontSize,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: TH.space.s,
              }}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
