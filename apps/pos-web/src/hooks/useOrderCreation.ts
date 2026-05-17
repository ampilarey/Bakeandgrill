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
  clearCart: () => void;
  setCartItems: (items: CartItem[]) => void;
  setSelectedItem: (item: Item | null) => void;
  setOfflineQueueCount: (n: number) => void;
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

  const buildPayload = () => {
    const discount = Math.max(0, Number.parseFloat(params.discountAmount) || 0);
    return {
      type: mapOrderType(params.orderType),
      print: true,
      device_identifier: params.deviceId,
      restaurant_table_id:
        params.orderType === "Dine-in" ? params.selectedTableId ?? undefined : undefined,
      discount_amount: discount,
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
      return true;
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (err instanceof ApiRequestError) {
        setStatusMessage(`Payment failed: ${msg}`);
      } else {
        setStatusMessage("Network issue — payment not recorded. Retry once back online.");
      }
      setPendingPaymentForOrderId(orderId);
      return false;
    }
  };

  const handleCheckout = () => {
    if (params.cartItems.length === 0) return;
    if (isSubmitting) return;
    if (params.orderType === "Dine-in" && !params.selectedTableId) {
      setStatusMessage("Select a table for dine-in orders.");
      return;
    }

    const payload = buildPayload();
    const paymentSnapshot = [...params.payments];

    if (!params.isOnline) {
      // Offline path: include payment intent so it can be settled on sync.
      void (async () => {
        try {
          await enqueue({ order: payload, payments: paymentSnapshot });
          params.setOfflineQueueCount(getQueueCount());
          params.clearCart();
          params.setSelectedItem(null);
          setStatusMessage("Offline order queued. Will sync when online.");
          setTimeout(() => setStatusMessage(""), 5000);
        } catch (err) {
          if (err instanceof OfflineQueueFullError) {
            setStatusMessage(
              `⛔ Offline queue full (${err.size} orders). Connect to internet and Sync before taking more orders.`,
            );
          } else {
            setStatusMessage("Unable to save offline order. Please try again.");
          }
        }
      })();
      return;
    }

    setIsSubmitting(true);
    let orderCreated = false;
    let newOrderId: number | null = null;

    createOrder(payload)
      .then(async (response) => {
        orderCreated = true;
        newOrderId = response.order.id;
        setLastCreatedOrderId(response.order.id);
        const totalDue = response.order.total ?? params.cartTotal;
        const settled = await settleOrder(response.order.id, totalDue, paymentSnapshot);
        if (settled) {
          params.clearCart();
          params.setSelectedItem(null);
          setStatusMessage("Order paid and sent to kitchen.");
          setTimeout(() => setStatusMessage(""), 5000);
        }
      })
      .catch(async (err: unknown) => {
        if (orderCreated) return; // payment error already surfaced by settleOrder
        const message = (err as Error)?.message ?? '';
        const isApiError = err instanceof ApiRequestError;
        const status = isApiError ? err.status : undefined;

        if (isApiError) {
          const isDeviceBlock =
            message.includes('Device disabled') ||
            message.includes('Device pending') ||
            message.includes('Device rejected') ||
            message.includes('Device identifier') ||
            message.includes('Device not registered') ||
            status === 401 ||
            status === 403;
          setStatusMessage(isDeviceBlock ? `⛔ ${message}` : `Order failed: ${message}`);
          return;
        }

        // True network failure — safe to queue (with payments).
        try {
          await enqueue({ order: payload, payments: paymentSnapshot });
          params.setOfflineQueueCount(getQueueCount());
          setStatusMessage("Network error. Order queued for sync (payments included).");
        } catch (e) {
          if (e instanceof OfflineQueueFullError) {
            setStatusMessage(
              `⛔ Offline queue full (${e.size} orders). Reconnect and Sync.`,
            );
          } else {
            setStatusMessage("Network error and unable to queue. Try again.");
          }
        }
      })
      .finally(() => {
        setIsSubmitting(false);
        void newOrderId; // silence unused-var lint when nothing uses it
      });
  };

  const handleRetryPayment = () => {
    if (!pendingPaymentForOrderId || isSubmitting) return;
    setIsSubmitting(true);
    void (async () => {
      try {
        const totalDue = params.cartTotal;
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

  const handleHoldOrder = () => {
    if (!params.isOnline) {
      setStatusMessage("Go online and login to hold orders.");
      return;
    }
    if (params.cartItems.length === 0) return;
    if (params.orderType === "Dine-in" && !params.selectedTableId) {
      setStatusMessage("Select a table for dine-in orders.");
      return;
    }

    const payload = { ...buildPayload(), print: false };

    createOrder(payload)
      .then((response) => holdOrder(response.order.id).then(() => response.order.id))
      .then((orderId) => {
        localStorage.setItem("pos_last_held_order", String(orderId));
        setLastHeldOrderId(orderId);
        params.clearCart();
        params.setSelectedItem(null);
        setStatusMessage(`Order ${orderId} held.`);
      })
      .catch((err: unknown) => {
        const msg = (err as Error).message ?? "";
        if (err instanceof ApiRequestError) {
          setStatusMessage(`Hold failed: ${msg}`);
        } else {
          setStatusMessage("Unable to hold order. Try again.");
        }
      });
  };

  const handleResumeLastHold = () => {
    if (!params.isOnline || !lastHeldOrderId) return;

    resumeOrder(lastHeldOrderId)
      .then(() => getOrder(lastHeldOrderId))
      .then((response) => {
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
        }));
        params.setCartItems(restoredItems);
        localStorage.removeItem("pos_last_held_order");
        setLastHeldOrderId(null);
        setStatusMessage("Held order resumed.");
      })
      .catch(() => setStatusMessage("Unable to resume held order."));
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
      lookupBarcode(trimmed)
        .then((item) => {
          if (item) { addToCart(item); setBarcode(""); return; }
          if (fallbackMatch) { addToCart(fallbackMatch); setBarcode(""); }
        })
        .catch(() => {
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

    const queue = getQueue();
    if (queue.length === 0) { setStatusMessage("No queued orders to sync."); return; }

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
    })();
  };

  return {
    statusMessage,
    setStatusMessage,
    isSubmitting,
    lastHeldOrderId,
    lastCreatedOrderId,
    pendingPaymentForOrderId,
    barcode,
    setBarcode,
    handleCheckout,
    handleHoldOrder,
    handleResumeLastHold,
    handleBarcodeSubmit,
    handleSyncQueue,
    handleRetryPayment,
  };
}
