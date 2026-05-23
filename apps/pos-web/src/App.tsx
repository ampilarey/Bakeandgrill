import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTables, setAuthToken, staffLogin, selfRegisterDevice, fetchPosQuickNotes, pingAuth, fetchMe, countActiveOrders, fetchCustomerSummary } from "./api";
import { getQueueCount } from "./offlineQueue";
import { countPendingOfflineOrders, getOfflineOrderSyncCounts, initOfflineDb, OFFLINE_SYNC_V2, cacheStaffSessionFromUser, ensureCachedStaffSession } from "./offline/db";
import { evaluateOfflineGate, type OfflineGateResult } from "./offline/offlineGate";
import { startSyncEnginePolling } from "./offline/syncEngine";
import { useConnectivity } from "./hooks/useConnectivity";
import type { RestaurantTable } from "./types";

import { useMenu }          from "./hooks/useMenu";
import { useCart }          from "./hooks/useCart";
import { useOrderCreation } from "./hooks/useOrderCreation";
import { useOps }           from "./hooks/useOps";
import { useShift }         from "./hooks/useShift";
import { hasPosPermission } from "./hooks/usePosPermissions";
import { useIdleLock, resolveIdleLockMinutes } from "./hooks/useIdleLock";
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
import { PosPreferencesModal } from "./components/PosPreferencesModal";
import { SideDrawer }        from "./components/SideDrawer";
import { TimeClockPanel }    from "./components/TimeClockPanel";
import { LockScreen }        from "./components/LockScreen";
import { PosUpdateBanner } from "./components/PosUpdateBanner";
import { OfflineSyncPanel } from "./components/OfflineSyncPanel";
import { usePosAppUpdate } from "./hooks/usePosAppUpdate";
import { POS_BUILD_INFO } from "./posBuildInfo";

import { palette } from "./theme";

