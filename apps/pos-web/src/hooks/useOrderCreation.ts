import { useState } from "react";
import {
  createOrder,
  createOrderBatch,
  createOrderPayments,
  getOrder,
  holdOrder,
  lookupBarcode,
  resumeOrder,
} from "../api";
import { enqueue, getQueue, getQueueCount, setQueue } from "../offlineQueue";
import type { CartItem, Item } from "../types";
import type { PaymentRow } from "./useCart";
import { makeCartKey } from "./useCart";

type OrderType = "Dine-in" | "Takeaway" | "Online Pickup";

const mapOrderType = (type: OrderType): "dine_in" | "takeaway" | "online_pickup" => {
  if (type === "Dine-in")       return "dine_in";
  if (type === "Online Pickup") return "online_pickup";
  return "takeaway";
};

type Params = {
  token: string | null;
  isOnline: boolean;
  deviceId: string;
  orderType: OrderType;
  selectedTableId: number | null;
  cartItems: CartItem[];
  cartTotal: number;
  payments: PaymentRow[];
  discountAmount: string;
  clearCart: () => void;
  setSelectedItem: (item: Item | null) => void;
  setOfflineQueueCount: (n: number) => void;
};

export function useOrderCreation(params: Params) {
  const [statusMessage, setStatusMessage] = useState("");
  const [lastHeldOrderId, setLastHeldOrderId] = useState<number | null>(() => {
    const raw = localStorage.getItem("pos_last_held_order");
    return raw ? Number(raw) : null;
  });
  const [barcode, setBarcode] = useState("");

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
        modifiers: item.modifiers.map((m) => ({ modifier_id: m.id, name: m.name, price: m.price })),
      })),
    };
  };

  const handleCheckout = () => {
    if (params.cartItems.length === 0) return;
    if (params.orderType === "Dine-in" && !params.selectedTableId) {
      setStatusMessage("Select a table for dine-in orders.");
      return;
    }

    const payload = buildPayload();

    if (params.isOnline && params.token) {
      createOrder(params.token, payload)
        .then((response) => {
          const parsedPayments = params.payments
            .map((p) => ({ method: p.method, amount: Number.parseFloat(p.amount) }))
            .filter((p) => Number.isFinite(p.amount) && p.amount > 0);

          const totalDue = response.order.total ?? params.cartTotal;
          const paidTotal = parsedPayments.reduce((s, p) => s + p.amount, 0);
          const finalPayments = [...parsedPayments];

          if (finalPayments.length === 0) {
            finalPayments.push({ method: "cash", amount: totalDue });
          } else if (paidTotal < totalDue) {
            finalPayments.push({ method: "cash", amount: totalDue - paidTotal });
          }

          return createOrderPayments(params.token!, response.order.id, {
            payments: finalPayments,
            print_receipt: true,
          });
        })
        .then(() => {
          params.clearCart();
          params.setSelectedItem(null);
          setStatusMessage("Order paid and sent to kitchen.");
        })
        .catch(() => {
          enqueue(payload);
          params.setOfflineQueueCount(getQueueCount());
          setStatusMessage("Network error. Order queued for sync.");
        });
      return;
    }

    enqueue(payload);
    params.setOfflineQueueCount(getQueueCount());
    params.clearCart();
    params.setSelectedItem(null);
    setStatusMessage("Offline order queued. Sync when online.");
  };

  const handleHoldOrder = () => {
    if (!params.isOnline || !params.token) {
      setStatusMessage("Go online and login to hold orders.");
      return;
    }
    if (params.cartItems.length === 0) return;
    if (params.orderType === "Dine-in" && !params.selectedTableId) {
      setStatusMessage("Select a table for dine-in orders.");
      return;
    }

    const payload = { ...buildPayload(), print: false };

    createOrder(params.token, payload)
      .then((response) => holdOrder(params.token!, response.order.id).then(() => response.order.id))
      .then((orderId) => {
        localStorage.setItem("pos_last_held_order", String(orderId));
        setLastHeldOrderId(orderId);
        params.clearCart();
        params.setSelectedItem(null);
        setStatusMessage(`Order ${orderId} held.`);
      })
      .catch(() => setStatusMessage("Unable to hold order. Try again."));
  };

  const handleResumeLastHold = () => {
    if (!params.isOnline || !params.token || !lastHeldOrderId) return;

    resumeOrder(params.token, lastHeldOrderId)
      .then(() => getOrder(params.token!, lastHeldOrderId))
      .then((response) => {
        const restoredItems: CartItem[] = response.order.items.map((item) => ({
          id: item.item_id ?? 0,
          name: item.item_name,
          price: item.unit_price,
          quantity: item.quantity,
          modifiers: item.modifiers?.map((m) => ({
            id: m.modifier_id ?? 0,
            name: m.modifier_name,
            price: m.modifier_price,
          })) ?? [],
        }));
        // Parent App will need to setCartItems — return the items
        setStatusMessage("Held order resumed.");
        return restoredItems;
      })
      .catch(() => setStatusMessage("Unable to resume held order."));
  };

  const handleBarcodeSubmit = (
    event: React.FormEvent<HTMLFormElement>,
    items: CartItem[],
    addToCart: (item: { id: number; name: string; base_price: number; barcode?: string | null; modifiers?: Array<{ id: number; name: string; price: number }> }) => void,
  ) => {
    event.preventDefault();
    const trimmed = barcode.trim();
    if (!trimmed) return;

    const fallbackMatch = items.find((item) => (item as unknown as { barcode?: string }).barcode === trimmed);

    if (params.isOnline) {
      lookupBarcode(trimmed)
        .then((item) => {
          if (item) { addToCart(item); setBarcode(""); return; }
          if (fallbackMatch) { addToCart(fallbackMatch as unknown as Parameters<typeof addToCart>[0]); setBarcode(""); }
        })
        .catch(() => {
          if (fallbackMatch) { addToCart(fallbackMatch as unknown as Parameters<typeof addToCart>[0]); setBarcode(""); }
        });
      return;
    }

    if (fallbackMatch) { addToCart(fallbackMatch as unknown as Parameters<typeof addToCart>[0]); setBarcode(""); }
  };

  const handleSyncQueue = () => {
    if (!params.isOnline) { setStatusMessage("You are offline. Sync paused."); return; }
    if (!params.token)    { setStatusMessage("Login required to sync."); return; }

    const queue = getQueue();
    if (queue.length === 0) { setStatusMessage("No queued orders to sync."); return; }

    type QueuePayload = {
      type: string;
      print?: boolean;
      device_identifier?: string;
      restaurant_table_id?: number | null;
      discount_amount?: number;
      items: Array<{
        item_id?: number | null;
        name: string;
        quantity: number;
        modifiers?: Array<{ modifier_id?: number | null; name: string; price: number }>;
      }>;
    };

    createOrderBatch(params.token, { orders: queue.map((e) => e.payload as QueuePayload) })
      .then((result) => {
        if (!result.failed || result.failed.length === 0) {
          setQueue([]);
          params.setOfflineQueueCount(0);
          setStatusMessage(`Synced ${result.processed} orders.`);
          return;
        }
        const failedIndexes = new Set(result.failed.map((f) => f.index));
        const remaining = queue.filter((_, i) => failedIndexes.has(i));
        setQueue(remaining);
        params.setOfflineQueueCount(remaining.length);
        setStatusMessage(`Synced ${result.processed} orders, ${remaining.length} failed.`);
      })
      .catch(() => setStatusMessage("Sync failed. Try again."));
  };

  return {
    statusMessage,
    setStatusMessage,
    lastHeldOrderId,
    barcode,
    setBarcode,
    handleCheckout,
    handleHoldOrder,
    handleResumeLastHold,
    handleBarcodeSubmit,
    handleSyncQueue,
  };
}
