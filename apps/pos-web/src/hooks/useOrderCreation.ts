import { useRef, useState } from "react";
import { ApiRequestError } from "@shared/api";
import {
  applyGiftCardToOrder,
  applyPromoToOrder,
  createOrder,
  createOrderPayments,
  fireOrderToKitchen,
  getOrder,
  holdLoyaltyForOrder,
  holdOrder,
  lookupBarcode,
  resumeOrder,
  updateOrderItems,
} from "../api";
import {
  enqueue,
  getQueue,
  getQueueCount,
  setQueue,
  OfflineQueueFullError,
} from "../offlineQueue";
import type { CartItem, Item } from "../types";
import type { PaymentRow } from "./useCart";
import type { PosCustomer } from "../api";

type OrderType = "Dine-in" | "Takeaway" | "Pickup";

const mapOrderType = (type: OrderType): "dine_in" | "takeaway" | "online_pickup" => {
  if (type === "Dine-in")       return "dine_in";
  if (type === "Pickup") return "online_pickup";
  return "takeaway";
};

/**
 * Payment row sent to the server: strings are parsed into numbers and any
 * row without a positive amount is dropped. The remainder (if any) is
 * collected in `cash` by the checkout flow so the order is always settled.
 */
function normalizePayments(rows: PaymentRow[]): { method: string; amount: number }[] {
  return rows
    .map((p) => ({ method: p.method, amount: Number.parseFloat(p.amount) }))
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

/**
 * Post-charge banner text. For Pickup orders we nudge the cashier
 * toward Active orders so they don't forget the ticket is still
 * cooking — paid pickup orders now stay visible in that panel until
 * the customer physically collects (and the cashier marks them
 * picked up there). Dine-in and Takeaway behave as before.
 */
function pickupAwareSuccess(orderType: OrderType, hasCustomer: boolean): string {
  if (orderType === "Pickup") {
    return hasCustomer
      ? "✅ Paid. Cooking — track in Active orders, then tap Picked up."
      : "✅ Paid and sent to kitchen — track in Active orders, then tap Picked up.";
  }
  return hasCustomer
    ? "Order paid. Receipt SMS sent to customer."
    : "Order paid and sent to kitchen.";
}

type Params = {
  isOnline: boolean;
  deviceId: string;
  orderType: OrderType;
  selectedTableId: number | null;
  cartItems: CartItem[];
  cartTotal: number;
  payments: PaymentRow[];
  discountAmount: string;
  customerId: number | null;
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
  onOrderSettled?: (orderId: number, customerId: number | null, customerPhone: string | null) => void;
};

export function useOrderCreation(params: Params) {
  const [statusMessage, setStatusMessage] = useState("");
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
    return {
      type: mapOrderType(params.orderType),
      print: true,
      device_identifier: params.deviceId,
      restaurant_table_id:
        params.orderType === "Dine-in" ? params.selectedTableId ?? undefined : undefined,
      // Attach the cart's customer so the order belongs to them. Server-side
      // PaymentConfirmationNotifier picks this up automatically and SMS's
      // the receipt link to customer.phone once the order is fully paid.
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
        // Free-form kitchen note string. We join the cashier's chip
        // selections with " · " (middle dot + spaces) so the receipt
        // and kitchen ticket render multiple notes legibly without
        // looking like a sentence. Empty notes are omitted so the
        // backend stores NULL (existing behaviour) instead of "".
        ...(item.notes && item.notes.length > 0
          ? { notes: item.notes.join(" · ") }
          : {}),
      })),
    };
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
    let total = currentTotal;
    // Bug-050: collect every reward failure into one combined
    // message instead of overwriting each other (and silently
    // disappearing). Previously a failed promo, then a failed
    // gift card, would each call setStatusMessage and the
    // second wiped the first — the cashier saw "Gift card
    // failed" and settled the order assuming the promo had
    // applied. Combined here so the cashier sees a single
    // sticky banner listing every reward that didn't take and
    // can decide whether to renegotiate with the customer
    // before tendering.
    const failures: string[] = [];

    if (params.appliedPromoCode) {
      try {
        await applyPromoToOrder(orderId, params.appliedPromoCode);
      } catch (err) {
        failures.push(`promo "${params.appliedPromoCode}" (${(err as Error).message})`);
      }
    }

    if (params.appliedLoyaltyPoints && params.appliedLoyaltyPoints > 0) {
      try {
        const res = await holdLoyaltyForOrder(orderId, params.appliedLoyaltyPoints);
        total = res.order.total;
      } catch (err) {
        failures.push(`loyalty redemption (${(err as Error).message})`);
      }
    }

    if (params.appliedGiftCardCode) {
      try {
        const res = await applyGiftCardToOrder(orderId, params.appliedGiftCardCode);
        total = res.order.total;
      } catch (err) {
        failures.push(`gift card "${params.appliedGiftCardCode}" (${(err as Error).message})`);
      }
    }

    // Final read — handles the promo case where we don't get the order
    // back inline (apply-promo returns a discount, not a fresh totals
    // payload). Cheap GET; only fires when we actually applied something.
    if (params.appliedPromoCode || params.appliedLoyaltyPoints || params.appliedGiftCardCode) {
      try {
        const fresh = await getOrder(orderId);
        if (typeof fresh.order.total === "number") total = fresh.order.total;
      } catch { /* keep last-known total */ }
    }

    if (failures.length > 0) {
      setStatusMessage(
        `⚠️ ${failures.length === 1 ? "Reward failed:" : "Rewards failed:"} ${failures.join("; ")}. ` +
        `The new total is MVR ${total.toFixed(2)}. Confirm before tendering.`,
      );
      // Sticky for 12s — long enough to read and decide what to do.
      setTimeout(() => setStatusMessage(""), 12000);
    }

    return total;
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
    const paidTotal = normalized.reduce((s, p) => s + p.amount, 0);
    const finalPayments = [...normalized];
    // Zero-balance order (100% promo/loyalty/gift-card discount, or
    // an entirely complimentary ring). The server's payment endpoint
    // accepts a single zero-amount cash row in this case and marks
    // the order paid via the existing paid_total >= total check. We
    // can't simply send an empty array — the StoreOrderPaymentsRequest
    // validator requires `payments|required|array|min:1`.
    if (totalDue <= 0) {
      if (finalPayments.length === 0) {
        finalPayments.push({ method: "cash", amount: 0 });
      }
    } else if (finalPayments.length === 0) {
      finalPayments.push({ method: "cash", amount: totalDue });
    } else if (paidTotal < totalDue) {
      finalPayments.push({ method: "cash", amount: totalDue - paidTotal });
    }

    try {
      await createOrderPayments(orderId, { payments: finalPayments, print_receipt: true });
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
          setStatusMessage("Session expired — please log back in.");
          return false;
        }
        setStatusMessage(`Payment failed: ${msg}`);
      } else {
        setStatusMessage("Network issue — payment not recorded. Retry once back online.");
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
      // Edit-mode safety: if the cashier opened the ticket for editing
      // and made changes (add/remove items, qty tweaks), settling now
      // would charge `resumedOrderTotal` — the SERVER's pre-edit total
      // — not what the cart actually contains. Customer would over-
      // or under-pay. Force them to commit the edits via "Save
      // changes" first; that call refreshes `resumedOrderTotal` and
      // flips `isEditingActive` back off, after which Charge is safe
      // to use the (now-authoritative) server total.
      if (isEditingActive) {
        setStatusMessage(
          "Tap \u201cSave changes\u201d on the resume banner first \u2014 the new total has to be sent to the server before you can charge.",
        );
        setTimeout(() => setStatusMessage(""), 6000);
        return false;
      }
      setIsSubmitting(true);
      try {
        // Use the server-captured total — not params.cartTotal — so a
        // resume→charge always settles the exact ticket the server
        // already has. Safe by construction now that the edit-mode
        // guard above forces a Save before we get here.
        const totalDue = resumedOrderTotal ?? params.cartTotal;
        const settled = await settleOrder(resumedOrderId, totalDue, paymentSnapshot);
        if (settled) {
          const cid = params.customerId;
          const cphone = params.customerPhone;
          const settledOrderId = resumedOrderId;
          setResumedOrderId(null);
          setResumedOrderTotal(null);
          setResumedItemsFingerprint(null);
          setResumedFromStatus(null);
          setIsEditingActive(false);
          params.clearCart();
          params.setSelectedItem(null);
          setStatusMessage(pickupAwareSuccess(params.orderType, cid != null));
          setTimeout(() => setStatusMessage(""), 6000);
          params.onOrderSettled?.(settledOrderId, cid, cphone);
        }
        return settled;
      } finally {
        setIsSubmitting(false);
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

    if (!params.isOnline) {
      try {
        await enqueue({ order: payload, payments: paymentSnapshot, rewards: stagedRewards });
        params.setOfflineQueueCount(getQueueCount());
        params.clearCart();
        params.setSelectedItem(null);
        setStatusMessage("Offline order queued. Will sync when online.");
        setTimeout(() => setStatusMessage(""), 6000);
        return true;
      } catch (err) {
        if (err instanceof OfflineQueueFullError) {
          setStatusMessage(`⛔ Offline queue full (${err.size}). Reconnect and Sync.`);
        } else {
          setStatusMessage("Unable to save offline order. Please try again.");
        }
        return false;
      }
    }

    setIsSubmitting(true);
    let orderCreated = false;
    try {
      const response = await createOrder(payload);
      orderCreated = true;
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
        setStatusMessage(pickupAwareSuccess(params.orderType, cid != null));
        setTimeout(() => setStatusMessage(""), 6000);
        params.onOrderSettled?.(response.order.id, cid, cphone);
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
        return false;
      }
      const message = (err as Error)?.message ?? "";
      const isApiError = err instanceof ApiRequestError;
      const status = isApiError ? err.status : undefined;

      if (isApiError) {
        const isDeviceBlock =
          message.includes("Device disabled") ||
          message.includes("Device pending") ||
          message.includes("Device rejected") ||
          message.includes("Device identifier") ||
          message.includes("Device not registered") ||
          status === 401 || status === 403;
        setStatusMessage(isDeviceBlock ? `⛔ ${message}` : `Order failed: ${message}`);
        return false;
      }

      try {
        await enqueue({ order: payload, payments: paymentSnapshot, rewards: stagedRewards });
        params.setOfflineQueueCount(getQueueCount());
        setStatusMessage("Network error. Order queued for sync (payments included).");
      } catch (e) {
        if (e instanceof OfflineQueueFullError) {
          setStatusMessage(`⛔ Offline queue full (${e.size}). Reconnect and Sync.`);
        } else {
          setStatusMessage("Network error and unable to queue. Try again.");
        }
      }
      return false;
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
          setStatusMessage("Payment recorded.");
          // Bug-015: 4s was too quick for a busy cashier to look up
          // from the cash drawer and read the message. 6s is the
          // POS-wide floor for success banners.
          setTimeout(() => setStatusMessage(""), 6000);
          params.onOrderSettled?.(orderId, cid, cphone);
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
    // Table is OPTIONAL on Dine-in tickets — the backend accepts a
    // null restaurant_table_id, and venues often save the ticket
    // before seating the customer (the cashier comes back later to
    // assign a table from the Save Ticket modal).

    if (fireToKitchen) {
      // Pickup phone-call workflow uses a two-step path so all
      // "fire" side effects (kitchen print + customer SMS + audit
      // log) live in ONE backend endpoint instead of being split
      // between OrderCreated listeners and the explicit fire
      // endpoint:
      //   1. Create order with print=false so OrderCreated fires
      //      WITHOUT kitchen print or "Order received" SMS.
      //   2. POST /orders/{id}/fire-to-kitchen — sets fired_at,
      //      enqueues kitchen print, SMSes the customer.
      // The status starts at pending (not held) because we want it
      // visible to KDS once fired. Two HTTP calls but cleaner code.
      const payload = { ...buildPayload({ ticket_name: name, ticket_note: note }), print: false };
      const response = await createOrder(payload);
      await fireOrderToKitchen(response.order.id);
      params.clearCart();
      params.setSelectedItem(null);
      setStatusMessage(`Ticket "${name}" fired to kitchen — unpaid.`);
      setTimeout(() => setStatusMessage(""), 6000);
      return;
    }

    // Classic save-for-later: create then hold so KDS never sees it.
    const payload = { ...buildPayload({ ticket_name: name, ticket_note: note }), print: false };
    const response = await createOrder(payload);
    await holdOrder(response.order.id, { ticket_name: name, ticket_note: note });

    localStorage.setItem("pos_last_held_order", String(response.order.id));
    setLastHeldOrderId(response.order.id);
    params.clearCart();
    params.setSelectedItem(null);
    setStatusMessage(`Ticket "${name}" saved.`);
    setTimeout(() => setStatusMessage(""), 6000);
  };

  /**
   * Resume a specific held ticket by id.
   *
   * Sets `resumedOrderId` so the next `handleCharge` settles THIS
   * order instead of creating a new one (the duplicate-order bug
   * fix). The cart UI flips to read-only — cashier must
   * `handleCancelResume` to put it back into Open Tickets and re-ring
   * if they need to edit items.
   */
  const handleResumeTicket = async (orderId: number): Promise<void> => {
    // Pre-flight: a phone-call pickup ticket can be paid online by
    // the customer via BML pay link between when the cashier opened
    // Open Tickets and when they tapped Resume. Detect that here and
    // tell the cashier to print the receipt instead of trying to
    // resume (which would fail with "paid orders can't be resumed").
    // This is cheap (one extra GET) and prevents a confusing error.
    const preflight = await getOrder(orderId);
    if (preflight.order.payment_status === "paid" || preflight.order.status === "paid") {
      setStatusMessage(
        `Ticket #${orderId} was paid online — open it from Receipts to print.`,
      );
      setTimeout(() => setStatusMessage(""), 6000);
      throw new Error("Already paid — see Receipts.");
    }

    // The backend `resume` endpoint walks held → pending via the state
    // machine. For any other status (pending/in_progress/ready) the
    // ticket is already "live" and calling resume would 422 because
    // pending → pending is not a valid transition. Before Active
    // orders existed this never came up (the panel only showed held
    // tickets); now the same Charge button can be tapped on a cooking
    // ticket, so we skip the transition for non-held orders and just
    // load them into the cart for settlement.
    if (preflight.order.status === "held") {
      await resumeOrder(orderId);
    }
    setResumedFromStatus(preflight.order.status ?? null);
    const response = await getOrder(orderId);

    // Restore the ticket-level context the cashier had when they held
    // the order. Without this, resuming a held Dine-in / Table 4 /
    // Aisha ticket dropped you into a Takeaway-default cart with no
    // customer attached — and the post-charge bill SMS went nowhere
    // because params.customerPhone was null. Each setter is optional
    // (gated on whether the caller wired them up).
    if (response.order.customer && params.setAttachedCustomer) {
      params.setAttachedCustomer(response.order.customer);
    }
    if (response.order.type && params.setOrderType) {
      // Backend uses snake_case enum values, the cashier UI uses
      // friendly labels. Anything we don't recognise falls through
      // without resetting (defensive: keeps the current type as-is).
      const typeMap: Record<string, OrderType> = {
        dine_in: "Dine-in",
        takeaway: "Takeaway",
        online_pickup: "Pickup",
      };
      const mapped = typeMap[response.order.type];
      if (mapped) params.setOrderType(mapped);
    }
    if (params.setSelectedTableId) {
      params.setSelectedTableId(response.order.restaurant_table_id ?? null);
    }

    const restoredItems: CartItem[] = response.order.items.map((item) => ({
      id: item.item_id ?? 0,
      name: item.item_name,
      price: item.unit_price,
      quantity: item.quantity,
      variant_id: item.variant_id ?? null,
      variant_name: item.variant_name ?? null,
      modifiers: item.modifiers?.map((m) => ({
        id: m.modifier_id ?? 0,
        name: m.modifier_name,
        price: m.modifier_price,
      })) ?? [],
      // Restore the per-line tax snapshot so the cart breakdown still
      // shows GST when the cashier resumes a held ticket. Without this
      // the cart would render Subtotal only and the Charge button would
      // visually disagree with the server total (settle still uses the
      // authoritative `resumedOrderTotal`, but the cashier shouldn't
      // see a misleading number).
      tax_rate: item.tax_rate != null ? Number(item.tax_rate) : 0,
      // Restore notes. Backend stores them as a single string (we
      // joined chips with " · " before sending), so we split back so
      // the chip picker correctly pre-selects what the cashier
      // originally chose. Trim each part defensively in case the
      // string was hand-edited elsewhere.
      notes: typeof item.notes === "string" && item.notes.trim().length > 0
        ? item.notes.split(" · ").map((s) => s.trim()).filter(Boolean)
        : [],
    }));
    params.setCartItems(restoredItems);
    setResumedOrderId(orderId);
    // Snapshot the authoritative server total so charge time uses it
    // even if the local cart calculation produces a different number.
    setResumedOrderTotal(response.order.total ?? null);
    // Take a fingerprint of the resumed items so handleSaveActiveChanges
    // can later decide if the kitchen actually needs a reprint.
    setResumedItemsFingerprint(cartFingerprint(restoredItems));
    localStorage.removeItem("pos_last_held_order");
    setLastHeldOrderId(null);
    setStatusMessage(`Ticket #${orderId} resumed — ready to charge.`);
    setTimeout(() => setStatusMessage(""), 6000);
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
    params.clearCart();
    params.setSelectedItem(null);
    setStatusMessage(
      wasHeld
        ? `Ticket #${id} returned to Open Tickets.`
        : `Cancelled — ticket #${id} is still in Active orders.`,
    );
    setTimeout(() => setStatusMessage(""), 6000);
  };

  /**
   * "Tap to edit" pathway — same as handleResumeTicket but flips the
   * cart into edit-mode so the cashier can add/remove items before
   * either saving (handleSaveActiveChanges) or charging (handleCharge).
   * Used by the OpenTicketsPanel when the cashier taps the row itself
   * (vs. tapping a specific action button).
   */
  const handleEditActiveTicket = async (orderId: number): Promise<void> => {
    await handleResumeTicket(orderId);
    setIsEditingActive(true);
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
      setStatusMessage("Add at least one item before saving changes.");
      setTimeout(() => setStatusMessage(""), 6000);
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
      setResumedOrderTotal(res.order.total ?? null);
      setResumedItemsFingerprint(currentFp);
      setIsEditingActive(false);
      setStatusMessage(
        itemsChanged
          ? `Ticket #${resumedOrderId} updated — kitchen chit reprinted.`
          : `Ticket #${resumedOrderId} saved — no item changes, kitchen not notified.`,
      );
      setTimeout(() => setStatusMessage(""), 6000);
      return true;
    } catch (err) {
      setStatusMessage(`Couldn't save changes: ${(err as Error).message}`);
      // Errors get a longer fuse — cashier needs time to read,
      // remember to retry, and decide what to tell the customer.
      setTimeout(() => setStatusMessage(""), 10000);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Legacy single-button hold — used when the user just taps Save Ticket
   *  without naming. Falls back to a default name based on the cart. */
  const handleHoldOrder = () => {
    void handleSaveTicket(`Ticket ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)
      .catch((e) => setStatusMessage((e as Error).message));
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
    if (!params.isOnline) { setStatusMessage("You are offline. Sync paused."); return; }
    // Re-entrancy guard. Without this, a fast double-tap on "Sync" or a
    // back-to-back online event + visibility event will start two
    // concurrent syncs that both pop from the queue and each try to
    // create the same orders — server-side idempotency would handle it,
    // but client-side counter math gets confused and status messages
    // race each other.
    if (isSyncingQueue) { setStatusMessage("Sync already in progress…"); return; }

    const queue = getQueue();
    if (queue.length === 0) { setStatusMessage("No queued orders to sync."); return; }

    setIsSyncingQueue(true);
    void (async () => {
      const remaining: typeof queue = [];
      let processed = 0;
      let paymentMisses = 0;

      for (const entry of queue) {
        const payload = entry.payload as {
          order?: Record<string, unknown>;
          payments?: PaymentRow[];
          rewards?: {
            promo_code?: string | null;
            loyalty_points?: number;
            gift_card_code?: string | null;
          };
        };
        // Legacy entries (pre-payment-fix) had the order at the top level.
        const orderPayload = (payload.order ?? entry.payload) as Parameters<typeof createOrder>[0];
        const paymentRows = payload.payments ?? [];
        const rewards = payload.rewards ?? {};

        try {
          const res = await createOrder(orderPayload);
          processed += 1;
          let totalDue = res.order.total ?? 0;

          // Bug-013: re-apply staged rewards in the same order
          // applyStagedRewards uses (promo → loyalty → gift card)
          // so the final total matches what the cashier saw on the
          // POS at offline-ring time. Failures are swallowed —
          // the order still lands and settle below will at least
          // book the customer's collected payment, with any
          // shortfall surfacing as a paymentMiss.
          if (rewards.promo_code) {
            try { await applyPromoToOrder(res.order.id, rewards.promo_code); } catch { /* skip */ }
          }
          if (rewards.loyalty_points && rewards.loyalty_points > 0) {
            try {
              const r = await holdLoyaltyForOrder(res.order.id, rewards.loyalty_points);
              totalDue = r.order.total;
            } catch { /* skip */ }
          }
          if (rewards.gift_card_code) {
            try {
              const r = await applyGiftCardToOrder(res.order.id, rewards.gift_card_code);
              totalDue = r.order.total;
            } catch { /* skip */ }
          }
          // Final read so settle uses the authoritative total when
          // any reward was attempted (matches applyStagedRewards).
          if (rewards.promo_code || (rewards.loyalty_points ?? 0) > 0 || rewards.gift_card_code) {
            try {
              const fresh = await getOrder(res.order.id);
              if (typeof fresh.order.total === "number") totalDue = fresh.order.total;
            } catch { /* keep last-known */ }
          }

          // Best-effort payment settlement; if it fails the order still exists
          // and the cashier sees a count of unpaid orders to handle in admin.
          const ok = await settleOrder(res.order.id, totalDue, paymentRows);
          if (!ok) {
            paymentMisses += 1;
            setPendingPaymentForOrderId(null); // don't pin one stale id
          }
        } catch {
          // Keep entry for retry.
          remaining.push(entry);
        }
      }

      setQueue(remaining);
      params.setOfflineQueueCount(remaining.length);

      if (remaining.length === 0 && paymentMisses === 0) {
        setStatusMessage(`Synced ${processed} orders.`);
      } else if (remaining.length === 0) {
        setStatusMessage(`Synced ${processed} orders. ⚠ ${paymentMisses} need payment in admin.`);
      } else {
        setStatusMessage(
          `Synced ${processed}, ${remaining.length} failed (kept in queue)${paymentMisses ? `, ${paymentMisses} need payment in admin` : ''}.`,
        );
      }
      setIsSyncingQueue(false);
    })();
  };

  return {
    statusMessage,
    setStatusMessage,
    isSubmitting,
    lastHeldOrderId,
    lastCreatedOrderId,
    pendingPaymentForOrderId,
    resumedOrderId,
    resumedFromStatus,
    isEditingActive,
    setIsEditingActive,
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
