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

// ── Helper components ──────────────────────────────────────────────────────────
function Field({ label, placeholder, value, onChange, error, multiline }: {
  label: string; placeholder?: string; value: string;
  onChange: (v: string) => void; error?: string; multiline?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={styles.fieldLabel}>{label}</label>
      {multiline ? (
        <textarea style={{ ...styles.input, height: 64, resize: "vertical" }}
          placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input style={{ ...styles.input, borderColor: error ? "#dc3545" : "#dee2e6" }}
          placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {error && <p style={styles.errorText}>{error}</p>}
    </div>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={styles.summaryRow}>
      <span style={{ color: highlight ? "#28a745" : "#495057" }}>{label}</span>
      <span style={{ color: highlight ? "#28a745" : "#495057", fontWeight: 500 }}>{value}</span>
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
      <div style={{ padding: 32, textAlign: "center" }}>
        <p>Your cart is empty.</p>
        <button style={styles.primaryBtn} onClick={() => navigate("/")}>Back to menu</button>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(-1)}>← Back</button>
        <span style={styles.headerTitle}>Checkout</span>
        {customerName && <span style={{ fontSize: 13, color: "#6c757d" }}>Hi, {customerName}</span>}
      </header>

      <div style={{ ...styles.layout, gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 380px" }}>
        {/* Left column */}
        <div style={{ ...styles.left, order: isMobile ? 1 : 0 }}>
          {!token && <AuthBlock onSuccess={handleAuthSuccess} />}

          {token && (
            <>
              {/* Order type */}
              <div style={styles.card}>
                <h2 style={styles.sectionTitle}>Order Type</h2>
                <div style={styles.typeRow}>
                  {(["takeaway", "delivery"] as const).map((type) => (
                    <button
                      key={type}
                      style={{ ...styles.typeBtn, ...(orderType === type ? styles.typeBtnActive : {}) }}
                      onClick={() => setOrderType(type)}
                    >
                      {type === "takeaway" ? "🥡 Takeaway" : "🛵 Delivery"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delivery form */}
              {orderType === "delivery" && (
                <div style={styles.card}>
                  <h2 style={styles.sectionTitle}>Delivery Details</h2>
                  <p style={{ fontSize: 13, color: "#6c757d", marginBottom: 12 }}>
                    Delivery fee: MVR {(deliveryFee / 100).toFixed(2)}
                  </p>
                  <Field label="Address *" placeholder="House / Flat number, Street"
                    value={delivery.address_line1} onChange={(v) => setDelivery({ ...delivery, address_line1: v })} error={errors.address_line1} />
                  <Field label="Address line 2" placeholder="Building name (optional)"
                    value={delivery.address_line2} onChange={(v) => setDelivery({ ...delivery, address_line2: v })} />
                  <Field label="Island *" placeholder="Malé"
                    value={delivery.island} onChange={(v) => setDelivery({ ...delivery, island: v })} error={errors.island} />
                  <div style={styles.fieldRow}>
                    <Field label="Contact name *" placeholder="Full name"
                      value={delivery.contact_name} onChange={(v) => setDelivery({ ...delivery, contact_name: v })} error={errors.contact_name} />
                    <Field label="Contact phone *" placeholder="7xxxxxxx"
                      value={delivery.contact_phone} onChange={(v) => setDelivery({ ...delivery, contact_phone: v })} error={errors.contact_phone} />
                  </div>
                  <Field label="Delivery notes" placeholder="Any special instructions for delivery rider"
                    value={delivery.notes} onChange={(v) => setDelivery({ ...delivery, notes: v })} multiline />
                </div>
              )}

              {/* Order notes */}
              <div style={styles.card}>
                <h2 style={styles.sectionTitle}>Order Notes</h2>
                <textarea style={{ ...styles.input, height: 72, resize: "vertical" }}
                  placeholder="Any special requests or allergies?" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {/* Promo code */}
              <div style={styles.card}>
                <h2 style={styles.sectionTitle}>Promo Code</h2>
                {promoApplied ? (
                  <div style={styles.promoApplied}>
                    <span>
                      {promoApplied.pending
                        ? <><span>⏳</span> <strong>{promoApplied.code}</strong> — will be applied at checkout</>
                        : <><span>✅</span> <strong>{promoApplied.code}</strong> — MVR {laarToMvr(promoApplied.discountLaar)} off</>
                      }
                    </span>
                    <button style={styles.removeBtn} onClick={() => setPromoApplied(null)}>Remove</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                        placeholder="Enter promo code" value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())} />
                      <button style={styles.secondaryBtn} onClick={handleApplyPromo} disabled={promoLoading || !promoCode}>
                        {promoLoading ? "…" : "Apply"}
                      </button>
                    </div>
                    {promoError && <p style={{ ...styles.errorText, marginTop: 6 }}>{promoError}</p>}
                  </>
                )}
              </div>

              {/* Loyalty */}
              {loyaltyAccount && loyaltyAccount.points_balance > 0 && (
                <div style={styles.card}>
                  <h2 style={styles.sectionTitle}>Loyalty Points</h2>
                  <p style={{ fontSize: 14, color: "#495057", marginBottom: 12 }}>
                    You have <strong>{loyaltyAccount.points_balance} pts</strong> available (
                    <span style={{ color: "#D97706" }}>MVR {laarToMvr(loyaltyAccount.points_balance)}</span> value).
                  </p>
                  <label style={styles.checkboxLabel}>
                    <input type="checkbox" checked={useLoyalty} onChange={(e) => setUseLoyalty(e.target.checked)}
                      style={{ marginRight: 8, width: 18, height: 18 }} />
                    Use all {loyaltyAccount.points_balance} pts to save MVR {laarToMvr(loyaltyPoints)}
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right column — order summary */}
        <div style={{ ...styles.right, order: isMobile ? 0 : 1 }}>
          <CartSummary cart={cart} />

          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Summary</h2>
            <SummaryRow label="Subtotal" value={`MVR ${laarToMvr(subtotalLaar)}`} />
            {orderType === "delivery" && (
              <SummaryRow label="Delivery fee" value={`MVR ${laarToMvr(deliveryFeeLaar)}`} />
            )}
            {promoApplied && !promoApplied.pending && (
              <SummaryRow label={`Promo (${promoApplied.code})`} value={`− MVR ${laarToMvr(promoDelta)}`} highlight />
            )}
            {useLoyalty && loyaltyDelta > 0 && (
              <SummaryRow label="Loyalty discount" value={`− MVR ${laarToMvr(loyaltyDelta)}`} highlight />
            )}
            <div style={styles.totalRow}>
              <span>Total</span>
              <span>MVR {laarToMvr(totalLaar)}</span>
            </div>
          </div>

          {token && (
            <>
              {globalError && <p style={{ ...styles.errorText, marginBottom: 12 }}>{globalError}</p>}
              <button
                style={{ ...styles.primaryBtn, width: "100%", padding: "16px 24px", fontSize: 17, opacity: isPlacing ? 0.7 : 1 }}
                onClick={handlePlaceAndPay}
                disabled={isPlacing}
              >
                {isPlacing ? "Processing…" : `Pay MVR ${laarToMvr(totalLaar)} with BML`}
              </button>
              <p style={styles.secureNote}>🔒 Secure payment via BML BankConnect</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = {
  page:         { minHeight: "100vh", background: "#f8f9fa", fontFamily: "'Inter', sans-serif" } as React.CSSProperties,
  header:       { position: "sticky" as const, top: 0, background: "#fff", borderBottom: "1px solid #e9ecef", padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" } as React.CSSProperties,
  backBtn:      { background: "none", border: "none", cursor: "pointer", color: "#1ba3b9", fontSize: 15, fontWeight: 600, padding: "4px 8px" } as React.CSSProperties,
  headerTitle:  { fontWeight: 700, fontSize: 18, color: "#212529", flex: 1 } as React.CSSProperties,
  layout:       { maxWidth: 1100, margin: "0 auto", padding: "24px 16px", display: "grid", gap: 24 } as React.CSSProperties,
  left:         { display: "flex", flexDirection: "column" as const, gap: 16 },
  right:        { display: "flex", flexDirection: "column" as const, gap: 16 },
  card:         { background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid #e9ecef" } as React.CSSProperties,
  sectionTitle: { fontSize: 16, fontWeight: 700, color: "#212529", margin: "0 0 16px", paddingBottom: 12, borderBottom: "1px solid #f0f0f0" } as React.CSSProperties,
  input:        { width: "100%", border: "1px solid #dee2e6", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#212529", outline: "none", boxSizing: "border-box" as const, marginBottom: 0, fontFamily: "inherit", transition: "border-color 0.15s" } as React.CSSProperties,
  fieldLabel:   { display: "block", fontSize: 13, fontWeight: 600, color: "#495057", marginBottom: 4 } as React.CSSProperties,
  fieldRow:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as React.CSSProperties,
  typeRow:      { display: "flex", gap: 12 } as React.CSSProperties,
  typeBtn:      { flex: 1, padding: "12px 16px", border: "2px solid #dee2e6", borderRadius: 12, background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#495057", transition: "all 0.15s" } as React.CSSProperties,
  typeBtnActive:{ borderColor: "#1ba3b9", background: "#e8f8fa", color: "#1ba3b9" } as React.CSSProperties,
  primaryBtn:   { background: "linear-gradient(135deg, #D97706, #B45309)", color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", transition: "opacity 0.2s" } as React.CSSProperties,
  secondaryBtn: { background: "#fff", color: "#1ba3b9", border: "2px solid #1ba3b9", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const } as React.CSSProperties,
  summaryRow:   { display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 } as React.CSSProperties,
  totalRow:     { display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, color: "#212529", borderTop: "2px solid #e9ecef", paddingTop: 12, marginTop: 8 } as React.CSSProperties,
  promoApplied: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#d4edda", borderRadius: 10, padding: "10px 14px", fontSize: 14 } as React.CSSProperties,
  removeBtn:    { background: "none", border: "none", color: "#721c24", cursor: "pointer", fontSize: 13, fontWeight: 600 } as React.CSSProperties,
  errorText:    { color: "#dc3545", fontSize: 13, margin: "4px 0 0" } as React.CSSProperties,
  checkboxLabel:{ display: "flex", alignItems: "center", fontSize: 14, color: "#212529", cursor: "pointer" } as React.CSSProperties,
  secureNote:   { textAlign: "center" as const, fontSize: 12, color: "#6c757d", marginTop: 8 } as React.CSSProperties,
} as const;
