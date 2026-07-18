import { useEffect, useState } from "react";
import {
  checkGiftCardBalance,
  fetchCustomerSummary,
  validatePromoCode,
} from "../api";
import type { PosCustomer, PosCustomerSummary } from "../api";
import { removeGiftCardFromOrder } from "../api/loyalty";
import { previewGiftCardDiscount } from "../utils/giftCardPreview";

type AppliedPromo = { code: string; promotionId: number | null; discount: number };
type AppliedLoyalty = { points: number; discount: number };
type AppliedGiftCard = {
  code: string;
  discount: number;
  /** Available (spendable) balance used for the preview cap. */
  cardBalance: number;
  heldBalance?: number;
};

type Props = {
  /** Null for walk-ins — gift card still works; promo/loyalty stay hidden. */
  customer: PosCustomer | null;
  /** Cart total BEFORE any rewards are applied — used as the upper
   *  bound on a loyalty redemption preview and on a gift-card debit so
   *  the staged discount can't exceed what the customer actually owes. */
  taxableSubtotal: number;
  applied: {
    promo: AppliedPromo | null;
    loyalty: AppliedLoyalty | null;
    giftCard: AppliedGiftCard | null;
  };
  setAppliedPromo: (v: AppliedPromo | null) => void;
  setAppliedLoyalty: (v: AppliedLoyalty | null) => void;
  setAppliedGiftCard: (v: AppliedGiftCard | null) => void;
  /** When set, gift-card remove hits the server so soft holds clear on open tickets. */
  orderId?: number | null;
  /** When true, the panel becomes read-only — used for resumed tickets
   *  where rewards must be applied via the original online checkout. */
  readOnly?: boolean;
};

const COLOR = {
  card: "#FFFFFF",
  border: "#E2E8F0",
  borderActive: "#D4813A",
  bg: "#F8FAFC",
  text: "#0F172A",
  muted: "#64748B",
  subtle: "#94A3B8",
  primary: "#D4813A",
  success: "#10B981",
  successBg: "#ECFDF5",
  danger: "#DC2626",
};

/**
 * Compact rewards drawer that appears in the cart whenever a customer
 * is attached AND the cart has at least one item. Shows the customer's
 * loyalty balance / tier / lifetime stats fetched from the new
 * `/api/customers/{id}/pos-summary` endpoint, and lets the cashier
 * stage three reward types:
 *   - Promo code   (validated against /api/promotions/validate)
 *   - Loyalty pts  (previewed via /api/pos/loyalty/preview)
 *   - Gift card    (available balance via POST /api/gift-cards/balance)
 *
 * NONE of these hit the server's apply endpoints yet — each one stores
 * an "estimated discount" object back into useCart state. The actual
 * apply happens in `useOrderCreation::applyStagedRewards` after the
 * order is created and before payment is settled.
 */
