import { useEffect, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { useCheckout } from "../hooks/useCheckout";
import { useSiteSettings } from "../context/SiteSettingsContext";
import { AuthBlock } from "../components/AuthBlock";
import { CartSummary } from "../components/CartSummary";

// ── Viewport hook ──────────────────────────────────────────────────────────────
function useIsMobile() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); },
    () => window.innerWidth < 768,
    () => false,
  );
}

import { WhatsAppIcon, ViberIcon } from '../components/icons';
import { laarToMvr } from '../utils/money';

// ── Field component ────────────────────────────────────────────────────────────
function Field({
  label, placeholder, value, onChange, error, multiline, type,
}: {
  label: string; placeholder?: string; value: string;
  onChange: (v: string) => void; error?: string; multiline?: boolean; type?: string;
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

// ── Page ───────────────────────────────────────────────────────────────────────
export function CheckoutPage() {
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const s = useSiteSettings();

  const siteName    = s.site_name        || 'Bake & Grill';
  const phone       = s.business_phone   || '+960 912 0011';
  const phoneTel    = 'tel:' + phone.replace(/[^+\d]/g, '');
  const email       = s.business_email   || 'hello@bakeandgrill.mv';
  const address     = s.business_address || 'Kalaafaanu Hingun, Malé, Maldives';
  const waLink      = s.business_whatsapp|| 'https://wa.me/9609120011';
  const viberLink   = s.business_viber   || 'viber://chat?number=9609120011';
  const deliveryEta = (s.delivery_time ?? s.delivery_eta) || '30–45 min';

  useEffect(() => { document.title = `Checkout — ${siteName}`; }, [siteName]);

  const {
    cart, token, customerName, loyaltyAccount, loyaltyPoints,
    orderType, setOrderType, delivery, setDelivery, notes, setNotes,
    promoCode, setPromoCode, promoApplied, setPromoApplied,
    promoError, promoLoading,
    useLoyalty, setUseLoyalty,
    deliveryFee, errors, isPlacing, globalError,
    subtotalLaar, deliveryFeeLaar, promoDelta, loyaltyDelta, totalLaar,
    handleApplyPromo, handlePlaceAndPay, handleAuthSuccess,
  } = useCheckout();

  if (cart.length === 0) {
    return (
      <div style={{ padding: '3rem 1.5rem', textAlign: 'center', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

  const placeLabel = isPlacing ? 'Processing…' : `Pay MVR ${laarToMvr(totalLaar)} with BML`;

  return (
    <div style={S.page}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header style={S.header}>
        <button style={S.backBtn} onClick={() => navigate(-1)} aria-label="Go back">
          ← Back
        </button>
        <span style={S.headerTitle}>Checkout</span>
        {customerName && (
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Hi, {customerName}</span>
        )}
      </header>

      <div style={{ ...S.layout, gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(300px,380px)' }}>

        {/* ── Left: form sections ──────────────────────────── */}
        <div style={{ ...S.col, order: isMobile ? 1 : 0, paddingBottom: isMobile ? '120px' : 0 }}>

          {/* Auth */}
          {!token && <AuthBlock onSuccess={handleAuthSuccess} />}

          {token && (
            <>
              {/* Order type */}
              <SectionCard title="Order Type">
                <div style={{ display: 'flex', gap: 12 }}>
                  {(['takeaway', 'delivery'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setOrderType(type)}
                      style={{
                        ...S.typeBtn,
                        ...(orderType === type ? S.typeBtnActive : {}),
                      }}
                      aria-pressed={orderType === type}
                    >
                      {type === 'takeaway' ? '🥡 Takeaway' : '🛵 Delivery'}
                    </button>
                  ))}
                </div>
              </SectionCard>

              {/* Delivery details */}
              {orderType === 'delivery' && (
                <SectionCard title="Delivery Details">
                  <div style={S.infoNote}>
                    <span>🛵</span> Delivery fee: <strong>MVR {(deliveryFee / 100).toFixed(2)}</strong> · Estimated {deliveryEta}
                  </div>
                  <Field label="Address *" placeholder="House / Flat number, Street"
                    value={delivery.address_line1} onChange={(v) => setDelivery({ ...delivery, address_line1: v })} error={errors.address_line1} />
                  <Field label="Address line 2" placeholder="Building name (optional)"
                    value={delivery.address_line2} onChange={(v) => setDelivery({ ...delivery, address_line2: v })} />
                  <Field label="Island *" placeholder="Malé"
                    value={delivery.island} onChange={(v) => setDelivery({ ...delivery, island: v })} error={errors.island} />
                  <div style={S.fieldRow}>
                    <Field label="Contact name *" placeholder="Full name"
                      value={delivery.contact_name} onChange={(v) => setDelivery({ ...delivery, contact_name: v })} error={errors.contact_name} />
                    <Field label="Contact phone *" placeholder="7xxxxxxx"
                      value={delivery.contact_phone} onChange={(v) => setDelivery({ ...delivery, contact_phone: v })} error={errors.contact_phone} />
                  </div>
                  <Field label="Delivery notes" placeholder="Any special instructions for the rider"
                    value={delivery.notes} onChange={(v) => setDelivery({ ...delivery, notes: v })} multiline />
                </SectionCard>
              )}

              {/* Order notes */}
              <SectionCard title="Special Instructions">
                <textarea
                  className="field-input"
                  placeholder="Allergies, special requests, or notes for the kitchen"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ height: 80, resize: 'vertical' }}
                />
              </SectionCard>

              {/* Promo code */}
              <SectionCard title="Promo Code">
                {promoApplied ? (
                  <div style={S.promoApplied}>
                    <span style={{ fontSize: 14 }}>
                      {promoApplied.pending
                        ? <><span>⏳</span> <strong>{promoApplied.code}</strong> — applied at checkout</>
                        : <><span>✅</span> <strong>{promoApplied.code}</strong> — MVR {laarToMvr(promoApplied.discountLaar)} off</>
                      }
                    </span>
                    <button style={S.removeBtn} onClick={() => setPromoApplied(null)}>Remove</button>
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
                      <button
                        style={S.secondaryBtn}
                        onClick={handleApplyPromo}
                        disabled={promoLoading || !promoCode}
                      >
                        {promoLoading ? '…' : 'Apply'}
                      </button>
                    </div>
                    {promoError && <p className="field-error" style={{ marginTop: 6 }}>{promoError}</p>}
                  </>
                )}
              </SectionCard>

              {/* Loyalty points */}
              {loyaltyAccount && loyaltyAccount.points_balance > 0 && (
                <SectionCard title="Loyalty Points">
                  <p style={{ fontSize: 14, color: 'var(--color-text)', marginBottom: 12 }}>
                    You have <strong>{loyaltyAccount.points_balance} pts</strong> available
                    {' '}(<span style={{ color: 'var(--color-primary)' }}>MVR {laarToMvr(loyaltyAccount.points_balance)}</span> value).
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--color-text)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={useLoyalty}
                      onChange={(e) => setUseLoyalty(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
                    />
                    Use {loyaltyAccount.points_balance} pts to save MVR {laarToMvr(loyaltyPoints)}
                  </label>
                </SectionCard>
              )}

              {/* Help */}
              <div style={{ ...S.card, textAlign: 'center', padding: '1.25rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                  Need help with your order?
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <a
                    href={`${waLink}?text=Hi%2C+I+need+help+with+my+order`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={S.chatBtnWa}
                    aria-label="Contact us on WhatsApp"
                  >
                    <WhatsAppIcon /> WhatsApp
                  </a>
                  <a
                    href={viberLink}
                    style={S.chatBtnViber}
                    aria-label="Contact us on Viber"
                  >
                    <ViberIcon /> Viber
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Right: order summary ─────────────────────────── */}
        <div style={{ ...S.col, order: isMobile ? 0 : 1 }}>
          <CartSummary cart={cart} />

          <div style={S.card}>
            <h2 style={S.sectionTitle}>Order Summary</h2>
            <SummaryRow label="Subtotal" value={`MVR ${laarToMvr(subtotalLaar)}`} />
            {orderType === 'delivery' && (
              <SummaryRow label="Delivery fee" value={`MVR ${laarToMvr(deliveryFeeLaar)}`} />
            )}
            {promoApplied && !promoApplied.pending && (
              <SummaryRow label={`Promo (${promoApplied.code})`} value={`− MVR ${laarToMvr(promoDelta)}`} highlight />
            )}
            {useLoyalty && loyaltyDelta > 0 && (
              <SummaryRow label="Loyalty discount" value={`− MVR ${laarToMvr(loyaltyDelta)}`} highlight />
            )}
            <div style={S.totalRow}>
              <span>Total</span>
              <span>MVR {laarToMvr(totalLaar)}</span>
            </div>
          </div>

          {token && (
            <div style={isMobile ? S.stickyPayBar : {}}>

              {/* ── BML Compliance block ─────────────────────── */}
              <div style={S.complianceBox}>
                {/* Req 1: Card brand marks in full colour */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>We accept</span>
                  {/* Visa — full colour */}
                  <svg viewBox="0 0 48 16" height="20" xmlns="http://www.w3.org/2000/svg" aria-label="Visa" role="img">
                    <rect width="48" height="16" rx="3" fill="#1A1F71"/>
                    <text x="24" y="11.5" textAnchor="middle" fill="#FFF" fontFamily="Arial,sans-serif" fontSize="9" fontWeight="bold">VISA</text>
                  </svg>
                  {/* Mastercard — full colour */}
                  <svg viewBox="0 0 38 24" height="20" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard" role="img">
                    <circle cx="14" cy="12" r="10" fill="#EB001B"/>
                    <circle cx="24" cy="12" r="10" fill="#F79E1B" fillOpacity="0.9"/>
                    <path d="M19 4.8a10 10 0 0 1 0 14.4A10 10 0 0 1 19 4.8" fill="#FF5F00"/>
                  </svg>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>+ other BML cards</span>
                </div>

                {/* Req 4+5: Currency + merchant country */}
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.625rem', lineHeight: 1.5 }}>
                  Amount charged in <strong>MVR (Maldivian Rufiyaa)</strong>. Merchant located in the <strong>Maldives</strong>.
                </p>

                {/* Req 6+8+12: Policy links before checkout */}
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                  Before completing your purchase, please read:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.875rem' }}>
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
              </div>

              {globalError && (
                <div className="banner banner-error" style={{ marginBottom: 12 }}>
                  <span className="banner-icon">⚠️</span>
                  <div>
                    <p className="banner-title">Payment failed</p>
                    <p className="banner-sub">{globalError}</p>
                  </div>
                </div>
              )}

              <button
                style={{
                  ...S.primaryBtn,
                  width: '100%',
                  padding: '1rem 1.5rem',
                  fontSize: 16,
                  opacity: (isPlacing || !acceptTerms) ? 0.55 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  cursor: !acceptTerms ? 'not-allowed' : 'pointer',
                }}
                onClick={handlePlaceAndPay}
                disabled={isPlacing || !acceptTerms}
                aria-busy={isPlacing}
                title={!acceptTerms ? 'Please agree to the terms to continue' : undefined}
              >
                {isPlacing && <span className="animate-spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} />}
                {placeLabel}
              </button>

              {/* Req 10+11: Security + retain records */}
              <p style={S.secureNote}>
                🔒 Payment processed securely by Bank of Maldives. We do not store your card details. We recommend retaining your order receipt.
              </p>

              {/* Req 3: Corporate info */}
              <div style={S.corporateInfo}>
                <strong>{siteName}</strong> · {address} ·{' '}
                <a href={phoneTel} style={{ color: 'inherit' }}>{phone}</a> ·{' '}
                <a href={`mailto:${email}`} style={{ color: 'inherit' }}>{email}</a>
              </div>
            </div>
          )}
        </div>
      </div>
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

  header: {
    position: 'sticky' as const, top: 0,
    background: 'rgba(255,251,245,0.95)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--color-border)',
    padding: '12px 20px',
    display: 'flex', alignItems: 'center', gap: 16,
    zIndex: 100,
    boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
  } as React.CSSProperties,

  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--color-primary)', fontSize: 15, fontWeight: 600,
    padding: '4px 8px', borderRadius: '6px', fontFamily: 'inherit',
  } as React.CSSProperties,

  headerTitle: {
    fontWeight: 700, fontSize: 17,
    color: 'var(--color-text)', flex: 1,
  } as React.CSSProperties,

  layout: {
    maxWidth: 1100, margin: '0 auto',
    padding: '20px 16px',
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

  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: '0 0 14px',
    paddingBottom: 10,
    borderBottom: '1px solid var(--color-border)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  } as React.CSSProperties,

  fieldLabel: {
    display: 'block',
    fontSize: 13, fontWeight: 600,
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
    cursor: 'pointer', fontSize: 14, fontWeight: 600,
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
    fontSize: 13, color: 'var(--color-text-muted)',
    background: 'var(--color-surface-alt)',
    borderRadius: '8px', padding: '8px 12px',
    marginBottom: 14,
  } as React.CSSProperties,

  summaryRow: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 14, marginBottom: 8,
  } as React.CSSProperties,

  totalRow: {
    display: 'flex', justifyContent: 'space-between',
    fontWeight: 800, fontSize: 18,
    color: 'var(--color-text)',
    borderTop: '2px solid var(--color-border)',
    paddingTop: 12, marginTop: 8,
  } as React.CSSProperties,

  promoApplied: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--color-success-bg)',
    borderRadius: 10, padding: '10px 14px', fontSize: 14,
    border: '1px solid rgba(22,163,74,0.2)',
  } as React.CSSProperties,

  removeBtn: {
    background: 'none', border: 'none',
    color: 'var(--color-error)',
    cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  } as React.CSSProperties,

  primaryBtn: {
    background: 'var(--color-primary)',
    color: '#fff', border: 'none',
    borderRadius: '12px', padding: '12px 24px',
    fontSize: 15, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.15s',
    boxShadow: '0 4px 14px var(--color-primary-glow)',
  } as React.CSSProperties,

  secondaryBtn: {
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    border: '1.5px solid var(--color-primary)',
    borderRadius: '10px', padding: '0 16px',
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
    fontFamily: 'inherit', height: 'var(--input-height)',
  } as React.CSSProperties,

  chatBtnWa: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '0.5rem 1rem',
    background: '#25d366', color: 'white',
    borderRadius: '8px', fontWeight: 600,
    fontSize: 13, textDecoration: 'none',
    transition: 'all 0.15s',
  } as React.CSSProperties,

  chatBtnViber: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '0.5rem 1rem',
    background: '#7360f2', color: 'white',
    borderRadius: '8px', fontWeight: 600,
    fontSize: 13, textDecoration: 'none',
    transition: 'all 0.15s',
  } as React.CSSProperties,

  stickyPayBar: {
    position: 'fixed' as const,
    bottom: 0, left: 0, right: 0,
    background: 'rgba(255,251,245,0.97)',
    backdropFilter: 'blur(12px)',
    borderTop: '1px solid var(--color-border)',
    padding: '12px 16px',
    /* Above .order-mobile-nav (z-index: 300) so Pay button is tappable */
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    zIndex: 320,
  } as React.CSSProperties,

  complianceBox: {
    background: 'var(--color-surface-alt)',
    border: '1px solid var(--color-border)',
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
