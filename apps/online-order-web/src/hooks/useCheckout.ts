import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchItems, setSalesChannel, type SalesChannel } from "../api/menu";
import { useCart } from "../context/CartContext";
import {
  applyPromoCode,
  validatePromoCode,
  removePromoCode,
  createCustomerOrder,
  createDeliveryOrder,
  createLoyaltyHold,
  getLoyaltyAccount,
  getCustomerMe,
  getOrderDetail,
  initiateOnlinePayment,
  completeZeroBalanceOrder,
  syncBladeSession,
  checkGiftCardBalance,
  applyGiftCard,
  removeGiftCard,
  getMyReferralCode,
  validateReferralCode,
  applyReferralToOrder,
  removeReferralFromOrder,
  fetchCustomerAddresses,
  type CustomerAddress,
} from "../api";
import type { LoyaltyAccount } from "../api";

export type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  modifiers?: Array<{ id: number; name: string; price: number }>;
  taxRate?: number;
};

export type OrderType = "pickup" | "delivery";

export type DeliveryForm = {
  address_line1: string;
  address_line2: string;
  island: string;
  contact_name: string;
  contact_phone: string;
  notes: string;
  location_link: string;
};

export const EMPTY_DELIVERY: DeliveryForm = {
  address_line1: "", address_line2: "", island: "",
  contact_name: "", contact_phone: "", notes: "", location_link: "",
};

const PENDING_ORDER_KEY = 'checkout_pending_order_id';

function readPendingOrderId(): number | null {
  try {
    const stored = sessionStorage.getItem(PENDING_ORDER_KEY);
    return stored ? Number(stored) : null;
  } catch {
    return null;
  }
}

function writePendingOrderId(id: number | null): void {
  try {
    if (id) sessionStorage.setItem(PENDING_ORDER_KEY, String(id));
    else sessionStorage.removeItem(PENDING_ORDER_KEY);
  } catch { /* ignore quota / private mode */ }
}

/**
 * Strip Maldivian country code — +9607972434 / 009607972434 → 7972434.
 * Used for both display and submission so the backend regex always receives
 * the canonical 7-digit local format.
 */
function localPhone(phone: string): string {
  return phone.trim().replace(/^(?:00960|\+?960)/, "");
}

function addressToDelivery(a: CustomerAddress): DeliveryForm {
  return {
    address_line1: a.address_line1,
    address_line2: a.address_line2 ?? "",
    island: a.island,
    contact_name: a.contact_name,
    contact_phone: localPhone(a.contact_phone),
    notes: a.notes ?? "",
    location_link: a.location_link ?? "",
  };
}

function readCart(): (CartItem & { variantId?: number | null })[] {
  try {
    const raw = localStorage.getItem("bakegrill_cart");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // CartContext stores a versioned object: { version, entries: [{ item, quantity, modifiers, variantId }] }
    const entries: Array<{
      item: { id: number; name: string; base_price: number | string; tax_rate?: number | null };
      quantity: number;
      modifiers?: Array<{ id: number; name: string; price: number | string }>;
      variantId?: number | null;
      variantPrice?: number | null;
    }> = Array.isArray(parsed) ? parsed : (parsed?.entries ?? []);
    return entries.map((e) => ({
      id:        e.item?.id ?? (e as unknown as CartItem).id,
      name:      e.item?.name ?? (e as unknown as CartItem).name,
      price:     Number(e.variantPrice ?? e.item?.base_price ?? (e as unknown as CartItem).price ?? 0),
      quantity:  e.quantity,
      modifiers: (e.modifiers ?? []).map((m) => ({ id: m.id, name: m.name, price: Number(m.price) })),
      variantId: e.variantId ?? null,
      taxRate:   Number(e.item?.tax_rate ?? 0),
    }));
  } catch { return []; }
}

function readToken(): string | null {
  return localStorage.getItem("online_token");
}

