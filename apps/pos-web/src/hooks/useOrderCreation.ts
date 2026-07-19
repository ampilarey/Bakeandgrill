import { useRef, useState, useCallback, useEffect } from "react";
import { ApiRequestError } from "@shared/api";
import {
  applyGiftCardToOrder,
  applyPromoToOrder,
  createDeliveryOrder,
  createOrder,
  createOrderPayments,
  fireOrderToKitchen,
  getOrder,
  holdLoyaltyForOrder,
  holdOrder,
  lookupBarcode,
  releaseLoyaltyHold,
  removeGiftCardFromOrder,
  resumeOrder,
  updateOrderItems,
} from "../api";
import {
  countPendingOfflineOrders,
  initOfflineDb,
  loadCachedShift,
  MAX_OFFLINE_ORDERS,
  saveOfflineOrder,
  type OfflineOrderRecord,
} from "../offline/db";
import { allocateOfflineOrderNumber } from "../offline/offlineOrderNumber";
import { runOfflineSync } from "../offline/syncEngine";
import type { CartItem, Item } from "../types";
import type { PaymentRow } from "./useCart";
import type { PosCustomer } from "../api";
import type { PosDeliveryDetails, PosOrderType } from "../orderTypes";
import { normalizeMvPhone, resolveDeliveryDetails, validateDeliveryDetails } from "../orderTypes";
import { applyStagedRewards as applyStagedRewardsUtil } from "../utils/applyStagedRewards";

type OrderType = PosOrderType;

const mapOrderType = (type: OrderType): "dine_in" | "takeaway" | "online_pickup" | "delivery" => {
  if (type === "Dine-in") return "dine_in";
  if (type === "Pickup") return "online_pickup";
  if (type === "Delivery") return "delivery";
  return "takeaway";
};

/**
 * Payment row sent to the server: strings are parsed into numbers and any
 * row without a positive amount is dropped. The remainder (if any) is
 * collected in `cash` by the checkout flow so the order is always settled.
 */
function mapChargeMethodToOffline(method: string): OfflineOrderRecord["payment"]["method"] | null {
  if (method === "cash") return "cash";
  if (method === "card" || method === "card_pos") return "card";
  if (method === "qr") return "qr";
  if (method === "digital_wallet" || method === "bank_transfer") return "bank_transfer";
  return null;
}

function newLocalOrderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function lineUnitPrice(item: CartItem): number {
  return item.price + (item.modifiers ?? []).reduce((sum, m) => sum + (m.price ?? 0), 0);
}

/** Map POS ChargeOverlay methods to backend payment method whitelist. */
function mapPaymentMethodForApi(method: string): string {
  if (method === "digital_wallet") return "bank_transfer";
  return method;
}

function normalizePayments(rows: PaymentRow[]): { method: string; amount: number }[] {
  return rows
    .map((p) => ({
      method: mapPaymentMethodForApi(p.method),
      amount: Number.parseFloat(p.amount),
    }))
    .filter((p) => Number.isFinite(p.amount) && p.amount > 0);
}

/**
 * Stable fingerprint of a cart for "did anything kitchen-relevant
 * actually change?" comparisons. Encodes everything the line cooks
 * would see on the chit: item id, variant, quantity, modifier set,
 * and per-line notes. Deliberately ignores prices and per-line
 * totals (price changes that don't alter what the cook sees don't
 * warrant a reprint).
 *
 * Item order within the array is normalised by sorting the per-
 * line strings before joining, so reshuffling lines in the cart
 * (e.g. removing then re-adding the same item) doesn't trigger a
 * spurious reprint.
 */
function cartFingerprint(items: CartItem[]): string {
  return items
    .map((it) => {
      const mods = (it.modifiers ?? [])
        .map((m) => `${m.id ?? 0}:${m.name ?? ""}`)
        .sort()
        .join(",");
      const notes = Array.isArray(it.notes)
        ? [...it.notes].sort().join("|")
        : (it.notes as unknown as string | undefined) ?? "";
      return `${it.id || 0}|${it.variant_id ?? 0}|q${it.quantity}|m${mods}|n${notes}`;
    })
    .sort()
    .join(";");
}

type Params = {
  isOnline: boolean;
  /** True when the API health ping succeeds — drives offline sales + sync. */
  isReachable: boolean;
  deviceId: string;
  shiftId: number | null;
  orderType: OrderType;
  selectedTableId: number | null;
  deliveryDetails?: PosDeliveryDetails;
  setDeliveryDetails?: (d: PosDeliveryDetails) => void;
  cartItems: CartItem[];
  cartTotal: number;
  cartSubtotal: number;
  cartTax: number;
  cartPackagingFee?: number;
  payments: PaymentRow[];
  discountAmount: string;
  customerId: number | null;
  /** Attached customer — used to prefill delivery contact when fields are blank. */
  customerName: string | null;
  /** Captured at charge time so the post-charge banner can show
   *  "SMS sent to {phone}" / Resend without re-fetching the customer
   *  (the cart's attachedCustomer gets cleared right after settle). */
  customerPhone: string | null;
  /** Customer-rewards staged on the ticket. Each one is applied
   *  server-side AFTER createOrder but BEFORE settleOrder so the
   *  order's stored `total` matches the Charge button. Cashier picks
   *  these from the Rewards panel in OrderCart. Optional — when null
   *  the order is created and settled exactly as before. */
  appliedPromoCode: string | null;
  appliedLoyaltyPoints: number | null;
  appliedGiftCardCode: string | null;
  /** When true, reward was hydrated from a resumed server order — skip re-apply. */
  appliedPromoServerApplied?: boolean;
  appliedLoyaltyServerApplied?: boolean;
  appliedGiftCardServerApplied?: boolean;
  clearCart: () => void;
  setCartItems: (items: CartItem[]) => void;
  setSelectedItem: (item: Item | null) => void;
  setOfflineQueueCount: (n: number) => void;
  /** Resume-time setters. handleResumeTicket calls these so the
   *  restored ticket lands back in the cashier UI with the same
   *  customer/order-type/table the ticket was held with — otherwise
   *  the resumed bill SMS goes nowhere and the Charge step silently
   *  re-routes a Dine-in ticket to the default (currently Dine-in).
   *  Optional so callers that haven't wired the setters yet still
   *  type-check; resume just won't restore those fields. */
  setAttachedCustomer?: (c: PosCustomer | null) => void;
  setOrderType?: (t: OrderType) => void;
  setSelectedTableId?: (id: number | null) => void;
  /** Resume hydration setters — repaint the rewards/discount rows in
   *  the cart sidebar so the cashier sees the same discount lines on
   *  the resumed ticket that were visible when it was held. Without
   *  these, the resumed cart subtotal showed gross + the Charge button
   *  used the server total — visually disagreeing with the rewards
   *  the customer thought they had. Optional (callers that haven't
   *  wired the setters yet just skip the hydration). */
  setDiscountAmount?: (s: string) => void;
  setAppliedPromo?: (p: {
    code: string;
    promotionId: number | null;
    discount: number;
    serverApplied?: boolean;
  } | null) => void;
  setAppliedLoyalty?: (l: {
    points: number;
    discount: number;
    serverApplied?: boolean;
  } | null) => void;
  setAppliedGiftCard?: (g: {
    code: string;
    discount: number;
    cardBalance: number;
    heldBalance?: number;
    serverApplied?: boolean;
  } | null) => void;
  onOrderSettled?: (
    orderId: number,
    customerId: number | null,
    customerPhone: string | null,
    orderType?: string | null,
    paidOnCredit?: boolean,
  ) => void;
};

