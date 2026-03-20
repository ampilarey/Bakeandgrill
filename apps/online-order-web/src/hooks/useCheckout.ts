import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  applyPromoCode,
  createCustomerOrder,
  createDeliveryOrder,
  createLoyaltyHold,
  getLoyaltyAccount,
  getCustomerMe,
  initiateOnlinePayment,
} from "../api";
import type { LoyaltyAccount } from "../api";

export type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  modifiers?: Array<{ id: number; name: string; price: number }>;
};

export type OrderType = "takeaway" | "delivery";

export type DeliveryForm = {
  address_line1: string;
  address_line2: string;
  island: string;
  contact_name: string;
  contact_phone: string;
  notes: string;
};

export const EMPTY_DELIVERY: DeliveryForm = {
  address_line1: "", address_line2: "", island: "",
  contact_name: "", contact_phone: "", notes: "",
};

function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem("bakegrill_cart");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // CartContext stores a versioned object: { version, entries: [{ item, quantity, modifiers }] }
    const entries: Array<{ item: { id: number; name: string; base_price: number | string }; quantity: number; modifiers?: Array<{ id: number; name: string; price: number | string }> }>
      = Array.isArray(parsed) ? parsed : (parsed?.entries ?? []);
    return entries.map((e) => ({
      id:        e.item?.id ?? (e as unknown as CartItem).id,
      name:      e.item?.name ?? (e as unknown as CartItem).name,
      price:     Number(e.item?.base_price ?? (e as unknown as CartItem).price ?? 0),
      quantity:  e.quantity,
      modifiers: (e.modifiers ?? []).map((m) => ({ id: m.id, name: m.name, price: Number(m.price) })),
    }));
  } catch { return []; }
}

function readToken(): string | null {
  return localStorage.getItem("online_token");
}

