import { useRef, useState, useCallback, useEffect } from "react";
import { ApiRequestError } from "@shared/api";
import {
  applyGiftCardToOrder,
  applyPromoToOrder,
  confirmDiscountApproval,
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
  requestDiscountApproval,
  resumeOrder,
  updateOrderItems,
  validateManualDiscountInput,
  DEFAULT_POS_DISCOUNT_CONTROLS,
  type PosDiscountControls,
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
import type { CartItem, Item, Variant } from "../types";
import type { PaymentRow } from "./useCart";
import type { PosCustomer } from "../api";
import type { PosDeliveryDetails, PosOrderType } from "../orderTypes";
import {
  EMPTY_DELIVERY_DETAILS,
  normalizeMvPhone,
  resolveDeliveryDetails,
  validateDeliveryDetails,
} from "../orderTypes";
import { applyStagedRewards as applyStagedRewardsUtil } from "../utils/applyStagedRewards";

type OrderType = PosOrderType;

type DiscountApprovalUi = {
  approvalId: number;
  orderId: number;
  discountAmount: number;
  error: string;
  busy: boolean;
  resending: boolean;
};

const mapOrderType = (type: OrderType): "dine_in" | "takeaway" | "online_pickup" | "delivery" => {
  if (type === "Dine-in") return "dine_in";
  if (type === "Pickup") return "online_pickup";
  if (type === "Delivery") return "delivery";
  return "takeaway";
};

function deliveryFingerprint(d: PosDeliveryDetails | null | undefined): string {
  const x = d ?? EMPTY_DELIVERY_DETAILS;
  return [
    x.addressLine1.trim(),
    x.addressLine2.trim(),
    x.island.trim(),
    x.contactName.trim(),
    normalizeMvPhone(x.contactPhone.trim()),
    x.notes.trim(),
    x.locationLink.trim(),
  ].join("|");
}

function deliveryDetailsFromOrder(order: {
  type?: string | null;
  delivery_address_line1?: string | null;
  delivery_address_line2?: string | null;
  delivery_island?: string | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  delivery_notes?: string | null;
  delivery_location_link?: string | null;
}): PosDeliveryDetails {
  if (order.type !== "delivery") return { ...EMPTY_DELIVERY_DETAILS };
  return {
    addressLine1: order.delivery_address_line1 ?? "",
    addressLine2: order.delivery_address_line2 ?? "",
    island: order.delivery_island ?? "Male",
    contactName: order.delivery_contact_name ?? "",
    contactPhone: order.delivery_contact_phone ?? "",
    notes: order.delivery_notes ?? "",
    locationLink: order.delivery_location_link ?? "",
  };
}

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

function normalizePayments(
  rows: PaymentRow[],
): { method: string; amount: number; tendered_amount?: number }[] {
  return rows
    .map((p) => {
      const amt = Number.parseFloat(p.amount);
      const tenderedRaw = p.tendered_amount;
      const tendered =
        tenderedRaw != null && tenderedRaw !== ""
          ? Number.parseFloat(String(tenderedRaw))
          : NaN;
      const base: { method: string; amount: number; tendered_amount?: number } = {
        method: mapPaymentMethodForApi(p.method),
        amount: amt,
      };
      // FIX 11 — only forward tendered_amount on cash overpay so old
      // clients / non-cash rows keep the exact same payload as before.
      if (base.method === "cash" && Number.isFinite(tendered) && tendered > amt) {
        base.tendered_amount = tendered;
      }
      return base;
    })
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
      return `${it.id || 0}|${it.variant_id ?? 0}|p${it.packaging_option_id ?? 0}|q${it.quantity}|m${mods}|n${notes}`;
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
  discountReason?: string | null;
  discountReasonNote?: string;
  discountControls?: PosDiscountControls;
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
    creditNote?: string | null,
    /**
     * FIX 9e — post-settle credit balance for the attached customer.
     * Populated when the payments endpoint echoes `credit_balance_mvr`
     * in its response (i.e. the tender mix included a house_account
     * leg AND the backend has been upgraded). Callers surface this on
     * the receipt banner. `null` = server didn't return a balance.
     */
    creditBalanceMvr?: number | null,
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
   * Unpaid resumed tickets open editable. Cleared on cancel-resume or
   * successful charge. Paid online tickets stay view-only (false).
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
  /** Table on the resumed ticket (dine_in only) — part of dirty detection. */
  const [resumedTableId, setResumedTableId] = useState<number | null>(null);
  /** Delivery address snapshot from resume — dirty when the form diverges. */
  const [resumedDeliveryFingerprint, setResumedDeliveryFingerprint] = useState<string | null>(null);
  /** Manual discount (MVR string) captured on resume — dirty when cashier edits it. */
  const [resumedDiscountBaseline, setResumedDiscountBaseline] = useState<string>("");
  /** Staff who rang the ticket — used to label POS pickup vs app online pickup. */
  const [resumedStaffUserId, setResumedStaffUserId] = useState<number | null>(null);

  const currentTicketType = () => mapOrderType(params.orderType);
  const currentTicketTableId = () =>
    currentTicketType() === "dine_in" ? (params.selectedTableId ?? null) : null;

  const normalizeDiscountAmount = (raw: string | null | undefined): string => {
    const n = Number.parseFloat(String(raw ?? "").trim());
    if (!Number.isFinite(n) || n <= 0) return "";
    return n.toFixed(2);
  };

  /** True when items, fulfillment type, table, delivery, or discount differ. */
  const computeTicketDirty = (): boolean => {
    if (resumedOrderId === null) return false;
    const itemsDirty = resumedItemsFingerprint !== null
      && cartFingerprint(params.cartItems) !== resumedItemsFingerprint;
    const typeDirty = resumedOrderType !== null
      && currentTicketType() !== resumedOrderType;
    const resumedTable = resumedOrderType === "dine_in" ? resumedTableId : null;
    const tableDirty = currentTicketTableId() !== resumedTable;
    const deliveryDirty = currentTicketType() === "delivery"
      && resumedDeliveryFingerprint !== null
      && deliveryFingerprint(params.deliveryDetails) !== resumedDeliveryFingerprint;
    const discountDirty =
      normalizeDiscountAmount(params.discountAmount) !== normalizeDiscountAmount(resumedDiscountBaseline);
    return itemsDirty || typeDirty || tableDirty || deliveryDirty || discountDirty;
  };

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
  /** Amber reward-apply failures while Charge overlay is open (FIX 21). */
  const [rewardWarning, setRewardWarning] = useState("");
  /** Reused until settle succeeds so a dropped create response cannot mint #2. */
  const chargeIdempotencyKeyRef = useRef<string | null>(null);
  /** Guard so handleSyncQueue can't be entered twice concurrently. */
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  const [discountApproval, setDiscountApproval] = useState<DiscountApprovalUi | null>(null);
  const discountApprovalWaiterRef = useRef<{
    resolve: (result: { total: number } | null) => void;
  } | null>(null);

  const controls = params.discountControls ?? DEFAULT_POS_DISCOUNT_CONTROLS;

  const parsedDiscountAmount = () => Math.max(0, Number.parseFloat(params.discountAmount) || 0);

  const needsDiscountApproval = (amount: number) =>
    amount > 0 && controls.approval_required === true;

  const preflightManualDiscount = (amount: number): string | null => {
    if (amount <= 0) return null;
    return validateManualDiscountInput({
      amountMvr: amount,
      subtotalMvr: params.cartSubtotal,
      controls,
      reason: params.discountReason,
      reasonNote: params.discountReasonNote,
    });
  };

  const requestApprovalPayload = (amount: number) => {
    const reason = (params.discountReason ?? "").trim() || undefined;
    const reasonNote = (params.discountReasonNote ?? "").trim() || undefined;
    return {
      discount_amount: amount,
      ...(reason ? { discount_reason: reason } : {}),
      ...(reasonNote ? { discount_reason_note: reasonNote } : {}),
    };
  };

  /**
   * Request an SMS OTP, open the modal, and wait for Confirm/Cancel.
   * Returns `{ total }` from the confirm response, or null if cancelled / failed to request.
   */
  const runDiscountApprovalFlow = async (
    orderId: number,
    amount: number,
  ): Promise<{ total: number } | null> => {
    let approvalId: number;
    try {
      const res = await requestDiscountApproval(orderId, requestApprovalPayload(amount));
      approvalId = res.approval_id;
    } catch (err) {
      const msg = (err as Error)?.message ?? "Could not request approval.";
      flashError(msg);
      return null;
    }

    setDiscountApproval({
      approvalId,
      orderId,
      discountAmount: amount,
      error: "",
      busy: false,
      resending: false,
    });

    return new Promise((resolve) => {
      discountApprovalWaiterRef.current = { resolve };
    });
  };

  const confirmDiscountApprovalCode = async (code: string): Promise<void> => {
    const state = discountApproval;
    if (!state) return;
    setDiscountApproval((s) => (s ? { ...s, busy: true, error: "" } : s));
    try {
      const res = await confirmDiscountApproval(state.orderId, {
        approval_id: state.approvalId,
        code,
        discount_amount: state.discountAmount,
      });
      const total = res.order.total != null ? Number(res.order.total) : params.cartTotal;
      setDiscountApproval(null);
      const waiter = discountApprovalWaiterRef.current;
      discountApprovalWaiterRef.current = null;
      waiter?.resolve({ total });
    } catch (err) {
      const msg = (err as Error)?.message ?? "Invalid code.";
      setDiscountApproval((s) => (s ? { ...s, busy: false, error: msg } : s));
    }
  };

  const resendDiscountApproval = async (): Promise<void> => {
    const state = discountApproval;
    if (!state) return;
    setDiscountApproval((s) => (s ? { ...s, resending: true, error: "" } : s));
    try {
      const res = await requestDiscountApproval(
        state.orderId,
        requestApprovalPayload(state.discountAmount),
      );
      setDiscountApproval((s) =>
        s
          ? {
            ...s,
            approvalId: res.approval_id,
            resending: false,
            error: "",
            busy: false,
          }
          : s,
      );
    } catch (err) {
      const msg = (err as Error)?.message ?? "Could not resend code.";
      setDiscountApproval((s) => (s ? { ...s, resending: false, error: msg } : s));
    }
  };

  const cancelDiscountApproval = (): void => {
    setDiscountApproval(null);
    const waiter = discountApprovalWaiterRef.current;
    discountApprovalWaiterRef.current = null;
    waiter?.resolve(null);
  };

  const buildPayload = (overrides: Partial<{
    ticket_name: string;
    ticket_note: string;
    /** When true, omit manual discount (approval flow creates order first). */
    omitDiscount: boolean;
  }> = {}) => {
    const discount = overrides.omitDiscount
      ? 0
      : Math.max(0, Number.parseFloat(params.discountAmount) || 0);
    const reason = (params.discountReason ?? "").trim() || undefined;
    const reasonNote = (params.discountReasonNote ?? "").trim() || undefined;
    const base = {
      print: true,
      device_identifier: params.deviceId,
      ...(params.customerId ? { customer_id: params.customerId } : {}),
      discount_amount: discount,
      ...(discount > 0 && reason ? { discount_reason: reason } : {}),
      ...(discount > 0 && reasonNote ? { discount_reason_note: reasonNote } : {}),
      ...(overrides.ticket_name ? { ticket_name: overrides.ticket_name } : {}),
      ...(overrides.ticket_note ? { ticket_note: overrides.ticket_note } : {}),
      items: params.cartItems.map((item) => ({
        item_id: item.id,
        name: item.name,
        quantity: item.quantity,
        ...(item.variant_id != null ? { variant_id: item.variant_id } : {}),
        ...(item.packaging_option_id != null
          ? { packaging_option_id: item.packaging_option_id }
          : {}),
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
      const msg =
        `${failures.length === 1 ? "Reward failed:" : "Rewards failed:"} ${failures.join("; ")}. ` +
        `The new total is MVR ${total.toFixed(2)}. Confirm before tendering.`;
      setRewardWarning(msg);
      flashError(`⚠️ ${msg}`);
    } else {
      setRewardWarning("");
    }

    return total;
  };

  const paidOnCreditFromRows = (rows: PaymentRow[]) => {
    const toLaar = (mvr: number | string) => Math.round(Number(mvr) * 100);
    const creditLaar = rows
      .filter((r) => r.method === "house_account")
      .reduce((s, r) => s + toLaar(r.amount), 0);
    if (creditLaar <= 0) return false;
    const totalLaar = rows.reduce((s, r) => s + toLaar(r.amount), 0);
    return totalLaar <= 0 || creditLaar * 2 >= totalLaar;
  };

  const creditPartialLabel = (rows: PaymentRow[]): string | null => {
    const toLaar = (mvr: number | string) => Math.round(Number(mvr) * 100);
    const creditLaar = rows
      .filter((r) => r.method === "house_account")
      .reduce((s, r) => s + toLaar(r.amount), 0);
    if (creditLaar <= 0) return null;
    const totalLaar = rows.reduce((s, r) => s + toLaar(r.amount), 0);
    if (totalLaar > 0 && creditLaar * 2 < totalLaar) {
      return `partially on credit (MVR ${(creditLaar / 100).toFixed(2)})`;
    }
    return null;
  };

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
          ...(item.packaging_option_id != null
            ? { packaging_option_id: item.packaging_option_id }
            : {}),
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
   * FIX 9e — the last successful settle response's credit balance
   * (MVR). Set inside settleOrder when the backend echoes
   * `credit_balance_mvr`, then read by the calling handlers to pass
   * through onOrderSettled → receipt banner. A tuple return would be
   * cleaner but every existing branch checks the boolean; sticking to
   * an outer ref keeps the diff surgical.
   */
  const lastCreditBalanceRef = useRef<number | null>(null);

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
      const shortfallLaar = totalDueLaar - paidTotalLaar;
      // Fabricating cash is only for ≤1-laari rounding. A larger gap means
      // the overlay tendered against a stale total — abort so the cashier
      // re-confirms instead of padding the drawer with phantom cash.
      if (shortfallLaar > 1) {
        flashError(
          `Order total changed to MVR ${totalDue.toFixed(2)} — please re-confirm payment`,
        );
        return false;
      }
      finalPayments.push({
        method: "cash",
        amount: fromLaar(shortfallLaar),
        idempotency_key: `pos:pay:${orderId}:${finalPayments.length}:cash`,
      });
    }

    try {
      const settleRes = await createOrderPayments(orderId, { payments: finalPayments, print_receipt: false });
      // FIX 9e — capture the server-echoed credit balance so the
      // caller can plumb it into the receipt banner. Older backends
      // omit the field, in which case we clear it to null so a stale
      // value from a previous settle doesn't bleed into the next
      // banner.
      lastCreditBalanceRef.current =
        typeof settleRes?.credit_balance_mvr === "number"
          ? settleRes.credit_balance_mvr
          : null;
      setPendingPaymentForOrderId(null);
      setPendingPaymentSnapshot(null);
      chargeIdempotencyKeyRef.current = null;
      setRewardWarning("");
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
    rows: Array<{ method: string; amount: number; tendered_amount?: number }>,
  ): Promise<boolean> => {
    if (params.cartItems.length === 0) return false;
    if (isSubmitting) return false;

    const paymentSnapshot: PaymentRow[] = rows.map((r) => ({
      id: crypto.randomUUID(),
      method: r.method as PaymentRow["method"],
      amount: r.amount.toFixed(2),
      ...(r.tendered_amount != null && Number.isFinite(r.tendered_amount)
        ? { tendered_amount: Number(r.tendered_amount).toFixed(2) }
        : {}),
    }));

    const discountAmt = parsedDiscountAmount();
    const discountPreflightErr = preflightManualDiscount(discountAmt);
    if (discountPreflightErr) {
      flashError(discountPreflightErr);
      return false;
    }
    const approvalNeeded = needsDiscountApproval(discountAmt);
    if (approvalNeeded && !params.isReachable) {
      flashError("Manager approval requires a connection. Remove the discount or reconnect.");
      return false;
    }

    // ─── Pending-payment retry ────────────────────────────────────
    // createOrder already succeeded; Confirm must NOT create another order.
    if (pendingPaymentForOrderId !== null) {
      const snapshot = pendingPaymentSnapshot;
      const matched = snapshot && snapshot.orderId === pendingPaymentForOrderId;
      const snapDue = matched ? snapshot.totalDue : params.cartTotal;
      // Stale zero-due retry with a live cart → abandon retry and create anew.
      if (!(snapDue <= 0 && params.cartTotal > 0)) {
        setIsSubmitting(true);
        try {
          const totalDue = snapDue;
          // Prefer current overlay tender rows (cashier may have corrected them).
          const retryRows = paymentSnapshot;
          const orderId = pendingPaymentForOrderId;

          // Discount may still need approval if the first create omitted it.
          let settleTotal = totalDue > 0 ? totalDue : 0;
          if (approvalNeeded) {
            const approved = await runDiscountApprovalFlow(orderId, discountAmt);
            if (!approved) {
              flashError("Discount approval cancelled.");
              return false;
            }
            settleTotal = approved.total;
          }

          const settled = await settleOrder(orderId, settleTotal, retryRows);
          if (settled) {
            const cid = params.customerId;
            const cphone = params.customerPhone;
            const settledType = resumedOrderType ?? mapOrderType(params.orderType);
            setResumedOrderId(null);
            setResumedOrderTotal(null);
            setResumedItemsFingerprint(null);
            setResumedFromStatus(null);
            setIsEditingActive(false);
            setResumedIsPaid(false);
            setResumedOrderLabel(null);
            setResumedOrderType(null);
            setResumedTableId(null);
            setResumedDeliveryFingerprint(null);
            setResumedDiscountBaseline("");
            setResumedStaffUserId(null);
            params.clearCart();
            params.setSelectedItem(null);
            setLastCreatedOrderId(null);
            params.onOrderSettled?.(
              orderId,
              cid,
              cphone,
              settledType,
              paidOnCreditFromRows(retryRows),
              creditPartialLabel(retryRows),
              lastCreditBalanceRef.current,
            );
          }
          return settled;
        } finally {
          setIsSubmitting(false);
        }
      }
      clearPendingPayment();
    }

    // ─── Resumed-ticket path ──────────────────────────────────────
    if (resumedOrderId !== null) {
      if (resumedIsPaid) {
        return false;
      }
      let baseTotal = resumedOrderTotal ?? params.cartTotal;
      if (computeTicketDirty() || approvalNeeded) {
        // When approval is required, save without discount then OTP-apply.
        const savedTotal = await handleSaveActiveChanges({
          omitDiscountForApproval: approvalNeeded,
        });
        if (savedTotal === false) return false;
        baseTotal = savedTotal ?? params.cartTotal;
      }
      setIsSubmitting(true);
      try {
        let totalDue = baseTotal;
        if (approvalNeeded) {
          const approved = await runDiscountApprovalFlow(resumedOrderId, discountAmt);
          if (!approved) {
            flashError("Discount approval cancelled.");
            return false;
          }
          totalDue = approved.total;
          setResumedOrderTotal(totalDue);
          setResumedDiscountBaseline(normalizeDiscountAmount(params.discountAmount));
        }
        totalDue = await applyStagedRewards(resumedOrderId, totalDue);
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
          setResumedTableId(null);
          setResumedDeliveryFingerprint(null);
          setResumedDiscountBaseline("");
          setResumedStaffUserId(null);
          params.clearCart();
          params.setSelectedItem(null);
          params.onOrderSettled?.(
            settledOrderId,
            cid,
            cphone,
            settledType,
            paidOnCreditFromRows(paymentSnapshot),
            creditPartialLabel(paymentSnapshot),
            lastCreditBalanceRef.current,
          );
        } else if (
          (params.appliedLoyaltyPoints ?? 0) > 0
          && !params.appliedLoyaltyServerApplied
        ) {
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

    if (!chargeIdempotencyKeyRef.current) {
      chargeIdempotencyKeyRef.current = crypto.randomUUID();
    }
    const payload = {
      ...buildPayload({ omitDiscount: approvalNeeded }),
      idempotency_key: chargeIdempotencyKeyRef.current,
    };
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
      if (approvalNeeded) {
        flashError("Manager approval requires a connection. Remove the discount or reconnect.");
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
      let totalDue = response.order.total ?? params.cartTotal;

      if (approvalNeeded) {
        const approved = await runDiscountApprovalFlow(response.order.id, discountAmt);
        if (!approved) {
          flashError("Discount approval cancelled.");
          setPendingPaymentForOrderId(response.order.id);
          setPendingPaymentSnapshot({
            orderId: response.order.id,
            totalDue,
            rows: paymentSnapshot,
          });
          return false;
        }
        totalDue = approved.total;
      }

      totalDue = await applyStagedRewards(response.order.id, totalDue);
      const settled = await settleOrder(response.order.id, totalDue, paymentSnapshot);
      if (settled) {
        const cid = params.customerId;
        const cphone = params.customerPhone;
        params.clearCart();
        params.setSelectedItem(null);
        setLastCreatedOrderId(null);
        params.onOrderSettled?.(
          response.order.id,
          cid,
          cphone,
          mapOrderType(params.orderType),
          paidOnCreditFromRows(paymentSnapshot),
          creditPartialLabel(paymentSnapshot),
          lastCreditBalanceRef.current,
        );
      } else if ((params.appliedLoyaltyPoints ?? 0) > 0) {
        await releaseLoyaltyHold(response.order.id).catch(() => undefined);
      }
      return settled;
    } catch (err: unknown) {
      if (orderCreated) {
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
            creditPartialLabel(retryRows),
            lastCreditBalanceRef.current,
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

    const discountAmt = parsedDiscountAmount();
    const discountPreflightErr = preflightManualDiscount(discountAmt);
    if (discountPreflightErr) throw new Error(discountPreflightErr);
    const approvalNeeded = needsDiscountApproval(discountAmt);
    if (approvalNeeded && !params.isReachable) {
      throw new Error("Manager approval requires a connection. Remove the discount or reconnect.");
    }

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
        const payload = {
          ...buildPayload({ ticket_name: name, ticket_note: note, omitDiscount: approvalNeeded }),
          print: false,
        };
        const response = await submitCreatedOrder(payload);
        if (approvalNeeded) {
          const approved = await runDiscountApprovalFlow(response.order.id, discountAmt);
          if (!approved) throw new Error("Discount approval cancelled.");
        }
        await applyStagedRewards(response.order.id, response.order.total);
        await fireOrderToKitchen(response.order.id);
        params.clearCart();
        params.setSelectedItem(null);
        return;
      }

      const payload = {
        ...buildPayload({ ticket_name: name, ticket_note: note, omitDiscount: approvalNeeded }),
        print: false,
      };
      const response = await submitCreatedOrder(payload);
      if (approvalNeeded) {
        const approved = await runDiscountApprovalFlow(response.order.id, discountAmt);
        if (!approved) throw new Error("Discount approval cancelled.");
      }
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
    if (params.setDeliveryDetails) {
      // Clear leftover address from a previous delivery ticket so a
      // later switch to Delivery only dirties after the cashier types.
      params.setDeliveryDetails(deliveryDetailsFromOrder(response.order));
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
      packaging_fee: item.packaging_fee != null ? Number(item.packaging_fee) : 0,
      packaging_fee_mode:
        item.packaging_fee_mode === "per_line" ? "per_line" : "per_unit",
      packaging_option_id: item.packaging_option_id ?? null,
      packaging_option_name: item.packaging_option_name ?? null,
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
      const manualLaar = response.order.manual_discount_laar != null
        ? Number(response.order.manual_discount_laar)
        : null;
      const manualDiscount = manualLaar != null && Number.isFinite(manualLaar) && manualLaar > 0
        ? manualLaar / 100
        : 0;
      const baseline = manualDiscount > 0 ? manualDiscount.toFixed(2) : "";
      params.setDiscountAmount(baseline);
      setResumedDiscountBaseline(baseline);
    } else {
      setResumedDiscountBaseline("");
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
      setResumedTableId(preflight.order.restaurant_table_id ?? null);
      setResumedDeliveryFingerprint(deliveryFingerprint(deliveryDetailsFromOrder(preflight.order)));
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
    setResumedTableId(response.order.restaurant_table_id ?? null);
    setResumedDeliveryFingerprint(deliveryFingerprint(deliveryDetailsFromOrder(response.order)));
    setResumedStaffUserId(staffUserIdFromOrder(response.order));
    setResumedOrderTotal(response.order.total != null ? Number(response.order.total) : null);
    setResumedItemsFingerprint(cartFingerprint(restoredItems));
    // Active tickets open editable — Save appears only when dirty.
    setIsEditingActive(true);
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
    setResumedTableId(null);
    setResumedDeliveryFingerprint(null);
    setResumedStaffUserId(null);
    params.clearCart();
    params.setSelectedItem(null);
  };

  /**
   * Open an active ticket for edit/charge. Unpaid tickets resume
   * editable; paid tickets stay view-only.
   */
  const handleEditActiveTicket = async (orderId: number): Promise<void> => {
    await handleResumeTicket(orderId);
  };

  /**
   * Push the cart's current lines + fulfillment meta back to the
   * active order. Returns the fresh server total on success, or false
   * on failure — callers must use the returned total (React state from
   * setResumedOrderTotal is not visible inside the same in-flight closure).
   *
   * When `omitDiscountForApproval` is true (charge path will OTP next),
   * persist items with discount_amount 0 so create/patch never hits the
   * "Manager approval code required" 422.
   */
  const handleSaveActiveChanges = async (
    opts?: { omitDiscountForApproval?: boolean },
  ): Promise<number | false> => {
    if (resumedOrderId === null) return false;
    if (params.cartItems.length === 0) {
      flashError("Add at least one item before saving changes.");
      return false;
    }
    const discountNorm = normalizeDiscountAmount(params.discountAmount);
    const discountAmount = discountNorm ? Number.parseFloat(discountNorm) : 0;
    const discountPreflightErr = preflightManualDiscount(discountAmount);
    if (discountPreflightErr) {
      flashError(discountPreflightErr);
      return false;
    }
    const approvalNeeded = needsDiscountApproval(discountAmount);
    const omitDiscount = opts?.omitDiscountForApproval === true || approvalNeeded;

    setIsSubmitting(true);
    try {
      const items = params.cartItems.map((it) => ({
        item_id: it.id || null,
        name: it.name,
        quantity: it.quantity,
        variant_id: it.variant_id ?? null,
        packaging_option_id: it.packaging_option_id ?? null,
        notes: Array.isArray(it.notes) && it.notes.length > 0 ? it.notes.join(" · ") : undefined,
        modifiers: (it.modifiers ?? []).map((m) => ({
          modifier_id: m.id || null,
          name: m.name,
          price: m.price,
        })),
      }));
      const currentFp = cartFingerprint(params.cartItems);
      const itemsChanged = resumedItemsFingerprint !== currentFp;
      const nextType = currentTicketType();
      const nextTableId = currentTicketTableId();
      const deliveryPayload = nextType === "delivery"
        ? resolveDeliveryDetails(
          params.deliveryDetails ?? EMPTY_DELIVERY_DETAILS,
          {
            name: params.customerName,
            phone: params.customerPhone,
          },
        )
        : null;
      if (deliveryPayload) {
        const deliveryErr = validateDeliveryDetails(deliveryPayload, {
          name: params.customerName,
          phone: params.customerPhone,
        });
        if (deliveryErr) {
          flashError(deliveryErr);
          return false;
        }
      }
      const reason = (params.discountReason ?? "").trim() || undefined;
      const reasonNote = (params.discountReasonNote ?? "").trim() || undefined;
      const sendDiscount = omitDiscount ? 0 : discountAmount;
      const res = await updateOrderItems(resumedOrderId, {
        items,
        reprint_kitchen: itemsChanged,
        type: nextType,
        restaurant_table_id: nextTableId,
        discount_amount: sendDiscount,
        ...(sendDiscount > 0 && reason ? { discount_reason: reason } : {}),
        ...(sendDiscount > 0 && reasonNote ? { discount_reason_note: reasonNote } : {}),
        ...(deliveryPayload
          ? {
            delivery_address_line1: deliveryPayload.addressLine1.trim(),
            delivery_address_line2: deliveryPayload.addressLine2.trim() || null,
            delivery_island: deliveryPayload.island.trim(),
            delivery_contact_name: deliveryPayload.contactName.trim(),
            delivery_contact_phone: normalizeMvPhone(deliveryPayload.contactPhone.trim()),
            delivery_notes: deliveryPayload.notes.trim() || null,
            delivery_location_link: deliveryPayload.locationLink.trim() || null,
          }
          : {}),
      });
      let freshTotal = res.order.total != null ? Number(res.order.total) : null;

      // Standalone Save Changes with approval required — request OTP here.
      // Charge path passes omitDiscountForApproval and runs OTP itself.
      if (approvalNeeded && opts?.omitDiscountForApproval !== true) {
        setIsSubmitting(false);
        const approved = await runDiscountApprovalFlow(resumedOrderId, discountAmount);
        if (!approved) {
          flashError("Discount approval cancelled.");
          return false;
        }
        freshTotal = approved.total;
        setIsSubmitting(true);
      }

      setResumedOrderTotal(freshTotal);
      setResumedItemsFingerprint(currentFp);
      setResumedOrderType(res.order.type ?? nextType);
      setResumedTableId(
        res.order.restaurant_table_id !== undefined
          ? res.order.restaurant_table_id
          : nextTableId,
      );
      setResumedDeliveryFingerprint(deliveryFingerprint(
        deliveryPayload ?? EMPTY_DELIVERY_DETAILS,
      ));
      setResumedDiscountBaseline(discountNorm);
      setIsEditingActive(true);
      return freshTotal ?? 0;
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
    addToCart: (item: Item, opts?: { variant?: Variant | null }) => void,
  ) => {
    event.preventDefault();
    const trimmed = barcode.trim();
    if (!trimmed) return;

    // Offline, or when the lookup fails, the cached menu is all we have. It
    // carries sizes too, so a size's own code still resolves here rather than
    // silently doing nothing.
    let fallbackVariant: Variant | null = null;
    let fallbackMatch = items.find(
      (item) => (item as Item & { barcode?: string | null }).barcode === trimmed,
    );

    if (!fallbackMatch) {
      for (const item of items) {
        const hit = (item.variants ?? []).find(
          (v) => (v as Variant & { barcode?: string | null }).barcode === trimmed
            || (v as Variant & { sku?: string | null }).sku === trimmed,
        );
        if (hit) {
          fallbackMatch = item;
          fallbackVariant = hit;
          break;
        }
      }
    }

    const addFallback = () => {
      if (!fallbackMatch) return false;
      addToCart(fallbackMatch, fallbackVariant ? { variant: fallbackVariant } : undefined);
      setBarcode("");

      return true;
    };

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
        .then((found) => {
          if (barcodeRef.current.trim() !== scannedFor) return;
          if (found) {
            // A code on a size rings up that size. Passing the item alone
            // would let addToCart fall back to the first active variant,
            // which is a coin toss between Large and Small.
            addToCart(found.item, found.variant ? { variant: found.variant } : undefined);
            setBarcode("");
            return;
          }
          addFallback();
        })
        .catch(() => {
          if (barcodeRef.current.trim() !== scannedFor) return;
          addFallback();
        });
      return;
    }

    addFallback();
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

  const clearPendingPayment = useCallback(() => {
    setPendingPaymentForOrderId(null);
    setPendingPaymentSnapshot(null);
    chargeIdempotencyKeyRef.current = null;
  }, []);

  /** Clear pending-payment state when the cashier cancels that order. */
  const notifyOrderCancelled = useCallback((orderId: number) => {
    if (pendingPaymentForOrderId === orderId) {
      clearPendingPayment();
    }
  }, [pendingPaymentForOrderId, clearPendingPayment]);

  const hasUnsavedTicketChanges = computeTicketDirty();

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
    pendingPaymentTotalDue: pendingPaymentSnapshot?.totalDue ?? null,
    rewardWarning,
    resumedOrderId,
    resumedOrderTotal,
    resumedFromStatus,
    isEditingActive,
    setIsEditingActive,
    hasUnsavedTicketChanges,
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
    clearPendingPayment,
    notifyOrderCancelled,
    discountApproval,
    confirmDiscountApprovalCode,
    resendDiscountApproval,
    cancelDiscountApproval,
  };
}
