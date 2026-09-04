import { canScanGiftCard, useGiftCardScan } from '../hooks/useGiftCardScan';
import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchOrderingEligibility, type OrderingEligibility,
  fetchOnlineOrderingStatus, type OnlineOrderingStatus,
  fetchDeliveryZoneStatus,
  getWaitTimeEstimate,
  fetchPickupSlots,
  type PickupSlot,
  getOrderDay,
} from "../api";
import { useNavigate } from "react-router-dom";
import { useCheckout } from "../hooks/useCheckout";
import { useSiteSettingsContext } from "../context/SiteSettingsContext";
import { useLanguage } from "../context/LanguageContext";
import { useServiceStatusContext } from "../context/ServiceStatusContext";
import { useOrderMode } from "../context/OrderModeContext";
import { useToast } from "../context/ToastContext";
import { AuthBlock } from "../components/AuthBlock";
import { BrandedHeader } from "../components/BrandedHeader";
import { CartSummary } from "../components/CartSummary";
import { WhatsAppIcon, ViberIcon } from '../components/icons';
import { laarToMvr } from '../utils/money';
import {
  loyaltyAvailablePoints,
  pointsValueMvr,
} from '../utils/loyalty';
import { AccordionItem } from '../components/ui/Accordion';
import { StickyCtaBar } from '../components/ui/StickyCtaBar';
import {
  collectDayPrimaryLabel,
  defaultCollectOn,
  forcedTomorrowNotice,
  formatTomorrowDateLabel,
} from '../utils/collectOn';
import { isDeliveryBlocked, isPickupBlocked } from '../utils/fulfilmentAvailability';
import {
  formatDeliveryDestination,
  resolveDestinationLabel,
  shouldShowDeliveryDestination,
  shouldShowSaveAddressOption,
  shouldShowUsingDefaultNote,
} from '../utils/checkoutDeliveryAddress';

function parseFreeDeliveryThreshold(raw: string | undefined): number {
  const n = parseFloat(raw ?? '');
  return Number.isFinite(n) && n > 0 ? n : 200;
}