export function useCheckout() {
  const navigate = useNavigate();

  const [cart]            = useState<CartItem[]>(readCart);
  const [token, setToken] = useState<string | null>(readToken);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);

  const [orderType, setOrderType]   = useState<OrderType>("takeaway");
  const [delivery, setDelivery]     = useState<DeliveryForm>(EMPTY_DELIVERY);
  const [notes, setNotes]           = useState("");

  const [promoCode, setPromoCode]   = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string; discountLaar: number; pending?: boolean;
  } | null>(null);
  const [promoError, setPromoError]   = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);

  const [useLoyalty, setUseLoyalty]   = useState(false);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);

  const [deliveryFee, setDeliveryFee] = useState(0);
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [isPlacing, setIsPlacing]     = useState(false);
  const [globalError, setGlobalError] = useState("");

  const hasMounted = useRef(false);

  useEffect(() => {
    const rawFee = parseInt(import.meta.env.VITE_DELIVERY_FEE_MVR ?? '20', 10);
    if (isNaN(rawFee) || rawFee < 0) {
      if (import.meta.env.DEV) console.error('VITE_DELIVERY_FEE_MVR must be a non-negative integer — falling back to 20 MVR');
      setDeliveryFee(20 * 100);
    } else {
      setDeliveryFee(rawFee * 100);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getCustomerMe(token)
      .then((r) => {
        if (cancelled) return;
        const display = r.customer.name ?? r.customer.phone ?? "";
        setCustomerName(display);
        if (display) {
          localStorage.setItem("online_customer_name", display);
          window.dispatchEvent(new Event("auth_change"));
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Token may be expired — clear it and signal the app to re-authenticate
          localStorage.removeItem('online_token');
          window.dispatchEvent(new CustomEvent('auth_change'));
        }
      });

    getLoyaltyAccount(token).then((r) => {
      if (!cancelled && r.account && r.account.points_balance > 0) {
        setLoyaltyAccount(r.account);
        setLoyaltyPoints(r.account.points_balance);
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (hasMounted.current && cart.length === 0) navigate("/");
    hasMounted.current = true;
  }, [cart, navigate]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const subtotalLaar = cart.reduce(
    (sum, item) =>
      sum +
      Math.round(item.price * 100) * item.quantity +
      (item.modifiers ?? []).reduce((ms, m) => ms + Math.round(m.price * 100) * item.quantity, 0),
    0,
  );

  const deliveryFeeLaar  = orderType === "delivery" ? deliveryFee : 0;
  const promoDelta       = promoApplied?.discountLaar ?? 0;
  const loyaltyDelta     = useLoyalty && loyaltyAccount ? loyaltyPoints : 0;
  const totalLaar        = Math.max(0, subtotalLaar + deliveryFeeLaar - promoDelta - loyaltyDelta);

  // ── Promo ──────────────────────────────────────────────────────────────────
  const handleApplyPromo = async () => {
    if (!token) { setPromoError("Please sign in first."); return; }
    if (!pendingOrderId) {
      setPromoError("");
      setPromoApplied({ code: promoCode.trim().toUpperCase(), discountLaar: 0, pending: true });
      return;
    }
    setPromoError("");
    setPromoLoading(true);
    try {
      const res = await applyPromoCode(token, pendingOrderId, promoCode.trim().toUpperCase());
      setPromoApplied({ code: promoCode.trim().toUpperCase(), discountLaar: res.discount_laar });
      setPromoCode("");
    } catch (e) {
      setPromoError((e as Error).message);
    } finally {
      setPromoLoading(false);
    }
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateDelivery = (): boolean => {
    const errs: Record<string, string> = {};
    if (!delivery.address_line1.trim()) errs.address_line1 = "Address is required";
    if (!delivery.island.trim())        errs.island        = "Island is required";
    if (!delivery.contact_name.trim())  errs.contact_name  = "Contact name is required";
    if (!delivery.contact_phone.trim()) errs.contact_phone = "Contact phone is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Place order + Pay ──────────────────────────────────────────────────────
  const handlePlaceAndPay = async () => {
    if (!token) return;
    if (isPlacing) return; // prevent double-submission
    if (orderType === "delivery" && !validateDelivery()) return;

    setIsPlacing(true);
    setGlobalError("");

    try {
      let orderId: number;

      // If an order was already created (e.g. payment failed on first attempt),
      // reuse it instead of creating a duplicate.
      if (pendingOrderId) {
        orderId = pendingOrderId;
      } else if (orderType === "delivery") {
        const res = await createDeliveryOrder(token, {
          items: cart.map((item) => ({
            item_id: item.id, quantity: item.quantity,
            modifiers: item.modifiers?.map((m) => ({ modifier_id: m.id })),
          })),
          delivery_address_line1: delivery.address_line1,
          delivery_address_line2: delivery.address_line2 || undefined,
          delivery_island: delivery.island,
          delivery_contact_name: delivery.contact_name,
          delivery_contact_phone: delivery.contact_phone,
          delivery_notes: delivery.notes || undefined,
          customer_notes: notes || undefined,
        });
        orderId = res.order.id;
      } else {
        const res = await createCustomerOrder(token, {
          items: cart.map((item) => ({
            item_id: item.id, quantity: item.quantity,
            modifiers: item.modifiers?.map((m) => ({ modifier_id: m.id })),
          })),
          type: "online_pickup",
          customer_notes: notes || undefined,
        });
        orderId = res.order.id;
      }

      setPendingOrderId(orderId);

      const promoToApply = promoApplied?.pending
        ? promoApplied.code
        : promoCode.trim().toUpperCase();

      if (promoToApply && (!promoApplied || promoApplied.pending)) {
        try {
          const promoRes = await applyPromoCode(token, orderId, promoToApply);
          setPromoApplied({ code: promoToApply, discountLaar: promoRes.discount_laar });
          setPromoCode("");
        } catch (e) {
          setPromoError((e as Error).message);
          setPromoApplied(null);
        }
      }

      if (useLoyalty && loyaltyAccount && loyaltyPoints > 0) {
        try {
          await createLoyaltyHold(token, orderId, loyaltyPoints);
        } catch (e) {
          if (import.meta.env.DEV) console.warn("Loyalty hold failed:", (e as Error).message);
        }
      }

      const payment = await initiateOnlinePayment(token, orderId);
      if (!payment.payment_url) {
        throw new Error("Payment could not be started. Please try again in a moment.");
      }

      // Save to order history in localStorage before leaving the page
      try {
        const historyKey = 'bakegrill_order_history';
        const existing = JSON.parse(localStorage.getItem(historyKey) ?? '[]');
        const entry = {
          orderId,
          orderType,
          totalLaar,
          itemCount: cart.reduce((s, i) => s + i.quantity, 0),
          placedAt: new Date().toISOString(),
        };
        const updated = [entry, ...existing].slice(0, 20); // keep last 20 orders
        localStorage.setItem(historyKey, JSON.stringify(updated));
      } catch { /* ignore */ }

      // Clear the cart before leaving — payment is initiated, order is placed
      localStorage.removeItem("bakegrill_cart");
      window.dispatchEvent(new CustomEvent("cart_cleared"));

      window.location.href = payment.payment_url;
    } catch (e) {
      setGlobalError((e as Error).message);
    } finally {
      setIsPlacing(false);
    }
  };

  const handleAuthSuccess = (tok: string, name: string) => {
    localStorage.setItem("online_token", tok);
    localStorage.setItem("online_customer_name", name);
    window.dispatchEvent(new Event("auth_change"));
    setToken(tok);
    setCustomerName(name);
  };

  return {
    cart, token, customerName, loyaltyAccount, loyaltyPoints, setLoyaltyPoints,
    orderType, setOrderType, delivery, setDelivery, notes, setNotes,
    promoCode, setPromoCode, promoApplied, setPromoApplied, promoError, promoLoading,
    useLoyalty, setUseLoyalty, deliveryFee, errors, isPlacing, globalError,
    subtotalLaar, deliveryFeeLaar, promoDelta, loyaltyDelta, totalLaar,
    handleApplyPromo, handlePlaceAndPay, handleAuthSuccess,
  };
}