export function CustomerRewardsPanel({
  customer,
  taxableSubtotal,
  applied,
  setAppliedPromo,
  setAppliedLoyalty,
  setAppliedGiftCard,
  orderId = null,
  readOnly = false,
}: Props) {
  const [summary, setSummary] = useState<PosCustomerSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Promo state (local — only committed to cart on Apply).
  const [promoCode, setPromoCode] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState("");

  // Loyalty state — defaults to the available points if any.
  const [loyaltyPoints, setLoyaltyPoints] = useState("");
  const [loyaltyBusy, setLoyaltyBusy] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState("");

  // Gift card state.
  const [giftCode, setGiftCode] = useState("");
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftError, setGiftError] = useState("");

  // Fetch the dashboard whenever the cashier attaches a different
  // customer. Detaching is handled in the cart hook (we just don't
  // render when customer is null).
  useEffect(() => {
    if (!customer) {
      setSummary(null);
      setSummaryError("");
      return;
    }
    let cancelled = false;
    setLoadingSummary(true);
    setSummaryError("");
    fetchCustomerSummary(customer.id)
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch((err: Error) => { if (!cancelled) setSummaryError(err.message); })
      .finally(() => { if (!cancelled) setLoadingSummary(false); });
    return () => { cancelled = true; };
  }, [customer]);

  const lifetimeOrders = summary?.lifetime.orders_count ?? 0;
  // Bug-053: backend returns total_spent as a Laravel decimal-cast
  // string ("123.45"), not a number. The `?? 0` only catches null/
  // undefined — without Number() the toFixed call below would crash
  // the panel for any customer with a payment history.
  const lifetimeSpent = Number(summary?.lifetime.total_spent ?? 0);
  const availablePoints = summary?.loyalty.available_points ?? 0;
  const tier = summary?.loyalty.tier ?? summary?.customer.tier ?? customer?.tier ?? "bronze";
  const lastPaidAt = summary?.lifetime.last_paid_at;
  const depositBalanceMvr = (summary?.deposit?.balance_laar ?? 0) / 100;
  const depositStatus = summary?.deposit?.status ?? 'active';
  const creditEnabled = summary?.credit?.enabled ?? false;
  const creditAvailableMvr = (summary?.credit?.available_laar ?? 0) / 100;
  const creditBalanceMvr = (summary?.credit?.balance_laar ?? 0) / 100;
  const hasCustomer = !!customer;

  const handleApplyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoBusy(true);
    setPromoError("");
    try {
      const res = await validatePromoCode(code);
      if (!res.valid) {
        setPromoError(res.message ?? "Invalid code.");
        return;
      }
      // Without an order_id the server can't compute the exact
      // discount, but a percentage promo's discount is roughly
      // `subtotal * discount_value / 100` and a fixed promo is
      // `discount_value` directly. Use a conservative estimate so the
      // cashier sees the right ballpark on the Charge button.
      //
      // M11 reconciliation: this is intentionally a CLIENT estimate.
      // Once Save Ticket / Charge happens, useOrderCreation calls
      // applyStagedRewards which hits the real /apply endpoint and
      // re-reads the order.total back from the server — and the
      // Charge overlay (C5 fix) now uses resumedOrderTotal so any
      // estimate drift is corrected the moment the order is created.
      // Promoting this to a true preview API would require sending
      // the full cart to a new /pos/promos/preview endpoint; tracked
      // as a follow-up but no longer a correctness risk after C5+H6.
      let estimate = 0;
      if (res.promotion) {
        if (res.promotion.type === "percentage") {
          estimate = (taxableSubtotal * Number(res.promotion.discount_value)) / 100;
        } else if (res.promotion.type === "fixed") {
          // discount_value on fixed promos is stored in laari.
          estimate = Number(res.promotion.discount_value) / 100;
        }
      }
      setAppliedPromo({ code, promotionId: null, discount: Math.max(0, estimate) });
      setPromoCode("");
    } catch (err) {
      setPromoError((err as Error).message);
    } finally {
      setPromoBusy(false);
    }
  };

  const handleApplyLoyalty = async () => {
    const points = Number.parseInt(loyaltyPoints, 10);
    if (!Number.isFinite(points) || points <= 0) {
      setLoyaltyError("Enter a positive number of points.");
      return;
    }
    if (points > availablePoints) {
      setLoyaltyError(`Customer only has ${availablePoints.toLocaleString()} points available.`);
      return;
    }
    setLoyaltyBusy(true);
    setLoyaltyError("");
    try {
      // We don't have an order_id yet (the cart hasn't been turned into
      // an order). Estimate locally using the discount-per-point ratio
      // from the dashboard. The server re-caps everything on the real
      // hold so we never over-redeem.
      const discountPerPoint = summary?.loyalty
        ? estimateDiscountPerPoint(summary)
        : 0.01;
      const estimate = Math.min(points * discountPerPoint, taxableSubtotal);
      setAppliedLoyalty({ points, discount: Math.max(0, estimate) });
      setLoyaltyPoints("");
    } catch (err) {
      setLoyaltyError((err as Error).message);
    } finally {
      setLoyaltyBusy(false);
    }
  };

  const handleApplyGiftCard = async () => {
    const code = giftCode.trim().toUpperCase();
    if (!code) return;
    setGiftBusy(true);
    setGiftError("");
    try {
      const res = await checkGiftCardBalance(code);
      const available = Number(res.available_balance ?? res.current_balance);
      const held = Number(res.held_balance ?? 0);
      const preview = previewGiftCardDiscount(available, held, taxableSubtotal);
      if (!preview.ok) {
        setGiftError(preview.error);
        return;
      }
      setAppliedGiftCard({
        code,
        discount: preview.discount,
        cardBalance: available,
        heldBalance: held,
      });
      setGiftCode("");
    } catch {
      // 404 from the balance endpoint is intentionally generic.
      setGiftError("Invalid or unavailable gift card.");
    } finally {
      setGiftBusy(false);
    }
  };

  const handleRemoveGiftCard = async () => {
    if (!applied.giftCard) return;
    setGiftError("");
    if (orderId) {
      setGiftBusy(true);
      try {
        await removeGiftCardFromOrder(orderId);
      } catch (err) {
        setGiftError((err as Error).message);
        setGiftBusy(false);
        return;
      } finally {
        setGiftBusy(false);
      }
    }
    setAppliedGiftCard(null);
    setGiftCode("");
  };

  return (
    <div style={{
      marginTop: 8,
      borderRadius: 10,
      border: `1px solid ${COLOR.border}`,
      background: COLOR.card,
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        style={{
          width: "100%",
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: expanded ? COLOR.bg : COLOR.card,
          border: "none",
          cursor: "pointer",
          minHeight: 56,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", textAlign: "left", gap: 2 }}>
          <span style={{ fontSize: 12, color: COLOR.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {hasCustomer ? "Customer rewards" : "Gift card"}
          </span>
          <span style={{ fontSize: 13, color: COLOR.text, fontWeight: 600 }}>
            {hasCustomer
              ? (loadingSummary
                ? "Loading customer…"
                : summary
                  ? `${availablePoints.toLocaleString()} pts · ${tier.toUpperCase()} · ${lifetimeOrders} orders`
                  : summaryError
                    ? "Could not load customer profile"
                    : "Tap to view & apply")
              : (applied.giftCard
                ? `MVR ${applied.giftCard.discount.toFixed(2)} staged`
                : "Apply a gift card without attaching a customer")}
          </span>
        </div>
        <span style={{ fontSize: 14, color: COLOR.muted, marginLeft: 8 }}>{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div style={{ padding: 12, borderTop: `1px solid ${COLOR.border}`, display: "grid", gap: 14 }}>
          {hasCustomer && (
            <>
              {/* ── At-a-glance customer card ─────────────────────────────── */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 8,
                padding: 10,
                borderRadius: 8,
                background: COLOR.bg,
              }}>
                <Stat label="Available points" value={availablePoints.toLocaleString()} />
                <Stat label="Tier" value={tier.toUpperCase()} />
                <Stat label="Lifetime orders" value={lifetimeOrders.toLocaleString()} />
                <Stat label="Lifetime spent" value={`MVR ${lifetimeSpent.toFixed(2)}`} />
                <Stat
                  label="Deposit balance"
                  value={
                    depositStatus !== 'active'
                      ? `${depositStatus.toUpperCase()} · MVR ${depositBalanceMvr.toFixed(2)}`
                      : `MVR ${depositBalanceMvr.toFixed(2)}`
                  }
                />
                {creditEnabled && (
                  <Stat
                    label="Credit available"
                    value={
                      creditBalanceMvr > 0
                        ? `MVR ${creditAvailableMvr.toFixed(2)} (owed MVR ${creditBalanceMvr.toFixed(2)})`
                        : `MVR ${creditAvailableMvr.toFixed(2)}`
                    }
                  />
                )}
                {lastPaidAt && (
                  <Stat
                    label="Last visit"
                    value={fmtRelative(lastPaidAt)}
                    full
                  />
                )}
                {summary?.customer.internal_notes && (
                  <Stat label="Note" value={summary.customer.internal_notes} full />
                )}
              </div>

              {/* ── Promo code ─────────────────────────────────────────── */}
              <Section
                title="Promo code"
                applied={
                  applied.promo
                    ? `${applied.promo.code} · est. MVR ${applied.promo.discount.toFixed(2)}`
                    : null
                }
                onRemove={applied.promo ? () => setAppliedPromo(null) : undefined}
                error={promoError}
                readOnly={readOnly}
              >
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={promoCode}
                    onChange={(e) => { setPromoCode(e.target.value); setPromoError(""); }}
                    placeholder="e.g. WELCOME10"
                    disabled={!!applied.promo || readOnly}
                    style={fieldStyle}
                  />
                  <button
                    type="button"
                    onClick={handleApplyPromo}
                    disabled={!promoCode.trim() || promoBusy || !!applied.promo || readOnly}
                    style={primaryBtn(!promoCode.trim() || promoBusy || !!applied.promo || readOnly)}
                  >
                    {promoBusy ? "…" : "Apply"}
                  </button>
                </div>
              </Section>

              {/* ── Loyalty points ─────────────────────────────────────── */}
              <Section
                title="Redeem loyalty points"
                hint={availablePoints > 0
                  ? `Available: ${availablePoints.toLocaleString()} pts`
                  : "No points available"}
                applied={
                  applied.loyalty
                    ? `${applied.loyalty.points.toLocaleString()} pts · est. MVR ${applied.loyalty.discount.toFixed(2)}`
                    : null
                }
                onRemove={applied.loyalty ? () => setAppliedLoyalty(null) : undefined}
                error={loyaltyError}
                readOnly={readOnly}
              >
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={loyaltyPoints}
                    onChange={(e) => { setLoyaltyPoints(e.target.value.replace(/\D/g, "")); setLoyaltyError(""); }}
                    placeholder="Points"
                    inputMode="numeric"
                    disabled={availablePoints <= 0 || !!applied.loyalty || readOnly}
                    style={fieldStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setLoyaltyPoints(String(availablePoints))}
                    disabled={availablePoints <= 0 || !!applied.loyalty || readOnly}
                    style={ghostBtn(availablePoints <= 0 || !!applied.loyalty || readOnly)}
                  >
                    Max
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyLoyalty}
                    disabled={!loyaltyPoints || loyaltyBusy || !!applied.loyalty || readOnly}
                    style={primaryBtn(!loyaltyPoints || loyaltyBusy || !!applied.loyalty || readOnly)}
                  >
                    {loyaltyBusy ? "…" : "Apply"}
                  </button>
                </div>
              </Section>
            </>
          )}

          {/* ── Gift card (works for walk-ins too) ──────────────────── */}
          <Section
            title="Gift card"
            applied={
              applied.giftCard
                ? `${applied.giftCard.code} · MVR ${applied.giftCard.discount.toFixed(2)} of ${applied.giftCard.cardBalance.toFixed(2)} available${
                    (applied.giftCard.heldBalance ?? 0) > 0
                      ? ` (${applied.giftCard.heldBalance!.toFixed(2)} held)`
                      : ''
                  }`
                : null
            }
            onRemove={applied.giftCard ? () => { void handleRemoveGiftCard(); } : undefined}
            error={giftError}
            readOnly={readOnly}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={giftCode}
                onChange={(e) => { setGiftCode(e.target.value.toUpperCase()); setGiftError(""); }}
                placeholder="GIFT-XXXX-XXXX"
                disabled={!!applied.giftCard || readOnly}
                style={fieldStyle}
                autoCapitalize="characters"
              />
              <button
                type="button"
                onClick={handleApplyGiftCard}
                disabled={!giftCode.trim() || giftBusy || !!applied.giftCard || readOnly}
                style={primaryBtn(!giftCode.trim() || giftBusy || !!applied.giftCard || readOnly)}
              >
                {giftBusy ? "…" : "Apply"}
              </button>
            </div>
          </Section>

          {/* ── Recent orders ──────────────────────────────────────── */}
          {summary && summary.recent_orders.length > 0 && (
            <div>
              <div style={sectionLabel}>Recent orders</div>
              <div style={{ display: "grid", gap: 4 }}>
                {summary.recent_orders.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: COLOR.bg,
                    }}
                  >
                    <span style={{ color: COLOR.muted, fontVariantNumeric: "tabular-nums" }}>
                      {o.order_number}
                    </span>
                    <span style={{ color: COLOR.muted, textTransform: "capitalize" }}>
                      {o.type.replace("_", " ")}
                    </span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      MVR {Number(o.total).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Roughly estimate the discount-per-point ratio so the cart can show a
 *  preview without an extra server round-trip. The server caps the
 *  actual discount when the hold is placed, so an over-estimate here
 *  becomes a smaller real discount — never an under-charge. */
function estimateDiscountPerPoint(s: PosCustomerSummary): number {
  const rate = s.loyalty.redeem_mvr_per_point;
  if (typeof rate === 'number' && rate > 0) return rate;
  return 0.01;
}

function fmtRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const days = Math.floor(diff / 86_400_000);
    if (days < 1) return "today";
    if (days < 2) return "yesterday";
    if (days < 30) return `${days} days ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  } catch {
    return "—";
  }
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #CBD5E1",
  fontSize: 13,
  minWidth: 0,
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 6,
    border: "none",
    background: disabled ? "#FBD9B8" : "#D4813A",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    minHeight: 36,
  };
}

function ghostBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: disabled ? "#94A3B8" : "#0F172A",
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function Stat({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 10, color: COLOR.subtle, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: COLOR.text, fontWeight: 700, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  applied,
  onRemove,
  error,
  readOnly,
  children,
}: {
  title: string;
  hint?: string;
  applied: string | null;
  onRemove?: () => void;
  error?: string;
  readOnly?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={sectionLabel}>{title}</span>
        {hint && <span style={{ fontSize: 11, color: COLOR.subtle }}>{hint}</span>}
      </div>
      {applied ? (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 6,
          background: COLOR.successBg,
          border: `1px solid #A7F3D0`,
        }}>
          <span style={{ fontSize: 13, color: "#047857", fontWeight: 600 }}>{applied}</span>
          {onRemove && !readOnly && (
            <button
              type="button"
              onClick={onRemove}
              style={{
                background: "transparent",
                border: "none",
                color: COLOR.danger,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Remove
            </button>
          )}
        </div>
      ) : (
        children
      )}
      {error && (
        <div style={{ marginTop: 4, fontSize: 12, color: COLOR.danger }}>{error}</div>
      )}
    </div>
  );
}