export function useCheckout() {
  const navigate = useNavigate();
  const { pruneCartToAllowedItemIds, refreshPricesFromMenu } = useCart();

  const [cartTick, bumpCart] = useReducer((n: number) => n + 1, 0);
  const cart = useMemo(() => readCart(), [cartTick]);
  const [token, setToken] = useState<string | null>(readToken);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);

  // Sync token when AuthContext recovers session via Blade cookie (e.g. after BML payment
  // clears localStorage on mobile Safari, checkSession() restores it asynchronously).
  useEffect(() => {
    const sync = () => {
      const t = localStorage.getItem("online_token");
      if (t && t !== token) setToken(t);
    };
    const expire = () => {
      setToken(null);
      setCustomerName(null);
      setLoyaltyAccount(null);
    };
    window.addEventListener("auth_change", sync);
    window.addEventListener("auth_expired", expire);
    return () => {
      window.removeEventListener("auth_change", sync);
      window.removeEventListener("auth_expired", expire);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [orderType, setOrderType]   = useState<OrderType>("pickup");
  const [delivery, setDelivery]     = useState<DeliveryForm>(EMPTY_DELIVERY);
  const [notes, setNotes]           = useState("");

  const [promoCode, setPromoCode]   = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string; discountLaar: number; promotionId?: number; pending?: boolean;
  } | null>(null);
  const [promoError, setPromoError]   = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [pendingOrderId, setPendingOrderIdState] = useState<number | null>(() => readPendingOrderId());
  const setPendingOrderId = (id: number | null) => {
    setPendingOrderIdState(id);
    writePendingOrderId(id);
  };

  const [useLoyalty, setUseLoyalty]   = useState(false);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);

  const [giftCardCode, setGiftCardCode]     = useState("");
  const [giftCardApplied, setGiftCardApplied] = useState<{
    code: string; discountLaar: number; pending?: boolean;
  } | null>(null);
  const [giftCardError, setGiftCardError]   = useState("");
  const [giftCardLoading, setGiftCardLoading] = useState(false);
  const [giftCardBalance, setGiftCardBalance] = useState<number | null>(null);

  const [myReferralCode, setMyReferralCode] = useState<string | null>(null);

  const [friendReferralCode, setFriendReferralCode] = useState("");
  const [friendReferralApplied, setFriendReferralApplied] = useState<{
    code: string;
    discountLaar: number;
    pending?: boolean;
    /** Fixed MVR discount from referral config — used to re-cap when cart/discounts change */
    configuredLaar?: number;
  } | null>(null);
  const [friendReferralError, setFriendReferralError] = useState("");
  const [friendReferralLoading, setFriendReferralLoading] = useState(false);

  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "new">("new");
  const [saveAddress, setSaveAddress] = useState(false);
  const [addressLabel, setAddressLabel] = useState("");

  const [deliveryFee, setDeliveryFee] = useState(0);
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [isPlacing, setIsPlacing]     = useState(false);
  const [globalError, setGlobalError] = useState("");

  const hasMounted = useRef(false);

  useEffect(() => {
    const ch: SalesChannel = orderType === "delivery" ? "delivery" : "online_pickup";
    setSalesChannel(ch);
    let cancelled = false;
    fetchItems(ch)
      .then((res) => {
        if (cancelled) return;
        const ids = new Set((res.data ?? []).map((i) => i.id));
        pruneCartToAllowedItemIds(ids);
        refreshPricesFromMenu(res.data ?? []);
        bumpCart();
      })
      .catch(() => { /* menu load failed — leave cart as-is rather than wiping items */ });
    return () => {
      cancelled = true;
    };
  }, [orderType, pruneCartToAllowedItemIds]);

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
        const raw = r.customer.phone ?? r.customer.name ?? "";
        const display = r.customer.phone ? localPhone(r.customer.phone) : raw;
        setCustomerName(display);
        if (display) {
          localStorage.setItem("online_customer_name", display);
          window.dispatchEvent(new Event("auth_change"));
        }
        // Pre-fill delivery contact phone (local format, no +960 prefix)
        if (r.customer.phone) {
          setDelivery((prev) => ({
            ...prev,
            contact_phone: prev.contact_phone || localPhone(r.customer.phone!),
          }));
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          // Only clear token on 401 (expired/invalid). Transient network errors
          // should not log the user out.
          if (e.message.includes('401') || e.message.toLowerCase().includes('unauthenticated')) {
            localStorage.removeItem('online_token');
            window.dispatchEvent(new CustomEvent('auth_change'));
          }
        }
      });

    fetchCustomerAddresses(token)
      .then((res) => {
        if (cancelled) return;
        const list = res.addresses ?? [];
        setSavedAddresses(list);
        const defaultAddr = list.find((a) => a.is_default) ?? list[0];
        if (defaultAddr) {
          setSelectedAddressId(defaultAddr.id);
          setDelivery((prev) => ({
            ...addressToDelivery(defaultAddr),
            contact_phone: prev.contact_phone || localPhone(defaultAddr.contact_phone),
          }));
        }
      })
      .catch(() => { /* optional — manual entry still works */ });

    getLoyaltyAccount(token).then((r) => {
      if (!cancelled && r.account && r.account.points_balance > 0) {
        setLoyaltyAccount(r.account);
        setLoyaltyPoints(r.account.points_balance);
      }
    }).catch((e: Error) => {
      if (import.meta.env.DEV) console.warn('Loyalty account load failed:', e.message);
    });

    getMyReferralCode(token).then((r) => {
      if (!cancelled) setMyReferralCode(r.code);
    }).catch((e: Error) => {
      if (import.meta.env.DEV) console.warn('Referral code load failed:', e.message);
    });

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

  // Full tax on the un-discounted subtotal (used only to derive the effective rate)
  const fullTaxLaar = cart.reduce((sum, item) => {
    const rate = item.taxRate ?? 0;
    if (rate <= 0) return sum;
    const itemLaar =
      Math.round(item.price * 100) * item.quantity +
      (item.modifiers ?? []).reduce((ms, m) => ms + Math.round(m.price * 100) * item.quantity, 0);
    return sum + Math.round(itemLaar * rate / 100);
  }, 0);

  const deliveryFeeLaar  = orderType === "delivery" ? deliveryFee : 0;
  const promoDelta       = promoApplied?.discountLaar ?? 0;
  const loyaltyDelta     = useLoyalty && loyaltyAccount ? loyaltyPoints : 0;
  const giftCardDelta    = giftCardApplied?.discountLaar ?? 0;

  const referralRoomLaar = Math.max(0, subtotalLaar - promoDelta - loyaltyDelta - giftCardDelta);
  const referralDelta = friendReferralApplied
    ? (friendReferralApplied.pending
      ? Math.min(friendReferralApplied.configuredLaar ?? friendReferralApplied.discountLaar, referralRoomLaar)
      : friendReferralApplied.discountLaar)
    : 0;

  // GST is on the discounted subtotal (standard Maldivian T-GST — discounts reduce
  // the taxable amount). Scale the effective tax rate proportionally.
  const discountedSubtotalLaar = Math.max(0, subtotalLaar - promoDelta - loyaltyDelta - giftCardDelta - referralDelta);
  const taxLaar = subtotalLaar > 0 ? Math.round(discountedSubtotalLaar * fullTaxLaar / subtotalLaar) : 0;
  const totalLaar = discountedSubtotalLaar + taxLaar + deliveryFeeLaar;

  // ── Promo ──────────────────────────────────────────────────────────────────
  const handleApplyPromo = async () => {
    if (!token) { setPromoError("Please sign in first."); return; }
    setPromoError("");
    setPromoLoading(true);
    if (!pendingOrderId) {
      // No order yet — validate the code and compute an estimated discount so
      // the customer sees the saving before they pay.
      try {
        const validation = await validatePromoCode(promoCode.trim().toUpperCase(), token);
        if (!validation.valid || !validation.promotion) {
          setPromoError(validation.message ?? "Invalid promo code.");
          return;
        }
        const p = validation.promotion as { type?: string; discount_type?: string; discount_value: number };
        const pType = p.type ?? p.discount_type ?? "";
        let estLaar = 0;
        if (pType === "fixed") {
          estLaar = Math.min(p.discount_value, totalLaar);
        } else if (pType === "percentage") {
          estLaar = Math.round(subtotalLaar * p.discount_value / 100);
        }
        setPromoApplied({ code: promoCode.trim().toUpperCase(), discountLaar: estLaar, pending: true });
        setPromoCode("");
      } catch (e) {
        setPromoError((e as Error).message);
      } finally {
        setPromoLoading(false);
      }
      return;
    }
    try {
      const res = await applyPromoCode(token, pendingOrderId, promoCode.trim().toUpperCase());
      setPromoApplied({ code: promoCode.trim().toUpperCase(), discountLaar: res.discount_laar, promotionId: res.promotion_id });
      setPromoCode("");
    } catch (e) {
      setPromoError((e as Error).message);
    } finally {
      setPromoLoading(false);
    }
  };

  // ── Gift Card ──────────────────────────────────────────────────────────────
  const handleCheckGiftCard = async () => {
    if (!giftCardCode.trim()) return;
    setGiftCardError(""); setGiftCardBalance(null); setGiftCardLoading(true);
    try {
      const res = await checkGiftCardBalance(giftCardCode.trim().toUpperCase());
      setGiftCardBalance(res.current_balance);
    } catch (e) {
      setGiftCardError((e as Error).message);
    } finally {
      setGiftCardLoading(false);
    }
  };

  const handleApplyGiftCard = async () => {
    if (!token) { setGiftCardError("Please sign in first."); return; }
    if (!giftCardCode.trim()) return;

    if (!pendingOrderId) {
      // ONL-005: cap the pending preview discount at the current order
      // total so the running total can't go negative. The real server
      // call after order creation will reapply the same cap, but the
      // preview here was previously the FULL gift-card balance (e.g.
      // a 500 MVR card on a 120 MVR order showed "−500" in the
      // summary which freaked customers out).
      const balanceLaar = giftCardBalance ? Math.round(giftCardBalance * 100) : 0;
      // subtract whatever discounts are already in effect, then cap
      const orderBeforeGift = Math.max(0, subtotalLaar - promoDelta - loyaltyDelta - referralDelta);
      const capped = Math.min(balanceLaar, orderBeforeGift);
      setGiftCardApplied({ code: giftCardCode.trim().toUpperCase(), discountLaar: capped, pending: true });
      setGiftCardError("");
      return;
    }
    setGiftCardError(""); setGiftCardLoading(true);
    try {
      const res = await applyGiftCard(token, pendingOrderId, giftCardCode.trim().toUpperCase());
      setGiftCardApplied({ code: giftCardCode.trim().toUpperCase(), discountLaar: res.discount_laar });
      setGiftCardCode("");
    } catch (e) {
      setGiftCardError((e as Error).message);
    } finally {
      setGiftCardLoading(false);
    }
  };

  const handleRemoveGiftCard = async () => {
    if (token && pendingOrderId && giftCardApplied && !giftCardApplied.pending) {
      try {
        await removeGiftCard(token, pendingOrderId);
      } catch (e) {
        setGiftCardError((e as Error).message);
        return;
      }
    }
    setGiftCardApplied(null);
    setGiftCardCode("");
    setGiftCardBalance(null);
  };

  const handleApplyFriendReferral = async () => {
    if (!token) { setFriendReferralError("Please sign in first."); return; }
    const raw = friendReferralCode.trim().toUpperCase();
    if (!raw) return;
    if (myReferralCode && raw === myReferralCode.toUpperCase()) {
      setFriendReferralError("You cannot use your own referral code.");
      return;
    }

    if (!pendingOrderId) {
      setFriendReferralError("");
      setFriendReferralLoading(true);
      try {
        const validation = await validateReferralCode(raw);
        if (!validation.valid) {
          setFriendReferralError(validation.message ?? "Invalid or expired referral code.");
          return;
        }
        const configuredLaar = Math.round(validation.referee_discount_mvr * 100);
        const roomLaar = Math.max(0, subtotalLaar - promoDelta - loyaltyDelta - giftCardDelta);
        const estLaar = Math.min(configuredLaar, roomLaar);
        if (estLaar <= 0) {
          setFriendReferralError("No referral discount applies — other discounts already cover this order.");
          return;
        }
        setFriendReferralApplied({
          code: raw,
          discountLaar: estLaar,
          configuredLaar,
          pending: true,
        });
        setFriendReferralCode("");
      } catch (e) {
        setFriendReferralError((e as Error).message);
      } finally {
        setFriendReferralLoading(false);
      }
      return;
    }
    setFriendReferralError("");
    setFriendReferralLoading(true);
    try {
      const res = await applyReferralToOrder(token, pendingOrderId, raw);
      setFriendReferralApplied({ code: res.code, discountLaar: res.discount_laar });
      setFriendReferralCode("");
    } catch (e) {
      setFriendReferralError((e as Error).message);
      setFriendReferralApplied(null);
    } finally {
      setFriendReferralLoading(false);
    }
  };

  const handleRemoveFriendReferral = async () => {
    if (token && pendingOrderId && friendReferralApplied && !friendReferralApplied.pending) {
      try {
        await removeReferralFromOrder(token, pendingOrderId);
      } catch (e) {
        setFriendReferralError((e as Error).message);
        return;
      }
    }
    setFriendReferralApplied(null);
    setFriendReferralCode("");
  };

  const handleRemovePromo = async () => {
    if (token && pendingOrderId && promoApplied?.promotionId && !promoApplied.pending) {
      try {
        await removePromoCode(token, pendingOrderId, promoApplied.promotionId);
      } catch (e) {
        setPromoError((e as Error).message);
        return;
      }
    }
    setPromoApplied(null);
    setPromoCode("");
  };

  const applySavedAddress = (id: number | "new") => {
    setSelectedAddressId(id);
    if (id === "new") {
      setSaveAddress(true);
      return;
    }
    const addr = savedAddresses.find((a) => a.id === id);
    if (addr) {
      setDelivery(addressToDelivery(addr));
      setSaveAddress(false);
      setAddressLabel(addr.label ?? "");
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
    if (!token) { setGlobalError('Please sign in to continue.'); return; }
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
            item_id: item.id,
            quantity: item.quantity,
            variant_id: (item as CartItem & { variantId?: number | null }).variantId ?? undefined,
            modifiers: item.modifiers?.map((m) => ({ modifier_id: m.id })),
          })),
          delivery_address_line1: delivery.address_line1,
          delivery_address_line2: delivery.address_line2 || undefined,
          delivery_island: delivery.island,
          delivery_contact_name: delivery.contact_name,
          delivery_contact_phone: localPhone(delivery.contact_phone),
          delivery_notes: delivery.notes || undefined,
          delivery_location_link: delivery.location_link.trim() || undefined,
          save_address: saveAddress || undefined,
          address_label: saveAddress ? (addressLabel.trim() || undefined) : undefined,
          customer_notes: notes || undefined,
        });
        orderId = res.order.id;
      } else {
        const res = await createCustomerOrder(token, {
          items: cart.map((item) => ({
            item_id: item.id,
            quantity: item.quantity,
            variant_id: (item as CartItem & { variantId?: number | null }).variantId ?? undefined,
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
          setPromoApplied({ code: promoToApply, discountLaar: promoRes.discount_laar, promotionId: promoRes.promotion_id });
          setPromoCode("");
        } catch (e) {
          // Promo failed to apply — clear it and stop checkout so the customer
          // isn't charged the full undiscounted amount without knowing.
          setPromoError((e as Error).message);
          setPromoApplied(null);
          setIsPlacing(false);
          return;
        }
      }

      if (useLoyalty && loyaltyAccount && loyaltyPoints > 0) {
        try {
          await createLoyaltyHold(token, orderId, loyaltyPoints);
        } catch (e) {
          setGlobalError("Could not apply loyalty points: " + (e as Error).message);
          setIsPlacing(false);
          return;
        }
      }

      const giftCardToApply = giftCardApplied?.pending ? giftCardApplied.code : (giftCardCode.trim().toUpperCase() || null);
      if (giftCardToApply && (!giftCardApplied || giftCardApplied.pending)) {
        try {
          const gcRes = await applyGiftCard(token, orderId, giftCardToApply);
          setGiftCardApplied({ code: giftCardToApply, discountLaar: gcRes.discount_laar });
          setGiftCardCode("");
        } catch (e) {
          setGlobalError("Could not apply gift card: " + (e as Error).message);
          setIsPlacing(false);
          return;
        }
      }

      const referralToApply = friendReferralApplied?.pending
        ? friendReferralApplied.code
        : friendReferralCode.trim().toUpperCase();
      if (referralToApply && (!friendReferralApplied || friendReferralApplied.pending)) {
        if (!myReferralCode || referralToApply !== myReferralCode.toUpperCase()) {
          try {
            const refRes = await applyReferralToOrder(token, orderId, referralToApply);
            setFriendReferralApplied({ code: refRes.code, discountLaar: refRes.discount_laar });
            setFriendReferralCode("");
          } catch (e) {
            setFriendReferralError((e as Error).message);
            setFriendReferralApplied(null);
            setIsPlacing(false);
            return;
          }
        }
      }

      const { order: freshOrder } = await getOrderDetail(token, orderId);
      const dueLaar =
        typeof freshOrder.total_laar === "number"
          ? freshOrder.total_laar
          : Math.round(Number(freshOrder.total) * 100);

      if (dueLaar <= 0) {
        await completeZeroBalanceOrder(token, orderId);
        try {
          const historyKey = 'bakegrill_order_history';
          const existing = JSON.parse(localStorage.getItem(historyKey) ?? '[]');
          const entry = {
            orderId,
            orderType,
            totalLaar: dueLaar,
            itemCount: cart.reduce((s, i) => s + i.quantity, 0),
            placedAt: new Date().toISOString(),
          };
          const updated = [entry, ...existing].slice(0, 20);
          localStorage.setItem(historyKey, JSON.stringify(updated));
        } catch { /* ignore */ }
        navigate(`/orders/${orderId}`);
        setIsPlacing(false);
        return;
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
          totalLaar: dueLaar,
          itemCount: cart.reduce((s, i) => s + i.quantity, 0),
          placedAt: new Date().toISOString(),
        };
        const updated = [entry, ...existing].slice(0, 20);
        localStorage.setItem(historyKey, JSON.stringify(updated));
      } catch { /* ignore */ }

      // Do NOT clear the cart here — cart is cleared in OrderStatusPage once
      // the order status is confirmed as paid/pending. If the user cancels
      // payment or the gateway fails, their cart will still be intact.

      // Keep isPlacing=true during redirect so the button stays disabled
      // while the browser navigates to BML. Don't call setIsPlacing(false)
      // in the finally block when we successfully redirect.
      window.location.href = payment.payment_url;
      return; // skip the finally reset below
    } catch (e) {
      setGlobalError((e as Error).message);
      setIsPlacing(false);
    }
  };

  const handleAuthSuccess = (tok: string, name: string) => {
    localStorage.setItem("online_token", tok);
    localStorage.setItem("online_customer_name", name);
    window.dispatchEvent(new Event("auth_change"));
    setToken(tok);
    setCustomerName(name);
    // Establish a Blade session so the token can be recovered if localStorage
    // is cleared by the mobile browser during a cross-origin redirect (e.g. BML payment).
    syncBladeSession(tok).catch(() => {});
  };

  return {
    cart, token, customerName, loyaltyAccount, loyaltyPoints, setLoyaltyPoints,
    orderType, setOrderType, delivery, setDelivery, notes, setNotes,
    savedAddresses, selectedAddressId, setSelectedAddressId, applySavedAddress,
    saveAddress, setSaveAddress, addressLabel, setAddressLabel,
    promoCode, setPromoCode, promoApplied, setPromoApplied, promoError, promoLoading,
    useLoyalty, setUseLoyalty, deliveryFee, errors, isPlacing, globalError,
    subtotalLaar, taxLaar, deliveryFeeLaar, promoDelta, loyaltyDelta, referralDelta, totalLaar,
    handleApplyPromo, handleRemovePromo, handlePlaceAndPay, handleAuthSuccess,
    giftCardCode, setGiftCardCode, giftCardApplied, giftCardError, giftCardLoading,
    giftCardBalance, giftCardDelta,
    handleCheckGiftCard, handleApplyGiftCard, handleRemoveGiftCard,
    myReferralCode,
    friendReferralCode, setFriendReferralCode, friendReferralApplied, friendReferralError,
    friendReferralLoading,
    handleApplyFriendReferral, handleRemoveFriendReferral,
  };
}