export function useOrderCreation(params: Params) {
  const [statusMessage, setStatusMessage] = useState("");
  const statusTimerRef = useRef<number | null>(null);

  const clearStatus = useCallback(() => {
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    setStatusMessage("");
  }, []);

  /** Top banner — errors and offline/sync only. Routine successes use inline UI. */
  const flashStatus = useCallback((msg: string, ms: number) => {
    clearStatus();
    setStatusMessage(msg);
    statusTimerRef.current = window.setTimeout(clearStatus, ms);
  }, [clearStatus]);

  const flashError = useCallback((msg: string) => flashStatus(msg, 8000), [flashStatus]);
  const flashNotice = useCallback((msg: string) => flashStatus(msg, 3500), [flashStatus]);

  useEffect(() => () => {
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastHeldOrderId, setLastHeldOrderId] = useState<number | null>(() => {
    const raw = localStorage.getItem("pos_last_held_order");
    return raw ? Number(raw) : null;
  });
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState<number | null>(null);
  const [barcode, setBarcodeState] = useState("");
  // Mirror barcode in a ref so the async lookupBarcode resolver
  // (Bug-030) can read the LATEST value, not the closure-captured
  // value from when handleBarcodeSubmit was called. Without the
  // ref the `barcode.trim() !== scannedFor` guard always passed
  // (because `barcode` IS `scannedFor` in that closure), and an
  // out-of-order resolve from a previous scan could add the
  // wrong item.
  const barcodeRef = useRef("");
  const setBarcode = (value: string) => {
    barcodeRef.current = value;
    setBarcodeState(value);
  };
  // When createOrder succeeds but payment fails, we expose this so the
  // cashier can retry collecting payment for the SAME order instead of
  // unwittingly creating a duplicate.
  const [pendingPaymentForOrderId, setPendingPaymentForOrderId] = useState<number | null>(null);
  /**
   * Held ticket that was just resumed and is now sitting in the cart.
   * The cart UI is read-only while this is set, and `handleCharge`
   * settles THIS order id (no fresh `createOrder`) — without that
   * branch we were silently creating a duplicate order on every
   * resume → charge, which corrupted Sales Reports, left Open Tickets
   * showing forever-parked rows, and made the new bill SMS feature
   * reference a different order than the one actually charged.
   *
   * The cashier can exit this mode via `handleCancelResume`, which
   * re-holds the order and puts it back in Open Tickets.
   */
  const [resumedOrderId, setResumedOrderId] = useState<number | null>(null);
  /**
   * Server-side total of the resumed order, captured when we fetched it
   * via getOrder(). This is the source of truth for what to charge — the
   * local cartTotal can drift if modifier prices or item prices change
   * between hold time and resume time, and we don't want to overcharge
   * (or undercharge) the customer based on a stale local total.
   */
  const [resumedOrderTotal, setResumedOrderTotal] = useState<number | null>(null);
  // Fingerprint of the cart contents at the moment a ticket was
  // resumed for editing. Used in handleSaveActiveChanges to decide
  // whether the kitchen actually needs a reprint, vs the cashier
  // having tapped Save without changing anything (or only renaming
  // the ticket / changing the customer, which the kitchen doesn't
  // care about).
  const [resumedItemsFingerprint, setResumedItemsFingerprint] = useState<string | null>(null);
  /**
   * Snapshot of the order's status at the moment the cashier tapped
   * Resume / Charge. Cancel-resume needs it to know what to do:
   *   - "held" → re-hold the order (put it back in Open Tickets parked)
   *   - anything else → just drop the local resumed state; the order is
   *     already in flight and should not be rolled back to held (that
   *     would yank a cooking ticket off the kitchen's screen).
   */
  const [resumedFromStatus, setResumedFromStatus] = useState<string | null>(null);
  /**
   * Edit-on-tap mode flag — set when the cashier opens an active order
   * for editing (not just for charging). Allows cart edits while
   * resumed AND unlocks the "💾 Save changes" button that pushes the
   * cart's items back to the server. Cleared on cancel-resume,
   * save-changes, or successful charge.
   */
  const [isEditingActive, setIsEditingActive] = useState(false);
  /** True when the resumed ticket was already paid (e.g. online BML).
   *  Cart is view-only and Charge is blocked — cashier can inspect
   *  line items without re-settling. */
  const [resumedIsPaid, setResumedIsPaid] = useState(false);
  /** Human-friendly ticket label (BG-YYYYMMDD-NNNN) for banners. */
  const [resumedOrderLabel, setResumedOrderLabel] = useState<string | null>(null);
  /** Backend order type (online_pickup, delivery, …) for fulfillment badges. */
  const [resumedOrderType, setResumedOrderType] = useState<string | null>(null);
  /** Staff who rang the ticket — used to label POS pickup vs app online pickup. */
  const [resumedStaffUserId, setResumedStaffUserId] = useState<number | null>(null);

  const staffUserIdFromOrder = (order: { user_id?: number | null; user?: { id?: number } | null }) =>
    order.user_id ?? order.user?.id ?? null;
  /**
   * Snapshot of the totalDue AND tender rows captured when an order
   * was created but payment failed. Used by handleRetryPayment so we
   * charge the same amount and the same split-tender breakdown on
   * retry that the server already validated, regardless of any
   * subsequent cart edits or the (legacy, usually empty) cart
   * payment-row state.
   */
  const [pendingPaymentSnapshot, setPendingPaymentSnapshot] = useState<{
    orderId: number;
    totalDue: number;
    rows: PaymentRow[];
  } | null>(null);
  /** Guard so handleSyncQueue can't be entered twice concurrently. */
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  const buildPayload = (overrides: Partial<{ ticket_name: string; ticket_note: string }> = {}) => {
    const discount = Math.max(0, Number.parseFloat(params.discountAmount) || 0);
    const base = {
      print: true,
      device_identifier: params.deviceId,
      ...(params.customerId ? { customer_id: params.customerId } : {}),
      discount_amount: discount,
      ...(overrides.ticket_name ? { ticket_name: overrides.ticket_name } : {}),
      ...(overrides.ticket_note ? { ticket_note: overrides.ticket_note } : {}),
      items: params.cartItems.map((item) => ({
        item_id: item.id,
        name: item.name,
        quantity: item.quantity,
        ...(item.variant_id != null ? { variant_id: item.variant_id } : {}),
        modifiers: item.modifiers.map((m) => ({ modifier_id: m.id, name: m.name, price: m.price })),
        ...(item.notes && item.notes.length > 0
          ? { notes: item.notes.join(" · ") }
          : {}),
      })),
    };

    if (params.orderType === "Delivery") {
      const d = resolveDeliveryDetails(
        params.deliveryDetails ?? {
          addressLine1: "",
          addressLine2: "",
          island: "Male",
          contactName: "",
          contactPhone: "",
          notes: "",
          locationLink: "",
        },
        { name: params.customerName, phone: params.customerPhone },
      );
      return {
        ...base,
        delivery_address_line1: d.addressLine1.trim(),
        delivery_address_line2: d.addressLine2.trim() || undefined,
        delivery_island: d.island.trim(),
        delivery_contact_name: d.contactName.trim(),
        delivery_contact_phone: normalizeMvPhone(d.contactPhone),
        delivery_notes: d.notes.trim() || undefined,
        delivery_location_link: d.locationLink.trim() || undefined,
      };
    }

    return {
      ...base,
      type: mapOrderType(params.orderType),
      restaurant_table_id:
        params.orderType === "Dine-in" ? params.selectedTableId ?? undefined : undefined,
    };
  };

  const submitCreatedOrder = async (
    payload: ReturnType<typeof buildPayload>,
  ): Promise<{ order: { id: number; total: number } }> => {
    if (params.orderType === "Delivery") {
      return createDeliveryOrder(payload as Parameters<typeof createDeliveryOrder>[0]);
    }
    return createOrder(payload as Parameters<typeof createOrder>[0]);
  };

  /**
   * Walk through every staged customer-reward (promo code, loyalty
   * points, gift card) and tell the server to apply it to the freshly-
   * created order. Returns the most recent authoritative total so the
   * subsequent `settleOrder` call charges the actual final number.
   *
   * Failures here are non-fatal: if a promo code is unexpectedly
   * rejected at apply-time (e.g. usage cap hit between validate and
   * apply) we log it to the cashier as a status message and continue
   * with the remaining rewards. The cart staging is best-effort; the
   * order is already created and must be settled one way or another.
   */
  const applyStagedRewards = async (orderId: number, currentTotal: number): Promise<number> => {
    // Bug-050: collect every reward failure into one combined banner.
    // serverApplied rewards (hydrated on resume) are skipped — already on the order.
    const { total, failures } = await applyStagedRewardsUtil(
      orderId,
      currentTotal,
      {
        appliedPromoCode: params.appliedPromoCode,
        appliedLoyaltyPoints: params.appliedLoyaltyPoints,
        appliedGiftCardCode: params.appliedGiftCardCode,
        appliedPromoServerApplied: params.appliedPromoServerApplied,
        appliedLoyaltyServerApplied: params.appliedLoyaltyServerApplied,
        appliedGiftCardServerApplied: params.appliedGiftCardServerApplied,
      },
      {
        applyPromoToOrder,
        holdLoyaltyForOrder,
        applyGiftCardToOrder,
        removeGiftCardFromOrder,
        getOrder,
      },
      { resumedOrderId },
    );

    if (failures.length > 0) {
      flashError(
        `⚠️ ${failures.length === 1 ? "Reward failed:" : "Rewards failed:"} ${failures.join("; ")}. ` +
        `The new total is MVR ${total.toFixed(2)}. Confirm before tendering.`,
      );
    }

    return total;
  };

  const paidOnCreditFromRows = (rows: PaymentRow[]) =>
    rows.some((r) => r.method === 'house_account');

  /** Persist sale to IndexedDB V2 queue (offline or network-failure fallback). */
  const tryPersistOfflineV2 = async (
    paymentSnapshot: PaymentRow[],
    stagedRewards?: { promo_code: string | null; loyalty_points: number; gift_card_code: string | null },
  ): Promise<boolean> => {
    const rewards = stagedRewards ?? {
      promo_code: params.appliedPromoCode ?? null,
      loyalty_points: params.appliedLoyaltyPoints ?? 0,
      gift_card_code: params.appliedGiftCardCode ?? null,
    };

    if ((rewards.loyalty_points ?? 0) > 0 && !params.customerId) {
      flashError("Attach a customer before redeeming loyalty points offline.");
      return false;
    }

    // Gift cards need live available-balance / soft-hold checks. Staging a
    // discount offline can undercharge if another unpaid order holds the card.
    if (rewards.gift_card_code) {
      flashError("Gift cards require a live connection. Remove the gift card or reconnect.");
      return false;
    }

    const blocked = paymentSnapshot.some((p) => {
      const method = p.method as string;
      return method === "house_account" || method === "wallet" || method === "bml" || method === "online";
    });
    if (blocked) {
      flashError("Only cash, card, transfer, and QR are available offline.");
      return false;
    }

    const cachedShift = params.shiftId ? null : await loadCachedShift();
    const shiftId = params.shiftId ?? cachedShift?.shift_id ?? null;
    if (!shiftId) {
      flashError("No open shift cached. Open a shift while online first.");
      return false;
    }

    const primary = paymentSnapshot[0];
    const offlineMethod = primary ? mapChargeMethodToOffline(primary.method) : null;
    if (!primary || !offlineMethod) {
      flashError("Only cash, card, transfer, and QR are available offline.");
      return false;
    }

    if (paymentSnapshot.length > 1) {
      flashError("Split tender is not available offline. Use one payment method.");
      return false;
    }

    try {
      await initOfflineDb();
      const pending = await countPendingOfflineOrders(shiftId);
      if (pending >= MAX_OFFLINE_ORDERS) {
        flashError(`⛔ Offline queue full (${pending}). Reconnect and Sync.`);
        return false;
      }

      const localOrderId = newLocalOrderId();
      const localOrderNumber = await allocateOfflineOrderNumber(params.deviceId);
      const orderPayload = buildPayload();
      const record: OfflineOrderRecord = {
        local_order_id: localOrderId,
        local_order_number: localOrderNumber,
        device_identifier: params.deviceId,
        shift_id: shiftId,
        created_at_local: new Date().toISOString(),
        type: mapOrderType(params.orderType),
        items: params.cartItems.map((item) => ({
          item_id: item.id,
          quantity: item.quantity,
          ...(item.variant_id != null ? { variant_id: item.variant_id } : {}),
          unit_price: lineUnitPrice(item),
          name: item.name,
          modifiers: (item.modifiers ?? []).map((m) => ({
            modifier_id: m.id,
            name: m.name,
            price: m.price,
          })),
          ...(item.notes?.length ? { notes: item.notes.join(" · ") } : {}),
        })),
        totals: {
          subtotal: params.cartSubtotal,
          tax: params.cartTax,
          total: params.cartTotal,
          ...(params.cartPackagingFee && params.cartPackagingFee > 0
            ? { packaging: params.cartPackagingFee }
            : {}),
        },
        payment: {
          method: offlineMethod,
          amount: Number.parseFloat(primary.amount),
        },
        discount_amount: Math.max(0, Number.parseFloat(params.discountAmount) || 0),
        ...(params.customerId ? { customer_id: params.customerId } : {}),
        ...(rewards.promo_code || rewards.loyalty_points || rewards.gift_card_code
          ? { rewards }
          : {}),
        ...(orderPayload.ticket_name ? { ticket_name: String(orderPayload.ticket_name) } : {}),
        ...(orderPayload.ticket_note ? { ticket_note: String(orderPayload.ticket_note) } : {}),
        ...(params.orderType === "Dine-in" && params.selectedTableId
          ? { restaurant_table_id: params.selectedTableId }
          : {}),
        status: "pending_sync",
      };

      await saveOfflineOrder(record);
      try {
        params.setOfflineQueueCount(await countPendingOfflineOrders(shiftId));
      } catch (e) {
        console.warn("[offline] Could not refresh pending count", e);
      }
      params.clearCart();
      params.setSelectedItem(null);
      flashNotice(`Offline sale saved (${localOrderNumber}). Will sync when online.`);
      return true;
    } catch (e) {
      console.error("[offline] save failed", e);
      const detail = e instanceof Error ? e.message : "Unknown error";
      flashError(`Unable to save offline order: ${detail}`);
      return false;
    }
  };

  /**
   * Settle an already-created order with the supplied payment rows. Fills
   * any remainder with cash. Returns true on success.
   */
  const settleOrder = async (
    orderId: number,
    totalDue: number,
    paymentRows: PaymentRow[],
  ): Promise<boolean> => {
    const normalized = normalizePayments(paymentRows);
    const toLaar = (mvr: number) => Math.round(Number(mvr) * 100);
    const fromLaar = (laar: number) => laar / 100;
    const totalDueLaar = toLaar(totalDue);
    const paidTotalLaar = normalized.reduce((s, p) => s + toLaar(p.amount), 0);
    const finalPayments = normalized.map((p, index) => ({
      ...p,
      idempotency_key: `pos:pay:${orderId}:${index}:${p.method}`,
    }));
    // Zero-balance order (100% promo/loyalty/gift-card discount, or
    // an entirely complimentary ring). The server's payment endpoint
    // accepts a single zero-amount cash row in this case and marks
    // the order paid via the existing paid_total >= total check. We
    // can't simply send an empty array — the StoreOrderPaymentsRequest
    // validator requires `payments|required|array|min:1`.
    if (totalDue <= 0) {
      if (finalPayments.length === 0) {
        finalPayments.push({ method: "cash", amount: 0, idempotency_key: `pos:pay:${orderId}:0:cash` });
      }
    } else if (finalPayments.length === 0) {
      finalPayments.push({ method: "cash", amount: totalDue, idempotency_key: `pos:pay:${orderId}:0:cash` });
    } else if (paidTotalLaar < totalDueLaar) {
      finalPayments.push({
        method: "cash",
        amount: fromLaar(totalDueLaar - paidTotalLaar),
        idempotency_key: `pos:pay:${orderId}:${finalPayments.length}:cash`,
      });
    }

    try {
      await createOrderPayments(orderId, { payments: finalPayments, print_receipt: false });
      setPendingPaymentForOrderId(null);
      setPendingPaymentSnapshot(null);
      return true;
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (err instanceof ApiRequestError) {
        // Auth expiry: surface to the rest of the app so the global
        // 401 handler redirects to PIN re-login. Don't pin a "retry
        // payment" UI in the cart for an auth failure — there's
        // nothing useful to retry until the cashier re-authenticates.
        if (err.status === 401) {
          window.dispatchEvent(new Event("auth_expired"));
          flashError("Session expired — please log back in.");
          return false;
        }
        flashError(`Payment failed: ${msg}`);
      } else {
        flashError("Network issue — payment not recorded. Retry once back online.");
      }
      setPendingPaymentForOrderId(orderId);
      // Snapshot the totalDue AND the rows from THIS attempt so retry
      // charges the server-validated total with the same tender split,
      // not the (possibly drifted) cartTotal or empty params.payments.
      setPendingPaymentSnapshot({ orderId, totalDue, rows: paymentRows });
      return false;
    }
  };

  /**
   * Charge the cart with explicit tender rows from the ChargeOverlay.
   * The cart is only cleared after both order creation AND settlement
   * succeed — partial successes leave the cart intact so the cashier
   * can retry without re-entering everything.
   */
  const handleCharge = async (
    rows: Array<{ method: string; amount: number }>,
  ): Promise<boolean> => {
    if (params.cartItems.length === 0) return false;
    if (isSubmitting) return false;
    // Note: table is OPTIONAL on Dine-in tickets. Some venues ring up
    // dine-in food at the counter before seating ("still seating" /
    // "walk-up bar order"), and the backend already treats
    // restaurant_table_id as nullable, so we don't block the charge
    // on it client-side either.

    const paymentSnapshot: PaymentRow[] = rows.map((r) => ({
      id: crypto.randomUUID(),
      method: r.method as PaymentRow["method"],
      amount: r.amount.toFixed(2),
    }));

    // ─── Resumed-ticket path ──────────────────────────────────────
    // The cart was rebuilt from an existing server-side order. Skip
    // createOrder entirely and settle the original. Offline isn't
    // supported here (the order id only exists because we're online),
    // so the queue path below is a non-issue for this branch.
    if (resumedOrderId !== null) {
      if (resumedIsPaid) {
        return false;
      }
      if (isEditingActive) {
        flashError(
          "Tap \u201cSave changes\u201d on the resume banner first \u2014 the new total has to be sent to the server before you can charge.",
        );
        return false;
      }
      setIsSubmitting(true);
      try {
        const baseTotal = resumedOrderTotal ?? params.cartTotal;
        const totalDue = await applyStagedRewards(resumedOrderId, baseTotal);
        const settled = await settleOrder(resumedOrderId, totalDue, paymentSnapshot);
        if (settled) {
          const cid = params.customerId;
          const cphone = params.customerPhone;
          const settledOrderId = resumedOrderId;
          const settledType = resumedOrderType;
          setResumedOrderId(null);
          setResumedOrderTotal(null);
          setResumedItemsFingerprint(null);
          setResumedFromStatus(null);
          setIsEditingActive(false);
          setResumedIsPaid(false);
          setResumedOrderLabel(null);
          setResumedOrderType(null);
          setResumedStaffUserId(null);
          params.clearCart();
          params.setSelectedItem(null);
          params.onOrderSettled?.(settledOrderId, cid, cphone, settledType, paidOnCreditFromRows(paymentSnapshot));
        } else if (
          (params.appliedLoyaltyPoints ?? 0) > 0
          && !params.appliedLoyaltyServerApplied
        ) {
          // Only release holds we created in this charge attempt.
          // serverApplied loyalty already has a hold from the earlier save.
          await releaseLoyaltyHold(resumedOrderId).catch(() => undefined);
        }
        return settled;
      } finally {
        setIsSubmitting(false);
      }
    }

    if (params.orderType === "Delivery") {
      if (!params.isReachable) {
        flashError("Delivery orders require an internet connection.");
        return false;
      }
      const deliveryErr = validateDeliveryDetails(
        params.deliveryDetails ?? {
          addressLine1: "",
          addressLine2: "",
          island: "",
          contactName: "",
          contactPhone: "",
          notes: "",
          locationLink: "",
        },
        { name: params.customerName, phone: params.customerPhone },
      );
      if (deliveryErr) {
        flashError(deliveryErr);
        return false;
      }
    }

    const payload = buildPayload();
    // Bug-013: snapshot the staged customer rewards into the offline
    // payload so handleSyncQueue can re-apply them when the orders
    // hit the wire later. Without this, an order rung up offline
    // with a loyalty redemption / promo / gift card would create
    // server-side with the FULL pre-reward total, the cashier's
    // collected payment would under-pay, and the order would be
    // stuck UNPAID in admin until someone manually applied the
    // reward. customer_id and discount_amount are already in
    // payload via buildPayload — this only adds the rewards.
    const stagedRewards = {
      promo_code: params.appliedPromoCode ?? null,
      loyalty_points: params.appliedLoyaltyPoints ?? 0,
      gift_card_code: params.appliedGiftCardCode ?? null,
    };

    if (!params.isReachable) {
      if (params.orderType === "Delivery") {
        flashError("Delivery orders cannot be saved offline.");
        return false;
      }
      return tryPersistOfflineV2(paymentSnapshot, stagedRewards);
    }

    setIsSubmitting(true);
    let orderCreated = false;
    let createdOrderId: number | null = null;
    try {
      const response = await submitCreatedOrder(payload);
      orderCreated = true;
      createdOrderId = response.order.id;
      setLastCreatedOrderId(response.order.id);
      // Apply any customer-rewards the cashier staged in the cart. Each
      // hop reduces the order total server-side (promo → loyalty → gift
      // card, in the same order the cart breakdown shows them) and we
      // read back the freshest authoritative total so `settleOrder`
      // charges the exact right amount. We swallow individual failures
      // and keep going — a bad promo code shouldn't make the cashier
      // re-ring an already-created order; they can manually adjust.
      let totalDue = response.order.total ?? params.cartTotal;
      totalDue = await applyStagedRewards(response.order.id, totalDue);
      const settled = await settleOrder(response.order.id, totalDue, paymentSnapshot);
      if (settled) {
        // Snapshot the customer BEFORE clearCart wipes attachedCustomer.
        const cid = params.customerId;
        const cphone = params.customerPhone;
        params.clearCart();
        params.setSelectedItem(null);
        // Drop the just-paid order id so the OrderCart stops offering
        // "Send bill" against a now-paid ticket — the audit caught the
        // Send Bill block silently shadowing the next ticket because
        // we never cleared this flag on success. The ReceiptActions
        // banner takes over the "what now?" duty for paid orders.
        setLastCreatedOrderId(null);
        params.onOrderSettled?.(
          response.order.id,
          cid,
          cphone,
          mapOrderType(params.orderType),
          paidOnCreditFromRows(paymentSnapshot),
        );
      } else if ((params.appliedLoyaltyPoints ?? 0) > 0) {
        // Payment failed after a loyalty hold — free the points so the
        // customer isn't stuck until hold TTL expires.
        await releaseLoyaltyHold(response.order.id).catch(() => undefined);
      }
      return settled;
    } catch (err: unknown) {
      if (orderCreated) {
        // Bug-014: createOrder succeeded but settle / rewards failed.
        // The order now exists on the server as an unpaid open
        // ticket (visible in OpenTicketsPanel with its own Send
        // Bill / Send Pay Link / Charge actions). Drop the local
        // `lastCreatedOrderId` so a stale "Send Bill for #X"
        // button doesn't haunt the OrderCart for the next ticket
        // the cashier rings up — they should drive the orphan
        // from the Open Tickets pane instead.
        setLastCreatedOrderId(null);
        if (createdOrderId && (params.appliedLoyaltyPoints ?? 0) > 0) {
          await releaseLoyaltyHold(createdOrderId).catch(() => undefined);
        }
        return false;
      }
      const message = (err as Error)?.message ?? "";
      const isApiError = err instanceof ApiRequestError;

      if (isApiError) {
        flashError(`Order failed: ${message}`);
        return false;
      }

      return tryPersistOfflineV2(paymentSnapshot, stagedRewards);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Legacy single-action checkout, kept for the rare case the cashier
   *  has explicit payment rows already set up (split tender) and just
   *  wants to commit them without a charge overlay. */
  const handleCheckout = () => {
    void handleCharge(
      normalizePayments(params.payments),
    );
  };

  const handleRetryPayment = () => {
    if (!pendingPaymentForOrderId || isSubmitting) return;
    setIsSubmitting(true);
    void (async () => {
      try {
        // Use the totalDue AND the rows captured when the original
        // payment attempt happened — the cart may have been cleared/
        // edited since (and `params.payments` is almost always empty
        // because the cashier paid via the Charge overlay, not the
        // legacy sidebar). Without the snapshot rows, retry would
        // silently send `[{ method: "cash", amount: totalDue }]` and
        // record the whole bill as cash even if the original was
        // split tender.
        const snapshot = pendingPaymentSnapshot;
        const matched = snapshot && snapshot.orderId === pendingPaymentForOrderId;
        const totalDue = matched ? snapshot.totalDue : params.cartTotal;
        const retryRows = matched ? snapshot.rows : params.payments;
        const orderId = pendingPaymentForOrderId;
        const settled = await settleOrder(
          orderId,
          totalDue > 0 ? totalDue : 0,
          retryRows,
        );
        if (settled) {
          // Snapshot customer BEFORE clearCart so we can hand it to
          // onOrderSettled (was missing — recovered payments showed
          // no Receipt Actions banner, leaving the cashier stranded
          // after a successful retry).
          const cid = params.customerId;
          const cphone = params.customerPhone;
          params.clearCart();
          params.setSelectedItem(null);
          setLastCreatedOrderId(null);
          params.onOrderSettled?.(
            orderId,
            cid,
            cphone,
            mapOrderType(params.orderType),
            paidOnCreditFromRows(retryRows),
          );
        }
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  /**
   * Park the current cart as a named ticket. Supports multiple
   * simultaneous tickets (one per cashier device) so it's safe to
   * juggle dine-in + walk-in customers without overwriting holds.
   *
   * Two save modes (chosen by the cashier in SaveTicketModal):
   *
   *   fireToKitchen=false (default for Dine-in/Takeaway)
   *     Order is created with print=false then immediately held.
   *     Kitchen has no idea it exists. Used when the cashier is
   *     parking the cart to add more items later or wait on the
   *     customer to decide.
   *
   *   fireToKitchen=true (default for Pickup)
   *     Order is created normally (print=true so kitchen chit fires)
   *     and stays in `pending` — NOT held. Customer with a phone
   *     number gets an "Order received" SMS. The ticket appears in
   *     Open Tickets with an UNPAID badge until paid via either
   *     the "Send pay link" button or the existing Charge flow.
   */
  const handleSaveTicket = async (name: string, note?: string, fireToKitchen = false): Promise<void> => {
    if (!params.isOnline) throw new Error("Go online to save tickets.");
    if (params.cartItems.length === 0) throw new Error("Add items first.");

    if (params.orderType === "Delivery") {
      if (!params.isReachable) throw new Error("Delivery orders require an internet connection.");
      const deliveryErr = validateDeliveryDetails(
        params.deliveryDetails ?? {
          addressLine1: "",
          addressLine2: "",
          island: "",
          contactName: "",
          contactPhone: "",
          notes: "",
          locationLink: "",
        },
        { name: params.customerName, phone: params.customerPhone },
      );
      if (deliveryErr) throw new Error(deliveryErr);
    }

    try {
      if (fireToKitchen) {
        const payload = { ...buildPayload({ ticket_name: name, ticket_note: note }), print: false };
        const response = await submitCreatedOrder(payload);
        await applyStagedRewards(response.order.id, response.order.total);
        await fireOrderToKitchen(response.order.id);
        params.clearCart();
        params.setSelectedItem(null);
        return;
      }

      const payload = { ...buildPayload({ ticket_name: name, ticket_note: note }), print: false };
      const response = await submitCreatedOrder(payload);
      await applyStagedRewards(response.order.id, response.order.total);
      await holdOrder(response.order.id, { ticket_name: name, ticket_note: note });

      localStorage.setItem("pos_last_held_order", String(response.order.id));
      setLastHeldOrderId(response.order.id);
      params.clearCart();
      params.setSelectedItem(null);
    } catch (err) {
      flashError(`Couldn't save ticket: ${(err as Error).message}`);
      throw err;
    }
  };

  /**
   * Restore server-side order fields into the local cart. Shared by
   * normal resume and paid-online view-only open.
   */
  const hydrateCartFromOrder = (
    response: Awaited<ReturnType<typeof getOrder>>,
  ): CartItem[] => {
    if (params.setAttachedCustomer) {
      params.setAttachedCustomer(response.order.customer ?? null);
    }
    if (response.order.type && params.setOrderType) {
      const typeMap: Record<string, OrderType> = {
        dine_in: "Dine-in",
        takeaway: "Takeaway",
        online_pickup: "Pickup",
        delivery: "Delivery",
      };
      const mapped = typeMap[response.order.type ?? ""];
      if (mapped) params.setOrderType(mapped);
    }
    if (response.order.type === "delivery" && params.setDeliveryDetails) {
      const o = response.order as {
        delivery_address_line1?: string | null;
        delivery_address_line2?: string | null;
        delivery_island?: string | null;
        delivery_contact_name?: string | null;
        delivery_contact_phone?: string | null;
        delivery_notes?: string | null;
        delivery_location_link?: string | null;
      };
      params.setDeliveryDetails({
        addressLine1: o.delivery_address_line1 ?? "",
        addressLine2: o.delivery_address_line2 ?? "",
        island: o.delivery_island ?? "Male",
        contactName: o.delivery_contact_name ?? "",
        contactPhone: o.delivery_contact_phone ?? "",
        notes: o.delivery_notes ?? "",
        locationLink: o.delivery_location_link ?? "",
      });
    }
    if (params.setSelectedTableId) {
      params.setSelectedTableId(response.order.restaurant_table_id ?? null);
    }

    const restoredItems: CartItem[] = response.order.items.map((item) => ({
      id: item.item_id ?? 0,
      name: item.item_name,
      price: Number(item.unit_price ?? 0),
      quantity: Number(item.quantity ?? 0),
      variant_id: item.variant_id ?? null,
      variant_name: item.variant_name ?? null,
      modifiers: item.modifiers?.map((m) => ({
        id: m.modifier_id ?? 0,
        name: m.modifier_name,
        price: Number(m.modifier_price ?? 0),
      })) ?? [],
      tax_rate: item.tax_rate != null ? Number(item.tax_rate) : 0,
      tax_code: item.tax_code ?? (Number(item.tax_rate) > 0 ? "standard_8" : "out_of_scope"),
      notes: typeof item.notes === "string" && item.notes.trim().length > 0
        ? item.notes.split(" · ").map((s) => s.trim()).filter(Boolean)
        : [],
    }));
    params.setCartItems(restoredItems);

    if (params.setDiscountAmount) {
      const manualDiscount = response.order.discount_amount != null
        ? Number(response.order.discount_amount)
        : 0;
      params.setDiscountAmount(manualDiscount > 0 ? manualDiscount.toFixed(2) : "");
    }
    if (params.setAppliedGiftCard) {
      const gcCode = response.order.gift_card_code ?? response.order.gift_card_masked ?? null;
      const gcDiscountLaar = response.order.gift_card_discount_laar ?? 0;
      // Display-only on resume — masked codes are not re-applicable.
      params.setAppliedGiftCard(gcCode && gcDiscountLaar > 0
        ? { code: gcCode, discount: gcDiscountLaar / 100, cardBalance: 0, serverApplied: true }
        : null);
    }
    if (params.setAppliedLoyalty) {
      const loyaltyDiscountLaar = response.order.loyalty_discount_laar ?? 0;
      // Display amounts only — never re-send placeholder points on charge.
      params.setAppliedLoyalty(loyaltyDiscountLaar > 0
        ? { points: 0, discount: loyaltyDiscountLaar / 100, serverApplied: true }
        : null);
    }
    if (params.setAppliedPromo) {
      const promoDiscountLaar = response.order.promo_discount_laar ?? 0;
      params.setAppliedPromo(promoDiscountLaar > 0
        ? { code: "", promotionId: null, discount: promoDiscountLaar / 100, serverApplied: true }
        : null);
    }

    return restoredItems;
  };

  const orderDisplayLabel = (order: { id: number; order_number?: string | null }) =>
    order.order_number?.trim() || `#${order.id}`;

  /**
   * Resume a specific held ticket by id.
   *
   * Sets `resumedOrderId` so the next `handleCharge` settles THIS
   * order instead of creating a new one (the duplicate-order bug
   * fix). The cart UI flips to read-only — cashier must
   * `handleCancelResume` to put it back into Open Tickets and re-ring
   * if they need to edit items.
   *
   * Paid online orders open in view-only mode (no Charge / no edit).
   */
  const handleResumeTicket = async (orderId: number): Promise<{ isPaid: boolean }> => {
    clearStatus();
    const preflight = await getOrder(orderId);
    const isPaid = preflight.order.payment_status === "paid"
      || preflight.order.status === "paid";
    const label = orderDisplayLabel(preflight.order);

    if (isPaid) {
      const restoredItems = hydrateCartFromOrder(preflight);
      setResumedFromStatus(preflight.order.status ?? null);
      setResumedOrderId(orderId);
      setResumedOrderTotal(
        preflight.order.total != null ? Number(preflight.order.total) : null,
      );
      setResumedItemsFingerprint(cartFingerprint(restoredItems));
      setResumedIsPaid(true);
      setResumedOrderLabel(label);
      setResumedOrderType(preflight.order.type ?? null);
      setResumedStaffUserId(staffUserIdFromOrder(preflight.order));
      setIsEditingActive(false);
      localStorage.removeItem("pos_last_held_order");
      setLastHeldOrderId(null);
      return { isPaid: true };
    }

    setResumedIsPaid(false);
    setResumedOrderLabel(label);

    if (preflight.order.status === "held") {
      await resumeOrder(orderId);
    }
    setResumedFromStatus(preflight.order.status ?? null);
    const response = await getOrder(orderId);

    const restoredItems = hydrateCartFromOrder(response);

    setResumedOrderId(orderId);
    setResumedOrderType(response.order.type ?? null);
    setResumedStaffUserId(staffUserIdFromOrder(response.order));
    setResumedOrderTotal(response.order.total != null ? Number(response.order.total) : null);
    setResumedItemsFingerprint(cartFingerprint(restoredItems));
    localStorage.removeItem("pos_last_held_order");
    setLastHeldOrderId(null);
    return { isPaid: false };
  };

  /**
   * Exit "resumed" mode without charging: re-hold the order (it goes
   * back into Open Tickets) and clear the cart. Used when the cashier
   * needs to edit a parked ticket — they cancel resume, the ticket
   * sits in Open Tickets again, then they ring up a fresh ticket
   * (which is the safest way to avoid item drift between local cart
   * and server-side order).
   */
  const handleCancelResume = async (): Promise<void> => {
    if (resumedOrderId === null) return;
    const id = resumedOrderId;
    const wasHeld = resumedFromStatus === "held";
    // Only re-hold tickets that came from `held`. In-flight tickets
    // (cooking / ready) are already mid-lifecycle — re-holding would
    // pull them off the KDS and confuse the kitchen. Cancel just
    // drops the local cart and leaves the server-side state alone.
    if (wasHeld) {
      try {
        await holdOrder(id);
      } catch {
        // If the re-hold fails (rare), still clear local state so the
        // cashier isn't stuck in a broken resumed mode.
      }
    }
    setResumedOrderId(null);
    setResumedOrderTotal(null);
    setResumedItemsFingerprint(null);
    setResumedFromStatus(null);
    setIsEditingActive(false);
    setResumedIsPaid(false);
    setResumedOrderLabel(null);
    setResumedOrderType(null);
    setResumedStaffUserId(null);
    params.clearCart();
    params.setSelectedItem(null);
  };

  /**
   * "Tap to edit" pathway — same as handleResumeTicket but flips the
   * cart into edit-mode so the cashier can add/remove items before
   * either saving (handleSaveActiveChanges) or charging (handleCharge).
   * Used by the OpenTicketsPanel when the cashier taps the row itself
   * (vs. tapping a specific action button).
   */
  const handleEditActiveTicket = async (orderId: number): Promise<void> => {
    const { isPaid } = await handleResumeTicket(orderId);
    if (!isPaid) setIsEditingActive(true);
  };

  /**
   * Push the cart's current line items back to the active order. The
   * server replaces all items, recalculates totals, and optionally
   * reprints the kitchen chit (we set reprint=true when items differ).
   * Used by the "💾 Save changes" button in the cart.
   *
   * Leaves the cashier in resumed mode so they can still tap Charge
   * after saving — saves a back-and-forth between Active orders and
   * cart for "add a side, then take payment" workflows.
   */
  const handleSaveActiveChanges = async (): Promise<boolean> => {
    if (resumedOrderId === null) return false;
    if (params.cartItems.length === 0) {
      flashError("Add at least one item before saving changes.");
      return false;
    }
    setIsSubmitting(true);
    try {
      const items = params.cartItems.map((it) => ({
        item_id: it.id || null,
        name: it.name,
        quantity: it.quantity,
        variant_id: it.variant_id ?? null,
        notes: Array.isArray(it.notes) && it.notes.length > 0 ? it.notes.join(" · ") : undefined,
        modifiers: (it.modifiers ?? []).map((m) => ({
          modifier_id: m.id || null,
          name: m.name,
          price: m.price,
        })),
      }));
      // Bug-016: only reprint the kitchen chit if the items / qty /
      // mods / notes actually changed. Tapping Save with no real
      // edits used to print a duplicate chit and cause double-prep
      // in a busy service.
      const currentFp = cartFingerprint(params.cartItems);
      const itemsChanged = resumedItemsFingerprint !== currentFp;
      const res = await updateOrderItems(resumedOrderId, {
        items,
        reprint_kitchen: itemsChanged,
      });
      setResumedOrderTotal(res.order.total != null ? Number(res.order.total) : null);
      setResumedItemsFingerprint(currentFp);
      setIsEditingActive(false);
      return true;
    } catch (err) {
      flashError(`Couldn't save changes: ${(err as Error).message}`);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Legacy single-button hold — used when the user just taps Save Ticket
   *  without naming. Falls back to a default name based on the cart. */
  const handleHoldOrder = () => {
    void handleSaveTicket(`Ticket ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)
      .catch((e) => flashError((e as Error).message));
  };

  const handleBarcodeSubmit = (
    event: React.FormEvent<HTMLFormElement>,
    items: Item[],
    addToCart: (item: Item) => void,
  ) => {
    event.preventDefault();
    const trimmed = barcode.trim();
    if (!trimmed) return;

    const fallbackMatch = items.find(
      (item) => (item as Item & { barcode?: string | null }).barcode === trimmed,
    );

    if (params.isOnline) {
      // Race fix: capture the barcode we just scanned. The async
      // lookupBarcode resolves later, by which time the user may have
      // typed another barcode or scanned a different code. We compare
      // against the captured value before adding to cart, so an
      // out-of-order resolve from a previous scan can never add the
      // wrong item.
      //
      // Bug-030: the previous version read `barcode` (the closure-
      // captured state) inside .then, which equalled `scannedFor`
      // for the duration of the closure — so the guard was a no-op
      // and out-of-order resolves slipped through. Now we read
      // `barcodeRef.current`, which the synchronous `setBarcode`
      // wrapper updates immediately on every keystroke / scan.
      const scannedFor = trimmed;
      lookupBarcode(trimmed)
        .then((item) => {
          if (barcodeRef.current.trim() !== scannedFor) return;
          if (item) { addToCart(item); setBarcode(""); return; }
          if (fallbackMatch) { addToCart(fallbackMatch); setBarcode(""); }
        })
        .catch(() => {
          if (barcodeRef.current.trim() !== scannedFor) return;
          if (fallbackMatch) { addToCart(fallbackMatch); setBarcode(""); }
        });
      return;
    }

    if (fallbackMatch) { addToCart(fallbackMatch); setBarcode(""); }
  };

  /**
   * Sync queued orders. Each entry contains BOTH the order payload and the
   * payment rows that were captured at offline-checkout time. We create the
   * order first; if it succeeds we immediately settle it with the saved
   * payments. Partial failures are tracked so the entry stays in the queue
   * for the next sync attempt.
   */
  const handleSyncQueue = () => {
    if (!params.isReachable) { flashNotice("You are offline. Sync paused."); return; }
    if (isSyncingQueue) { flashNotice("Sync already in progress…"); return; }

    setIsSyncingQueue(true);
    void (async () => {
      try {
        const result = await runOfflineSync(true);
        params.setOfflineQueueCount(result.remaining);
        if (result.remaining === 0 && result.synced > 0) {
          clearStatus();
          flashNotice(`Synced ${result.synced} offline order${result.synced === 1 ? "" : "s"}.`);
        } else if (result.synced > 0) {
          flashError(`Synced ${result.synced}, ${result.remaining} remaining${result.conflicts ? `, ${result.conflicts} conflicts` : ""}.`);
        } else if (result.remaining === 0) {
          flashNotice("No queued orders to sync.");
        } else {
          flashError(`Sync incomplete — ${result.remaining} still pending.`);
        }
      } finally {
        setIsSyncingQueue(false);
      }
    })();
  };

  return {
    statusMessage,
    setStatusMessage,
    clearStatus,
    flashError,
    flashNotice,
    isSubmitting,
    lastHeldOrderId,
    lastCreatedOrderId,
    pendingPaymentForOrderId,
    resumedOrderId,
    resumedOrderTotal,
    resumedFromStatus,
    isEditingActive,
    setIsEditingActive,
    resumedIsPaid,
    resumedOrderLabel,
    resumedOrderType,
    resumedStaffUserId,
    barcode,
    setBarcode,
    handleCheckout,
    handleCharge,
    handleHoldOrder,
    handleSaveTicket,
    handleResumeTicket,
    handleEditActiveTicket,
    handleSaveActiveChanges,
    handleCancelResume,
    handleBarcodeSubmit,
    handleSyncQueue,
    handleRetryPayment,
  };
}