function parseZoneFees(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// ── Field component ────────────────────────────────────────────────────────────
function Field({
  label, placeholder, value, onChange, onBlur, error, multiline, type,
}: {
  label: string; placeholder?: string; value: string;
  onChange: (v: string) => void; onBlur?: () => void;
  error?: string; multiline?: boolean; type?: string;
}) {
  const fieldId = label.toLowerCase().replace(/\s+/g, '-');
  const errorId = `${fieldId}-error`;
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={fieldId} style={S.fieldLabel}>{label}</label>
      {multiline ? (
        <textarea
          id={fieldId}
          className={`field-input${error ? ' error' : ''}`}
          placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          style={{ height: 72, resize: 'vertical' }}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
      ) : (
        <input
          id={fieldId}
          type={type ?? 'text'}
          className={`field-input${error ? ' error' : ''}`}
          placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
      )}
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
}

// ── Summary row ────────────────────────────────────────────────────────────────
function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={S.summaryRow}>
      <span style={{ color: highlight ? 'var(--color-success)' : 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ color: highlight ? 'var(--color-success)' : 'var(--color-text)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ── Error → accordion mapping ──────────────────────────────────────────────────
/**
 * Maps form field error keys (from useCheckout `errors`) and zone/promo
 * banner errors to the accordion id that should be force-opened to surface
 * the error to the user.
 * See docs/online-order-ui-redesign/CHECKOUT_ACCORDION_ERRORS.md for the full table.
 */
const ERROR_TO_ACCORDION: Record<string, string> = {
  address_line1: 'fulfillment',
  island:        'fulfillment',
  contact_name:  'fulfillment',
  contact_phone: 'fulfillment',
};

// ── Page ───────────────────────────────────────────────────────────────────────
export function CheckoutPage() {
  const navigate  = useNavigate();
  const { t }     = useLanguage();
  const { showToast } = useToast();
  const { modeConfirmed } = useOrderMode();
  const needsModeChoice = !modeConfirmed;
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [openId, setOpenId]           = useState<string | null>('order-type');
  const toggle = (id: string) => {
    // Keep Order Type open until the customer makes an explicit choice.
    if (id === 'order-type' && needsModeChoice) {
      setOpenId('order-type');
      return;
    }
    setOpenId((cur) => (cur === id ? null : id));
  };

  const { settings: s, text } = useSiteSettingsContext();
  const { isAvailable: isServiceAvailable, get: getService, openUnavailableModal } = useServiceStatusContext();
  const checkoutServiceAvailable = isServiceAvailable('online_checkout');
  const paymentServiceAvailable = isServiceAvailable('online_payment');
  const pickupServiceAvailable = isServiceAvailable('online_pickup');
  const deliveryServiceAvailable = isServiceAvailable('online_delivery');
  const checkoutServiceEntry = getService('online_checkout');
  const paymentServiceEntry = getService('online_payment');

  const siteName    = s.site_name        || 'Bake & Grill';
  const checkoutTitle = text('order_checkout_title', 'Complete your order');
  const checkoutSubtitle = text('order_checkout_subtitle', 'Secure payment · Straight to the kitchen');
  const paymentCompliance = text(
    'order_payment_compliance',
    'All prices in MVR. Payments are processed securely via Bank of Maldives (BML). Your card details are never stored on our servers.',
  );
  const phone       = s.business_phone   || '+960 912 0011';
  const phoneTel    = 'tel:' + phone.replace(/[^+\d]/g, '');
  const email       = s.business_email   || 'admin@bakeandgrill.mv';
  const address     = s.business_address || 'Kalaafaanu Hingun, Malé, Maldives';
  const waLink      = s.business_whatsapp|| 'https://wa.me/9609120011';
  const viberLink   = s.business_viber   || 'viber://chat?number=9609120011';
  const deliveryEta = (s.delivery_time ?? s.delivery_eta) || '30–45 min';

  useEffect(() => { document.title = `${t('checkout.title')} — ${siteName}`; }, [siteName, t]);

  const [orderElig, setOrderElig] = useState<OrderingEligibility | null>(null);
  const [onlineGate, setOnlineGate] = useState<OnlineOrderingStatus | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [waitMinutes, setWaitMinutes] = useState<number | null>(null);
  const [pickupSlots, setPickupSlots] = useState<PickupSlot[]>([]);
  const [pickupSlotsLoading, setPickupSlotsLoading] = useState(false);

  const pickupSlotsEnabled = s.pickup_slots_enabled !== '0' && s.pickup_slots_enabled !== 'false';

  useEffect(() => {
    fetchOrderingEligibility().then(setOrderElig).catch(() => setOrderElig(null));
    fetchOnlineOrderingStatus().then(setOnlineGate).catch(() => setOnlineGate(null));
    getWaitTimeEstimate()
      .then(({ wait_minutes, queue_depth }) => {
        if (queue_depth > 0) setWaitMinutes(wait_minutes);
      })
      .catch(() => { /* non-blocking */ });
  }, []);

  const handleIslandBlur = useCallback(async (island: string) => {
    if (!island.trim()) return;
    setZoneError(null);
    try {
      const status = await fetchDeliveryZoneStatus(island.trim());
      if (status.zone_eligible === false) {
        setZoneError(status.message ?? `Delivery is not available to "${island}".`);
      }
    } catch {
      // non-blocking — backend will reject at submission if needed
    }
  }, []);

  const {
    cart, isAuthenticated, customerName, loyaltyAccount, loyaltyTierProgress, loyaltyRedeemPoints, loyaltyRates, loyaltyProgramMessage, earnPreviewPoints,
    orderType, setOrderType, pickupSlotAt, setPickupSlotAt,
    lastChannelPrune,
    collectOn, setCollectOn, allowsTomorrow, cartForcesTomorrow,
    partySize, setPartySize,
    delivery, setDelivery, notes, setNotes,
    savedAddresses, selectedAddressId, applySavedAddress, markAddressAsNew,
    saveAddress, setSaveAddress, addressLabel, setAddressLabel, usingAutoDefaultAddress,
    promoCode, setPromoCode, promoApplied,
    promoError, promoLoading,
    useLoyalty, setUseLoyalty,
    deliveryFee, errors, isPlacing, globalError,
    subtotalLaar, discountedSubtotalLaar, taxLaar, deliveryFeeLaar, promoDelta, loyaltyDelta, referralDelta,
    serviceChargeLaar, serviceChargeLabel, totalLaar, amountDueLaar,
    packagingFeeLaar, packagingFeeLabel, smallOrderFeeLaar, smallOrderFeeLabel,
    handleApplyPromo, handleRemovePromo, handlePlaceAndPay, handleAuthSuccess,
    giftCardCode, setGiftCardCode, giftCardApplied, giftCardError, giftCardLoading,
    giftCardBalance, giftCardHeld, giftCardDelta,
    handleCheckGiftCard, handleApplyGiftCard, handleRemoveGiftCard,
    tableSession,
    myReferralCode,
    friendReferralCode, setFriendReferralCode, friendReferralApplied, friendReferralError,
    friendReferralLoading,
    handleApplyFriendReferral, handleRemoveFriendReferral,
  } = useCheckout();

  /*
   * Scanning is offered only where the browser can actually do it — Chrome and
   * Android WebView have BarcodeDetector built in, iOS Safari does not. No
   * scanning library is shipped: this is the customer app, and a decoder is a
   * large download for everyone to give a few people a shortcut. Typing and
   * pasting the SMS link work on every device.
   */
  const [scanSupported] = useState(() => canScanGiftCard());
  const giftScan = useGiftCardScan((value) => { setGiftCardCode(value); });


  const showDeliveryDestination = shouldShowDeliveryDestination(orderType, delivery.address_line1);
  const destinationLabel = resolveDestinationLabel(selectedAddressId, savedAddresses, addressLabel);
  const destinationText = formatDeliveryDestination({
    label: destinationLabel,
    addressLine1: delivery.address_line1,
    island: delivery.island,
  });
  const showUsingDefaultNote = shouldShowUsingDefaultNote(
    usingAutoDefaultAddress,
    savedAddresses.length,
  );
  const openAddressPicker = () => setOpenId('fulfillment');

  const forTomorrow = collectOn === 'tomorrow';
  const deliveryModeGate = forTomorrow
    ? onlineGate?.order_for_tomorrow?.modes?.delivery?.open
    : onlineGate?.modes?.delivery?.open;
  const pickupModeGate = forTomorrow
    ? onlineGate?.order_for_tomorrow?.modes?.pickup?.open
    : onlineGate?.modes?.pickup?.open;
  const deliveryBlocked = isDeliveryBlocked({
    isOpen: onlineGate == null ? null : onlineGate.open,
    deliveryAvailable: onlineGate?.delivery_available ?? true,
    eligibilityAccepting: orderElig == null ? null : orderElig.delivery.accepting,
    serviceAvailable: deliveryServiceAvailable,
    forTomorrow,
    modeGateOpen: deliveryModeGate,
  });
  const pickupBlocked = isPickupBlocked({
    serviceAvailable: pickupServiceAvailable,
    modeGateOpen: pickupModeGate,
  });
  const shopClosed = onlineGate != null && !onlineGate.open;
  const orderingGateClosed = shopClosed || !checkoutServiceAvailable;
  const collectTomorrowDate = onlineGate?.order_for_tomorrow?.collect_tomorrow_date ?? null;
  // Owner kill switch / schedule for tomorrow ordering (older servers omit = on).
  const tomorrowGateOpen = onlineGate?.order_for_tomorrow?.open !== false;
  const canOrderTomorrowWhileClosed = shopClosed && allowsTomorrow && checkoutServiceAvailable && tomorrowGateOpen;
  const placeBlockedByGate = orderingGateClosed && !(canOrderTomorrowWhileClosed && collectOn === 'tomorrow');
  // Prepaid dine-in ("Eat here"): today uses modes.dine_in / legacy; tomorrow needs tomorrow_dine_in.
  const dineInAvailable = forTomorrow
    ? onlineGate?.order_for_tomorrow?.modes?.dine_in?.open === true
    : (onlineGate?.modes?.dine_in?.open
      ?? ((onlineGate?.dine_in_preorder?.open ?? onlineGate?.dine_in_preorder?.enabled) === true && !shopClosed));
  const isDineIn = orderType === 'dine_in';

  // Auto-fallback when the chosen mode becomes unavailable — never counts as an explicit choice.
  const lastAutoFlipKey = useRef<string | null>(null);
  useEffect(() => {
    if (deliveryBlocked && orderType === 'delivery' && !pickupBlocked) {
      const key = 'delivery→pickup';
      if (lastAutoFlipKey.current !== key) {
        lastAutoFlipKey.current = key;
        showToast(t('checkout.delivery_unavailable'));
      }
      setOrderType('pickup', { explicit: false });
      return;
    }
    if (pickupBlocked && orderType === 'pickup' && !deliveryBlocked) {
      const key = 'pickup→delivery';
      if (lastAutoFlipKey.current !== key) {
        lastAutoFlipKey.current = key;
        showToast(t('checkout.pickup_unavailable_switched'));
      }
      setOrderType('delivery', { explicit: false });
      return;
    }
    // Fall back to pickup if dine-in was selected but is not available.
    if (orderType === 'dine_in' && onlineGate != null && !dineInAvailable && !pickupBlocked) {
      const key = 'dine_in→pickup';
      if (lastAutoFlipKey.current !== key) {
        lastAutoFlipKey.current = key;
      }
      setOrderType('pickup', { explicit: false });
      return;
    }
    lastAutoFlipKey.current = null;
  }, [deliveryBlocked, pickupBlocked, orderType, setOrderType, showToast, t, onlineGate, dineInAvailable]);

  // Dine-in arrival is always today.
  useEffect(() => {
    if (isDineIn && collectOn !== 'today') setCollectOn('today');
  }, [isDineIn, collectOn, setCollectOn]);

  // Keep Order Type open while unconfirmed (also if another accordion was force-opened).
  useEffect(() => {
    if (needsModeChoice) setOpenId('order-type');
  }, [needsModeChoice]);

  // Surface channel-switch cart pruning (same copy as menu).
  const lastPruneAt = useRef<number | null>(null);
  useEffect(() => {
    if (!lastChannelPrune || lastChannelPrune.at === lastPruneAt.current) return;
    lastPruneAt.current = lastChannelPrune.at;
    const pruneKey = lastChannelPrune.count === 1 ? 'menu.toast_prune_one' : 'menu.toast_prune_many';
    showToast(t(pruneKey).replace('{n}', String(lastChannelPrune.count)));
  }, [lastChannelPrune, showToast, t]);

  // Default Today when open, Tomorrow when closed, cart forces tomorrow,
  // or the customer already picked Tomorrow on the menu.
  useEffect(() => {
    const next = defaultCollectOn({
      shopOpen: onlineGate == null ? null : onlineGate.open,
      cartForcesTomorrow,
      cartAllowsTomorrow: allowsTomorrow,
      preferredDay: getOrderDay(),
    });
    setCollectOn(next);
  }, [onlineGate?.open, cartForcesTomorrow, allowsTomorrow, setCollectOn]);

  // Mixed cart: if Tomorrow is forced/selected, every line must allow it.
  useEffect(() => {
    if (collectOn === 'tomorrow' && !allowsTomorrow) {
      setCollectOn('today');
    }
  }, [collectOn, allowsTomorrow, setCollectOn]);

  useEffect(() => {
    // Dine-in reuses the slot grid as the ARRIVAL time and always needs it.
    const needsSlots = orderType === 'dine_in' || (orderType === 'pickup' && pickupSlotsEnabled);
    if (!needsSlots) {
      setPickupSlots([]);
      if (orderType === 'delivery') setPickupSlotAt(null);
      return;
    }
    setPickupSlotsLoading(true);
    fetchPickupSlots()
      .then((res) => {
        const available = (res.slots ?? []).filter((slot) => slot.available);
        setPickupSlots(available);
        if (pickupSlotAt && !available.some((slot) => slot.starts_at === pickupSlotAt)) {
          setPickupSlotAt(null);
        }
      })
      .catch(() => setPickupSlots([]))
      .finally(() => setPickupSlotsLoading(false));
  }, [orderType, pickupSlotsEnabled, setPickupSlotAt]);

  // ── Force-open accordion when errors surface ────────────────────────────────
  useEffect(() => {
    const found = Object.keys(ERROR_TO_ACCORDION).find(
      (k) => !!(errors as Record<string, string | undefined>)[k],
    );
    if (found) { setOpenId(ERROR_TO_ACCORDION[found]); return; }
    if (zoneError) { setOpenId('fulfillment'); return; }
    if (promoError || giftCardError || friendReferralError) { setOpenId('discounts'); return; }
    // globalError surfaces as a banner in StickyCtaBar.above — no accordion redirect
  }, [errors, zoneError, promoError, giftCardError, friendReferralError, globalError]);

  if (cart.length === 0) {
    return (
      <div style={{ padding: '3rem var(--page-gutter)', textAlign: 'center', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-fade-in">
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.35 }}>🛒</div>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', fontSize: '1rem' }}>
            {t('checkout.empty_cart')}
          </p>
          <button style={S.primaryBtn} onClick={() => navigate("/")}>{t('checkout.browse_menu')}</button>
        </div>
      </div>
    );
  }

  const hasPendingReferral = friendReferralApplied?.pending === true;
  const guardedPlaceAndPay = () => {
    if (!checkoutServiceAvailable) {
      openUnavailableModal({
        serviceKey: 'online_checkout',
        message: checkoutServiceEntry?.public_message ?? 'Online ordering is temporarily unavailable.',
        alternatives: checkoutServiceEntry?.alternatives ?? ['pickup', 'call'],
        retryAt: checkoutServiceEntry?.retry_at ?? null,
        notifyEnabled: checkoutServiceEntry?.notify_enabled ?? true,
      });
      return;
    }
    if (!paymentServiceAvailable && amountDueLaar > 0) {
      openUnavailableModal({
        serviceKey: 'online_payment',
        message: paymentServiceEntry?.public_message ?? 'Online payment is temporarily unavailable — please choose cash on collection.',
        alternatives: paymentServiceEntry?.alternatives ?? ['cod', 'call'],
        retryAt: paymentServiceEntry?.retry_at ?? null,
        notifyEnabled: paymentServiceEntry?.notify_enabled ?? true,
      });
      return;
    }
    void handlePlaceAndPay();
  };
  // Hide the misleading "nothing to pay" red banner (auto-handled in useCheckout).
  // Never pair that message with a live Pay label — switch to the no-payment label.
  const zeroBalanceConflict = /nothing to pay/i.test(globalError);
  const placeLabel = isPlacing
    ? t('checkout.processing')
    : placeBlockedByGate
      ? t('checkout.gate_closed')
      : needsModeChoice
        ? t('checkout.choose_order_type')
        : !paymentServiceAvailable && amountDueLaar > 0
          ? 'Online payment unavailable'
          : (amountDueLaar <= 0 || zeroBalanceConflict)
            ? t('checkout.place_no_payment')
            : t('checkout.pay_bml').replace('{amount}', String(laarToMvr(amountDueLaar)));

  // ── Section bodies (bare content — AccordionItem provides title/chrome) ──────

  const bodyOrderType = (
    <>
      {needsModeChoice && (
        <p style={{ margin: '0 0 12px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.45 }}>
          {t('checkout.choose_order_type_hint')}
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {(['pickup', 'delivery', 'dine_in'] as const).map((type) => {
          const blocked =
            (type === 'delivery' && deliveryBlocked)
            || (type === 'pickup' && pickupBlocked)
            || (type === 'dine_in' && !dineInAvailable);
          const active = !needsModeChoice && orderType === type;
          return (
            <button
              key={type}
              type="button"
              data-testid={type === 'dine_in' ? 'order-type-dine-in' : undefined}
              onClick={() => {
                if (blocked) return;
                setOrderType(type);
              }}
              disabled={blocked}
              style={{
                ...S.typeBtn,
                ...(active ? S.typeBtnActive : {}),
                ...(blocked ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
              }}
              aria-pressed={active}
              aria-disabled={blocked || undefined}
            >
              {type === 'pickup'
                ? `🥡 ${t('checkout.type_pickup')}`
                : type === 'delivery'
                  ? `🛵 ${t('checkout.type_delivery')}`
                  : `🍽️ ${t('checkout.type_eat_here')}`}
            </button>
          );
        })}
      </div>
      {deliveryBlocked && (
        <p style={{ margin: '12px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
          {(orderElig?.delivery.message) ?? t('checkout.delivery_unavailable')}
        </p>
      )}
      {pickupBlocked && (
        <p style={{ margin: '12px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
          Pickup orders are temporarily paused.
        </p>
      )}

      {isDineIn && (
        <div style={{ marginTop: 16 }} data-testid="dine-in-details">
          <p style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text)' }}>
            How many people?
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              aria-label="Fewer people"
              onClick={() => setPartySize(Math.max(1, partySize - 1))}
              style={{ ...S.typeBtn, padding: '8px 16px' }}
            >
              −
            </button>
            <span style={{ fontSize: '1rem', fontWeight: 800, minWidth: 24, textAlign: 'center' }} data-testid="party-size-value">
              {partySize}
            </span>
            <button
              type="button"
              aria-label="More people"
              onClick={() => setPartySize(Math.min(20, partySize + 1))}
              style={{ ...S.typeBtn, padding: '8px 16px' }}
            >
              +
            </button>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Pick your arrival time below. We reserve a table for you and have your food ready when you walk in.
            You pay now — anything extra you order at the table joins the same bill.
          </p>
        </div>
      )}
    </>
  );

  // The day is decided on the menu (Today/Tomorrow toggle) — checkout only
  // shows it read-only so a late flip can't invalidate the cart. Only the
  // time (pickup slot) is chosen here.
  const tomorrowDateLabel = formatTomorrowDateLabel(collectTomorrowDate);
  const tomorrowHeading = collectDayPrimaryLabel(collectTomorrowDate, t('checkout.day_tomorrow'));
  const bodyWhenSummary = (
    <div style={{ marginBottom: 16 }} data-testid="collect-day-summary">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: 'var(--color-surface-alt)',
          borderRadius: 12,
          padding: '10px 14px',
        }}
      >
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text)' }}>
          <span aria-hidden="true">📅</span>{' '}
          {collectOn === 'tomorrow'
            ? `${tomorrowHeading}, ${tomorrowDateLabel}`
            : t('checkout.day_today')}
        </span>
        <button
          type="button"
          data-testid="collect-day-change"
          onClick={() => navigate('/')}
          style={{
            border: 'none',
            background: 'none',
            padding: 0,
            fontFamily: 'inherit',
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            color: 'var(--color-primary)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {t('checkout.change_day')}
        </button>
      </div>
      {(cartForcesTomorrow || (shopClosed && collectOn === 'tomorrow')) && allowsTomorrow && (
        <p
          data-testid="forced-tomorrow-notice"
          style={{
            margin: '10px 0 0',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            lineHeight: 1.5,
            background: 'var(--color-surface-alt)',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          {forcedTomorrowNotice(collectTomorrowDate)}
        </p>
      )}
      {!allowsTomorrow && shopClosed && (
        <p style={{ margin: '10px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
          Ordering is closed for today. Remove items that cannot be collected tomorrow, or come back when we reopen.
        </p>
      )}
    </div>
  );

  const bodyPickupSlot = (
    <>
      {pickupSlotsLoading ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{t('checkout.pickup_loading')}</p>
      ) : pickupSlots.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
          {t('checkout.pickup_full')}
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text)' }}>
            {t('checkout.pickup_choose')}
          </p>
          <div className="time-slot-grid" data-testid="pickup-slot-grid">
            <button
              type="button"
              onClick={() => setPickupSlotAt(null)}
              aria-pressed={pickupSlotAt === null}
              className={`time-slot-btn${pickupSlotAt === null ? ' is-active' : ''}`}
            >
              <span className="time-slot-btn__label">⚡ {t('checkout.asap')}</span>
              <span className="time-slot-btn__sub">{t('checkout.asap_sub')}</span>
            </button>
            {pickupSlots.map((slot) => (
              <button
                key={slot.starts_at}
                type="button"
                onClick={() => setPickupSlotAt(slot.starts_at)}
                aria-pressed={pickupSlotAt === slot.starts_at}
                className={`time-slot-btn${pickupSlotAt === slot.starts_at ? ' is-active' : ''}`}
              >
                <span className="time-slot-btn__label">{slot.label}</span>
                {slot.remaining > 0 && slot.remaining <= 3 && (
                  <span className="time-slot-btn__sub">
                    {t('checkout.slot_left').replace('{n}', String(slot.remaining))}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );

  // Dine-in arrival time: same slot grid as pickup, but REQUIRED (no ASAP) —
  // the kitchen times the food and the table hold to this.
  const bodyDineInArrival = (
    <>
      {pickupSlotsLoading ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{t('checkout.pickup_loading')}</p>
      ) : pickupSlots.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
          No arrival times are available right now. Please try again later or choose Pickup.
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            When will you arrive? Your table is reserved for this time.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} data-testid="arrival-slot-grid">
            {pickupSlots.map((slot) => (
              <button
                key={slot.starts_at}
                type="button"
                onClick={() => setPickupSlotAt(slot.starts_at)}
                style={{
                  ...S.typeBtn,
                  ...(pickupSlotAt === slot.starts_at ? S.typeBtnActive : {}),
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                }}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );

  const bodyDelivery = orderType === 'delivery' ? (() => {
    const freeThreshold = parseFreeDeliveryThreshold(s.delivery_free_threshold);
    const defaultFee = parseFloat(s.delivery_default_fee ?? '30') || 30;
    const zoneFees = parseZoneFees(s.delivery_zone_fees);
    const islandKey = delivery.island.trim();
    const zoneFee = islandKey
      ? Object.entries(zoneFees).find(([z]) => z.toLowerCase() === islandKey.toLowerCase())?.[1]
      : undefined;
    const explainedFee = zoneFee ?? defaultFee;
    const cartMvr = discountedSubtotalLaar / 100;
    const qualifiesFree = cartMvr >= freeThreshold;

    return (
      <>
        <div style={S.infoNote}>
          <span>🛵</span>{' '}
          {t('checkout.delivery_fee_prefix')}{' '}
          <strong>MVR {(deliveryFee / 100).toFixed(2)}</strong>
          {islandKey && zoneFee != null && zoneFee !== defaultFee && (
            <> · {t('checkout.zone_rate').replace('{island}', islandKey).replace('{fee}', explainedFee.toFixed(2))}</>
          )}
          {islandKey && zoneFee == null && (
            <> · {t('checkout.standard_rate').replace('{fee}', defaultFee.toFixed(2))}</>
          )}
          {' '}· {t('checkout.estimated').replace('{eta}', deliveryEta)}
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
          {qualifiesFree
            ? t('checkout.free_qualifies').replace('{n}', freeThreshold.toFixed(0))
            : t('checkout.free_add_more')
                .replace('{n}', freeThreshold.toFixed(0))
                .replace('{amount}', Math.max(0, freeThreshold - cartMvr).toFixed(2))}
        </p>
        {isAuthenticated && savedAddresses.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('checkout.saved_address')}
            </label>
            <select
              className="field-input"
              value={selectedAddressId}
              onChange={(e) => {
                const v = e.target.value;
                applySavedAddress(v === 'new' ? 'new' : Number(v));
              }}
              style={{ width: '100%' }}
            >
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.label ? `${a.label} — ` : '') + a.address_line1 + (a.is_default ? ` ${t('checkout.default_suffix')}` : '')}
                </option>
              ))}
              <option value="new">{t('checkout.new_address')}</option>
            </select>
          </div>
        )}
        <Field label={t('checkout.label_address')} placeholder={t('checkout.ph_address')}
          value={delivery.address_line1} onChange={(v) => { setDelivery({ ...delivery, address_line1: v }); markAddressAsNew(); }} error={errors.address_line1} />
        <Field label={t('checkout.label_address2')} placeholder={t('checkout.ph_address2')}
          value={delivery.address_line2} onChange={(v) => setDelivery({ ...delivery, address_line2: v })} />
        <Field label={t('checkout.label_island')} placeholder={t('checkout.ph_island')}
          value={delivery.island}
          onChange={(v) => { setDelivery({ ...delivery, island: v }); setZoneError(null); }}
          onBlur={() => void handleIslandBlur(delivery.island)}
          error={zoneError ?? errors.island} />
        <Field label={t('checkout.label_maps')} placeholder={t('checkout.ph_maps')}
          value={delivery.location_link} onChange={(v) => setDelivery({ ...delivery, location_link: v })} />
        <div style={S.fieldRow}>
          <Field label={t('checkout.label_contact_name')} placeholder={t('checkout.ph_contact_name')}
            value={delivery.contact_name} onChange={(v) => setDelivery({ ...delivery, contact_name: v })} error={errors.contact_name} />
          <Field label={t('checkout.label_contact_phone')} placeholder={t('checkout.ph_contact_phone')}
            value={delivery.contact_phone} onChange={(v) => setDelivery({ ...delivery, contact_phone: v })} error={errors.contact_phone} />
        </div>
        <Field label={t('checkout.label_delivery_notes')} placeholder={t('checkout.ph_delivery_notes')}
          value={delivery.notes} onChange={(v) => setDelivery({ ...delivery, notes: v })} multiline />
        {shouldShowSaveAddressOption(isAuthenticated, selectedAddressId) && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="checkout-save-address">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={saveAddress}
                onChange={(e) => setSaveAddress(e.target.checked)}
              />
              {t('checkout.save_address')}
            </label>
            {saveAddress && (
              <Field label={t('checkout.label_address_label')} placeholder={t('checkout.ph_address_label')}
                value={addressLabel} onChange={setAddressLabel} />
            )}
          </div>
        )}
      </>
    );
  })() : null;

  const bodyNotes = (
    <textarea
      className="field-input"
      placeholder={t('checkout.ph_notes')}
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      style={{ height: 80, resize: 'vertical' }}
    />
  );

  // Discounts: promo + loyalty + friend referral + gift card stacked in one panel
  const bodyDiscounts = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Promo Code */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('checkout.promo_code')}
        </p>
        {promoApplied ? (
          <div style={S.promoApplied}>
            <span style={{ fontSize: 'var(--text-base)' }}>
              {(promoApplied.pending && promoApplied.discountLaar === 0)
                ? <><span>⏳</span> <strong>{promoApplied.code}</strong> — {t('checkout.promo_pending')}</>
                : promoApplied.discountLaar === 0
                  ? <><span>✅</span> <strong>{promoApplied.code}</strong> — Free delivery</>
                  : <><span>✅</span> <strong>{promoApplied.code}</strong> — {t('checkout.promo_off').replace('{amount}', String(laarToMvr(promoApplied.discountLaar)))}</>
              }
            </span>
            <button style={S.removeBtn} onClick={() => void handleRemovePromo()}>{t('checkout.remove')}</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field-input"
                style={{ flex: 1 }}
                placeholder={t('checkout.ph_promo')}
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                aria-label={t('checkout.aria_promo')}
              />
              <button style={S.secondaryBtn} onClick={handleApplyPromo} disabled={promoLoading || !promoCode}>
                {promoLoading ? '…' : t('checkout.apply')}
              </button>
            </div>
            {promoError && <p className="field-error" style={{ marginTop: 6 }}>{promoError}</p>}
          </>
        )}
      </div>

      {/* Loyalty Points */}
      {loyaltyAccount && loyaltyAccount.points_balance > 0 && (() => {
        const available = loyaltyAvailablePoints(loyaltyAccount);
        const held = loyaltyAccount.points_held ?? 0;
        const minRedeem = loyaltyRates.minRedeemPoints;
        const canRedeem = available >= minRedeem && loyaltyRedeemPoints >= minRedeem;
        return (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('checkout.loyalty_points')}
            </p>
            {loyaltyProgramMessage && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 10px', lineHeight: 1.45 }}>
                {loyaltyProgramMessage}
              </p>
            )}
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', marginBottom: 8 }}>
              {t('checkout.loyalty_available')
                .replace('{n}', available.toLocaleString())
                .replace('{value}', `MVR ${pointsValueMvr(available, loyaltyRates)}`)}
            </p>
            {held > 0 && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
                {t('checkout.loyalty_held')
                  .replace('{held}', held.toLocaleString())
                  .replace('{total}', loyaltyAccount.points_balance.toLocaleString())}
              </p>
            )}
            {available < minRedeem && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                {t('checkout.loyalty_min').replace('{n}', String(minRedeem))}
              </p>
            )}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--text-base)',
              color: canRedeem ? 'var(--color-text)' : 'var(--color-text-muted)',
              cursor: canRedeem ? 'pointer' : 'not-allowed',
            }}>
              <input
                type="checkbox"
                checked={useLoyalty && canRedeem}
                disabled={!canRedeem}
                onChange={(e) => setUseLoyalty(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
              />
              {canRedeem
                ? t('checkout.loyalty_use')
                    .replace('{n}', loyaltyRedeemPoints.toLocaleString())
                    .replace('{value}', String(pointsValueMvr(loyaltyRedeemPoints, loyaltyRates)))
                    .replace('{pct}', String(loyaltyRates.maxRedeemPercent))
                : t('checkout.loyalty_use_disabled')}
            </label>
          </div>
        );
      })()}

      {/* Friend's Referral Code */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('checkout.friend_referral')}
        </p>
        {friendReferralApplied ? (
          <div style={S.promoApplied}>
            <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>
              {friendReferralApplied.pending
                ? <><span>⏳</span> <strong style={{ fontFamily: 'monospace' }}>{friendReferralApplied.code}</strong> — {t('checkout.referral_est').replace('{amount}', String(laarToMvr(referralDelta)))}</>
                : <><span>🤝</span> <strong style={{ fontFamily: 'monospace' }}>{friendReferralApplied.code}</strong> — {t('checkout.promo_off').replace('{amount}', String(laarToMvr(friendReferralApplied.discountLaar)))}</>}
            </span>
            <button style={S.removeBtn} onClick={() => void handleRemoveFriendReferral()}>{t('checkout.remove')}</button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
              {t('checkout.friend_referral_hint')}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field-input"
                style={{ flex: 1, fontFamily: 'monospace' }}
                placeholder={t('checkout.ph_referral')}
                value={friendReferralCode}
                onChange={(e) => setFriendReferralCode(e.target.value.toUpperCase())}
                aria-label={t('checkout.aria_referral')}
              />
              <button
                style={S.secondaryBtn}
                onClick={() => void handleApplyFriendReferral()}
                disabled={friendReferralLoading || !friendReferralCode.trim()}
              >
                {friendReferralLoading ? '…' : t('checkout.apply')}
              </button>
            </div>
            {friendReferralError && <p className="field-error" style={{ marginTop: 6 }}>{friendReferralError}</p>}
          </>
        )}
      </div>

      {tableSession.name && (
        <div
          data-testid="table-session-banner"
          style={{
            padding: '10px 12px', borderRadius: 10, marginBottom: 12,
            background: 'var(--color-success-bg, #F0FDF4)',
            border: '1px solid var(--color-success, #10B981)',
            fontSize: 'var(--text-sm)', fontWeight: 700,
          }}
        >
          🍽️ Ordering for {tableSession.name} — we will bring it to your table.
        </div>
      )}
      {tableSession.error && (
        <div
          data-testid="table-session-error"
          className="field-error"
          style={{ marginBottom: 12 }}
        >
          {tableSession.error}
        </div>
      )}

      {/* Gift Card */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t('checkout.gift_card')}
        </p>
        {giftCardApplied ? (
          <div style={S.promoApplied}>
            <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>
              {giftCardApplied.pending
                ? <><span>⏳</span> <strong style={{ fontFamily: 'monospace' }}>{giftCardApplied.code}</strong> — {t('checkout.promo_pending')}</>
                : <><span>🎁</span> <strong style={{ fontFamily: 'monospace' }}>{giftCardApplied.code}</strong> — {t('checkout.promo_off').replace('{amount}', String(laarToMvr(giftCardApplied.discountLaar)))}</>}
            </span>
            <button style={S.removeBtn} onClick={() => void handleRemoveGiftCard()}>{t('checkout.remove')}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder={t('checkout.ph_gift')}
                value={giftCardCode}
                onChange={(e) => { setGiftCardCode(e.target.value.toUpperCase()); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCheckGiftCard(); }}
                style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 'var(--text-base)', fontFamily: 'monospace', textTransform: 'uppercase', minWidth: 0 }}
                aria-label={t('checkout.aria_gift')}
              />
              {scanSupported && (
                <button
                  type="button"
                  data-testid="gift-card-scan"
                  aria-label="Scan gift card"
                  onClick={() => giftScan.setOpen(true)}
                  style={{ ...S.secondaryBtn, minWidth: 48, padding: '9px 12px' }}
                >
                  📷
                </button>
              )}
              <button
                style={{ ...S.secondaryBtn, whiteSpace: 'nowrap' }}
                onClick={giftCardBalance !== null ? () => void handleApplyGiftCard() : () => void handleCheckGiftCard()}
                disabled={giftCardLoading || !giftCardCode.trim()}
              >
                {giftCardLoading ? '…' : giftCardBalance !== null ? t('checkout.apply') : t('checkout.check')}
              </button>
            </div>
            {giftCardBalance !== null && !giftCardError && (
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 600 }}>
                {giftCardHeld > 0
                  ? t('checkout.gift_balance_held')
                      .replace('{available}', giftCardBalance.toFixed(2))
                      .replace('{held}', giftCardHeld.toFixed(2))
                  : t('checkout.gift_balance').replace('{amount}', giftCardBalance.toFixed(2))}
              </p>
            )}
            {giftCardError && <p className="field-error" style={{ marginTop: 0 }}>{giftCardError}</p>}
            {/* A card arrives as an SMS link, so say that the link works —
                otherwise people transcribe a long code by hand. */}
            {giftCardBalance === null && !giftCardError && (
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                {t('checkout.gift_link_hint')}
              </p>
            )}
            {giftScan.open && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Scan gift card"
                data-testid="gift-card-scanner"
                style={{
                  position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,0.85)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16,
                }}
              >
                <video
                  ref={giftScan.videoRef}
                  muted
                  playsInline
                  style={{ width: 'min(420px, 100%)', borderRadius: 14, background: '#000' }}
                />
                {giftScan.error && (
                  <p style={{ color: '#fff', fontSize: 'var(--text-sm)', textAlign: 'center', maxWidth: 360 }}>
                    {giftScan.error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={giftScan.close}
                  style={{ ...S.secondaryBtn, marginTop: 12, minHeight: 48, minWidth: 160 }}
                >
                  {t('checkout.gift_scan_close')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const discountsSummary: string | undefined = [
    promoApplied?.code ?? null,
    useLoyalty && loyaltyDelta > 0 ? t('checkout.loyalty_summary') : null,
    giftCardApplied?.code ?? null,
    friendReferralApplied?.code ?? null,
  ].filter((v): v is string => v !== null).join(' · ') || undefined;

  const sectionReferral = myReferralCode && (
    <div style={{ background: 'var(--color-surface-alt)', border: '1px dashed var(--color-border)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
      <p style={{ margin: '0 0 6px', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 600 }}>
        {t('checkout.share_referral')}
      </p>
      <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--color-primary)', fontWeight: 700 }}>
        {myReferralCode}
      </p>
      <button
        style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'underline' }}
        onClick={() => { void navigator.clipboard?.writeText(myReferralCode); }}
      >
        {t('checkout.copy_code')}
      </button>
    </div>
  );

  const sectionCartSummary = <CartSummary cart={cart} />;

  const sectionOrderSummary = (
    <div style={S.cardWarm}>
      <h2 style={S.sectionTitle}>{t('checkout.order_summary')}</h2>
      <SummaryRow label={t('cart.subtotal')} value={`MVR ${laarToMvr(subtotalLaar)}`} />
      {promoApplied && promoDelta > 0 && (
        <SummaryRow label={`${t('checkout.promo_code')} (${promoApplied.code})`} value={`− MVR ${laarToMvr(promoDelta)}`} highlight />
      )}
      {promoApplied && promoDelta === 0 && !promoApplied.pending && (
        <SummaryRow label={`${t('checkout.promo_code')} (${promoApplied.code})`} value="Free delivery" highlight />
      )}
      {useLoyalty && loyaltyDelta > 0 && (
        <SummaryRow label={t('checkout.loyalty_discount')} value={`− MVR ${laarToMvr(loyaltyDelta)}`} highlight />
      )}
      {friendReferralApplied && referralDelta > 0 && (
        <SummaryRow
          label={`${t('checkout.friend_referral')} (${friendReferralApplied.code})${friendReferralApplied.pending ? ' (est.)' : ''}`}
          value={`− MVR ${laarToMvr(referralDelta)}`}
          highlight
        />
      )}
      {serviceChargeLaar > 0 && (
        <SummaryRow label={serviceChargeLabel} value={`MVR ${laarToMvr(serviceChargeLaar)}`} />
      )}
      {packagingFeeLaar > 0 && (
        <SummaryRow label={packagingFeeLabel} value={`MVR ${laarToMvr(packagingFeeLaar)}`} />
      )}
      {smallOrderFeeLaar > 0 && (
        <SummaryRow label={smallOrderFeeLabel} value={`MVR ${laarToMvr(smallOrderFeeLaar)}`} />
      )}
      {taxLaar > 0 && (
        <SummaryRow label={t('checkout.gst')} value={`MVR ${laarToMvr(taxLaar)}`} />
      )}
      {orderType === 'delivery' && (
        <SummaryRow
          label={deliveryFeeLaar === 0 ? 'Free delivery' : t('checkout.delivery_fee')}
          value={deliveryFeeLaar === 0 ? 'MVR 0.00' : `MVR ${laarToMvr(deliveryFeeLaar)}`}
          highlight={deliveryFeeLaar === 0}
        />
      )}
      {showDeliveryDestination && (
        <div
          data-testid="checkout-delivery-destination-summary"
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px dashed var(--color-border)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            lineHeight: 1.4,
          }}
        >
          <div>
            {t('checkout.delivering_to').replace('{destination}', destinationText)}
          </div>
          {showUsingDefaultNote && (
            <div style={{ marginTop: 2, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {t('checkout.using_default_address')}
            </div>
          )}
          <button
            type="button"
            data-testid="checkout-change-address-summary"
            onClick={openAddressPicker}
            style={{
              marginTop: 6,
              padding: 0,
              border: 'none',
              background: 'none',
              color: 'var(--color-primary)',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {t('checkout.change_address')}
          </button>
        </div>
      )}
      <div style={S.totalRow}>
        <span>{t('checkout.total')}</span>
        <span style={S.totalRowAmount}>MVR {laarToMvr(totalLaar)}</span>
      </div>
      {giftCardApplied && giftCardDelta > 0 && (
        <SummaryRow label={`${t('checkout.gift_card')} (${giftCardApplied.code})`} value={`− MVR ${laarToMvr(giftCardDelta)}`} highlight />
      )}
      {giftCardApplied && giftCardDelta > 0 && (
        <div style={{ ...S.totalRow, marginTop: 4 }}>
          <span>Amount due</span>
          <span style={S.totalRowAmount}>MVR {laarToMvr(amountDueLaar)}</span>
        </div>
      )}
      {isAuthenticated && totalLaar > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--color-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.8rem' }}>⭐</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {t('checkout.earn_pts').replace('{n}', String(earnPreviewPoints))}
          </span>
        </div>
      )}
    </div>
  );

  // Payment accordion body — BML compliance notice (hidden when payment down)
  const bodyPayment = !paymentServiceAvailable ? (
    <div
      role="status"
      style={{
        ...S.complianceBox,
        background: 'var(--color-warning-bg, #fef3c7)',
        border: '1px solid var(--color-warning, #fbbf24)',
      }}
      data-testid="checkout-payment-down"
    >
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-warning, #92400e)', lineHeight: 1.5 }}>
        <strong>Online payment is temporarily unavailable.</strong> Please choose cash on collection or call us to pay by transfer.
      </p>
    </div>
  ) : (
    <div style={S.complianceBox}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('checkout.we_accept')}</span>
        <img src="/card-brands.png" alt={t('checkout.card_brands_alt')} style={{ height: '53px', objectFit: 'contain' }} />
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.625rem', lineHeight: 1.5 }}>
        {paymentCompliance}
      </p>
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
        {t('checkout.read_before')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {[
          { href: '/terms', label: t('account.link_terms') },
          { href: '/refund', label: t('account.link_refund') },
          { href: '/order/privacy', label: t('account.link_privacy') },
        ].map(({ href, label }) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '0.78rem', color: 'var(--color-primary)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
            {label}
          </a>
        ))}
      </div>
      <p style={{ ...S.secureNote, textAlign: 'left', marginTop: '0.5rem' }}>
        🔒 Payment processed securely by Bank of Maldives. We do not store your card details.
      </p>
      <div style={{ ...S.corporateInfo, textAlign: 'left', borderTop: 'none', paddingTop: 0, marginTop: '0.375rem' }}>
        <strong>{siteName}</strong> · {address} ·{' '}
        <a href={phoneTel} style={{ color: 'inherit' }}>{phone}</a> ·{' '}
        <a href={`mailto:${email}`} style={{ color: 'inherit' }}>{email}</a>
      </div>
    </div>
  );

  const sectionHelp = (
    <div style={{ ...S.card, textAlign: 'center', padding: '1.25rem' }}>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
        Need help with your order?
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <a href={`${waLink}?text=Hi%2C+I+need+help+with+my+order`} target="_blank" rel="noopener noreferrer"
          style={S.chatBtnWa} aria-label={t('checkout.contact_whatsapp')}>
          <WhatsAppIcon /> {t('home.footer_whatsapp')}
        </a>
        <a href={viberLink} style={S.chatBtnViber} aria-label={t('checkout.contact_viber')}>
          <ViberIcon /> {t('home.footer_viber')}
        </a>
      </div>
    </div>
  );

  // Fulfillment accordion: read-only day summary + mode-specific detail
  // (same-day pickup slots, delivery form, or dine-in arrival). Always visible.
  const showPickupSlots = orderType === 'pickup' && pickupSlotsEnabled && collectOn === 'today';
  const bodyFulfillment = orderType === 'dine_in' ? (
    bodyDineInArrival
  ) : (
    <>
      {bodyWhenSummary}
      {showPickupSlots ? bodyPickupSlot : orderType === 'delivery' ? bodyDelivery : null}
    </>
  );
  const fulfillmentTitle = orderType === 'pickup'
    ? t('checkout.acc_when')
    : orderType === 'dine_in'
      ? 'Arrival time'
      : t('checkout.acc_delivery');
  const collectDayLabel  = collectOn === 'tomorrow'
    ? `${t('checkout.day_tomorrow')}, ${tomorrowDateLabel}`
    : t('checkout.day_today');
  const pickupSlotLabel  = pickupSlotAt
    ? (pickupSlots.find((sl) => sl.starts_at === pickupSlotAt)?.label ?? pickupSlotAt)
    : t('checkout.asap');
  const fulfillmentSummary = orderType === 'pickup'
    ? (showPickupSlots ? `${collectDayLabel} · ${pickupSlotLabel}` : collectDayLabel)
    : orderType === 'dine_in'
      ? (pickupSlotAt ? (pickupSlots.find((sl) => sl.starts_at === pickupSlotAt)?.label ?? pickupSlotAt) : 'Choose a time')
      : (delivery.address_line1 ? `${collectDayLabel} · ${delivery.address_line1}` : collectDayLabel);

  // StickyCtaBar above-content: gate banner + terms + error + pending note
  const stickyAbove = (
    <>
      {placeBlockedByGate && (
        <div className="banner banner-warning" style={{ marginBottom: 12 }}>
          <span className="banner-icon">🔒</span>
          <div>
            <p className="banner-title">{t('checkout.gate_closed')}</p>
            <p className="banner-sub">{onlineGate?.message ?? t('checkout.gate_closed_sub')}</p>
          </div>
        </div>
      )}
      {needsModeChoice && !placeBlockedByGate && (
        <div className="banner banner-info" style={{ marginBottom: 12 }} data-testid="choose-order-type-hint">
          <span className="banner-icon">🥡</span>
          <div>
            <p className="banner-title">{t('checkout.choose_order_type')}</p>
            <p className="banner-sub">{t('checkout.choose_order_type_hint')}</p>
          </div>
        </div>
      )}
      {collectOn === 'tomorrow' && !placeBlockedByGate && (
        <div className="banner banner-info" style={{ marginBottom: 12 }} data-testid="tomorrow-order-banner">
          <span className="banner-icon">📅</span>
          <div>
            <p className="banner-title">{t('checkout.tomorrow_banner_title')}</p>
            <p className="banner-sub">
              {t(orderType === 'delivery' ? 'checkout.tomorrow_banner_delivery' : 'checkout.tomorrow_banner_pickup')
                .replace('{date}', tomorrowDateLabel)}
            </p>
          </div>
        </div>
      )}
      {isDineIn && pickupSlotAt && (
        <div className="banner banner-info" style={{ marginBottom: 12 }} data-testid="dine-in-summary-banner">
          <span className="banner-icon">🍽️</span>
          <div>
            <p className="banner-title">Eating here</p>
            <p className="banner-sub">
              Table for {partySize} reserved at{' '}
              {pickupSlots.find((sl) => sl.starts_at === pickupSlotAt)?.label?.split('–')[0]?.trim()
                ?? new Date(pickupSlotAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.
              Your food will be ready when you arrive. You pay now — extras ordered at the table join the same bill.
            </p>
          </div>
        </div>
      )}
      {isDineIn && !pickupSlotAt && (
        <div className="banner banner-warning" style={{ marginBottom: 12 }} data-testid="dine-in-needs-time-banner">
          <span className="banner-icon">⏰</span>
          <div>
            <p className="banner-title">Choose your arrival time</p>
            <p className="banner-sub">Pick when you’ll arrive so we can reserve your table and time the kitchen.</p>
          </div>
        </div>
      )}
      {showDeliveryDestination && (
        <div
          className="banner banner-info"
          style={{ marginBottom: 12 }}
          data-testid="checkout-delivery-destination"
        >
          <span className="banner-icon" aria-hidden>📍</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="banner-title" style={{ margin: 0 }}>
              {t('checkout.delivering_to').replace('{destination}', destinationText)}
            </p>
            {showUsingDefaultNote && (
              <p className="banner-sub" style={{ margin: '2px 0 0' }}>
                {t('checkout.using_default_address')}
              </p>
            )}
            <button
              type="button"
              data-testid="checkout-change-address"
              onClick={openAddressPicker}
              style={{
                marginTop: 6,
                padding: 0,
                border: 'none',
                background: 'none',
                color: 'var(--color-primary)',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {t('checkout.change_address')}
            </button>
          </div>
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
        <input
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          style={{ marginTop: '2px', width: 16, height: 16, accentColor: 'var(--color-primary)', flexShrink: 0 }}
        />
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text)', lineHeight: 1.5 }}>
          {t('checkout.terms_prefix')}{' '}
          <a href="/terms" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)' }}>{t('account.link_terms')}</a>,{' '}
          <a href="/refund" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)' }}>{t('account.link_refund')}</a>
          {t('checkout.terms_and')}{' '}
          <a href="/order/privacy" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)' }}>{t('account.link_privacy')}</a>.
        </span>
      </label>
      {globalError && !zeroBalanceConflict && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          <span className="banner-icon">⚠️</span>
          <div>
            <p className="banner-title">{t('error.generic_title')}</p>
            <p className="banner-sub">{globalError}</p>
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
                  fontSize: '0.8125rem', fontWeight: 700, color: '#166534',
                  background: '#dcfce7', padding: '6px 12px', borderRadius: 999, textDecoration: 'none',
                }}
              >
                <WhatsAppIcon size={16} /> {t('checkout.whatsapp_help')}
              </a>
            )}
          </div>
        </div>
      )}
      {hasPendingReferral && (
        <p style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
          ⏳ {t('checkout.referral_pending')}
        </p>
      )}
    </>
  );

  return (
    <div style={S.page}>
      {loyaltyTierProgress?.near_next_tier && loyaltyTierProgress.next_tier_name && (
        <div style={{
          margin: '0 0 1rem',
          padding: '12px 16px',
          borderRadius: 12,
          background: 'var(--color-warning-bg, #FFFBEB)',
          border: '1px solid var(--color-warning, #FCD34D)',
          fontSize: 14,
          color: 'var(--color-text)',
        }}>
          ⭐ You&apos;re close to <strong>{loyaltyTierProgress.next_tier_name}</strong>
          {loyaltyTierProgress.points_to_next != null && loyaltyTierProgress.points_to_next > 0
            ? (() => {
                const projected = Math.max(0, loyaltyTierProgress.points_to_next - earnPreviewPoints);
                return projected > 0
                  ? <> — about <strong>{projected.toLocaleString()} more points</strong> to reach it after this order!</>
                  : <> — this order should unlock <strong>{loyaltyTierProgress.next_tier_name}</strong>!</>;
              })()
            : '!'}
        </div>
      )}

      {/* ── Branded header ─────────────────────────────────── */}
      <BrandedHeader
        onBack={() => navigate(-1)}
        backLabel={`← ${t('common.back')}`}
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            {loyaltyAccount && loyaltyAvailablePoints(loyaltyAccount) > 0 && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                fontSize: 'var(--text-xs)', fontWeight: 700,
                color: 'var(--color-warning)', background: 'var(--color-warning-bg)',
                borderRadius: '999px', padding: '0.2rem 0.6rem',
              }}>
                ⭐ {loyaltyAvailablePoints(loyaltyAccount).toLocaleString()} pts
              </span>
            )}
            {customerName && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                {t('checkout.hi_name').replace('{name}', customerName)}
              </span>
            )}
          </div>
        }
      />

      {/* ── Page heading ───────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, var(--color-surface-alt) 0%, var(--color-surface) 100%)', borderBottom: '1px solid rgba(212,129,58,0.2)', padding: '0.875rem 0' }}>
        <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto', width: '100%', padding: '0 var(--page-gutter)', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🧾</span>
          <div>
            <h1 style={{ fontSize: 'var(--text-md)', fontWeight: 800, color: 'var(--color-text)', margin: 0, lineHeight: 1.2 }}>
              {checkoutTitle}
            </h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0, marginTop: '0.125rem' }}>
              {checkoutSubtitle}
              {waitMinutes != null && <> · {t('checkout.kitchen_wait').replace('{n}', String(waitMinutes))}</>}
            </p>
          </div>
        </div>
      </div>

      {/* ── Unified two-area layout (CSS grid: 1-col mobile, 2-col ≥900px) ── */}
      <div className="checkout-layout">
        {/* Main: auth gate + accordion sections + sticky CTA */}
        <div className="checkout-main">
          {!isAuthenticated && <AuthBlock skipProfileSetup onSuccess={handleAuthSuccess} />}
          {isAuthenticated && (
            <>
              <AccordionItem
                id="order-type"
                title={t('checkout.acc_order_type')}
                summary={
                  needsModeChoice
                    ? t('checkout.choose_order_type')
                    : (orderType === 'pickup' ? t('mode.pickup') : t('mode.delivery'))
                }
                open={openId === 'order-type'}
                onToggle={() => toggle('order-type')}
              >
                {bodyOrderType}
              </AccordionItem>

              <AccordionItem
                id="fulfillment"
                title={fulfillmentTitle}
                summary={fulfillmentSummary}
                open={openId === 'fulfillment'}
                onToggle={() => toggle('fulfillment')}
              >
                {bodyFulfillment}
              </AccordionItem>

              <AccordionItem
                id="discounts"
                title={t('checkout.acc_discounts')}
                summary={discountsSummary}
                open={openId === 'discounts'}
                onToggle={() => toggle('discounts')}
              >
                {bodyDiscounts}
              </AccordionItem>

              <AccordionItem
                id="notes"
                title={t('checkout.acc_notes')}
                summary={notes ? (() => {
                  const max = 56;
                  if (notes.length <= max) return notes;
                  const cut = notes.slice(0, max);
                  const sp = cut.lastIndexOf(' ');
                  return `${sp > 24 ? cut.slice(0, sp) : cut}…`;
                })() : undefined}
                open={openId === 'notes'}
                onToggle={() => toggle('notes')}
              >
                {bodyNotes}
              </AccordionItem>

              <AccordionItem
                id="payment"
                title={t('checkout.acc_payment')}
                summary={t('checkout.acc_payment_summary')}
                open={openId === 'payment'}
                onToggle={() => toggle('payment')}
              >
                {bodyPayment}
              </AccordionItem>

              {sectionHelp}

              <StickyCtaBar
                above={stickyAbove}
                label={placeLabel}
                onClick={guardedPlaceAndPay}
                disabled={
                  isPlacing
                  || !acceptTerms
                  || placeBlockedByGate
                  || needsModeChoice
                  || !checkoutServiceAvailable
                  || (!paymentServiceAvailable && amountDueLaar > 0)
                  || (isDineIn && !pickupSlotAt)
                }
                loading={isPlacing}
              />
            </>
          )}
        </div>

        {/* Summary aside: cart + order totals + referral share */}
        <aside className="checkout-summary">
          {sectionCartSummary}
          {sectionOrderSummary}
          {sectionReferral}
        </aside>
      </div>
    </div>
  );
}