const orderTypes = ["Dine-in", "Takeaway", "Pickup"] as const;
type OrderType = (typeof orderTypes)[number];

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
  const [, setStaffRole] = useState<string>(() => localStorage.getItem("pos_staff_role") ?? "");
  // Cashier's resolved permission slugs (DB grants + role defaults, owner
  // bypass already flattened to all slugs server-side). Persisted in
  // localStorage so the void/refund buttons stay hidden during the brief
  // window between page load and the next /auth/me call.
  const [staffPermissions, setStaffPermissions] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("pos_staff_permissions");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const canVoidOrders = hasPosPermission(staffPermissions, "orders.void");
  const canOpenShift = hasPosPermission(staffPermissions, "pos.open_shift");
  const canCloseShift = hasPosPermission(staffPermissions, "pos.close_shift");
  const canRingSales = hasPosPermission(staffPermissions, "pos.ring_sales");
  const canHoldResume = hasPosPermission(staffPermissions, "pos.hold_resume");
  const canViewActiveOrders = hasPosPermission(staffPermissions, "pos.active_orders");
  const canViewReceipts = hasPosPermission(staffPermissions, "orders.receipts");
  const canViewShiftHistory = hasPosPermission(staffPermissions, "shifts.view_own_history");
  const canCashInOut = hasPosPermission(staffPermissions, "payments.cash_in_out");
  const canLockScreen = hasPosPermission(staffPermissions, "pos.lock_screen");
  const canOpsInventory = hasPosPermission(staffPermissions, "inventory.manage");
  const canOpsSuppliers = hasPosPermission(staffPermissions, "suppliers.manage");
  const canOpsReports = hasPosPermission(staffPermissions, "reports.view");
  const canOpsMarketing = hasPosPermission(staffPermissions, "integrations.sms");
  const canUseCredit = hasPosPermission(staffPermissions, "payments.credit");
  const canAccessOps = canOpsInventory || canOpsSuppliers || canOpsReports || canOpsMarketing;
  const [idleLockMinutes, setIdleLockMinutes] = useState(5);
  const [deviceId]                    = useState(() => {
    // Priority order:
    //  1. Previously persisted id in localStorage — once a device is
    //     bound, that binding is sticky. URL params can no longer
    //     overwrite it, which prevents anyone-with-a-link from re-
    //     attributing this POS's orders to a different station id.
    //  2. `?device=<id>` in the URL — ONLY honored on the very first
    //     load (no stored id yet) so the owner can pre-provision a
    //     headless device (KDS / display) with a single QR / link.
    //     Subsequent loads ignore the param, even if it's still in
    //     the URL bar after a share.
    //  3. Newly minted POS id for first-time interactive cashier flow.
    //
    // Previously the URL param won unconditionally — useful for
    // re-binding a fresh browser profile, but it also meant a stale
    // bookmark or a copy-pasted link could silently rebind a busy POS
    // to the wrong station mid-shift, breaking per-device order
    // attribution + station-scoped active orders.
    const stored = localStorage.getItem("pos_device_id");
    if (stored) return stored;

    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = (params.get("device") ?? params.get("device_id") ?? "").trim();
      if (fromUrl && /^[A-Za-z0-9\-_]+$/.test(fromUrl)) {
        localStorage.setItem("pos_device_id", fromUrl);
        params.delete("device");
        params.delete("device_id");
        // Strip the query param so a hard refresh doesn't keep re-binding
        // (defensive — the localStorage check above already handles this).
        const cleanQs = params.toString();
        const cleanUrl = window.location.pathname + (cleanQs ? `?${cleanQs}` : "") + window.location.hash;
        window.history.replaceState({}, "", cleanUrl);
        return fromUrl;
      }
    } catch { /* ignore — fall through to generated id */ }

    const generated = `POS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    localStorage.setItem("pos_device_id", generated);
    return generated;
  });
  const [deviceDbId, setDeviceDbId] = useState<number | null>(() => {
    const raw = localStorage.getItem("pos_device_db_id");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const persistDeviceDbId = useCallback((id: number | undefined | null) => {
    if (!id) return;
    setDeviceDbId(id);
    localStorage.setItem("pos_device_db_id", String(id));
  }, []);
  const [authError, setAuthError]     = useState("");
  const [showTimeClock, setShowTimeClock] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // ── View + connectivity ─────────────────────────────────────────────────────
  const [pane, setPane] = useState<Pane>("sales");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const connectivity = useConnectivity(isLoggedIn);
  const isOnline = connectivity.isOnline;
  const isReachable = connectivity.isReachable;
  const [offlineQueueCount, setOfflineQueueCount] = useState(() => (
    OFFLINE_SYNC_V2 ? 0 : getQueueCount()
  ));
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const [offlinePendingTotals, setOfflinePendingTotals] = useState({
    cash: 0,
    card: 0,
    transfer: 0,
  });
  const [showOfflineSyncPanel, setShowOfflineSyncPanel] = useState(false);
  const [offlineGate, setOfflineGate] = useState<OfflineGateResult | null>(null);

  // Modals/overlays
  const [showSendBill, setShowSendBill] = useState(false);
  const [showCharge, setShowCharge] = useState(false);
  const [chargeCreditAvailable, setChargeCreditAvailable] = useState(0);
  const [chargeCreditEligible, setChargeCreditEligible] = useState(false);
  const [showSaveTicket, setShowSaveTicket] = useState(false);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [openShiftBusy, setOpenShiftBusy] = useState(false);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  /** After a paid dine-in/takeaway sale, jump to Receipts with this order selected. */
  const [receiptsFocusOrderId, setReceiptsFocusOrderId] = useState<number | null>(null);

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

  // Auto-flush the offline queue when connectivity returns. Previously
  // the cashier had to remember to tap "Sync" in the header — easy to
  // forget during a busy lunch rush, and tickets sat in localStorage
  // until someone noticed. Debounced 2s so a flaky wifi (online ↔
  // offline cycling) doesn't fire repeated sync attempts that all
  // collide on the same offline_id rows.
  //
  // Gated on isLoggedIn so we never sync against a stale/expired token
  // immediately after the auth_expired flow lands the cashier back on
  // the lock screen.
  useEffect(() => {
    if (!isReachable || !isLoggedIn) return;
    if (offlineQueueCount === 0) return;
    const handle = window.setTimeout(() => {
      try {
        order.handleSyncQueue();
      } catch { /* sync hook surfaces its own error toast */ }
    }, 2000);
    return () => window.clearTimeout(handle);
    // Intentionally omit `order` from deps — its identity changes every
    // render and would cause this effect to re-run continuously. The
    // closure captures the latest handleSyncQueue from the current
    // render anyway (React 18 useEffect semantics).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReachable, isLoggedIn, offlineQueueCount]);

  // ── Hooks ───────────────────────────────────────────────────────────────────
  // Passing orderType lets the menu refilter when the cashier flips
  // between Dine-in / Takeaway / Pickup — items the admin has
  // restricted via item_channel_availability disappear or reappear
  // automatically, so the cashier can't accidentally ring something
  // that doesn't belong on that channel.
  const shift = useShift(isLoggedIn, isLoggedIn, deviceId);
  const menu = useMenu(isLoggedIn, orderType, isReachable, shift.seedFromBootstrap);
  const cart = useCart();
  const ops  = useOps(isLoggedIn, pane === "ops" ? "ops" : "pos");

  const refreshOfflineCounts = useCallback(async () => {
    if (!OFFLINE_SYNC_V2) {
      setOfflineQueueCount(getQueueCount());
      setOfflinePendingCount(0);
      return;
    }
    const shiftId = shift.current?.id ?? null;
    const pending = await countPendingOfflineOrders(shiftId ?? undefined);
    const totals = await getOfflineOrderSyncCounts(shiftId ?? undefined);
    setOfflineQueueCount(pending);
    setOfflinePendingCount(pending);
    setOfflinePendingTotals({
      cash: totals.pendingCashTotal,
      card: totals.pendingCardTotal,
      transfer: totals.pendingTransferTotal,
    });
  }, [shift.current?.id]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const handle = window.setTimeout(() => {
      void initOfflineDb().then(() => ensureCachedStaffSession()).then(() => refreshOfflineCounts());
    }, 1500);
    return () => window.clearTimeout(handle);
  }, [isLoggedIn, refreshOfflineCounts]);

  useEffect(() => {
    if (!isLoggedIn || !OFFLINE_SYNC_V2) return;
    let stop: (() => void) | undefined;
    const handle = window.setTimeout(() => {
      stop = startSyncEnginePolling(() => isReachable);
    }, 10_000);
    return () => {
      window.clearTimeout(handle);
      stop?.();
    };
  }, [isLoggedIn, isReachable]);

  useEffect(() => {
    if (!isLoggedIn || isReachable) {
      setOfflineGate(null);
      return;
    }
    if (menu.isLoading || shift.loading) return;
    void evaluateOfflineGate().then(setOfflineGate);
  }, [isLoggedIn, isReachable, menu.isLoading, shift.loading]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const handle = window.setTimeout(() => { void refreshOfflineCounts(); }, 2000);
    return () => window.clearTimeout(handle);
  }, [isReachable, isLoggedIn, refreshOfflineCounts]);

  // Auto-dismiss the note picker if the cart line it's editing
  // disappears (e.g. cashier removed the line in another panel before
  // saving the note). Lives here (after useCart) so we don't call
  // setState during the render of the modal IIFE below — fixes a
  // React warning + sporadic freezes on iPad when the modal stayed
  // mounted with a stale key.
  useEffect(() => {
    if (notePickerKey === null) return;
    const exists = cart.cartItems.some(
      (ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes) === notePickerKey,
    );
    if (!exists) {
      setNotePickerKey(null);
    }
  }, [notePickerKey, cart.cartItems]);
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
    if (!isLoggedIn) return;
    try {
      setOpenTicketsCount(await countActiveOrders());
    } catch { /* best-effort */ }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const handle = window.setTimeout(() => { void refreshOpenTickets(); }, 5000);
    return () => window.clearTimeout(handle);
  }, [refreshOpenTickets, pane, shift.current?.id, isLoggedIn]);

  // Sync role from /auth/me — deferred so menu + shift win the network on login.
  // staffLogin already caches role/permissions; this refreshes them quietly.
  useEffect(() => {
    if (!isLoggedIn) return;
    const handle = window.setTimeout(() => {
      void fetchMe()
        .then((user) => {
          const role = user.role ?? "";
          localStorage.setItem("pos_staff_role", role);
          setStaffRole(role);
          const perms = user.permissions ?? [];
          localStorage.setItem("pos_staff_permissions", JSON.stringify(perms));
          setStaffPermissions(perms);
          setIdleLockMinutes(resolveIdleLockMinutes(user));
          void cacheStaffSessionFromUser({
            id: user.id,
            name: user.name,
            permissions: perms,
          });
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearTimeout(handle);
  }, [isLoggedIn]);

  const order = useOrderCreation({
    isOnline,
    isReachable,
    deviceId,
    shiftId: shift.current?.id ?? null,
    orderType,
    selectedTableId,
    cartItems:     cart.cartItems,
    cartTotal:     cart.cartTotal,
    cartSubtotal:  cart.cartSubtotal,
    cartTax:       cart.cartTax,
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
    setOfflineQueueCount: (n) => {
      setOfflineQueueCount(n);
      void refreshOfflineCounts();
    },
    // Resume-time setters so handleResumeTicket can rehydrate the
    // ticket's original context (customer / order type / table). Without
    // these, parking a Dine-in/Table 4/Aisha ticket and resuming it
    // landed you on a Takeaway cart with no customer attached — and
    // the receipt SMS at charge time went nowhere.
    setAttachedCustomer: cart.setAttachedCustomer,
    setOrderType,
    setSelectedTableId,
    // M6 fix — repaint the discount/promo/loyalty/gift-card rows on
    // the cart sidebar when resuming a held ticket so the cashier
    // sees the same totals the customer was quoted at hold time.
    setDiscountAmount: cart.setDiscountAmount,
    setAppliedPromo: cart.setAppliedPromo,
    setAppliedLoyalty: cart.setAppliedLoyalty,
    setAppliedGiftCard: cart.setAppliedGiftCard,
    onOrderSettled: () => {
      void refreshOpenTickets();
      void shift.refreshSummary();
      setPane("sales");
    },
  });

  const posUpdate = usePosAppUpdate({
    cartHasItems: cart.cartItems.length > 0,
    resumedOrderId: order.resumedOrderId,
    isEditingActive: order.isEditingActive,
    showCharge,
    showSendBill,
    showSaveTicket,
    showOpenShift,
    showCloseShift,
    showPreferences,
    isSubmitting: order.isSubmitting,
    pendingPaymentForOrderId: order.pendingPaymentForOrderId,
    offlineQueueCount,
    offlinePendingCount,
    shiftCashFormOpen: false,
  }, isLoggedIn);

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

  const refreshQuickNotes = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const chips = await fetchPosQuickNotes();
      setQuickNotes(chips);
    } catch {
      // Same logic as refreshTables — keep showing the last-known list.
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!showCharge || !cart.attachedCustomer || !canUseCredit) {
      setChargeCreditEligible(false);
      setChargeCreditAvailable(0);
      return;
    }
    let cancelled = false;
    void fetchCustomerSummary(cart.attachedCustomer.id)
      .then((summary) => {
        if (cancelled) return;
        const credit = summary.credit;
        setChargeCreditEligible(Boolean(credit?.can_charge));
        setChargeCreditAvailable((credit?.available_laar ?? 0) / 100);
      })
      .catch(() => {
        if (!cancelled) {
          setChargeCreditEligible(false);
          setChargeCreditAvailable(0);
        }
      });
    return () => { cancelled = true; };
  }, [showCharge, cart.attachedCustomer?.id, canUseCredit]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const handle = window.setTimeout(() => { void refreshTables(); }, 4000);
    return () => window.clearTimeout(handle);
  }, [isLoggedIn, refreshTables]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const handle = window.setTimeout(() => { void refreshQuickNotes(); }, 4000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshQuickNotes();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(handle);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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

  // Fire-and-forget device audit registration — never blocks sales.
  useEffect(() => {
    if (!isLoggedIn) return;
    const handle = window.setTimeout(() => {
      void selfRegisterDevice(deviceId, `POS ${deviceId}`)
        .then((res) => {
          if (res.device?.id) persistDeviceDbId(res.device.id);
        })
        .catch(() => { /* optional audit metadata */ });
    }, 6000);
    return () => window.clearTimeout(handle);
  }, [isLoggedIn, deviceId, persistDeviceDbId]);

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
      localStorage.setItem("pos_staff_role", response.user?.role ?? "");
      const loginPerms = response.user?.permissions ?? [];
      localStorage.setItem("pos_staff_permissions", JSON.stringify(loginPerms));
      setCashierName(name);
      setStaffRole(response.user?.role ?? "");
      setStaffPermissions(loginPerms);
      setIdleLockMinutes(resolveIdleLockMinutes(response.user));
      setAuthToken(response.token);
      if (response.user?.id) {
        void cacheStaffSessionFromUser({
          id: response.user.id,
          name: response.user.name ?? name,
          permissions: loginPerms,
        });
      }
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
    localStorage.removeItem("pos_staff_role");
    localStorage.removeItem("pos_staff_permissions");
    localStorage.removeItem("pos_staff_user_id");
    setAuthToken(null);
    setIsLoggedIn(false);
    setCashierName("");
    setStaffRole("");
    setStaffPermissions([]);
    setIdleLockMinutes(5);
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

  // Bug-052: proactive token-validity check on tab focus.
  // Sanctum tokens silently expire after the configured idle TTL;
  // without this the cashier learns about it the first time they
  // try to ring up an order after coming back from lunch, which
  // adds 5 seconds of "tap charge → spinner → 401 → relogin" to
  // a queued customer's wait. Now we ping /auth/me on every
  // visible event; a 401 fires the existing auth_expired listener
  // above and the cashier sees the login screen IMMEDIATELY on
  // returning to the iPad. Throttled to once per 30s so a manager
  // who keeps switching tabs doesn't hammer the backend.
  useEffect(() => {
    if (!isLoggedIn) return;
    let lastPing = 0;
    const tryPing = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastPing < 30_000) return;
      lastPing = now;
      // pingAuth dispatches auth_expired internally on 401; we just
      // need to call it. Swallow other errors (network blips) since
      // they'll surface naturally on the next real request.
      void pingAuth().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", tryPing);
    return () => document.removeEventListener("visibilitychange", tryPing);
  }, [isLoggedIn]);

  const handleOpenShift = async (openingCash: number, notes?: string) => {
    setOpenShiftBusy(true);
    try { await shift.open(openingCash, notes, deviceDbId); setShowOpenShift(false); }
    finally { setOpenShiftBusy(false); }
  };
  const handleCloseShift = async (closingCash: number, notes?: string) => {
    await shift.close(closingCash, notes);
    setShowCloseShift(false);
    setPane("sales");
  };
  const handleSaveTicketSubmit = async (name: string, note: string | undefined, fireToKitchen: boolean) => {
    await order.handleSaveTicket(name, note, fireToKitchen);
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
      localStorage.setItem("pos_staff_role", res.user?.role ?? "");
      const unlockPerms = res.user?.permissions ?? [];
      localStorage.setItem("pos_staff_permissions", JSON.stringify(unlockPerms));
      setAuthToken(res.token);
      setStaffRole(res.user?.role ?? "");
      setStaffPermissions(unlockPerms);
      setIdleLockMinutes(resolveIdleLockMinutes(res.user));
      if (res.user?.id) {
        void cacheStaffSessionFromUser({
          id: res.user.id,
          name: res.user.name ?? localStorage.getItem("pos_cashier_name") ?? "",
          permissions: unlockPerms,
        });
      }
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

  // ── Auto-lock on inactivity ─────────────────────────────────────
  // Per-staff minutes from admin → My Account (default 5). 0 = never.
  // Paused while any blocking modal is open.
  const isAnyModalOpen = showCharge || showSendBill || showSaveTicket || showOpenShift || showCloseShift || showPreferences;
  useIdleLock({
    enabled: isLoggedIn && !isLocked && !showTimeClock && !isAnyModalOpen && idleLockMinutes > 0,
    timeoutMs: idleLockMinutes * 60_000,
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

  const drawerItems = useMemo(() => {
    const main: Array<{ id: string; label: string; icon: string; group: "main"; badge?: string; disabled?: boolean }> = [];
    if (canRingSales) main.push({ id: "sales", label: "Sales", icon: "🛒", group: "main" });
    if (canViewReceipts) main.push({ id: "receipts", label: "Receipts", icon: "🧾", group: "main" });
    if (canViewActiveOrders) {
      main.push({
        id: "open_tickets", label: "Active Orders", icon: "🎫", group: "main",
        badge: openTicketsCount > 0 ? String(openTicketsCount) : undefined,
      });
    }
    if (shift.current || canViewShiftHistory) {
      main.push({ id: "shift", label: "Current Shift", icon: "💰", group: "main" });
    }
    if (canViewShiftHistory) main.push({ id: "shift_history", label: "Shift History", icon: "📚", group: "main" });
    if (canAccessOps) main.push({ id: "ops", label: "Operations", icon: "🛠", group: "main" });

    const user: Array<{ id: string; label: string; icon: string; group: "user" }> = [
      { id: "refresh_menu", label: "Refresh data", icon: "↻", group: "user" },
      { id: "check_update", label: "Update app", icon: "⬇", group: "user" },
      { id: "preferences", label: "My settings", icon: "⚙️", group: "user" },
    ];
    if (canLockScreen) user.push({ id: "lock", label: "Lock screen", icon: "🔒", group: "user" });
    user.push({ id: "logout", label: "Log out", icon: "↩", group: "user" });
    return [...main, ...user];
  }, [canRingSales, canViewReceipts, canViewActiveOrders, canViewShiftHistory, canAccessOps, canLockScreen, openTicketsCount, shift.current]);

  const paneAllowed = useMemo((): Record<Pane, boolean> => ({
    sales: canRingSales,
    receipts: canViewReceipts,
    open_tickets: canViewActiveOrders,
    shift: !!shift.current || canViewShiftHistory,
    shift_history: canViewShiftHistory,
    ops: canAccessOps,
  }), [canRingSales, canViewReceipts, canViewActiveOrders, canViewShiftHistory, canAccessOps, shift.current]);

  useEffect(() => {
    if (paneAllowed[pane]) return;
    const fallback = (Object.keys(paneAllowed) as Pane[]).find((p) => paneAllowed[p]);
    if (fallback) setPane(fallback);
  }, [pane, paneAllowed]);

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

  // Hard shift gate — POS UI is unreachable until a shift is open.
  if (!shift.loading && !shift.current) {
    return (
      <>
        <ShiftClosedGate
          onOpenShift={() => setShowOpenShift(true)}
          onLogout={handleLogout}
          onSwitchUser={canLockScreen ? lockScreen : undefined}
          canOpenShift={canOpenShift}
          error={shift.error || undefined}
        />
        {showOpenShift && canOpenShift && (
          <OpenShiftModal
            onConfirm={handleOpenShift}
            onCancel={() => setShowOpenShift(false)}
            busy={openShiftBusy}
          />
        )}
      </>
    );
  }

  if (!isReachable && offlineGate && !offlineGate.allowed && !menu.isLoading && !shift.loading) {
    const activeSessionFallback =
      !!localStorage.getItem("pos_token")
      && shift.current != null
      && menu.items.length > 0;

    if (!activeSessionFallback) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, background: "#F8FAFC", color: "#0F172A",
      }}>
        <div style={{
          maxWidth: 480, width: "100%", background: "#fff", borderRadius: 12,
          padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Offline mode unavailable</h1>
          <p style={{ margin: 0, color: "#64748B", lineHeight: 1.5 }}>
            {offlineGate.reason ?? "Connect while online once to cache menu, shift, and staff session."}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void connectivity.ping().then(() => evaluateOfflineGate().then(setOfflineGate))}
              style={{
                minHeight: 44, padding: "0 16px", borderRadius: 8,
                border: "none", background: "#0F172A", color: "#fff", fontWeight: 700, cursor: "pointer",
              }}
            >
              Retry connection
            </button>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                minHeight: 44, padding: "0 16px", borderRadius: 8,
                border: "1px solid #E2E8F0", background: "#fff", fontWeight: 600, cursor: "pointer",
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    );
    }
  }

  return (
    <div className="pos-shell" style={{
      minHeight: '100vh',
      background: palette.bg,
      color: palette.panelInk,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header className="pos-topbar" style={{
        background: '#FFFFFF', borderBottom: '1px solid #E2E8F0',
        padding: '10px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="pos-header-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            style={{
              width: 44, height: 44, borderRadius: 10,
              background: '#F1F5F9', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 18,
            }}>☰</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>
              {paneTitle(pane)}
            </div>
            <div className="pos-topbar-subtitle" style={{ fontSize: 11, color: '#64748B', lineHeight: 1.1, marginTop: 2 }}>
              {cashierName || 'Cashier'} · {deviceId}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Sales chip — quick at-a-glance shift KPI */}
          {shift.summary && (
            <span className="pos-topbar-chip" style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: '#0F172A', color: '#fff',
            }}>
              {shift.summary.sales_summary.order_count} orders · MVR {Number(shift.summary.sales_summary.net_sales ?? 0).toFixed(0)}
            </span>
          )}

          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: isReachable ? '#DCFCE7' : '#FEE2E2',
            color: isReachable ? '#15803D' : '#B91C1C',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isReachable ? '#22C55E' : '#EF4444' }} />
            {isReachable ? 'Online' : 'Offline'}
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
            className="pos-header-btn"
            onClick={lockScreen}
            aria-label="Lock screen"
            title="Lock screen (Ctrl/Cmd+L)"
            style={{
              width: 44, height: 44, borderRadius: 10,
              background: '#F1F5F9', border: '1px solid #E2E8F0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 15,
            }}
          >🔒</button>

          {offlineQueueCount > 0 && (
            <button
              onClick={() => {
                if (OFFLINE_SYNC_V2) setShowOfflineSyncPanel(true);
                else order.handleSyncQueue();
              }}
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

      {!isReachable && (
        <div style={{
          padding: "10px 16px", background: "#FEF3C7", color: "#92400E",
          borderBottom: "1px solid #FDE68A", fontSize: 13, fontWeight: 600,
        }}>
          Offline mode — cash, card, and transfer only (manual). Orders sync when internet returns.
          {menu.usingCachedMenu ? " Showing cached menu." : ""}
        </div>
      )}

      <PosUpdateBanner
        visible={isLoggedIn && !isLocked && posUpdate.bannerVisible}
        updateBlocked={posUpdate.updateBlocked}
        applying={posUpdate.applying}
        serverVersion={posUpdate.serverBuild?.version ?? null}
        serverBuild={posUpdate.serverBuild?.build ?? null}
        localBuild={POS_BUILD_INFO.build}
        onLater={posUpdate.dismissBanner}
        onUpdateNow={() => {
          if (posUpdate.applying) return;
          void posUpdate.applyUpdate().then((res) => {
            if (!res.ok && res.message) order.flashError(res.message);
          });
        }}
      />

      {/* Status banners */}
      {(order.statusMessage || ops.opsMessage) && (
        <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {order.statusMessage && (
            shouldShowStatusBanner(order.statusMessage)
              ? <Banner text={order.statusMessage} />
              : <NoticeBanner text={order.statusMessage} />
          )}
          {ops.opsMessage && <Banner text={ops.opsMessage} />}
        </div>
      )}

      {shift.error && shift.current && (
        <div style={{
          margin: '0 12px', padding: '8px 12px', borderRadius: 8,
          background: '#FEF3C7', color: '#92400E', fontSize: 12, fontWeight: 600,
        }}>
          {shift.error}
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
              resumedFromStatus={order.resumedFromStatus}
              resumedIsPaid={order.resumedIsPaid}
              resumedOrderLabel={order.resumedOrderLabel}
              resumedOrderType={order.resumedOrderType}
              resumedStaffUserId={order.resumedStaffUserId}
              isEditingActive={order.isEditingActive}
              onUnlockEdit={() => order.setIsEditingActive(true)}
              onSaveActiveChanges={() => void order.handleSaveActiveChanges().then(refreshOpenTickets)}
              onCancelResume={() => void order.handleCancelResume().then(refreshOpenTickets)}
              onClearCart={cart.clearCart}
              onSaveTicket={() => setShowSaveTicket(true)}
              onOpenTickets={() => setPane("open_tickets")}
              canRingSales={canRingSales}
              canHoldResume={canHoldResume}
              onCheckout={() => {
                // Pre-flight checks BEFORE opening the charge overlay.
                // Once the overlay is up (z-index 900) it covers the
                // status banner area, so a silent handleCharge failure
                // looks like "the Confirm button does nothing". Catch
                // the most common ones inline so the cashier sees them.
                if (cart.cartItems.length === 0) return;
                if (order.resumedIsPaid) return;
                // Table is OPTIONAL on Dine-in tickets — some venues
                // ring up at the counter before seating, so we don't
                // gate Charge on it. The cashier can still pick a
                // table later from the Save Ticket modal if needed.
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
              // Bug-055: the menu was disabled the moment ANY ticket
              // was resumed, including edit mode — the cashier
              // couldn't add items even though the cart was unlocked.
              // Lock the menu only in charge-only resume (where the
              // cart is read-only). In edit mode the cashier MUST be
              // able to tap items to add them to the open ticket.
              readOnly={order.resumedOrderId !== null && !order.isEditingActive}
              onRefreshMenu={refreshAll}
              isRefreshingMenu={isRefreshingAll || menu.isRefreshing}
              lastRefreshedAt={menu.lastRefreshedAt}
            />
          </>
        )}

        {pane === 'receipts' && (
          <ReceiptsPanel
            onClose={() => {
              setReceiptsFocusOrderId(null);
              setPane("sales");
            }}
            shiftId={shift.current?.id ?? null}
            initialOrderId={receiptsFocusOrderId}
          />
        )}

        {pane === 'open_tickets' && (
          <OpenTicketsPanel
            canVoidOrders={canVoidOrders}
            cartCustomerPhone={cart.attachedCustomer?.phone ?? null}
            onClose={() => setPane("sales")}
            onResume={(t) => {
              // Tap-to-open active ticket: load the order into the main
              // POS cart in edit mode (cart unlocked, "Save changes"
              // button appears) so the cashier can add/remove items
              // before charging. For PARKED tickets edit mode is the
              // natural fit; for COOKING/READY it lets the cashier
              // patch a missed line without re-ringing the whole
              // ticket. Surfaces resume errors instead of swallowing
              // them so the cashier sees what went wrong.
              order.handleEditActiveTicket(t.id)
                .then(() => {
                  setPane("sales");
                  void refreshOpenTickets();
                })
                .catch((err) => {
                  const msg = (err as Error)?.message ?? "Couldn't open ticket";
                  order.flashError(`Couldn't open ticket: ${msg}`);
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
            canCloseShift={canCloseShift}
            canCashInOut={canCashInOut}
          />
        )}

        {pane === 'shift_history' && (
          <ShiftHistoryPanel onClose={() => setPane("sales")} />
        )}

        {pane === 'ops' && (
          <OpsPanel
            {...ops}
            permissions={{
              inventory: canOpsInventory,
              suppliers: canOpsSuppliers,
              reports: canOpsReports,
              marketing: canOpsMarketing,
            }}
          />
        )}
      </main>

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={drawerItems}
        active={pane}
        cashierName={cashierName}
        shiftLabel={shift.current ? `Shift #${shift.current.id} · MVR ${Number(shift.summary?.cash_drawer.expected_cash ?? 0).toFixed(2)} in drawer` : 'No open shift'}
        appVersion={POS_BUILD_INFO.version}
        appBuild={POS_BUILD_INFO.build}
        updatePending={posUpdate.updateAvailable}
        onSelect={(id) => {
          setDrawerOpen(false);
          if (id === "logout") return handleLogout();
          if (id === "lock") return canLockScreen ? lockScreen() : undefined;
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
            void posUpdate.requestManualUpdate().then((result) => {
              if (result === "blocked") {
                order.flashError("Finish the current order or payment first, then tap Update Now.");
              } else if (result === "current" || result === "available") {
                order.flashError("Could not reload — close the app from the home screen and reopen, or clear Safari cache for this site.");
              }
            });
            return;
          }
          if (id === "preferences") {
            setShowPreferences(true);
            return;
          }
          setPane(id as Pane);
        }}
      />

      {showPreferences && (
        <PosPreferencesModal
          idleLockMinutes={idleLockMinutes}
          onClose={() => setShowPreferences(false)}
          onSaved={(resolved) => setIdleLockMinutes(resolved)}
        />
      )}

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
          // Use the SERVER total for resumed tickets so the cashier
          // confirms the same number that handleCharge will settle
          // against. Without this, a ticket resumed with server-side
          // promo/loyalty/gift-card baked in (but not yet hydrated
          // into the cart fields) could show one MVR total here and
          // settle a different one — wrong change handed back, customer
          // disputes. Falls back to cart.cartTotal for fresh tickets
          // (no resumed total available yet).
          total={order.resumedOrderId !== null
            ? (order.resumedOrderTotal ?? cart.cartTotal)
            : cart.cartTotal}
          creditEligible={canUseCredit && chargeCreditEligible && isReachable}
          creditAvailableMvr={chargeCreditAvailable}
          isOffline={!isReachable}
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

      {showCloseShift && canCloseShift && (
        <CloseShiftModal
          summary={shift.summary}
          pendingOfflineCount={offlinePendingCount}
          pendingOfflineCashTotal={offlinePendingTotals.cash}
          pendingOfflineCardTotal={offlinePendingTotals.card}
          pendingOfflineTransferTotal={offlinePendingTotals.transfer}
          onSyncNow={() => {
            setShowCloseShift(false);
            setShowOfflineSyncPanel(true);
          }}
          onConfirm={handleCloseShift}
          onCancel={() => setShowCloseShift(false)}
        />
      )}

      {showOfflineSyncPanel && (
        <OfflineSyncPanel
          shiftId={shift.current?.id ?? null}
          onClose={() => {
            setShowOfflineSyncPanel(false);
            void refreshOfflineCounts();
          }}
        />
      )}

      {/* Per-line kitchen note picker. We look up the active cart line
          by key so the picker stays correct even if other lines are
          added/removed underneath while the modal is open. If the line
          was removed entirely (rare race), we just dismiss via the
          effect below — calling setState inside this IIFE during render
          tripped React's "Cannot update a component while rendering"
          warning and occasionally desynced the modal on iPad. */}
      {notePickerKey !== null && (() => {
        const line = cart.cartItems.find(
          (ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes) === notePickerKey,
        );
        if (!line) {
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
    case "open_tickets": return "Active Orders";
    case "shift": return "Current Shift";
    case "shift_history": return "Shift History";
    case "ops": return "Operations";
  }
}

function shouldShowStatusBanner(text: string): boolean {
  return /failed|couldn't|unable|error|invalid|offline|expired|before you can|add at least|network|queue full|retry|not recorded|reward failed|⚠|session expired|sync paused|need payment/i.test(text);
}

function Banner({ text }: { text: string }) {
  return (
    <div style={{
      background: '#FEF2F2', borderRadius: 8, padding: '10px 14px',
      fontSize: 13, color: '#991B1B', border: '1px solid #FECACA', marginBottom: 6,
    }}>{text}</div>
  );
}

function NoticeBanner({ text }: { text: string }) {
  return (
    <div style={{
      background: '#FFFBEB', borderRadius: 8, padding: '10px 14px',
      fontSize: 13, color: '#92400E', border: '1px solid #FDE68A', marginBottom: 6,
    }}>{text}</div>
  );
}

export default App;
