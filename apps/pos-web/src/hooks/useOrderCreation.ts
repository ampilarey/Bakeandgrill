import { useState } from "react";
import { ApiRequestError } from "@shared/api";
import {
  createOrder,
  createOrderPayments,
  getOrder,
  holdOrder,
  lookupBarcode,
  resumeOrder,
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

type OrderType = "Dine-in" | "Takeaway" | "Online Pickup";

const mapOrderType = (type: OrderType): "dine_in" | "takeaway" | "online_pickup" => {
  if (type === "Dine-in")       return "dine_in";
  if (type === "Online Pickup") return "online_pickup";
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
  clearCart: () => void;
  setCartItems: (items: CartItem[]) => void;
  setSelectedItem: (item: Item | null) => void;
  setOfflineQueueCount: (n: number) => void;
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
  const [barcode, setBarcode] = useState("");
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
  /**
   * Snapshot of the totalDue captured when an order was created but
   * payment failed. Used by handleRetryPayment so we charge the same
   * amount on retry that the server already validated, regardless of
   * any subsequent cart edits.
   */
  const [pendingPaymentSnapshot, setPendingPaymentSnapshot] = useState<{
    orderId: number;
    totalDue: number;
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
      })),
    };
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
    if (finalPayments.length === 0) {
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
      // Snapshot the totalDue from THIS attempt so retry charges the
      // server-validated total, not the (possibly drifted) cartTotal.
      setPendingPaymentSnapshot({ orderId, totalDue });
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
    if (params.orderType === "Dine-in" && !params.selectedTableId) {
      setStatusMessage("Select a table for dine-in orders.");
      return false;
    }

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
      setIsSubmitting(true);
      try {
        // Use the server-captured total — not params.cartTotal — so a
        // resume→charge always settles the exact ticket the server
        // already has, even if the cashier somehow modified the local
        // cart (shouldn't happen because the cart is read-only on
        // resume, but defense in depth).
        const totalDue = resumedOrderTotal ?? params.cartTotal;
        const settled = await settleOrder(resumedOrderId, totalDue, paymentSnapshot);
        if (settled) {
          const cid = params.customerId;
          const cphone = params.customerPhone;
          const settledOrderId = resumedOrderId;
          setResumedOrderId(null);
          setResumedOrderTotal(null);
          params.clearCart();
          params.setSelectedItem(null);
          setStatusMessage(
            cid
              ? "Order paid. Receipt SMS sent to customer."
              : "Order paid and sent to kitchen.",
          );
          setTimeout(() => setStatusMessage(""), 5000);
          params.onOrderSettled?.(settledOrderId, cid, cphone);
        }
        return settled;
      } finally {
        setIsSubmitting(false);
      }
    }

    const payload = buildPayload();

    if (!params.isOnline) {
      try {
        await enqueue({ order: payload, payments: paymentSnapshot });
        params.setOfflineQueueCount(getQueueCount());
        params.clearCart();
        params.setSelectedItem(null);
        setStatusMessage("Offline order queued. Will sync when online.");
        setTimeout(() => setStatusMessage(""), 5000);
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
      const totalDue = response.order.total ?? params.cartTotal;
      const settled = await settleOrder(response.order.id, totalDue, paymentSnapshot);
      if (settled) {
        // Snapshot the customer BEFORE clearCart wipes attachedCustomer.
        const cid = params.customerId;
        const cphone = params.customerPhone;
        params.clearCart();
        params.setSelectedItem(null);
        setStatusMessage(
          cid
            ? "Order paid. Receipt SMS sent to customer."
            : "Order paid and sent to kitchen.",
        );
        setTimeout(() => setStatusMessage(""), 5000);
        params.onOrderSettled?.(response.order.id, cid, cphone);
      }
      return settled;
    } catch (err: unknown) {
      if (orderCreated) return false;
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
        await enqueue({ order: payload, payments: paymentSnapshot });
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
        // Use the totalDue captured when the original payment attempt
        // happened — the cart may have been cleared/edited since, and
        // we must charge the same amount the server already validated.
        const snapshot = pendingPaymentSnapshot;
        const totalDue = snapshot && snapshot.orderId === pendingPaymentForOrderId
          ? snapshot.totalDue
          : params.cartTotal;
        const settled = await settleOrder(
          pendingPaymentForOrderId,
          totalDue > 0 ? totalDue : 0,
          params.payments,
        );
        if (settled) {
          params.clearCart();
          params.setSelectedItem(null);
          setStatusMessage("Payment recorded.");
          setTimeout(() => setStatusMessage(""), 4000);
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
   */
  const handleSaveTicket = async (name: string, note?: string): Promise<void> => {
    if (!params.isOnline) throw new Error("Go online to save tickets.");
    if (params.cartItems.length === 0) throw new Error("Add items first.");
    if (params.orderType === "Dine-in" && !params.selectedTableId) {
      throw new Error("Select a table for dine-in orders.");
    }

    const payload = { ...buildPayload({ ticket_name: name, ticket_note: note }), print: false };
    const response = await createOrder(payload);
    await holdOrder(response.order.id, { ticket_name: name, ticket_note: note });

    localStorage.setItem("pos_last_held_order", String(response.order.id));
    setLastHeldOrderId(response.order.id);
    params.clearCart();
    params.setSelectedItem(null);
    setStatusMessage(`Ticket "${name}" saved.`);
    setTimeout(() => setStatusMessage(""), 4000);
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
    await resumeOrder(orderId);
    const response = await getOrder(orderId);
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
    }));
    params.setCartItems(restoredItems);
    setResumedOrderId(orderId);
    // Snapshot the authoritative server total so charge time uses it
    // even if the local cart calculation produces a different number.
    setResumedOrderTotal(response.order.total ?? null);
    localStorage.removeItem("pos_last_held_order");
    setLastHeldOrderId(null);
    setStatusMessage(`Ticket #${orderId} resumed — ready to charge.`);
    setTimeout(() => setStatusMessage(""), 3000);
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
    try {
      await holdOrder(id);
    } catch {
      // If the re-hold fails (rare), still clear local state so the
      // cashier isn't stuck in a broken resumed mode. The order will
      // remain in "pending" status on the server and the cashier can
      // resume it again from Open Tickets.
    }
    setResumedOrderId(null);
    setResumedOrderTotal(null);
    params.clearCart();
    params.setSelectedItem(null);
    setStatusMessage(`Ticket #${id} returned to Open Tickets.`);
    setTimeout(() => setStatusMessage(""), 3000);
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
      const scannedFor = trimmed;
      lookupBarcode(trimmed)
        .then((item) => {
          // Only act on this resolve if the input still shows the same
          // barcode (i.e. the user didn't scan something else in the
          // meantime).
          if (barcode.trim() !== scannedFor) return;
          if (item) { addToCart(item); setBarcode(""); return; }
          if (fallbackMatch) { addToCart(fallbackMatch); setBarcode(""); }
        })
        .catch(() => {
          if (barcode.trim() !== scannedFor) return;
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
        };
        // Legacy entries (pre-payment-fix) had the order at the top level.
        const orderPayload = (payload.order ?? entry.payload) as Parameters<typeof createOrder>[0];
        const paymentRows = payload.payments ?? [];

        try {
          const res = await createOrder(orderPayload);
          processed += 1;
          // Best-effort payment settlement; if it fails the order still exists
          // and the cashier sees a count of unpaid orders to handle in admin.
          const totalDue = res.order.total ?? 0;
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
    barcode,
    setBarcode,
    handleCheckout,
    handleCharge,
    handleHoldOrder,
    handleSaveTicket,
    handleResumeTicket,
    handleCancelResume,
    handleBarcodeSubmit,
    handleSyncQueue,
    handleRetryPayment,
  };
}
