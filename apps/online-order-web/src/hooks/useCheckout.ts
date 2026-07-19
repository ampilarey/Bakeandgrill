import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchItems, fetchDeliveryFeePreview, fetchCheckoutFeesPreview, fetchGstBootstrap, type SalesChannel } from "../api/menu";
import { useCart } from "../context/CartContext";
import { useOrderMode } from "../context/OrderModeContext";
import {
  applyPromoCode,
  validatePromoCode,
  removePromoCode,
  createCustomerOrder,
  createDeliveryOrder,
  createLoyaltyHold,
  previewLoyaltyHold,
  releaseLoyaltyHold,
  getLoyaltyAccount,
  getCustomerMe,
  getOrderDetail,
  initiateOnlinePayment,
  completeZeroBalanceOrder,
  checkGiftCardBalance,
  applyGiftCard,
  removeGiftCard,
  getMyReferralCode,
  validateReferralCode,
  applyReferralToOrder,
  removeReferralFromOrder,
  fetchCustomerAddresses,
  type CustomerAddress,
  type LoyaltyAccount,
} from "../api";
import type { LoyaltyTierProgress } from "@shared/types";
import {
  discountLaarForRedeemPoints,
  DEFAULT_LOYALTY_RATES,
  loyaltyAvailablePoints,
  maxRedeemPointsForSubtotalLaar,
  estimateEarnPointsForSubtotalMvr,
  ratesFromApi,
  type LoyaltyRatesConfig,
} from '../utils/loyalty';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useAuth } from '../context/AuthContext';
import {
  parseServiceChargePublicSettings,
  previewServiceCharge,
  serviceChargeTaxLaarByBuckets,
} from '@shared/utils/serviceCharge';
import { discountedSubtotalLaar as calcDiscountedSubtotalLaar } from '@shared/utils/effectiveDiscount';
import { estimateDeliveryFeeLaar } from '@shared/utils/deliveryFeeEstimate';

export type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  modifiers?: Array<{ id: number; name: string; price: number }>;
  taxRate?: number;
  taxCode?: string | null;
  packagingFee?: number;
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
      item: {
        id: number;
        name: string;
        base_price: number | string;
        tax_rate?: number | null;
        tax_code?: string | null;
        packaging_fee?: number | string | null;
      };
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
      taxCode:   e.item?.tax_code ?? null,
      packagingFee: Math.max(0, Number(e.item?.packaging_fee ?? 0)),
    }));
  } catch { return []; }
}

/** Mirror GstTaxCalculator / POS effectiveLineTaxRatePercent. */
function effectiveCheckoutTaxRatePercent(
  taxCode: string | null | undefined,
  _legacyTaxRate: number | undefined,
  defaultTaxRatePercent: number,
): number {
  const code = (taxCode ?? "").trim();
  if (code === "zero_rated" || code === "exempt" || code === "out_of_scope") {
    return 0;
  }
  if (code === "standard_8" || code === "standard" || code === "") {
    // Missing code defaults to standard on the server at create time.
    // Never treat tax_rate=0 as "use 8%" for an explicit zero-rated line
    // that already set tax_code — and never trust corrupt legacy percents.
    return defaultTaxRatePercent;
  }
  return 0;
}

