import { useEffect, useState, useSyncExternalStore, useCallback } from "react";
import {
  fetchOrderingEligibility, type OrderingEligibility,
  fetchOnlineOrderingStatus, type OnlineOrderingStatus,
  fetchDeliveryZoneStatus,
  getWaitTimeEstimate,
  fetchPickupSlots,
  type PickupSlot,
} from "../api";
import { useNavigate } from "react-router-dom";
import { useCheckout } from "../hooks/useCheckout";
import { useSiteSettingsContext } from "../context/SiteSettingsContext";
import { AuthBlock } from "../components/AuthBlock";
import { BrandedHeader } from "../components/BrandedHeader";
import { CartSummary } from "../components/CartSummary";
import { WhatsAppIcon, ViberIcon } from '../components/icons';
import { laarToMvr } from '../utils/money';
import {
  loyaltyAvailablePoints,
  pointsValueMvr,
} from '../utils/loyalty';

// ── Viewport hook ──────────────────────────────────────────────────────────────
function useIsMobile() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); },
    () => window.innerWidth < 768,
    () => false,
  );
}

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

// ── Section card ───────────────────────────────────────────────────────────────
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={S.card}>
      <h2 style={S.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

// ── T&C + Pay button (reused in both columns depending on viewport) ───────────
function PaySection({ acceptTerms, setAcceptTerms, globalError, isPlacing, placeLabel, handlePlaceAndPay, gateClosed, gateMessage, hasPendingReferral, waLink }: {
  acceptTerms: boolean;
  setAcceptTerms: (v: boolean) => void;
  globalError: string | null;
  isPlacing: boolean;
  placeLabel: string;
  handlePlaceAndPay: () => void;
  gateClosed?: boolean;
  gateMessage?: string | null;
  hasPendingReferral?: boolean;
  waLink?: string;
}) {
  const disabled = isPlacing || !acceptTerms || !!gateClosed;
  return (
    <div style={{ ...S.cardWarm, border: '1.5px solid rgba(212,129,58,0.35)', boxShadow: '0 4px 16px rgba(212,129,58,0.12)' }}>
      {gateClosed && (
        <div className="banner banner-warning" style={{ marginBottom: 12 }}>
          <span className="banner-icon">🔒</span>
          <div>
            <p className="banner-title">Online ordering is closed</p>
            <p className="banner-sub">{gateMessage ?? 'Online ordering is currently unavailable. Please check back later.'}</p>
          </div>
        </div>
      )}

      {/* Req 13: Affirmative acceptance checkbox */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
        <input
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          style={{ marginTop: '2px', width: 16, height: 16, accentColor: 'var(--color-primary)', flexShrink: 0 }}
        />
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text)', lineHeight: 1.5 }}>
          I agree to the <a href="/terms" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)' }}>Terms &amp; Conditions</a>,{' '}
          <a href="/refund" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)' }}>Refund Policy</a>, and{' '}
          <a href="/privacy" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)' }}>Privacy Policy</a>.
        </span>
      </label>

      {globalError && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          <span className="banner-icon">⚠️</span>
          <div>
            <p className="banner-title">Something went wrong</p>
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
                <WhatsAppIcon size={16} /> Message us on WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      <button
        style={{
          ...S.primaryBtn,
          width: '100%',
          padding: '1rem var(--page-gutter)',
          fontSize: 'var(--text-md)',
          opacity: disabled ? 0.55 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onClick={handlePlaceAndPay}
        disabled={disabled}
        aria-busy={isPlacing}
        title={!acceptTerms ? 'Please agree to the terms to continue' : gateClosed ? 'Online ordering is currently closed' : undefined}
      >
        {isPlacing && <span className="animate-spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} />}
        {placeLabel}
      </button>
      {hasPendingReferral && (
        <p style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
          ⏳ Referral discount is estimated — final amount confirmed when your order is created.
        </p>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function CheckoutPage() {
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const { settings: s, text } = useSiteSettingsContext();

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

  useEffect(() => { document.title = `Checkout — ${siteName}`; }, [siteName]);

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
    orderType, setOrderType, pickupSlotAt, setPickupSlotAt, delivery, setDelivery, notes, setNotes,
    savedAddresses, selectedAddressId, setSelectedAddressId, applySavedAddress,
    saveAddress, setSaveAddress, addressLabel, setAddressLabel,
    promoCode, setPromoCode, promoApplied,
    promoError, promoLoading,
    useLoyalty, setUseLoyalty,
    deliveryFee, errors, isPlacing, globalError,
    subtotalLaar, taxLaar, deliveryFeeLaar, promoDelta, loyaltyDelta, referralDelta,
    serviceChargeLaar, serviceChargeLabel, totalLaar,
    packagingFeeLaar, packagingFeeLabel, smallOrderFeeLaar, smallOrderFeeLabel,
    handleApplyPromo, handleRemovePromo, handlePlaceAndPay, handleAuthSuccess,
    giftCardCode, setGiftCardCode, giftCardApplied, giftCardError, giftCardLoading,
    giftCardBalance, giftCardDelta,
    handleCheckGiftCard, handleApplyGiftCard, handleRemoveGiftCard,
    myReferralCode,
    friendReferralCode, setFriendReferralCode, friendReferralApplied, friendReferralError,
    friendReferralLoading,
    handleApplyFriendReferral, handleRemoveFriendReferral,
  } = useCheckout();

  const deliveryBlocked = orderElig != null && !orderElig.delivery.accepting;
  const orderingGateClosed = onlineGate != null && !onlineGate.open;
  useEffect(() => {
    if (deliveryBlocked && orderType === 'delivery') setOrderType('pickup');
  }, [deliveryBlocked, orderType, setOrderType]);

  useEffect(() => {
    if (orderType !== 'pickup' || !pickupSlotsEnabled) {
      setPickupSlots([]);
      if (orderType !== 'pickup') setPickupSlotAt(null);
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

  if (cart.length === 0) {
    return (
      <div style={{ padding: '3rem var(--page-gutter)', textAlign: 'center', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-fade-in">
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.35 }}>🛒</div>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', fontSize: '1rem' }}>
            Your cart is empty. Add some items first.
          </p>
          <button style={S.primaryBtn} onClick={() => navigate("/")}>Browse the menu</button>
        </div>
      </div>
    );
  }

  const hasPendingReferral = friendReferralApplied?.pending === true;
  const placeLabel = isPlacing
    ? 'Processing…'
    : orderingGateClosed
      ? 'Online ordering is closed'
      : totalLaar <= 0
        ? 'Place order — no payment due'
        : `Pay MVR ${laarToMvr(totalLaar)} with BML`;

  // ── Reusable section blocks (shared between mobile and desktop layouts) ──────
  const sectionOrderType = (
    <SectionCard title="Order Type">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {(['pickup', 'delivery'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              if (type === 'delivery' && deliveryBlocked) return;
              setOrderType(type);
            }}
            disabled={type === 'delivery' && deliveryBlocked}
            style={{
              ...S.typeBtn,
              ...(orderType === type ? S.typeBtnActive : {}),
              ...(type === 'delivery' && deliveryBlocked ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
            }}
            aria-pressed={orderType === type}
          >
            {type === 'pickup' ? '🥡 Pickup' : '🛵 Delivery'}
          </button>
        ))}
      </div>
      {deliveryBlocked && (
        <p style={{ margin: '12px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
          {orderElig.delivery.message ?? 'Delivery is not available right now. Please choose pickup.'}
        </p>
      )}
    </SectionCard>
  );

  const sectionPickupSlot = orderType === 'pickup' && pickupSlotsEnabled && (
    <SectionCard title="Pickup time">
      {pickupSlotsLoading ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Loading available times…</p>
      ) : pickupSlots.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
          Pickup slots are full or unavailable right now — we'll prepare your order as soon as possible after payment.
        </p>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            Choose when you'd like to collect your order (optional).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => setPickupSlotAt(null)}
              style={{
                ...S.typeBtn,
                ...(pickupSlotAt === null ? S.typeBtnActive : {}),
                padding: '8px 12px',
                fontSize: '0.85rem',
              }}
            >
              ASAP
            </button>
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
    </SectionCard>
  );

  const sectionDelivery = orderType === 'delivery' && (() => {
    const freeThreshold = parseFreeDeliveryThreshold(s.delivery_free_threshold);
    const defaultFee = parseFloat(s.delivery_default_fee ?? '30') || 30;
    const zoneFees = parseZoneFees(s.delivery_zone_fees);
    const islandKey = delivery.island.trim();
    const zoneFee = islandKey
      ? Object.entries(zoneFees).find(([z]) => z.toLowerCase() === islandKey.toLowerCase())?.[1]
      : undefined;
    const explainedFee = zoneFee ?? defaultFee;
    const cartMvr = subtotalLaar / 100;
    const qualifiesFree = cartMvr >= freeThreshold;

    return (
    <SectionCard title="Delivery Details">
      <div style={S.infoNote}>
        <span>🛵</span>{' '}
        Delivery fee: <strong>MVR {(deliveryFee / 100).toFixed(2)}</strong>
        {islandKey && zoneFee != null && zoneFee !== defaultFee && (
          <> · Zone rate for {islandKey}: MVR {explainedFee.toFixed(2)}</>
        )}
        {islandKey && zoneFee == null && (
          <> · Standard rate: MVR {defaultFee.toFixed(2)}</>
        )}
        {' '}· Estimated {deliveryEta}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
        {qualifiesFree
          ? `Your order qualifies for free delivery (orders over MVR ${freeThreshold.toFixed(0)}).`
          : `Free delivery on orders over MVR ${freeThreshold.toFixed(0)} — add MVR ${Math.max(0, freeThreshold - cartMvr).toFixed(2)} more to qualify.`}
      </p>
      {isAuthenticated && savedAddresses.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Saved address
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
                {(a.label ? `${a.label} — ` : '') + a.address_line1 + (a.is_default ? ' (default)' : '')}
              </option>
            ))}
            <option value="new">Use a new address</option>
          </select>
        </div>
      )}
      <Field label="Address *" placeholder="House / Flat number, Street"
        value={delivery.address_line1} onChange={(v) => { setDelivery({ ...delivery, address_line1: v }); setSelectedAddressId('new'); }} error={errors.address_line1} />
      <Field label="Address line 2" placeholder="Building name (optional)"
        value={delivery.address_line2} onChange={(v) => setDelivery({ ...delivery, address_line2: v })} />
      <Field label="Island *" placeholder="Malé"
        value={delivery.island}
        onChange={(v) => { setDelivery({ ...delivery, island: v }); setZoneError(null); }}
        onBlur={() => void handleIslandBlur(delivery.island)}
        error={zoneError ?? errors.island} />
      <Field label="Google Maps / location link" placeholder="https://maps.google.com/..."
        value={delivery.location_link} onChange={(v) => setDelivery({ ...delivery, location_link: v })} />
      <div style={S.fieldRow}>
        <Field label="Contact name *" placeholder="Full name"
          value={delivery.contact_name} onChange={(v) => setDelivery({ ...delivery, contact_name: v })} error={errors.contact_name} />
        <Field label="Contact phone *" placeholder="7xxxxxxx"
          value={delivery.contact_phone} onChange={(v) => setDelivery({ ...delivery, contact_phone: v })} error={errors.contact_phone} />
      </div>
      <Field label="Delivery notes" placeholder="Any special instructions for the rider"
        value={delivery.notes} onChange={(v) => setDelivery({ ...delivery, notes: v })} multiline />
      {isAuthenticated && (selectedAddressId === 'new' || saveAddress) && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={saveAddress}
              onChange={(e) => setSaveAddress(e.target.checked)}
            />
            Save this address to my account
          </label>
          {saveAddress && (
            <Field label="Address label" placeholder="Home, Office, etc."
              value={addressLabel} onChange={setAddressLabel} />
          )}
        </div>
      )}
    </SectionCard>
    );
  })();

  const sectionNotes = (
    <SectionCard title="Special Instructions">
      <textarea
        className="field-input"
        placeholder="Allergies, special requests, or notes for the kitchen"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{ height: 80, resize: 'vertical' }}
      />
    </SectionCard>
  );

  const sectionPromo = (
    <SectionCard title="Promo Code">
      {promoApplied ? (
        <div style={S.promoApplied}>
          <span style={{ fontSize: 'var(--text-base)' }}>
            {(promoApplied.pending && promoApplied.discountLaar === 0)
              ? <><span>⏳</span> <strong>{promoApplied.code}</strong> — applied at checkout</>
              : <><span>✅</span> <strong>{promoApplied.code}</strong> — MVR {laarToMvr(promoApplied.discountLaar)} off</>
            }
          </span>
          <button style={S.removeBtn} onClick={() => void handleRemovePromo()}>Remove</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="field-input"
              style={{ flex: 1 }}
              placeholder="Enter promo code"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              aria-label="Promo code"
            />
            <button style={S.secondaryBtn} onClick={handleApplyPromo} disabled={promoLoading || !promoCode}>
              {promoLoading ? '…' : 'Apply'}
            </button>
          </div>
          {promoError && <p className="field-error" style={{ marginTop: 6 }}>{promoError}</p>}
        </>
      )}
    </SectionCard>
  );

  const sectionLoyalty = loyaltyAccount && loyaltyAccount.points_balance > 0 && (() => {
    const available = loyaltyAvailablePoints(loyaltyAccount);
    const held = loyaltyAccount.points_held ?? 0;
    const minRedeem = loyaltyRates.minRedeemPoints;
    const canRedeem = available >= minRedeem && loyaltyRedeemPoints >= minRedeem;

    return (
    <SectionCard title="Loyalty Points">
      {loyaltyProgramMessage && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 10px', lineHeight: 1.45 }}>
          {loyaltyProgramMessage}
        </p>
      )}
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', marginBottom: 8 }}>
        You have <strong>{available.toLocaleString()} pts</strong> available to use
        {' '}(<span style={{ color: 'var(--color-primary)' }}>MVR {pointsValueMvr(available, loyaltyRates)}</span> value).
      </p>
      {held > 0 && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
          {held.toLocaleString()} pts are reserved on another order ({loyaltyAccount.points_balance.toLocaleString()} total balance).
        </p>
      )}
      {available < minRedeem && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
          Minimum {minRedeem} available points required to redeem.
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
          ? <>Use {loyaltyRedeemPoints.toLocaleString()} pts to save MVR {pointsValueMvr(loyaltyRedeemPoints, loyaltyRates)} (max {loyaltyRates.maxRedeemPercent}% of subtotal)</>
          : <>Use loyalty points on this order</>}
      </label>
    </SectionCard>
    );
  })();

  const sectionFriendReferral = (
    <SectionCard title="Friend's Referral Code">
      {friendReferralApplied ? (
        <div style={S.promoApplied}>
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>
            {friendReferralApplied.pending
              ? <><span>⏳</span> <strong style={{ fontFamily: 'monospace' }}>{friendReferralApplied.code}</strong> — est. MVR {laarToMvr(referralDelta)} off at checkout</>
              : <><span>🤝</span> <strong style={{ fontFamily: 'monospace' }}>{friendReferralApplied.code}</strong> — MVR {laarToMvr(friendReferralApplied.discountLaar)} off</>}
          </span>
          <button style={S.removeBtn} onClick={() => void handleRemoveFriendReferral()}>Remove</button>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
            Have a code from a friend? Enter it for a discount on your first order with that code.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="field-input"
              style={{ flex: 1, fontFamily: 'monospace' }}
              placeholder="Referral code"
              value={friendReferralCode}
              onChange={(e) => setFriendReferralCode(e.target.value.toUpperCase())}
              aria-label="Friend referral code"
            />
            <button
              style={S.secondaryBtn}
              onClick={() => void handleApplyFriendReferral()}
              disabled={friendReferralLoading || !friendReferralCode.trim()}
            >
              {friendReferralLoading ? '…' : 'Apply'}
            </button>
          </div>
          {friendReferralError && <p className="field-error" style={{ marginTop: 6 }}>{friendReferralError}</p>}
        </>
      )}
    </SectionCard>
  );

  const sectionGiftCard = (
    <SectionCard title="Gift Card">
      {giftCardApplied ? (
        <div style={S.promoApplied}>
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)' }}>
            {giftCardApplied.pending
              ? <><span>⏳</span> <strong style={{ fontFamily: 'monospace' }}>{giftCardApplied.code}</strong> — applied at checkout</>
              : <><span>🎁</span> <strong style={{ fontFamily: 'monospace' }}>{giftCardApplied.code}</strong> — MVR {laarToMvr(giftCardApplied.discountLaar)} off</>}
          </span>
          <button style={S.removeBtn} onClick={() => void handleRemoveGiftCard()}>Remove</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="XXXX-XXXX-XXXX"
              value={giftCardCode}
              onChange={(e) => { setGiftCardCode(e.target.value.toUpperCase()); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCheckGiftCard(); }}
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 'var(--text-base)', fontFamily: 'monospace', textTransform: 'uppercase', minWidth: 0 }}
              aria-label="Gift card code"
            />
            <button
              style={{ ...S.secondaryBtn, whiteSpace: 'nowrap' }}
              onClick={giftCardBalance !== null ? () => void handleApplyGiftCard() : () => void handleCheckGiftCard()}
              disabled={giftCardLoading || !giftCardCode.trim()}
            >
              {giftCardLoading ? '…' : giftCardBalance !== null ? 'Apply' : 'Check'}
            </button>
          </div>
          {giftCardBalance !== null && !giftCardError && (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 600 }}>
              Balance: MVR {giftCardBalance.toFixed(2)} — click Apply to use it
            </p>
          )}
          {giftCardError && <p className="field-error" style={{ marginTop: 0 }}>{giftCardError}</p>}
        </div>
      )}
    </SectionCard>
  );

  const sectionReferral = myReferralCode && (
    <div style={{ background: 'var(--color-surface-alt)', border: '1px dashed var(--color-border)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
      <p style={{ margin: '0 0 6px', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 600 }}>
        Share your referral code with friends
      </p>
      <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--color-primary)', fontWeight: 700 }}>
        {myReferralCode}
      </p>
      <button
        style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'underline' }}
        onClick={() => { void navigator.clipboard?.writeText(myReferralCode); }}
      >
        Copy code
      </button>
    </div>
  );

  const sectionCartSummary = <CartSummary cart={cart} />;

  const sectionOrderSummary = (
    <div style={S.cardWarm}>
      <h2 style={S.sectionTitle}>Order Summary</h2>
      <SummaryRow label="Subtotal" value={`MVR ${laarToMvr(subtotalLaar)}`} />
      {promoApplied && promoDelta > 0 && (
        <SummaryRow label={`Promo (${promoApplied.code})`} value={`− MVR ${laarToMvr(promoDelta)}`} highlight />
      )}
      {useLoyalty && loyaltyDelta > 0 && (
        <SummaryRow label="Loyalty discount" value={`− MVR ${laarToMvr(loyaltyDelta)}`} highlight />
      )}
      {giftCardApplied && giftCardDelta > 0 && (
        <SummaryRow label={`Gift Card (${giftCardApplied.code})`} value={`− MVR ${laarToMvr(giftCardDelta)}`} highlight />
      )}
      {friendReferralApplied && referralDelta > 0 && (
        <SummaryRow
          label={`Referral (${friendReferralApplied.code})${friendReferralApplied.pending ? ' (est.)' : ''}`}
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
        <SummaryRow label="GST" value={`MVR ${laarToMvr(taxLaar)}`} />
      )}
      {orderType === 'delivery' && (
        <SummaryRow label="Delivery fee" value={`MVR ${laarToMvr(deliveryFeeLaar)}`} />
      )}
      <div style={S.totalRow}>
        <span>Total</span>
        <span style={S.totalRowAmount}>MVR {laarToMvr(totalLaar)}</span>
      </div>
      {isAuthenticated && totalLaar > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--color-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.8rem' }}>⭐</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            You'll earn <strong style={{ color: 'var(--color-primary)' }}>{earnPreviewPoints} pts</strong> from this order
          </span>
        </div>
      )}
    </div>
  );

  const sectionCompliance = (
    <div style={S.complianceBox}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>We accept</span>
        <img src="/card-brands.png" alt="Amex, Visa, Mastercard, Maestro" style={{ height: '53px', objectFit: 'contain' }} />
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.625rem', lineHeight: 1.5 }}>
        {paymentCompliance}
      </p>
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
        Before completing your purchase, please read:
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {[
          { href: '/terms',   label: 'Terms & Conditions' },
          { href: '/refund',  label: 'Refund Policy' },
          { href: '/privacy', label: 'Privacy Policy' },
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

  const paySectionEl = (
    <PaySection
      acceptTerms={acceptTerms}
      setAcceptTerms={setAcceptTerms}
      globalError={globalError}
      isPlacing={isPlacing}
      placeLabel={placeLabel}
      handlePlaceAndPay={handlePlaceAndPay}
      gateClosed={orderingGateClosed}
      gateMessage={onlineGate?.message}
      hasPendingReferral={hasPendingReferral}
      waLink={waLink}
    />
  );

  const sectionHelp = (
    <div style={{ ...S.card, textAlign: 'center', padding: '1.25rem' }}>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
        Need help with your order?
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <a href={`${waLink}?text=Hi%2C+I+need+help+with+my+order`} target="_blank" rel="noopener noreferrer"
          style={S.chatBtnWa} aria-label="Contact us on WhatsApp">
          <WhatsAppIcon /> WhatsApp
        </a>
        <a href={viberLink} style={S.chatBtnViber} aria-label="Contact us on Viber">
          <ViberIcon /> Viber
        </a>
      </div>
    </div>
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
        backLabel="← Back"
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
                Hi, {customerName}
              </span>
            )}
          </div>
        }
      />

      {/* ── Page heading ───────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, var(--color-surface-alt) 0%, var(--color-surface) 100%)', borderBottom: '1px solid rgba(212,129,58,0.2)', padding: '0.875rem var(--page-gutter)' }}>
        <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🧾</span>
          <div>
            <h1 style={{ fontSize: 'var(--text-md)', fontWeight: 800, color: 'var(--color-text)', margin: 0, lineHeight: 1.2 }}>
              {checkoutTitle}
            </h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0, marginTop: '0.125rem' }}>
              {checkoutSubtitle}
              {waitMinutes != null && <> · Kitchen wait ~{waitMinutes} min</>}
            </p>
          </div>
        </div>
      </div>

      {isMobile ? (
        /* ── Mobile: single column, sections in logical order ─────────── */
        <div style={{ ...S.layout, gridTemplateColumns: '1fr' }}>
          <div style={S.col}>
            {!isAuthenticated && <AuthBlock skipProfileSetup onSuccess={handleAuthSuccess} />}
            {isAuthenticated && (
              <>
                {sectionOrderType}
                {sectionPickupSlot}
                {sectionDelivery}
                {sectionNotes}
                {sectionPromo}
                {sectionLoyalty}
                {sectionFriendReferral}
                {sectionGiftCard}
                {sectionCartSummary}
                {sectionOrderSummary}
                {sectionReferral}
                {sectionCompliance}
                {paySectionEl}
                {sectionHelp}
              </>
            )}
          </div>
        </div>
      ) : (
        /* ── Desktop: two-column grid ──────────────────────────────────── */
        <div style={{ ...S.layout, gridTemplateColumns: 'minmax(0,1fr) minmax(300px,380px)' }}>
          {/* Left: form */}
          <div style={S.col}>
            {!isAuthenticated && <AuthBlock skipProfileSetup onSuccess={handleAuthSuccess} />}
            {isAuthenticated && (
              <>
                {sectionOrderType}
                {sectionPickupSlot}
                {sectionDelivery}
                {sectionNotes}
                {sectionPromo}
                {sectionLoyalty}
                {sectionFriendReferral}
                {sectionGiftCard}
                {sectionHelp}
              </>
            )}
          </div>
          {/* Right: summary + pay */}
          <div style={S.col}>
            {sectionCartSummary}
            {sectionOrderSummary}
            {myReferralCode && sectionReferral}
            {isAuthenticated && (
              <>
                {sectionCompliance}
                {paySectionEl}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-bg)',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  } as React.CSSProperties,

  layout: {
    maxWidth: 'var(--layout-max)', margin: '0 auto',
    padding: '1.5rem var(--page-gutter)',
    display: 'grid', gap: 20,
  } as React.CSSProperties,

  col: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },

  card: {
    background: 'var(--color-surface)',
    borderRadius: '16px',
    padding: '18px 20px',
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid var(--color-border)',
  } as React.CSSProperties,

  /* Warm tinted variant — used for Order Summary and Pay section */
  cardWarm: {
    background: 'var(--color-surface-alt)',
    borderRadius: '16px',
    padding: '18px 20px',
    boxShadow: '0 2px 10px rgba(212,129,58,0.08)',
    border: '1px solid rgba(212,129,58,0.22)',
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 'var(--text-md)',
    fontWeight: 700,
    color: 'var(--color-primary)',
    margin: '0 0 14px',
    paddingBottom: 10,
    borderBottom: '1px solid var(--color-border)',
  } as React.CSSProperties,

  fieldLabel: {
    display: 'block',
    fontSize: 'var(--text-sm)', fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: 5,
  } as React.CSSProperties,

  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  } as React.CSSProperties,

  typeBtn: {
    flex: 1, padding: '12px 16px',
    border: '1.5px solid var(--color-border)',
    borderRadius: '12px',
    background: 'var(--color-surface)',
    cursor: 'pointer', fontSize: 'var(--text-base)', fontWeight: 600,
    color: 'var(--color-text)',
    transition: 'all 0.15s', fontFamily: 'inherit',
  } as React.CSSProperties,

  typeBtnActive: {
    borderColor: 'var(--color-primary)',
    background: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
  } as React.CSSProperties,

  infoNote: {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)',
    background: 'var(--color-surface-alt)',
    borderRadius: '8px', padding: '8px 12px',
    marginBottom: 14,
  } as React.CSSProperties,

  summaryRow: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 'var(--text-base)', marginBottom: 8,
  } as React.CSSProperties,

  totalRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    fontWeight: 800, fontSize: 'var(--text-lg)',
    color: 'var(--color-text)',
    borderTop: '2px solid var(--color-border)',
    paddingTop: 12, marginTop: 8,
  } as React.CSSProperties,

  totalRowAmount: {
    color: 'var(--color-primary)',
    fontSize: '1.2rem',
  } as React.CSSProperties,

  promoApplied: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--color-success-bg)',
    borderRadius: 10, padding: '10px 14px', fontSize: 'var(--text-base)',
    border: '1px solid var(--color-success-bg)',
  } as React.CSSProperties,

  removeBtn: {
    background: 'none', border: 'none',
    color: 'var(--color-error)',
    cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600, fontFamily: 'inherit',
  } as React.CSSProperties,

  primaryBtn: {
    background: 'var(--color-primary)',
    color: '#fff', border: 'none',
    borderRadius: '12px', padding: '12px 24px',
    fontSize: 'var(--text-body)', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.15s',
    boxShadow: '0 4px 14px var(--color-primary-glow)',
  } as React.CSSProperties,

  secondaryBtn: {
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    border: '1.5px solid var(--color-primary)',
    borderRadius: '10px', padding: '0 16px',
    fontSize: 'var(--text-base)', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
    fontFamily: 'inherit', height: 'var(--input-height)',
  } as React.CSSProperties,

  chatBtnWa: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '0.5rem 1rem',
    background: '#25d366', color: 'white',
    borderRadius: '8px', fontWeight: 600,
    fontSize: 'var(--text-sm)', textDecoration: 'none',
    transition: 'all 0.15s',
  } as React.CSSProperties,

  chatBtnViber: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '0.5rem 1rem',
    background: '#7360f2', color: 'white',
    borderRadius: '8px', fontWeight: 600,
    fontSize: 'var(--text-sm)', textDecoration: 'none',
    transition: 'all 0.15s',
  } as React.CSSProperties,

  complianceBox: {
    background: 'var(--color-surface-alt)',
    border: '1px solid rgba(212,129,58,0.22)',
    borderRadius: '12px',
    padding: '1rem 1.125rem',
    marginBottom: '12px',
  } as React.CSSProperties,

  secureNote: {
    fontSize: '0.72rem',
    color: 'var(--color-text-muted)',
    textAlign: 'center' as const,
    marginTop: '0.625rem',
    lineHeight: 1.5,
  } as React.CSSProperties,

  corporateInfo: {
    fontSize: '0.68rem',
    color: 'var(--color-text-muted)',
    textAlign: 'center' as const,
    marginTop: '0.375rem',
    lineHeight: 1.6,
    borderTop: '1px solid var(--color-border)',
    paddingTop: '0.5rem',
  } as React.CSSProperties,
} as const;