// ── Styles (Phase 5 PR2 — visual tokens only; structure unchanged) ─────────────
const S = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-bg)',
    fontFamily: 'inherit',
    paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
  } as React.CSSProperties,

  card: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-2xl)',
    padding: '1.125rem 1.25rem',
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid var(--color-border)',
  } as React.CSSProperties,

  /* Warm tinted variant — Order Summary */
  cardWarm: {
    background: 'var(--color-surface-alt)',
    borderRadius: 'var(--radius-2xl)',
    padding: '1.125rem 1.25rem',
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border))',
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 800,
    color: 'var(--color-dark)',
    margin: '0 0 0.85rem',
    paddingBottom: '0.65rem',
    borderBottom: '1px solid var(--color-border)',
    letterSpacing: '-0.01em',
  } as React.CSSProperties,

  fieldLabel: {
    display: 'block',
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: 6,
  } as React.CSSProperties,

  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  } as React.CSSProperties,

  typeBtn: {
    flex: 1,
    minHeight: 48,
    padding: '0.75rem 1rem',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    background: 'var(--color-surface)',
    cursor: 'pointer',
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    transition: 'background var(--duration-micro) var(--ease-out), border-color var(--duration-micro) var(--ease-out)',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  typeBtnActive: {
    borderColor: 'var(--color-primary)',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
  } as React.CSSProperties,

  infoNote: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface-alt)',
    borderRadius: 'var(--radius-lg)',
    padding: '0.65rem 0.85rem',
    marginBottom: 14,
    border: '1px solid var(--color-border)',
  } as React.CSSProperties,

  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9375rem',
    marginBottom: 8,
    gap: 12,
  } as React.CSSProperties,

  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    fontWeight: 800,
    fontSize: '1.125rem',
    color: 'var(--color-dark)',
    borderTop: '1.5px solid var(--color-border)',
    paddingTop: 12,
    marginTop: 8,
    gap: 12,
  } as React.CSSProperties,

  totalRowAmount: {
    color: 'var(--color-primary)',
    fontSize: '1.25rem',
    fontVariantNumeric: 'tabular-nums',
  } as React.CSSProperties,

  promoApplied: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--color-success-bg)',
    borderRadius: 'var(--radius-lg)',
    padding: '0.7rem 0.9rem',
    fontSize: '0.9375rem',
    border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
    gap: 10,
  } as React.CSSProperties,

  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-error)',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    minHeight: 36,
    padding: '0 0.35rem',
  } as React.CSSProperties,

  primaryBtn: {
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-xl)',
    padding: '0.85rem 1.25rem',
    minHeight: 48,
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background var(--duration-micro) var(--ease-out)',
  } as React.CSSProperties,

  secondaryBtn: {
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    border: '1.5px solid var(--color-primary)',
    borderRadius: 'var(--radius-lg)',
    padding: '0 1rem',
    fontSize: '0.875rem',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'inherit',
    minHeight: 44,
  } as React.CSSProperties,

  chatBtnWa: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    padding: '0.5rem 1rem',
    background: '#25d366',
    color: 'white',
    borderRadius: 'var(--radius-lg)',
    fontWeight: 700,
    fontSize: '0.8125rem',
    textDecoration: 'none',
  } as React.CSSProperties,

  chatBtnViber: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    padding: '0.5rem 1rem',
    background: '#7360f2',
    color: 'white',
    borderRadius: 'var(--radius-lg)',
    fontWeight: 700,
    fontSize: '0.8125rem',
    textDecoration: 'none',
  } as React.CSSProperties,

  complianceBox: {
    background: 'var(--color-surface-alt)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '1rem 1.125rem',
    marginBottom: '0.75rem',
  } as React.CSSProperties,

  secureNote: {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
    textAlign: 'center' as const,
    marginTop: '0.625rem',
    lineHeight: 1.5,
  } as React.CSSProperties,

  corporateInfo: {
    fontSize: '0.72rem',
    color: 'var(--color-text-muted)',
    textAlign: 'center' as const,
    marginTop: '0.375rem',
    lineHeight: 1.6,
    borderTop: '1px solid var(--color-border)',
    paddingTop: '0.5rem',
  } as React.CSSProperties,
} as const;