export function useCheckout() {
  const navigate = useNavigate();
  const { isAuthenticated, customerName: authCustomerName, setAuth } = useAuth();
  const { pruneCartToAllowedItemIds, refreshPricesFromMenu } = useCart();
  const siteSettings = useSiteSettings();
  const serviceChargeConfig = useMemo(
    () => parseServiceChargePublicSettings(siteSettings as Record<string, string | null | undefined>),
    [siteSettings],
  );

  const [cartTick, bumpCart] = useReducer((n: number) => n + 1, 0);
  const cart = useMemo(() => readCart(), [cartTick]);
  const [customerName, setCustomerName] = useState<string | null>(authCustomerName);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
  const [loyaltyTierProgress, setLoyaltyTierProgress] = useState<LoyaltyTierProgress | null>(null);
  const [loyaltyRates, setLoyaltyRates] = useState<LoyaltyRatesConfig>(DEFAULT_LOYALTY_RATES);
  const [earnRatePerMvr, setEarnRatePerMvr] = useState(1);
  const [tierMultiplier, setTierMultiplier] = useState(1);
  const [loyaltyProgramMessage, setLoyaltyProgramMessage] = useState('');
  const [defaultTaxRatePercent, setDefaultTaxRatePercent] = useState(8);
  const [taxInclusive, setTaxInclusive] = useState(false);

  useEffect(() => {
    fetchGstBootstrap()
      .then((b) => {
        setDefaultTaxRatePercent(b.tax_rate_percent);
        setTaxInclusive(!!b.tax_inclusive);
      })
      .catch(() => {
        setDefaultTaxRatePercent(8);
        setTaxInclusive(false);
      });
  }, []);

  useEffect(() => {
    if (authCustomerName) setCustomerName(authCustomerName);
  }, [authCustomerName]);

  useEffect(() => {
    const expire = () => {
      setCustomerName(null);
      setLoyaltyAccount(null);
    };
    window.addEventListener("auth_expired", expire);
    return () => window.removeEventListener("auth_expired", expire);
  }, []);

  const { mode: orderType, setMode: setOrderType } = useOrderMode();
  const [pickupSlotAt, setPickupSlotAt] = useState<string | null>(null);
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

  const [giftCardCode, setGiftCardCodeState] = useState("");
  const [giftCardApplied, setGiftCardApplied] = useState<{
    code: string; discountLaar: number; pending?: boolean;
  } | null>(null);
  const [giftCardError, setGiftCardError]   = useState("");
  const [giftCardLoading, setGiftCardLoading] = useState(false);
  const [giftCardBalance, setGiftCardBalance] = useState<number | null>(null);
  const [giftCardHeld, setGiftCardHeld] = useState(0);

  const setGiftCardCode = (code: string) => {
    setGiftCardCodeState(code);
    setGiftCardBalance(null);
    setGiftCardHeld(0);
    setGiftCardError("");
  };

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
  const [packagingFeeLaar, setPackagingFeeLaar] = useState(0);
  const [packagingFeeLabel, setPackagingFeeLabel] = useState('Packaging fee');
  const [smallOrderFeeLaar, setSmallOrderFeeLaar] = useState(0);
  const [smallOrderFeeLabel, setSmallOrderFeeLabel] = useState('Small order fee');
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [isPlacing, setIsPlacing]     = useState(false);
  const [globalError, setGlobalError] = useState("");

  const hasMounted = useRef(false);

  // Channel persistence lives in OrderModeContext (setMode → setSalesChannel).
  // fetchItems may emit sales_channel_change on delivery→pickup fallback; context
  // snaps mode authoritatively, then this effect re-runs with the new orderType.
  useEffect(() => {
    const ch: SalesChannel = orderType === "delivery" ? "delivery" : "online_pickup";
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
  }, [orderType, pruneCartToAllowedItemIds, refreshPricesFromMenu]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    getCustomerMe()
      .then((r) => {
        if (cancelled) return;
        const raw = r.customer.phone ?? r.customer.name ?? "";
        const display = r.customer.phone ? localPhone(r.customer.phone) : raw;
        setCustomerName(display);
        if (r.customer.phone) {
          setDelivery((prev) => ({
            ...prev,
            contact_phone: prev.contact_phone || localPhone(r.customer.phone!),
          }));
        }
      })
      .catch(() => { /* transient errors — session may still be valid */ });

    fetchCustomerAddresses()
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

    getLoyaltyAccount().then((r) => {
      if (!cancelled && r.program) {
        setLoyaltyProgramMessage(r.program.customer_message ?? '');
      }
      if (!cancelled && r.rates) {
        setLoyaltyRates(ratesFromApi(r.rates));
        setEarnRatePerMvr(r.rates.earn_per_mvr ?? 1);
        setTierMultiplier(r.rates.tier_multiplier ?? 1);
      }
      if (!cancelled && r.tier_progress) {
        setLoyaltyTierProgress(r.tier_progress);
      }
      if (!cancelled && r.account && r.account.points_balance > 0 && (r.program?.enabled ?? true)) {
        setLoyaltyAccount(r.account);
      }
    }).catch((e: Error) => {
      if (import.meta.env.DEV) console.warn('Loyalty account load failed:', e.message);
    });

    getMyReferralCode().then((r) => {
      if (!cancelled) setMyReferralCode(r.code);
    }).catch((e: Error) => {
      if (import.meta.env.DEV) console.warn('Referral code load failed:', e.message);
    });

    return () => { cancelled = true; };
  }, [isAuthenticated]);

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

  const loyaltyRedeemPoints = useMemo(() => {
    if (!useLoyalty || !loyaltyAccount) return 0;
    const roomLaar = Math.max(0, subtotalLaar - promoDelta);
    return maxRedeemPointsForSubtotalLaar(roomLaar, loyaltyAvailablePoints(loyaltyAccount), loyaltyRates);
  }, [useLoyalty, loyaltyAccount, subtotalLaar, promoDelta, loyaltyRates]);

  const loyaltyDelta = loyaltyRedeemPoints > 0
    ? discountLaarForRedeemPoints(loyaltyRedeemPoints, loyaltyRates)
    : 0;

  const giftCardDelta    = giftCardApplied?.discountLaar ?? 0;

  const referralRoomLaar = Math.max(0, subtotalLaar - promoDelta - loyaltyDelta - giftCardDelta);
  const referralDelta = friendReferralApplied
    ? (friendReferralApplied.pending
      ? Math.min(friendReferralApplied.configuredLaar ?? friendReferralApplied.discountLaar, referralRoomLaar)
      : friendReferralApplied.discountLaar)
    : 0;

  // GST on discounted subtotal — per-line allocation (matches POS / OrderTotalsCalculator).
  const discountedSubtotalLaar = calcDiscountedSubtotalLaar(subtotalLaar, {
    promo: promoDelta,
    loyalty: loyaltyDelta,
    gift_card: giftCardDelta,
    referral: referralDelta,
  });

  // Free-delivery threshold uses discounted merchandise (same as OrderTotalsCalculator).
  useEffect(() => {
    if (orderType !== 'delivery') {
      setDeliveryFee(0);
      return;
    }
    const island = delivery.island.trim();
    if (!island) {
      setDeliveryFee(0);
      return;
    }

    const freeThresholdMvr = (() => {
      const n = parseFloat(String(siteSettings.delivery_free_threshold ?? ''));
      return Number.isFinite(n) && n > 0 ? n : 200;
    })();
    const defaultFeeMvr = (() => {
      const n = parseFloat(String(siteSettings.delivery_default_fee ?? ''));
      return Number.isFinite(n) && n >= 0 ? n : 30;
    })();
    let zoneFeesMvr: Record<string, number> = {};
    try {
      const raw = siteSettings.delivery_zone_fees;
      if (raw) {
        const parsed = JSON.parse(String(raw)) as Record<string, number>;
        if (parsed && typeof parsed === 'object') zoneFeesMvr = parsed;
      }
    } catch { /* defaults */ }
    const estimateOpts = { freeThresholdMvr, defaultFeeMvr, zoneFeesMvr };

    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchDeliveryFeePreview(island, discountedSubtotalLaar)
        .then((preview) => {
          if (!cancelled) setDeliveryFee(preview.fee_laar);
        })
        .catch(() => {
          if (!cancelled) {
            setDeliveryFee(estimateDeliveryFeeLaar(island, discountedSubtotalLaar, estimateOpts));
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [orderType, delivery.island, discountedSubtotalLaar, siteSettings]);

  const backendOrderType = orderType === 'delivery' ? 'delivery' : 'online_pickup';
  const serviceChargePreview = useMemo(
    () => previewServiceCharge(serviceChargeConfig, backendOrderType, discountedSubtotalLaar),
    [serviceChargeConfig, backendOrderType, discountedSubtotalLaar],
  );
  const serviceChargeLaar = serviceChargePreview.amountLaar;
  const discountRatio = subtotalLaar > 0 ? discountedSubtotalLaar / subtotalLaar : 0;
  const taxBuckets: Array<{ ratePercent: number; laar: number }> = [];
  let itemTaxLaar = 0;
  for (const item of cart) {
    const rate = effectiveCheckoutTaxRatePercent(item.taxCode, item.taxRate, defaultTaxRatePercent);
    if (rate <= 0) continue;
    const itemLaar =
      Math.round(item.price * 100) * item.quantity +
      (item.modifiers ?? []).reduce((ms, m) => ms + Math.round(m.price * 100) * item.quantity, 0);
    const effectiveLaar = Math.round(itemLaar * discountRatio);
    if (effectiveLaar <= 0) continue;
    if (taxInclusive) {
      // Extract embedded tax: amount * r / (100 + r)
      itemTaxLaar += Math.round((effectiveLaar * rate) / (100 + rate));
    } else {
      itemTaxLaar += Math.round((effectiveLaar * rate) / 100);
    }
    taxBuckets.push({ ratePercent: rate, laar: effectiveLaar });
  }
  // Backend skips service-charge tax in the inclusive branch.
  const scTaxLaar = taxInclusive
    ? 0
    : serviceChargeTaxLaarByBuckets(serviceChargeConfig, serviceChargeLaar, taxBuckets);
  const taxLaar = itemTaxLaar + scTaxLaar;

  useEffect(() => {
    const feeOrderType = orderType === 'delivery' ? 'delivery' : 'online_pickup';
    const lines = cart.map((item) => ({
      item_id: item.id,
      quantity: item.quantity,
    }));
    // Instant local estimate from cart snapshots; server preview overwrites.
    let localPackLaar = 0;
    for (const item of cart) {
      const feeMvr = Number(item.packagingFee ?? 0);
      if (!(feeMvr > 0)) continue;
      const qty = Math.max(0, Math.round(item.quantity));
      if (qty <= 0) continue;
      localPackLaar += Math.round(feeMvr * 100) * qty;
    }
    setPackagingFeeLaar(localPackLaar);

    fetchCheckoutFeesPreview(feeOrderType, discountedSubtotalLaar, lines)
      .then((res) => {
        setPackagingFeeLaar(res.packaging_fee_laar ?? 0);
        setPackagingFeeLabel(res.packaging_fee_label ?? 'Packaging fee');
        setSmallOrderFeeLaar(res.small_order_fee_laar ?? 0);
        setSmallOrderFeeLabel(res.small_order_fee_label ?? 'Small order fee');
      })
      .catch(() => {
        setPackagingFeeLaar(localPackLaar);
        setSmallOrderFeeLaar(0);
      });
  }, [orderType, discountedSubtotalLaar, cart]);

  // Inclusive: tax is already inside discountedSubtotalLaar — show taxLaar as info only.
  const taxForTotalLaar = taxInclusive ? 0 : taxLaar;
  const totalLaar = discountedSubtotalLaar + serviceChargeLaar + taxForTotalLaar + deliveryFeeLaar + packagingFeeLaar + smallOrderFeeLaar;

  const earnPreviewPoints = useMemo(
    () => estimateEarnPointsForSubtotalMvr(discountedSubtotalLaar / 100, earnRatePerMvr, tierMultiplier),
    [discountedSubtotalLaar, earnRatePerMvr, tierMultiplier],
  );

  useEffect(() => {
    if (useLoyalty && loyaltyRedeemPoints < loyaltyRates.minRedeemPoints) {
      setUseLoyalty(false);
    }
  }, [useLoyalty, loyaltyRedeemPoints, loyaltyRates.minRedeemPoints]);

  // ── Promo ──────────────────────────────────────────────────────────────────
  const handleApplyPromo = async () => {
    if (!isAuthenticated) { setPromoError("Please sign in first."); return; }
    setPromoError("");
    setPromoLoading(true);
    if (!pendingOrderId) {
      // No order yet — validate the code and compute an estimated discount so
      // the customer sees the saving before they pay.
      try {
        const validation = await validatePromoCode(promoCode.trim().toUpperCase());
        if (!validation.valid || !validation.promotion) {
          setPromoError(validation.message ?? "Invalid promo code.");
          return;
        }
        const p = validation.promotion as { type?: string; discount_type?: string; discount_value: number };
        const pType = p.type ?? p.discount_type ?? "";
        let estLaar = 0;
        if (pType === "FIXED" || pType === "fixed") {
          // discount_value is laari for fixed promos; backend caps at merchandise subtotal.
          estLaar = Math.min(p.discount_value, subtotalLaar);
        } else if (pType === "PERCENTAGE" || pType === "percentage") {
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
      const res = await applyPromoCode(pendingOrderId, promoCode.trim().toUpperCase());
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
    setGiftCardError(""); setGiftCardBalance(null); setGiftCardHeld(0); setGiftCardLoading(true);
    try {
      const res = await checkGiftCardBalance(giftCardCode.trim().toUpperCase());
      const available = Number(res.available_balance ?? res.current_balance);
      const held = Number(res.held_balance ?? 0);
      setGiftCardHeld(held);
      if (available <= 0) {
        setGiftCardBalance(null);
        setGiftCardError(
          held > 0
            ? 'This gift card is fully held on other unpaid orders.'
            : 'This gift card has no available balance.',
        );
      } else {
        setGiftCardBalance(available);
      }
    } catch (e) {
      setGiftCardError((e as Error).message);
    } finally {
      setGiftCardLoading(false);
    }
  };

  const handleApplyGiftCard = async () => {
    if (!isAuthenticated) { setGiftCardError("Please sign in first."); return; }
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
      const res = await applyGiftCard(pendingOrderId, giftCardCode.trim().toUpperCase());
      setGiftCardApplied({ code: giftCardCode.trim().toUpperCase(), discountLaar: res.discount_laar });
      setGiftCardCode("");
    } catch (e) {
      setGiftCardError((e as Error).message);
    } finally {
      setGiftCardLoading(false);
    }
  };

  const handleRemoveGiftCard = async () => {
    if (isAuthenticated && pendingOrderId && giftCardApplied && !giftCardApplied.pending) {
      try {
        await removeGiftCard(pendingOrderId);
      } catch (e) {
        setGiftCardError((e as Error).message);
        return;
      }
    }
    setGiftCardApplied(null);
    setGiftCardCode("");
    setGiftCardBalance(null);
    setGiftCardHeld(0);
  };

  // Restage pending gift-card preview when cart / other discounts change.
  useEffect(() => {
    if (!giftCardApplied?.pending || giftCardBalance == null) return;
    const referralRoom = Math.max(0, subtotalLaar - promoDelta - loyaltyDelta);
    const referralBeforeGift = friendReferralApplied
      ? (friendReferralApplied.pending
        ? Math.min(friendReferralApplied.configuredLaar ?? friendReferralApplied.discountLaar, referralRoom)
        : friendReferralApplied.discountLaar)
      : 0;
    const room = Math.max(0, subtotalLaar - promoDelta - loyaltyDelta - referralBeforeGift);
    const capped = Math.min(Math.round(giftCardBalance * 100), room);
    if (capped === giftCardApplied.discountLaar) return;
    setGiftCardApplied((prev) => (prev?.pending ? { ...prev, discountLaar: capped } : prev));
  }, [
    subtotalLaar,
    promoDelta,
    loyaltyDelta,
    giftCardBalance,
    giftCardApplied?.pending,
    giftCardApplied?.code,
    giftCardApplied?.discountLaar,
    friendReferralApplied,
  ]);

  const handleApplyFriendReferral = async () => {
    if (!isAuthenticated) { setFriendReferralError("Please sign in first."); return; }
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
      const res = await applyReferralToOrder(pendingOrderId, raw);
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
    if (isAuthenticated && pendingOrderId && friendReferralApplied && !friendReferralApplied.pending) {
      try {
        await removeReferralFromOrder(pendingOrderId);
      } catch (e) {
        setFriendReferralError((e as Error).message);
        return;
      }
    }
    setFriendReferralApplied(null);
    setFriendReferralCode("");
  };

  const handleRemovePromo = async () => {
    if (isAuthenticated && pendingOrderId && promoApplied?.promotionId && !promoApplied.pending) {
      try {
        await removePromoCode(pendingOrderId, promoApplied.promotionId);
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
    if (!isAuthenticated) { setGlobalError('Please sign in to continue.'); return; }
    if (isPlacing) return; // prevent double-submission
    if (orderType === "delivery" && !validateDelivery()) return;

    setIsPlacing(true);
    setGlobalError("");
    let loyaltyHeldForOrderId: number | null = null;
    let giftCardAttachedOrderId: number | null = null;

    try {
      let orderId: number;

      // If an order was already created (e.g. payment failed on first attempt),
      // reuse it instead of creating a duplicate.
      if (pendingOrderId) {
        orderId = pendingOrderId;
      } else if (orderType === "delivery") {
        const res = await createDeliveryOrder({
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
        const res = await createCustomerOrder({
          items: cart.map((item) => ({
            item_id: item.id,
            quantity: item.quantity,
            variant_id: (item as CartItem & { variantId?: number | null }).variantId ?? undefined,
            modifiers: item.modifiers?.map((m) => ({ modifier_id: m.id })),
          })),
          type: "online_pickup",
          customer_notes: notes || undefined,
          pickup_slot_at: pickupSlotAt ?? undefined,
        });
        orderId = res.order.id;
      }

      setPendingOrderId(orderId);
      if (giftCardApplied && !giftCardApplied.pending) {
        giftCardAttachedOrderId = orderId;
      }

      const promoToApply = promoApplied?.pending
        ? promoApplied.code
        : promoCode.trim().toUpperCase();

      if (promoToApply && (!promoApplied || promoApplied.pending)) {
        try {
          const promoRes = await applyPromoCode(orderId, promoToApply);
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

      if (useLoyalty && loyaltyAccount) {
        const available = loyaltyAvailablePoints(loyaltyAccount);
        const roomLaar = Math.max(0, subtotalLaar - (promoApplied?.discountLaar ?? promoDelta));
        let pointsToRedeem = maxRedeemPointsForSubtotalLaar(roomLaar, available, loyaltyRates);

        if (pointsToRedeem < loyaltyRates.minRedeemPoints) {
          setGlobalError(
            available < loyaltyRates.minRedeemPoints
              ? `You need at least ${loyaltyRates.minRedeemPoints} available loyalty points. ${loyaltyAccount.points_held ? `${loyaltyAccount.points_held} points are reserved on another order.` : ''}`.trim()
              : 'Loyalty discount cannot be applied to this order total.',
          );
          setIsPlacing(false);
          return;
        }

        try {
          const preview = await previewLoyaltyHold(orderId, pointsToRedeem);
          pointsToRedeem = preview.points;
          if (pointsToRedeem < loyaltyRates.minRedeemPoints) {
            setGlobalError('Loyalty discount cannot be applied to this order total.');
            setIsPlacing(false);
            return;
          }
          await createLoyaltyHold(orderId, pointsToRedeem);
          loyaltyHeldForOrderId = orderId;
        } catch (e) {
          setGlobalError("Could not apply loyalty points: " + (e as Error).message);
          setIsPlacing(false);
          return;
        }
      }

      const giftCardToApply = giftCardApplied?.pending ? giftCardApplied.code : (giftCardCode.trim().toUpperCase() || null);
      if (giftCardToApply && (!giftCardApplied || giftCardApplied.pending)) {
        try {
          const gcRes = await applyGiftCard(orderId, giftCardToApply);
          setGiftCardApplied({ code: giftCardToApply, discountLaar: gcRes.discount_laar });
          setGiftCardCode("");
          giftCardAttachedOrderId = orderId;
        } catch (e) {
          if (loyaltyHeldForOrderId) {
            await releaseLoyaltyHold(loyaltyHeldForOrderId).catch(() => undefined);
            loyaltyHeldForOrderId = null;
          }
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
            const refRes = await applyReferralToOrder(orderId, referralToApply);
            setFriendReferralApplied({ code: refRes.code, discountLaar: refRes.discount_laar });
            setFriendReferralCode("");
          } catch (e) {
            if (loyaltyHeldForOrderId) {
              await releaseLoyaltyHold(loyaltyHeldForOrderId).catch(() => undefined);
              loyaltyHeldForOrderId = null;
            }
            setFriendReferralError((e as Error).message);
            setFriendReferralApplied(null);
            setIsPlacing(false);
            return;
          }
        }
      }

      const { order: freshOrder } = await getOrderDetail(orderId);
      const dueLaar =
        typeof freshOrder.total_laar === "number"
          ? freshOrder.total_laar
          : Math.round(Number(freshOrder.total) * 100);

      if (dueLaar <= 0) {
        // Hold is consumed on zero-balance completion — do not release.
        loyaltyHeldForOrderId = null;
        giftCardAttachedOrderId = null;
        await completeZeroBalanceOrder(orderId);
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

      const payment = await initiateOnlinePayment(orderId);
      if (!payment.payment_url) {
        throw new Error("Payment could not be started. Please try again in a moment.");
      }

      // Keep holds through BML redirect — OrderPaid consumes them.
      loyaltyHeldForOrderId = null;
      giftCardAttachedOrderId = null;

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
      if (loyaltyHeldForOrderId) {
        await releaseLoyaltyHold(loyaltyHeldForOrderId).catch(() => undefined);
      }
      if (giftCardAttachedOrderId) {
        await removeGiftCard(giftCardAttachedOrderId).catch(() => undefined);
        setGiftCardApplied(null);
      }
      setGlobalError((e as Error).message);
      setIsPlacing(false);
    }
  };

  const handleAuthSuccess = (name: string) => {
    setAuth(name);
    setCustomerName(name);
  };

  return {
    cart, isAuthenticated, customerName, loyaltyAccount, loyaltyTierProgress, loyaltyRedeemPoints, loyaltyRates, loyaltyProgramMessage, earnPreviewPoints,
    orderType, setOrderType, pickupSlotAt, setPickupSlotAt, delivery, setDelivery, notes, setNotes,
    savedAddresses, selectedAddressId, setSelectedAddressId, applySavedAddress,
    saveAddress, setSaveAddress, addressLabel, setAddressLabel,
    promoCode, setPromoCode, promoApplied, setPromoApplied, promoError, promoLoading,
    useLoyalty, setUseLoyalty, deliveryFee, errors, isPlacing, globalError,
    subtotalLaar, discountedSubtotalLaar, taxLaar, deliveryFeeLaar, promoDelta, loyaltyDelta, referralDelta,
    serviceChargeLaar, serviceChargeLabel: serviceChargePreview.label,
    packagingFeeLaar, packagingFeeLabel, smallOrderFeeLaar, smallOrderFeeLabel,
    totalLaar,
    handleApplyPromo, handleRemovePromo, handlePlaceAndPay, handleAuthSuccess,
    giftCardCode, setGiftCardCode, giftCardApplied, giftCardError, giftCardLoading,
    giftCardBalance, giftCardHeld, giftCardDelta,
    handleCheckGiftCard, handleApplyGiftCard, handleRemoveGiftCard,
    myReferralCode,
    friendReferralCode, setFriendReferralCode, friendReferralApplied, friendReferralError,
    friendReferralLoading,
    handleApplyFriendReferral, handleRemoveFriendReferral,
  };
}
