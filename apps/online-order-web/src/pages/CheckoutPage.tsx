import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";

function useIsMobile() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); },
    () => window.innerWidth < 768,
    () => false,
  );
}
import {
  applyPromoCode,
  createCustomerOrder,
  createDeliveryOrder,
  createLoyaltyHold,
  getLoyaltyAccount,
  getCustomerMe,
  initiateOnlinePayment,
  requestOtp,
  verifyOtp,
  type LoyaltyAccount,
} from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  modifiers?: Array<{ id: number; name: string; price: number }>;
};

type OrderType = "takeaway" | "delivery";

type DeliveryForm = {
  address_line1: string;
  address_line2: string;
  island: string;
  contact_name: string;
  contact_phone: string;
  notes: string;
};

const EMPTY_DELIVERY: DeliveryForm = {
  address_line1: "",
  address_line2: "",
  island: "",
  contact_name: "",
  contact_phone: "",
  notes: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function laarToMvr(laar: number): string {
  return (laar / 100).toFixed(2);
}

function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem("bakegrill_cart");
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

function readToken(): string | null {
  return localStorage.getItem("online_token");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AuthBlock({
  onSuccess,
}: {
  onSuccess: (token: string, name: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await requestOtp(phone);
      if (res.otp) setHint(`Dev OTP: ${res.otp}`);
      setStep("otp");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await verifyOtp({ phone, otp });
      localStorage.setItem("online_token", res.token);
      onSuccess(res.token, res.customer.name ?? res.customer.phone);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>Sign in to continue</h2>
      <p style={{ color: "#6c757d", fontSize: 14, marginBottom: 16 }}>
        We'll send an OTP to your Maldivian number.
      </p>
      {error && <p style={styles.errorText}>{error}</p>}
      {hint && (
        <p style={{ ...styles.hintText, marginBottom: 12 }}>{hint}</p>
      )}
      {step === "phone" ? (
        <>
          <input
            style={styles.input}
            placeholder="Phone (e.g. 7xxxxxx)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRequestOtp()}
          />
          <button
            style={styles.primaryBtn}
            onClick={handleRequestOtp}
            disabled={loading || !phone}
          >
            {loading ? "Sending…" : "Send OTP"}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 14, color: "#495057", marginBottom: 8 }}>
            Enter the 6-digit code sent to {phone}
          </p>
          <input
            style={styles.input}
            placeholder="OTP code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
          />
          <button
            style={styles.primaryBtn}
            onClick={handleVerify}
            disabled={loading || otp.length < 6}
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
          <button
            style={styles.ghostBtn}
            onClick={() => {
              setStep("phone");
              setOtp("");
            }}
          >
            Change number
          </button>
        </>
      )}
    </div>
  );
}

function CartSummary({ cart }: { cart: CartItem[] }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>Your Order</h2>
      {cart.map((item) => (
        <div key={item.id} style={styles.cartRow}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600 }}>{item.name}</span>
            {item.modifiers && item.modifiers.length > 0 && (
              <div style={{ fontSize: 12, color: "#6c757d" }}>
                + {item.modifiers.map((m) => m.name).join(", ")}
              </div>
            )}
          </div>
          <span style={{ color: "#6c757d", marginRight: 8 }}>
            ×{item.quantity}
          </span>
          <span style={{ fontWeight: 600, color: "#1ba3b9" }}>
            MVR {(item.price * item.quantity).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CheckoutPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [cart] = useState<CartItem[]>(readCart);
  const [token, setToken] = useState<string | null>(readToken);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);

  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [delivery, setDelivery] = useState<DeliveryForm>(EMPTY_DELIVERY);
  const [notes, setNotes] = useState("");

  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    discountLaar: number;
  } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);

  const [useLoyalty, setUseLoyalty] = useState(false);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);

  const [deliveryFee, setDeliveryFee] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPlacing, setIsPlacing] = useState(false);
  const [globalError, setGlobalError] = useState("");

  const hasMounted = useRef(false);

  // Load delivery fee from config/env  
  useEffect(() => {
    const fee = parseInt(import.meta.env.VITE_DELIVERY_FEE_MVR ?? "20", 10);
    setDeliveryFee(fee * 100);
  }, []);

  // Load customer info + loyalty when token available
  useEffect(() => {
    if (!token) return;
    getCustomerMe(token).then((r) => {
      setCustomerName(r.customer.name ?? r.customer.phone);
    }).catch(() => {});
    getLoyaltyAccount(token).then((r) => {
      if (r.account && r.account.points_balance > 0) {
        setLoyaltyAccount(r.account);
        setLoyaltyPoints(r.account.points_balance);
      }
    }).catch(() => {});
  }, [token]);

  // Redirect if cart is empty (only after first mount)
  useEffect(() => {
    if (hasMounted.current && cart.length === 0) {
      navigate("/");
    }
    hasMounted.current = true;
  }, [cart, navigate]);

  if (cart.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <p>Your cart is empty.</p>
        <button style={styles.primaryBtn} onClick={() => navigate("/")}>
          Back to menu
        </button>
      </div>
    );
  }

  // ── Totals ────────────────────────────────────────────────────────────────

  const subtotalLaar = cart.reduce(
    (sum, item) =>
      sum +
      Math.round(item.price * 100) * item.quantity +
      (item.modifiers ?? []).reduce(
        (ms, m) => ms + Math.round(m.price * 100) * item.quantity,
        0
      ),
    0
  );

  const deliveryFeeLaar = orderType === "delivery" ? deliveryFee : 0;
  const promoDelta = promoApplied?.discountLaar ?? 0;
  const loyaltyDelta = useLoyalty && loyaltyAccount ? loyaltyPoints : 0;
  const totalLaar = Math.max(0, subtotalLaar + deliveryFeeLaar - promoDelta - loyaltyDelta);

  // ── Promo ─────────────────────────────────────────────────────────────────

  const handleApplyPromo = async () => {
    if (!token || !pendingOrderId) {
      setPromoError("Please sign in first.");
      return;
    }
    setPromoError("");
    setPromoLoading(true);
    try {
      const res = await applyPromoCode(token, pendingOrderId, promoCode.trim().toUpperCase());
      setPromoApplied({
        code: promoCode.trim().toUpperCase(),
        discountLaar: res.discount_laar,
      });
      setPromoCode("");
    } catch (e) {
      setPromoError((e as Error).message);
    } finally {
      setPromoLoading(false);
    }
  };

  // ── Validation ────────────────────────────────────────────────────────────

  const validateDelivery = (): boolean => {
    const errs: Record<string, string> = {};
    if (!delivery.address_line1.trim()) errs.address_line1 = "Address is required";
    if (!delivery.island.trim()) errs.island = "Island is required";
    if (!delivery.contact_name.trim()) errs.contact_name = "Contact name is required";
    if (!delivery.contact_phone.trim()) errs.contact_phone = "Contact phone is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Place order + Pay ─────────────────────────────────────────────────────

  const handlePlaceAndPay = async () => {
    if (!token) return;
    if (orderType === "delivery" && !validateDelivery()) return;

    setIsPlacing(true);
    setGlobalError("");

    try {
      let orderId: number;

      if (orderType === "delivery") {
        const res = await createDeliveryOrder(token, {
          items: cart.map((item) => ({
            item_id: item.id,
            quantity: item.quantity,
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
            item_id: item.id,
            quantity: item.quantity,
            modifiers: item.modifiers?.map((m) => ({ modifier_id: m.id })),
          })),
          type: "online_pickup",
          customer_notes: notes || undefined,
        });
        orderId = res.order.id;
      }

      setPendingOrderId(orderId);

      // Apply promo code if entered but not yet applied
      if (promoCode.trim() && !promoApplied) {
        try {
          const promoRes = await applyPromoCode(token, orderId, promoCode.trim().toUpperCase());
          setPromoApplied({
            code: promoCode.trim().toUpperCase(),
            discountLaar: promoRes.discount_laar,
          });
        } catch (e) {
          // Non-fatal: promo errors don't block payment
          setPromoError((e as Error).message);
        }
      }

      // Create loyalty hold if customer chose to use points
      if (useLoyalty && loyaltyAccount && loyaltyPoints > 0) {
        try {
          await createLoyaltyHold(token, orderId, loyaltyPoints);
        } catch (e) {
          // Non-fatal: loyalty errors don't block payment
          console.warn("Loyalty hold failed:", (e as Error).message);
        }
      }

      // Initiate BML payment
      const payment = await initiateOnlinePayment(token, orderId);

      if (!payment.payment_url) {
        throw new Error("Payment could not be started. Please try again in a moment.");
      }

      // Clear cart before redirect
      localStorage.removeItem("bakegrill_cart");

      // Redirect to BML payment page
      window.location.href = payment.payment_url;
    } catch (e) {
      setGlobalError((e as Error).message);
    } finally {
      setIsPlacing(false);
    }
  };

  const handleAuthSuccess = (tok: string, name: string) => {
    setToken(tok);
    setCustomerName(name);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <span style={styles.headerTitle}>Checkout</span>
        {customerName && (
          <span style={{ fontSize: 13, color: "#6c757d" }}>
            Hi, {customerName}
          </span>
        )}
      </header>

      <div style={{ ...styles.layout, gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 380px" }}>
        {/* Left column — on mobile, order is: form first, then cart */}
        <div style={{ ...styles.left, order: isMobile ? 1 : 0 }}>
          {/* Auth gate */}
          {!token && (
            <AuthBlock onSuccess={handleAuthSuccess} />
          )}

          {token && (
            <>
              {/* Order type */}
              <div style={styles.card}>
                <h2 style={styles.sectionTitle}>Order Type</h2>
                <div style={styles.typeRow}>
                  <button
                    style={{
                      ...styles.typeBtn,
                      ...(orderType === "takeaway" ? styles.typeBtnActive : {}),
                    }}
                    onClick={() => setOrderType("takeaway")}
                  >
                    🥡 Takeaway
                  </button>
                  <button
                    style={{
                      ...styles.typeBtn,
                      ...(orderType === "delivery" ? styles.typeBtnActive : {}),
                    }}
                    onClick={() => setOrderType("delivery")}
                  >
                    🛵 Delivery
                  </button>
                </div>
              </div>

              {/* Delivery form */}
              {orderType === "delivery" && (
                <div style={styles.card}>
                  <h2 style={styles.sectionTitle}>Delivery Details</h2>
                  <p style={{ fontSize: 13, color: "#6c757d", marginBottom: 12 }}>
                    Delivery fee: MVR {(deliveryFee / 100).toFixed(2)}
                  </p>
                  <Field
                    label="Address *"
                    placeholder="House / Flat number, Street"
                    value={delivery.address_line1}
                    onChange={(v) => setDelivery({ ...delivery, address_line1: v })}
                    error={errors.address_line1}
                  />
                  <Field
                    label="Address line 2"
                    placeholder="Building name (optional)"
                    value={delivery.address_line2}
                    onChange={(v) => setDelivery({ ...delivery, address_line2: v })}
                  />
                  <Field
                    label="Island *"
                    placeholder="Malé"
                    value={delivery.island}
                    onChange={(v) => setDelivery({ ...delivery, island: v })}
                    error={errors.island}
                  />
                  <div style={styles.fieldRow}>
                    <Field
                      label="Contact name *"
                      placeholder="Full name"
                      value={delivery.contact_name}
                      onChange={(v) => setDelivery({ ...delivery, contact_name: v })}
                      error={errors.contact_name}
                    />
                    <Field
                      label="Contact phone *"
                      placeholder="7xxxxxxx"
                      value={delivery.contact_phone}
                      onChange={(v) => setDelivery({ ...delivery, contact_phone: v })}
                      error={errors.contact_phone}
                    />
                  </div>
                  <Field
                    label="Delivery notes"
                    placeholder="Any special instructions for delivery rider"
                    value={delivery.notes}
                    onChange={(v) => setDelivery({ ...delivery, notes: v })}
                    multiline
                  />
                </div>
              )}

              {/* Notes */}
              <div style={styles.card}>
                <h2 style={styles.sectionTitle}>Order Notes</h2>
                <textarea
                  style={{ ...styles.input, height: 72, resize: "vertical" }}
                  placeholder="Any special requests or allergies?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Promo code */}
              <div style={styles.card}>
                <h2 style={styles.sectionTitle}>Promo Code</h2>
                {promoApplied ? (
                  <div style={styles.promoApplied}>
                    <span>
                      ✅ <strong>{promoApplied.code}</strong> — MVR{" "}
                      {laarToMvr(promoApplied.discountLaar)} off
                    </span>
                    <button
                      style={styles.removeBtn}
                      onClick={() => setPromoApplied(null)}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                        placeholder="Enter promo code"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      />
                      <button
                        style={styles.secondaryBtn}
                        onClick={handleApplyPromo}
                        disabled={promoLoading || !promoCode}
                      >
                        {promoLoading ? "…" : "Apply"}
                      </button>
                    </div>
                    {promoError && (
                      <p style={{ ...styles.errorText, marginTop: 6 }}>
                        {promoError}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Loyalty */}
              {loyaltyAccount && loyaltyAccount.points_balance > 0 && (
                <div style={styles.card}>
                  <h2 style={styles.sectionTitle}>Loyalty Points</h2>
                  <p style={{ fontSize: 14, color: "#495057", marginBottom: 12 }}>
                    You have{" "}
                    <strong>{loyaltyAccount.points_balance} pts</strong>{" "}
                    available (
                    <span style={{ color: "#1ba3b9" }}>
                      MVR {laarToMvr(loyaltyAccount.points_balance)}
                    </span>{" "}
                    value).
                  </p>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={useLoyalty}
                      onChange={(e) => setUseLoyalty(e.target.checked)}
                      style={{ marginRight: 8, width: 18, height: 18 }}
                    />
                    Use all {loyaltyAccount.points_balance} pts to save MVR{" "}
                    {laarToMvr(loyaltyPoints)}
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right column — order summary (shown first on mobile) */}
        <div style={{ ...styles.right, order: isMobile ? 0 : 1 }}>
          <CartSummary cart={cart} />

          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Summary</h2>
            <SummaryRow label="Subtotal" value={`MVR ${laarToMvr(subtotalLaar)}`} />
            {orderType === "delivery" && (
              <SummaryRow
                label="Delivery fee"
                value={`MVR ${laarToMvr(deliveryFeeLaar)}`}
              />
            )}
            {promoApplied && (
              <SummaryRow
                label={`Promo (${promoApplied.code})`}
                value={`− MVR ${laarToMvr(promoApplied.discountLaar)}`}
                highlight
              />
            )}
            {useLoyalty && loyaltyDelta > 0 && (
              <SummaryRow
                label="Loyalty discount"
                value={`− MVR ${laarToMvr(loyaltyDelta)}`}
                highlight
              />
            )}
            <div style={styles.totalRow}>
              <span>Total</span>
              <span>MVR {laarToMvr(totalLaar)}</span>
            </div>
          </div>

          {token && (
            <>
              {globalError && (
                <p style={{ ...styles.errorText, marginBottom: 12 }}>
                  {globalError}
                </p>
              )}
              <button
                style={{
                  ...styles.primaryBtn,
                  width: "100%",
                  padding: "16px 24px",
                  fontSize: 17,
                  opacity: isPlacing ? 0.7 : 1,
                }}
                onClick={handlePlaceAndPay}
                disabled={isPlacing}
              >
                {isPlacing
                  ? "Processing…"
                  : `Pay MVR ${laarToMvr(totalLaar)} with BML`}
              </button>
              <p style={styles.secureNote}>
                🔒 Secure payment via BML BankConnect
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function Field({
  label,
  placeholder,
  value,
  onChange,
  error,
  multiline,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  multiline?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={styles.fieldLabel}>{label}</label>
      {multiline ? (
        <textarea
          style={{ ...styles.input, height: 64, resize: "vertical" }}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          style={{ ...styles.input, borderColor: error ? "#dc3545" : "#dee2e6" }}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error && <p style={styles.errorText}>{error}</p>}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={styles.summaryRow}>
      <span style={{ color: highlight ? "#28a745" : "#495057" }}>{label}</span>
      <span style={{ color: highlight ? "#28a745" : "#495057", fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8f9fa",
    fontFamily: "'Inter', sans-serif",
  } as React.CSSProperties,

  header: {
    position: "sticky" as const,
    top: 0,
    background: "#fff",
    borderBottom: "1px solid #e9ecef",
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    gap: 16,
    zIndex: 100,
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  } as React.CSSProperties,

  backBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#1ba3b9",
    fontSize: 15,
    fontWeight: 600,
    padding: "4px 8px",
  } as React.CSSProperties,

  headerTitle: {
    fontWeight: 700,
    fontSize: 18,
    color: "#212529",
    flex: 1,
  } as React.CSSProperties,

  layout: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "24px 16px",
    display: "grid",
    gap: 24,
  } as React.CSSProperties,

  left: { display: "flex", flexDirection: "column" as const, gap: 16 },
  right: { display: "flex", flexDirection: "column" as const, gap: 16 },

  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "20px 24px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    border: "1px solid #e9ecef",
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#212529",
    margin: "0 0 16px",
    paddingBottom: 12,
    borderBottom: "1px solid #f0f0f0",
  } as React.CSSProperties,

  input: {
    width: "100%",
    border: "1px solid #dee2e6",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    color: "#212529",
    outline: "none",
    boxSizing: "border-box" as const,
    marginBottom: 0,
    fontFamily: "inherit",
    transition: "border-color 0.15s",
  } as React.CSSProperties,

  fieldLabel: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#495057",
    marginBottom: 4,
  } as React.CSSProperties,

  fieldRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  } as React.CSSProperties,

  typeRow: {
    display: "flex",
    gap: 12,
  } as React.CSSProperties,

  typeBtn: {
    flex: 1,
    padding: "12px 16px",
    border: "2px solid #dee2e6",
    borderRadius: 12,
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    color: "#495057",
    transition: "all 0.15s",
  } as React.CSSProperties,

  typeBtnActive: {
    borderColor: "#1ba3b9",
    background: "#e8f8fa",
    color: "#1ba3b9",
  } as React.CSSProperties,

  primaryBtn: {
    background: "linear-gradient(135deg, #1ba3b9, #0d7a8a)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "12px 24px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    width: "100%",
    transition: "opacity 0.2s",
  } as React.CSSProperties,

  secondaryBtn: {
    background: "#fff",
    color: "#1ba3b9",
    border: "2px solid #1ba3b9",
    borderRadius: 10,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,

  ghostBtn: {
    background: "none",
    border: "none",
    color: "#6c757d",
    cursor: "pointer",
    fontSize: 13,
    padding: "8px 0",
    textDecoration: "underline",
    width: "100%",
    marginTop: 8,
  } as React.CSSProperties,

  cartRow: {
    display: "flex",
    alignItems: "flex-start",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottom: "1px solid #f0f0f0",
  } as React.CSSProperties,

  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    marginBottom: 8,
  } as React.CSSProperties,

  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontWeight: 800,
    fontSize: 18,
    color: "#212529",
    borderTop: "2px solid #e9ecef",
    paddingTop: 12,
    marginTop: 8,
  } as React.CSSProperties,

  promoApplied: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#d4edda",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
  } as React.CSSProperties,

  removeBtn: {
    background: "none",
    border: "none",
    color: "#721c24",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  } as React.CSSProperties,

  errorText: {
    color: "#dc3545",
    fontSize: 13,
    margin: "4px 0 0",
  } as React.CSSProperties,

  hintText: {
    background: "#fff3cd",
    border: "1px solid #ffc107",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    color: "#856404",
  } as React.CSSProperties,

  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    fontSize: 14,
    color: "#212529",
    cursor: "pointer",
  } as React.CSSProperties,

  secureNote: {
    textAlign: "center" as const,
    fontSize: 12,
    color: "#6c757d",
    marginTop: 8,
  } as React.CSSProperties,
} as const;

