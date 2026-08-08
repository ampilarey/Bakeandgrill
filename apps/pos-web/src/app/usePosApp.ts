import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiRequestError } from "@shared/api";
import type { StaffLoginResponse } from "@shared/types";
import { fetchTables, setAuthToken, staffLogin, staffPasswordLogin, selfRegisterDevice, selfDeviceStatus, fetchPosQuickNotes, pingAuth, fetchMe, fetchActiveOrdersBadgeSample, fetchCustomerSummary, updateOrderCustomer, fetchCustomerAddresses, previewDeliveryFeeMvr, fetchPublicSiteSettings, fetchKitchenHandoverSettings, DEFAULT_POS_SMS_NOTIFICATIONS, DEFAULT_POS_DISCOUNT_CONTROLS, type PosCustomer, type PosCustomerAddress, type PosSmsNotifications, type PosDiscountControls, type KitchenHandoverSettings } from "../api";
import { ticketStage } from "../utils/openTicketUtils";
import { ticketAgeAnchor, ticketAgeLevel } from "../utils/ticketAging";
import { countPendingOfflineOrders, getOfflineOrderSyncCounts, initOfflineDb, cacheStaffSessionFromUser, ensureCachedStaffSession } from "../offline/db";
import { evaluateOfflineGate, type OfflineGateResult } from "../offline/offlineGate";
import { startSyncEnginePolling } from "../offline/syncEngine";
import { useConnectivity } from "../hooks/useConnectivity";
import type { RestaurantTable } from "../types";

import { useMenu }          from "../hooks/useMenu";
import { useCart }          from "../hooks/useCart";
import { useOrderCreation } from "../hooks/useOrderCreation";
import { useOps }           from "../hooks/useOps";
import { useShift }         from "../hooks/useShift";
import { hasPosPermission } from "../hooks/usePosPermissions";
import { useIdleLock, resolveIdleLockMinutes } from "../hooks/useIdleLock";
import { makeCartKey }       from "../hooks/useCart";
import {
  applyPackagingPickerSelections,
  reconcileCartPackagingForOrderTypeToggle,
  type PackagingPickerLine,
} from "../hooks/packagingReconcile";
import { useOnlineOrderWatcher } from "../hooks/useOnlineOrderWatcher";
import { usePosAppUpdate } from "../hooks/usePosAppUpdate";

import {
  type PosDeliveryDetails,
  type PosOrderType,
  EMPTY_DELIVERY_DETAILS,
  estimateDeliveryFeeMvr,
  resolveDeliveryDetails,
  savedAddressToDeliveryDetails,
} from "../orderTypes";

import type { Pane } from "./types";

