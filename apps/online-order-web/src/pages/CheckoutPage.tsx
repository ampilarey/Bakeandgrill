import { useEffect, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { useCheckout } from "../hooks/useCheckout";
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

// ── Utility ────────────────────────────────────────────────────────────────────
function laarToMvr(laar: number): string { return (laar / 100).toFixed(2); }

// ── WhatsApp + Viber icons ─────────────────────────────────────────────────────
function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
function ViberIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.4 0C5.7.3 1.2 4.8.9 10.5c-.2 3.4.8 6.5 2.7 8.9L2.2 24l4.8-1.4c1.4.7 3 1.1 4.7 1.1 6.1 0 11.1-5 11.1-11.1S17.9 0 11.8 0h-.4zm.5 2c5.1 0 9.1 4 9.1 9.1s-4 9.1-9.1 9.1c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .9.9-2.9-.2-.3C3.7 15.2 3.1 13.1 3.1 11 3.1 5.9 7.2 2 12.1 2h-.2zm-.8 3.2c-.3 0-.8.1-1.2.5C9.5 6.3 8.8 7 8.8 8.5s1 3 1.2 3.2c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.1 1.8-.1.5-.3 1.6-1.5 1.8-2.3.2-.7.1-1.3-.1-1.5-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.2c-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.2-.2.4-.4.5-.6.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6-.1-.1-.8-1.9-1.1-2.7-.2-.5-.5-.5-.7-.5z"/>
    </svg>
  );
}

// ── Field component ────────────────────────────────────────────────────────────
function Field({
  label, placeholder, value, onChange, error, multiline, type,
}: {
  label: string; placeholder?: string; value: string;
  onChange: (v: string) => void; error?: string; multiline?: boolean; type?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.fieldLabel}>{label}</label>
      {multiline ? (
        <textarea
          className={`field-input${error ? ' error' : ''}`}
          placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ height: 72, resize: 'vertical' }}
        />
      ) : (
        <input
          type={type ?? 'text'}
          className={`field-input${error ? ' error' : ''}`}
          placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error && <p className="field-error">{error}</p>}
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

  useEffect(() => { document.title = 'Checkout — Bake & Grill'; }, []);

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

      <div style={{ ...S.layout, gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 380px' }}>

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
                    <span>🛵</span> Delivery fee: <strong>MVR {(deliveryFee / 100).toFixed(2)}</strong> · Estimated 30–45 min
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
                    href="https://wa.me/9609120011?text=Hi%2C+I+need+help+with+my+order"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={S.chatBtnWa}
                    aria-label="Contact us on WhatsApp"
                  >
                    <WhatsAppIcon /> WhatsApp
                  </a>
                  <a
                    href="viber://chat?number=%2B9609120011"
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
                  opacity: isPlacing ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
                onClick={handlePlaceAndPay}
                disabled={isPlacing}
                aria-busy={isPlacing}
              >
                {isPlacing && <span className="animate-spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%' }} />}
                {placeLabel}
              </button>
              <p style={S.secureNote}>🔒 Secure payment via BML BankConnect · Free cancellation before kitchen confirms</p>
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

  secureNote: {
    textAlign: 'center' as const,
    fontSize: 12,
    color: 'var(--color-text-muted)',
    marginTop: 8, lineHeight: 1.5,
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
    zIndex: 50,
  } as React.CSSProperties,
} as const;