export function usePosApp() {
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
  const canViewReports = hasPosPermission(staffPermissions, "reports.view")
    || hasPosPermission(staffPermissions, "reports.basic")
    || hasPosPermission(staffPermissions, "reports.sales");
  /** Owner + anyone granted finance.expenses (same gate as Admin → Expenses). */
  const canManageExpenses = hasPosPermission(staffPermissions, "finance.expenses");
  const canCashInOut = hasPosPermission(staffPermissions, "payments.cash_in_out");
  const canLockScreen = hasPosPermission(staffPermissions, "pos.lock_screen");
  const canOpsInventory = hasPosPermission(staffPermissions, "inventory.manage");
  const canOpsPreparedStock = hasPosPermission(staffPermissions, "menu.prepared_stock");
  const canUseCredit = hasPosPermission(staffPermissions, "payments.credit");
  const canUseWallet = hasPosPermission(staffPermissions, "payments.deposit")
    || hasPosPermission(staffPermissions, "payments.wallet");
  const canPayCash = hasPosPermission(staffPermissions, "payments.cash");
  const canPayCard = hasPosPermission(staffPermissions, "payments.card");
  const canPaySplit = hasPosPermission(staffPermissions, "payments.split");
  const canApplyDiscount = hasPosPermission(staffPermissions, "promotions.discounts");
  const canUseRewards = canApplyDiscount || hasPosPermission(staffPermissions, "loyalty.redeem");
  const canApproveRefund = hasPosPermission(staffPermissions, "orders.refund");
  const canRequestRefund = hasPosPermission(staffPermissions, "orders.refund_request")
    || canApproveRefund;
  const canRefund = canRequestRefund;
  const canSendBill = hasPosPermission(staffPermissions, "orders.send_sms_bill");
  const canSendPayLink = hasPosPermission(staffPermissions, "orders.send_payment_link");
  const canManageOrderStatus = hasPosPermission(staffPermissions, "pos.manage_order_status");
  const canTimeClock = hasPosPermission(staffPermissions, "pos.time_clock");
  const canViewKds = hasPosPermission(staffPermissions, "kds.view");
  const canAccessOps = canOpsInventory || canOpsPreparedStock || canRequestRefund;
  // FIX 17 — a user with `pos.active_orders` is a POS user (kitchen-side
  // expediter/manager who watches active orders), not a KDS-only kitchen
  // hand, so they must NOT be shunted into the kitchen-only landing page.
  const canKitchenOnly = canViewKds
    && !canRingSales
    && !canAccessOps
    && !canViewShiftHistory
    && !canViewActiveOrders;
  const canCreatePurchaseRequest = hasPosPermission(staffPermissions, "purchase_requests.create");
  const canViewOwnPurchaseRequests = hasPosPermission(staffPermissions, "purchase_requests.view_own");
  const canBuyAssigned = hasPosPermission(staffPermissions, "purchase_requests.buy");
  const canKitchenReceive = hasPosPermission(staffPermissions, "kitchen.receiving.view");
  const canManageEvents = hasPosPermission(staffPermissions, "events.manage");
  const [kitchenHandoverSettings, setKitchenHandoverSettings] = useState<KitchenHandoverSettings | null>(null);
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
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
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
  const [showRequestItemModal, setShowRequestItemModal] = useState(false);
  const [kitchenPane, setKitchenPane] = useState<"home" | "my_requests" | "buying_list">("home");
  const [showCharge, setShowCharge] = useState(false);
  const [chargeCreditAvailable, setChargeCreditAvailable] = useState(0);
  const [chargeCreditEligible, setChargeCreditEligible] = useState(false);
  const [chargeWalletAvailable, setChargeWalletAvailable] = useState(0);
  const [chargeWalletEligible, setChargeWalletEligible] = useState(false);
  // FIX 8 — timestamp of the last successful credit summary fetch for
  // the currently-attached customer. Bumped whenever the Charge overlay
  // opens, the cashier taps the Credit Account tender, or a
  // credit-limit rejection forces a re-fetch. Rendered by the overlay
  // as an "as of just now / N min ago" pill so the cashier can tell
  // the banner is fresh.
  const [chargeCreditRefreshedAt, setChargeCreditRefreshedAt] = useState<number | null>(null);
  const [showSaveTicket, setShowSaveTicket] = useState(false);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [openShiftBusy, setOpenShiftBusy] = useState(false);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const [openTicketsCritical, setOpenTicketsCritical] = useState(false);
  /** After a paid dine-in/takeaway sale, jump to Receipts with this order selected. */
  const [receiptsFocusOrderId, setReceiptsFocusOrderId] = useState<number | null>(null);
  /** After a paid sale, show receipt print/SMS actions until dismissed. */
  const [receiptBanner, setReceiptBanner] = useState<{
    orderId: number;
    customerPhone: string | null;
    paidOnCredit: boolean;
    creditNote?: string | null;
    /**
     * FIX 9e — post-settle credit balance in MVR when the payments
     * response echoed one. Rendered on the receipt banner as
     * "balance now MVR X" so the cashier can relay the fresh owed
     * amount without pulling up the customer panel. Null = the
     * backend didn't return it (older builds or non-credit orders).
     */
    creditBalanceMvr?: number | null;
  } | null>(null);
  const [deviceBlockedMessage, setDeviceBlockedMessage] = useState<string | null>(null);

  const onlineOrderWatcher = useOnlineOrderWatcher(
    isLoggedIn && !isLocked && canViewActiveOrders,
  );

  // ── Tables / order type ─────────────────────────────────────────────────────
  // Dine-in is the most common ticket type for an in-store cashier
  // (someone walks up, picks a table, orders), so we default there.
  // Cashiers can flip to Takeaway / Pickup with the segmented control
  // at the top of the cart.
  const [orderType, setOrderType] = useState<PosOrderType>("Dine-in");
  const [deliveryDetails, setDeliveryDetails] = useState<PosDeliveryDetails>(EMPTY_DELIVERY_DETAILS);
  const [customerAddresses, setCustomerAddresses] = useState<PosCustomerAddress[]>([]);
  const [selectedDeliveryAddressId, setSelectedDeliveryAddressId] = useState<number | "manual">("manual");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  /** Forced packaging picker after cashier switches to an eligible order type. */
  const [packagingPickerLines, setPackagingPickerLines] = useState<PackagingPickerLine[] | null>(null);
  // Owner-curated quick-note chip library (e.g. "No salt", "Extra
  // spicy"). Loaded once after login from the public site-settings
  // endpoint. Empty array hides the per-line Note button.
  const [quickNotes, setQuickNotes] = useState<string[]>([]);
  const [smsNotifications, setSmsNotifications] = useState<PosSmsNotifications>(DEFAULT_POS_SMS_NOTIFICATIONS);
  const [discountControls, setDiscountControls] = useState<PosDiscountControls>(DEFAULT_POS_DISCOUNT_CONTROLS);
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
  const canUseNonOrderFeatures = canAccessOps || canViewShiftHistory;
  const canEnterPosShell = !!shift.current || canUseNonOrderFeatures;
  const shiftOpen = !!shift.current;
  const menu = useMenu(isLoggedIn, orderType, isReachable, shift.seedFromBootstrap, setSmsNotifications, setDiscountControls);
  const cart = useCart(orderType);

  /**
   * Cashier-facing order-type change. Reconciles packaging on cart lines
   * (strip for dine-in; auto-apply / forced picker for eligible types).
   * Resume/load/offline paths must keep using raw `setOrderType`.
   */
  const handleOrderTypeToggle = useCallback((next: PosOrderType) => {
    setOrderType(next);
    const result = reconcileCartPackagingForOrderTypeToggle(next, cart.cartItems, menu.items);
    cart.setCartItems(result.items);
    setPackagingPickerLines(result.needsPicker.length > 0 ? result.needsPicker : null);
  }, [cart.cartItems, cart.setCartItems, menu.items]);

  const handlePackagingReconcileConfirm = useCallback((selections: Record<string, number>) => {
    const menuById = new Map(menu.items.map((i) => [i.id, i]));
    cart.setCartItems((prev) => applyPackagingPickerSelections(prev, selections, menuById));
    setPackagingPickerLines(null);
  }, [cart.setCartItems, menu.items]);

  // When switching to Delivery (or attaching a customer mid-ticket),
  // copy name/phone into the delivery contact fields if still blank.
  useEffect(() => {
    if (orderType !== "Delivery" || !cart.attachedCustomer) return;
    setDeliveryDetails((prev) => resolveDeliveryDetails(prev, cart.attachedCustomer));
  }, [orderType, cart.attachedCustomer?.id, cart.attachedCustomer?.name, cart.attachedCustomer?.phone]);

  useEffect(() => {
    const customerId = cart.attachedCustomer?.id;
    if (orderType !== "Delivery" || !customerId) {
      setCustomerAddresses([]);
      setSelectedDeliveryAddressId("manual");
      return;
    }
    let cancelled = false;
    fetchCustomerAddresses(customerId)
      .then((res) => {
        if (cancelled) return;
        const list = res.addresses ?? [];
        setCustomerAddresses(list);
        const defaultAddr = list.find((a) => a.is_default) ?? list[0];
        if (defaultAddr) {
          setSelectedDeliveryAddressId(defaultAddr.id);
          setDeliveryDetails((prev) => (
            prev.addressLine1.trim()
              ? resolveDeliveryDetails(prev, cart.attachedCustomer)
              : savedAddressToDeliveryDetails(defaultAddr, cart.attachedCustomer)
          ));
        } else {
          setSelectedDeliveryAddressId("manual");
        }
      })
      .catch(() => {
        if (!cancelled) setCustomerAddresses([]);
      });
    return () => { cancelled = true; };
  }, [orderType, cart.attachedCustomer?.id]);

  const applyPosDeliveryAddress = useCallback((id: number | "manual") => {
    setSelectedDeliveryAddressId(id);
    if (id === "manual") return;
    const addr = customerAddresses.find((a) => a.id === id);
    if (addr) {
      setDeliveryDetails(savedAddressToDeliveryDetails(addr, cart.attachedCustomer));
    }
  }, [customerAddresses, cart.attachedCustomer]);

  const handleClearCart = useCallback(() => {
    cart.clearCart();
    setDeliveryDetails(EMPTY_DELIVERY_DETAILS);
    setCustomerAddresses([]);
    setSelectedDeliveryAddressId("manual");
    // Drop sticky seat selection — otherwise the next Save ticket
    // pre-fills "Table 1" (etc.) for every new order and Active Orders
    // all look like the same table.
    setSelectedTableId(null);
  }, [cart]);

  const [deliveryFeeEst, setDeliveryFeeEst] = useState(0);
  const [deliveryFeeSettings, setDeliveryFeeSettings] = useState<{
    freeThresholdMvr: number;
    defaultFeeMvr: number;
    zoneFeesMvr: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicSiteSettings()
      .then((settings) => {
        if (cancelled) return;
        let zoneFeesMvr: Record<string, number> = {};
        try {
          const raw = settings.delivery_zone_fees;
          if (raw) {
            const parsed = JSON.parse(raw) as Record<string, number>;
            if (parsed && typeof parsed === "object") zoneFeesMvr = parsed;
          }
        } catch { /* keep empty — estimate uses defaults */ }
        const free = parseFloat(settings.delivery_free_threshold ?? "");
        const def = parseFloat(settings.delivery_default_fee ?? "");
        setDeliveryFeeSettings({
          freeThresholdMvr: Number.isFinite(free) && free > 0 ? free : 200,
          defaultFeeMvr: Number.isFinite(def) && def >= 0 ? def : 30,
          zoneFeesMvr,
        });
      })
      .catch(() => { /* estimate keeps built-in defaults */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (orderType !== "Delivery") {
      setDeliveryFeeEst(0);
      return;
    }
    let cancelled = false;
    // Free-delivery threshold uses discounted merchandise (matches OrderTotalsCalculator).
    const feeBaseMvr = cart.discountedSubtotal;
    const feeBaseLaar = Math.round(feeBaseMvr * 100);
    const island = deliveryDetails.island.trim() || "Male";
    const fallback = estimateDeliveryFeeMvr(island, feeBaseMvr, deliveryFeeSettings ?? undefined);

    void previewDeliveryFeeMvr(island, feeBaseLaar).then((fee) => {
      // null = API failed; 0 = free delivery (valid).
      if (!cancelled) setDeliveryFeeEst(fee ?? fallback);
    });

    return () => { cancelled = true; };
  }, [orderType, deliveryDetails.island, cart.discountedSubtotal, deliveryFeeSettings]);

  const ops  = useOps(isLoggedIn, pane === "ops" ? "ops" : "pos");

  const refreshOfflineCounts = useCallback(async () => {
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
    if (!isLoggedIn) return;
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
    void evaluateOfflineGate({ requireShift: canRingSales }).then(setOfflineGate);
  }, [isLoggedIn, isReachable, menu.isLoading, shift.loading, canRingSales]);

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
      (ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes, ci.packaging_option_id) === notePickerKey,
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
      const { count, rows } = await fetchActiveOrdersBadgeSample();
      setOpenTicketsCount(count);
      setOpenTicketsCritical(rows.some((t) => {
        const stage = ticketStage(t);
        return ticketAgeLevel(ticketAgeAnchor(t, stage), stage) === "critical";
      }));
    } catch { /* best-effort */ }
  }, [isLoggedIn]);

  // Badge used to wait 5s so menu/shift could win the network — after a
  // POS update that left Active Orders blank for several seconds. Fetch
  // immediately, then poll; also refresh when returning to the tab.
  useEffect(() => {
    if (!isLoggedIn) return;
    void refreshOpenTickets();
    const poll = window.setInterval(() => { void refreshOpenTickets(); }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshOpenTickets();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshOpenTickets, shift.current?.id, isLoggedIn]);

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

  useEffect(() => {
    if (!isLoggedIn || !canKitchenReceive) return;
    void fetchKitchenHandoverSettings()
      .then((res) => setKitchenHandoverSettings(res.settings))
      .catch(() => undefined);
  }, [isLoggedIn, canKitchenReceive]);

  const order = useOrderCreation({
    isOnline,
    isReachable,
    deviceId,
    shiftId: shift.current?.id ?? null,
    orderType,
    selectedTableId,
    deliveryDetails,
    setDeliveryDetails,
    cartItems:     cart.cartItems,
    cartTotal:     cart.cartTotal,
    cartPackagingFee: cart.cartPackagingFee,
    cartSubtotal:  cart.cartSubtotal,
    cartTax:       cart.cartTax,
    payments:      cart.payments,
    discountAmount: cart.discountAmount,
    discountReason: cart.discountReason,
    discountReasonNote: cart.discountReasonNote,
    discountControls,
    customerId:    cart.attachedCustomer?.id ?? null,
    customerName:  cart.attachedCustomer?.name ?? null,
    customerPhone: cart.attachedCustomer?.phone ?? null,
    appliedPromoCode:     cart.appliedPromo?.code ?? null,
    appliedLoyaltyPoints: cart.appliedLoyalty?.points ?? null,
    appliedGiftCardCode:  cart.appliedGiftCard?.code ?? null,
    appliedPromoServerApplied: cart.appliedPromo?.serverApplied === true,
    appliedLoyaltyServerApplied: cart.appliedLoyalty?.serverApplied === true,
    appliedGiftCardServerApplied: cart.appliedGiftCard?.serverApplied === true,
    clearCart:        handleClearCart,
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
    onOrderSettled: (orderId, _customerId, customerPhone, _orderType, paidOnCredit, creditNote, creditBalanceMvr) => {
      void refreshOpenTickets();
      void refreshTables();
      void shift.refreshSummary();
      setReceiptBanner({
        orderId,
        customerPhone: customerPhone ?? null,
        paidOnCredit: !!paidOnCredit,
        creditNote: creditNote ?? null,
        creditBalanceMvr: typeof creditBalanceMvr === "number" ? creditBalanceMvr : null,
      });
      setPane("sales");
    },
  });

  const chargeTotal = useMemo(() => {
    if (order.pendingPaymentForOrderId != null && order.pendingPaymentTotalDue != null) {
      return order.pendingPaymentTotalDue;
    }
    // Paid/view-only resume: prefer server grand total − gift tender.
    // Editable resumes use live cart math so Charge matches the cart.
    if (order.resumedOrderId !== null && !order.isEditingActive) {
      const gift = cart.appliedGiftCard?.discount ?? 0;
      const serverGrand = order.resumedOrderTotal;
      if (serverGrand != null) {
        return Math.round(Math.max(0, serverGrand - gift) * 100) / 100;
      }
      return cart.cartTotal;
    }
    if (orderType === "Delivery" && deliveryFeeEst > 0) {
      return Math.round((cart.cartTotal + deliveryFeeEst) * 100) / 100;
    }
    return cart.cartTotal;
  }, [
    order.pendingPaymentForOrderId,
    order.pendingPaymentTotalDue,
    order.resumedOrderId,
    order.resumedOrderTotal,
    order.isEditingActive,
    orderType,
    deliveryFeeEst,
    cart.cartTotal,
    cart.appliedGiftCard?.discount,
  ]);

  const handleAttachCustomer = useCallback(async (customer: PosCustomer) => {
    cart.setAttachedCustomer(customer);
    if (orderType === "Delivery") {
      setDeliveryDetails((prev) => resolveDeliveryDetails(prev, customer));
    }
    if (order.resumedOrderId == null) return;
    try {
      await updateOrderCustomer(order.resumedOrderId, customer.id);
    } catch (e) {
      order.flashError((e as Error).message || "Couldn't save customer on this order.");
    }
  }, [cart, order, orderType]);

  const handleDetachCustomer = useCallback(async () => {
    cart.detachCustomer();
    if (order.resumedOrderId == null) return;
    try {
      await updateOrderCustomer(order.resumedOrderId, null);
    } catch (e) {
      order.flashError((e as Error).message || "Couldn't remove customer from this order.");
    }
  }, [cart, order]);

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

  /**
   * FIX 8 — pluggable credit/deposit summary refresh. Called from three
   * places:
   *   1. The Charge overlay opens (existing behaviour).
   *   2. Cashier taps the Credit Account tender inside the overlay.
   *   3. A settle attempt is rejected on the credit rail — we re-poll
   *      so the banner shows the live available balance the moment
   *      the cashier reads the error.
   *
   * Bumps `chargeCreditRefreshedAt` on success so the overlay can echo
   * an "as of just now" indicator. Returns nothing — it's fire-and-
   * forget from the callers' perspective.
   */
  const refreshChargeCreditSummary = useCallback(async () => {
    const customer = cart.attachedCustomer;
    if (!customer) {
      setChargeCreditEligible(false);
      setChargeCreditAvailable(0);
      setChargeWalletEligible(false);
      setChargeWalletAvailable(0);
      setChargeCreditRefreshedAt(null);
      return;
    }
    try {
      const summary = await fetchCustomerSummary(customer.id);
      const credit = summary.credit;
      if (canUseCredit) {
        setChargeCreditEligible(Boolean(credit?.can_charge));
        setChargeCreditAvailable((credit?.available_laar ?? 0) / 100);
      } else {
        setChargeCreditEligible(false);
        setChargeCreditAvailable(0);
      }
      const deposit = summary.deposit;
      const balanceMvr = (deposit?.balance_laar ?? 0) / 100;
      if (canUseWallet && deposit?.status === 'active' && balanceMvr > 0) {
        setChargeWalletEligible(Boolean(deposit.can_use));
        setChargeWalletAvailable(balanceMvr);
      } else {
        setChargeWalletEligible(false);
        setChargeWalletAvailable(0);
      }
      setChargeCreditRefreshedAt(Date.now());
    } catch {
      setChargeCreditEligible(false);
      setChargeCreditAvailable(0);
      setChargeWalletEligible(false);
      setChargeWalletAvailable(0);
    }
  }, [cart.attachedCustomer, canUseCredit, canUseWallet]);

  useEffect(() => {
    if (!showCharge || !cart.attachedCustomer) {
      setChargeCreditEligible(false);
      setChargeCreditAvailable(0);
      setChargeWalletEligible(false);
      setChargeWalletAvailable(0);
      setChargeCreditRefreshedAt(null);
      return;
    }
    void refreshChargeCreditSummary();
  }, [showCharge, cart.attachedCustomer?.id, canUseCredit, canUseWallet, refreshChargeCreditSummary]);

  // Keep floor occupancy fresh across terminals (Save / Charge / Close).
  useEffect(() => {
    if (!isLoggedIn) return;
    void refreshTables();
    const poll = window.setInterval(() => { void refreshTables(); }, 20_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshTables();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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

  const checkDeviceStatus = useCallback(async () => {
    try {
      const status = await selfDeviceStatus(deviceId);
      if (status.is_active === false) {
        setDeviceBlockedMessage("This POS device is disabled. Contact the owner to re-enable it.");
      } else {
        setDeviceBlockedMessage(null);
        if (status.id) persistDeviceDbId(status.id);
      }
    } catch {
      /* best-effort — sales may still work if device was previously registered */
    }
  }, [deviceId, persistDeviceDbId]);

  // Fire-and-forget device audit registration — never blocks sales.
  useEffect(() => {
    if (!isLoggedIn) return;
    const handle = window.setTimeout(() => {
      void selfRegisterDevice(deviceId, `POS ${deviceId}`)
        .then((res) => {
          if (res.device?.id) persistDeviceDbId(res.device.id);
        })
        .catch(() => { /* optional audit metadata */ });
      void checkDeviceStatus();
    }, 6000);
    return () => window.clearTimeout(handle);
  }, [isLoggedIn, deviceId, persistDeviceDbId, checkDeviceStatus]);

  const completeStaffLogin = useCallback((response: StaffLoginResponse) => {
    localStorage.setItem("pos_token", response.token);
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
    void checkDeviceStatus();
  }, [username, checkDeviceStatus]);

  // ── Login handler ───────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setAuthError("");
    if (!username.trim()) { setAuthError("Enter your mobile or email."); return; }
    if (pin.trim().length < 4) { setAuthError("Enter a valid PIN."); return; }
    try {
      const response = await staffLogin(username.trim(), pin.trim(), deviceId.trim());
      completeStaffLogin(response);
    } catch (e) {
      setAuthError(e instanceof ApiRequestError ? e.message : "Login failed. Check your mobile/email and PIN.");
    }
  };

  const handlePasswordLogin = async (password: string) => {
    setAuthError("");
    if (!username.trim()) { setAuthError("Enter your mobile or email."); return; }
    if (password.length < 6) { setAuthError("Enter your admin password."); return; }
    try {
      const response = await staffPasswordLogin(username.trim(), password, deviceId.trim());
      completeStaffLogin(response);
    } catch (e) {
      setAuthError(e instanceof ApiRequestError ? e.message : "Login failed. Check your mobile/email and password.");
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
    if (canRingSales) setPane("sales");
    else if (canAccessOps) setPane("ops");
    else if (canViewShiftHistory) setPane("shift_history");
    else setPane("shift");
  };
  const handleSaveTicketSubmit = async (name: string, note: string | undefined, fireToKitchen: boolean) => {
    try {
      await order.handleSaveTicket(name, note, fireToKitchen);
      setShowSaveTicket(false);
      void refreshOpenTickets();
      void refreshTables();
    } catch {
      /* handleSaveTicket already surfaced the error banner */
    }
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
    if (!isLoggedIn || !canLockScreen) return;
    setShowCharge(false);
    setShowSendBill(false);
    setShowSaveTicket(false);
    setShowOpenShift(false);
    setShowCloseShift(false);
    setIsLocked(true);
  }, [isLoggedIn, canLockScreen]);

  // ── Auto-lock on inactivity ─────────────────────────────────────
  // Per-staff minutes from admin → My Account (default 5). 0 = never.
  // Paused while any blocking modal is open.
  const isAnyModalOpen = showCharge || showSendBill || showSaveTicket || showOpenShift || showCloseShift || showPreferences;
  useIdleLock({
    enabled: isLoggedIn && canLockScreen && !isLocked && !showTimeClock && !isAnyModalOpen && idleLockMinutes > 0,
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l" && canLockScreen) {
        e.preventDefault();
        lockScreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLoggedIn, isLocked, lockScreen, canLockScreen]);

  const drawerItems = useMemo(() => {
    const main: Array<{ id: string; label: string; icon: string; group: "main"; badge?: string; badgeCritical?: boolean; disabled?: boolean }> = [];
    if (canRingSales && shiftOpen) main.push({ id: "sales", label: "Sales", icon: "🛒", group: "main" });
    if (canViewReceipts && shiftOpen) main.push({ id: "receipts", label: "Receipts", icon: "🧾", group: "main" });
    if (canViewActiveOrders && shiftOpen) {
      main.push({
        id: "open_tickets", label: "Active Orders", icon: "🎫", group: "main",
        badge: openTicketsCount > 0 ? String(openTicketsCount) : undefined,
        badgeCritical: openTicketsCritical,
      });
    }
    // Events tab is always visible once logged in — independent of shift state.
    main.push({ id: "events", label: "Events", icon: "📅", group: "main" });
    if (shiftOpen || canOpenShift || canCloseShift) {
      main.push({ id: "shift", label: shiftOpen ? "Current Shift" : "Shift", icon: "💰", group: "main" });
    }
    if (canViewShiftHistory) main.push({ id: "shift_history", label: "Shift History", icon: "📚", group: "main" });
    if (canViewReports) main.push({ id: "sales_report", label: "Sales reports", icon: "📊", group: "main" });
    if (canAccessOps) main.push({ id: "ops", label: "Operations", icon: "🛠", group: "main" });
    if (canManageExpenses) main.push({ id: "expenses", label: "Expenses", icon: "💸", group: "main" });
    if (canCreatePurchaseRequest) main.push({ id: "request_item", label: "Request items", icon: "🛒", group: "main" });
    if (canViewOwnPurchaseRequests) main.push({ id: "my_requests", label: "My requests", icon: "📋", group: "main" });
    if (canBuyAssigned) main.push({ id: "buying_list", label: "Buying list", icon: "✅", group: "main" });
    if (canKitchenReceive && shiftOpen) main.push({ id: "kitchen_receiving", label: "Kitchen receive", icon: "🍳", group: "main" });

    const user: Array<{ id: string; label: string; icon: string; group: "user" }> = [];
    if (!shiftOpen && canOpenShift) {
      user.push({ id: "open_shift", label: "Open shift", icon: "💰", group: "user" });
    }
    if (shiftOpen && canCloseShift) {
      user.push({ id: "close_shift", label: "Close shift", icon: "🔒", group: "user" });
    }
    user.push(
      { id: "refresh_menu", label: "Refresh data", icon: "↻", group: "user" },
      { id: "check_update", label: "Update app", icon: "⬇", group: "user" },
      { id: "preferences", label: "My settings", icon: "⚙️", group: "user" },
    );
    if (canLockScreen) user.push({ id: "lock", label: "Lock screen", icon: "🔒", group: "user" });
    user.push({ id: "logout", label: "Log out", icon: "↩", group: "user" });
    return [...main, ...user];
  }, [
    canRingSales, canViewReceipts, canViewActiveOrders, canViewShiftHistory, canViewReports, canAccessOps,
    canManageExpenses, canCreatePurchaseRequest, canViewOwnPurchaseRequests, canBuyAssigned, canKitchenReceive,
    canLockScreen, canOpenShift, canCloseShift, shiftOpen, openTicketsCount, openTicketsCritical,
  ]);

  const paneAllowed = useMemo((): Record<Pane, boolean> => ({
    sales: canRingSales && shiftOpen,
    receipts: canViewReceipts && shiftOpen,
    open_tickets: canViewActiveOrders && shiftOpen,
    events: true,
    shift: shiftOpen || canOpenShift || canCloseShift,
    shift_history: canViewShiftHistory,
    sales_report: canViewReports,
    ops: canAccessOps,
    expenses: canManageExpenses,
    my_requests: canViewOwnPurchaseRequests,
    buying_list: canBuyAssigned,
    kitchen_receiving: canKitchenReceive && shiftOpen,
  }), [
    canRingSales, canViewReceipts, canViewActiveOrders, canViewShiftHistory, canViewReports,
    canAccessOps, canManageExpenses, canOpenShift, canCloseShift, shiftOpen,
    canViewOwnPurchaseRequests, canBuyAssigned, canKitchenReceive,
  ]);

  useEffect(() => {
    if (paneAllowed[pane]) return;
    const fallback = (Object.keys(paneAllowed) as Pane[]).find((p) => paneAllowed[p]);
    if (fallback) setPane(fallback);
  }, [pane, paneAllowed]);

  return {
    isLoggedIn, username, setUsername, pin, setPin, cashierName, staffPermissions,
    canVoidOrders, canOpenShift, canCloseShift, canRingSales, canHoldResume,
    canViewActiveOrders, canViewReceipts, canViewShiftHistory, canViewReports, canManageExpenses,
    canCashInOut, canLockScreen,
    canOpsInventory, canOpsPreparedStock,
    canUseCredit, canUseWallet, canPayCash, canPayCard, canPaySplit, canApplyDiscount,
    canUseRewards, canRefund, canRequestRefund, canApproveRefund, canSendBill, canSendPayLink, canManageOrderStatus, canTimeClock,
    canViewKds, canAccessOps, canKitchenOnly, canCreatePurchaseRequest, canViewOwnPurchaseRequests,
    canBuyAssigned, canKitchenReceive, canManageEvents, kitchenHandoverSettings, idleLockMinutes, setIdleLockMinutes, deviceId,
    deviceDbId, authError, showTimeClock, setShowTimeClock, isLocked, pane, setPane,
    drawerOpen, setDrawerOpen, showPreferences, setShowPreferences, connectivity, isOnline,
    isReachable, offlineQueueCount, offlinePendingCount, offlinePendingTotals,
    showOfflineSyncPanel, setShowOfflineSyncPanel, offlineGate, setOfflineGate,
    showSendBill, setShowSendBill, showRequestItemModal, setShowRequestItemModal,
    kitchenPane, setKitchenPane, showCharge, setShowCharge, chargeCreditAvailable,
    chargeCreditEligible, chargeCreditRefreshedAt, refreshChargeCreditSummary,
    chargeWalletAvailable, chargeWalletEligible, showSaveTicket,
    setShowSaveTicket, showOpenShift, setShowOpenShift, showCloseShift, setShowCloseShift,
    openShiftBusy, openTicketsCount, openTicketsCritical, receiptsFocusOrderId, setReceiptsFocusOrderId,
    receiptBanner, setReceiptBanner, deviceBlockedMessage, onlineOrderWatcher,
    orderType, setOrderType, handleOrderTypeToggle, packagingPickerLines, handlePackagingReconcileConfirm,
    deliveryDetails, setDeliveryDetails, customerAddresses,
    selectedDeliveryAddressId, setSelectedDeliveryAddressId, tables, selectedTableId, setSelectedTableId, quickNotes,
    smsNotifications, discountControls, notePickerKey, setNotePickerKey, shift, canUseNonOrderFeatures,
    canEnterPosShell, shiftOpen, menu, cart, applyPosDeliveryAddress, handleClearCart,
    deliveryFeeEst, ops, refreshOfflineCounts, filteredItems, refreshOpenTickets, order,
    chargeTotal, handleAttachCustomer, handleDetachCustomer, posUpdate, refreshTables,
    refreshQuickNotes, isRefreshingAll, refreshAll, checkDeviceStatus, handleLogin, handlePasswordLogin,
    handleLogout, handleOpenShift, handleCloseShift, handleSaveTicketSubmit, handleUnlock,
    lockScreen, drawerItems, paneAllowed, persistDeviceDbId,
  };
}
