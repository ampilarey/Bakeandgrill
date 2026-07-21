import { useEffect, useState } from "react";
import {
  checkGiftCardBalance,
  fetchCustomerSummary,
  previewLoyaltyRedeem,
  previewPromoForCart,
} from "../api";
import type { PosCustomer, PosCustomerSummary } from "../api";
import type { PromoPreviewLine } from "../api/loyalty";
import { removeGiftCardFromOrder } from "../api/loyalty";
import { previewGiftCardDiscount } from "../utils/giftCardPreview";

type AppliedPromo = {
  code: string;
  promotionId: number | null;
  discount: number;
  serverApplied?: boolean;
};
type AppliedLoyalty = { points: number; discount: number; serverApplied?: boolean };
type AppliedGiftCard = {
  code: string;
  discount: number;
  /** Available (spendable) balance used for the preview cap. */
  cardBalance: number;
  heldBalance?: number;
  serverApplied?: boolean;
};

type Props = {
  /** Null for walk-ins — gift card still works; promo/loyalty stay hidden. */
  customer: PosCustomer | null;
  /** Cart merchandise after true discounts — loyalty/promo preview cap. */
  taxableSubtotal: number;
  /** Cart lines for server promo preview (item_id + unit prices). */
  cartLines?: PromoPreviewLine[];
  /** Manual cashier discount in MVR — used for loyalty % cap preview. */
  manualDiscountMvr?: number;
  /** Grand total after tax — gift-card tender is capped against this. */
  tenderRoom: number;
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
  /** Staff needs promotions.discounts (same as backend staffApply). */
  canApplyGiftCard?: boolean;
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
 *   - Promo code   (previewed via /api/pos/promos/preview)
 *   - Loyalty pts  (previewed via /api/pos/loyalty/preview)
 *   - Gift card    (available balance via POST /api/gift-cards/balance)
 *
 * NONE of these hit the server's apply endpoints yet — each one stores
 * a server-estimated discount back into useCart state. The actual apply
 * happens in `useOrderCreation::applyStagedRewards` after the order is
 * created and before payment is settled (code/points only).
 */
export function CustomerRewardsPanel({
  customer,
  taxableSubtotal,
  cartLines = [],
  manualDiscountMvr = 0,
  tenderRoom,
  applied,
  setAppliedPromo,
  setAppliedLoyalty,
  setAppliedGiftCard,
  orderId = null,
  readOnly = false,
  canApplyGiftCard = true,
}: Props) {
  const [summary, setSummary] = useState<PosCustomerSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  // Collapsed by default — expand when the cashier needs rewards.
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
  const isVip = Boolean(summary?.is_vip ?? summary?.customer.is_vip);
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
    if (!orderId && cartLines.length === 0) {
      setPromoError("Add items before applying a promo.");
      return;
    }
    setPromoBusy(true);
    setPromoError("");
    try {
      const res = await previewPromoForCart({
        code,
        orderId: orderId ?? null,
        customerId: customer?.id ?? null,
        items: orderId ? undefined : cartLines,
      });
      if (!res.valid) {
        setPromoError(res.message ?? "Invalid code.");
        return;
      }
      const discountMvr = Math.max(0, (res.discount_laar ?? 0) / 100);
      setAppliedPromo({
        code,
        promotionId: res.promotion?.id ?? null,
        discount: discountMvr,
      });
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
    if (!customer?.id && !orderId) {
      setLoyaltyError("Attach a customer before redeeming points.");
      return;
    }
    setLoyaltyBusy(true);
    setLoyaltyError("");
    try {
      // taxableSubtotal already excludes staged promo/manual/loyalty — rebuild
      // merchandise so the server can apply the same % cap as the real hold.
      const merchandiseMvr =
        taxableSubtotal
        + (applied.promo?.discount ?? 0)
        + manualDiscountMvr
        + (applied.loyalty?.discount ?? 0);
      const res = await previewLoyaltyRedeem({
        points,
        orderId: orderId ?? null,
        customerId: customer?.id ?? null,
        merchandiseSubtotalLaar: orderId ? undefined : Math.round(Math.max(0, merchandiseMvr) * 100),
        promoDiscountLaar: orderId ? undefined : Math.round(Math.max(0, applied.promo?.discount ?? 0) * 100),
        manualDiscountLaar: orderId ? undefined : Math.round(Math.max(0, manualDiscountMvr) * 100),
      });
      setAppliedLoyalty({
        points: res.points,
        discount: Math.max(0, res.discount_laar / 100),
      });
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
      const preview = previewGiftCardDiscount(available, held, tenderRoom);
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
          <span style={{ fontSize: 13, color: COLOR.text, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {hasCustomer
              ? (loadingSummary
                ? "Loading customer…"
                : summary
                  ? (
                    <>
                      {isVip && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          color: "#92400E",
                          background: "#FEF3C7",
                          border: "1px solid #F59E0B",
                          borderRadius: 4,
                          padding: "2px 6px",
                        }}>
                          VIP
                        </span>
                      )}
                      <span>{`${availablePoints.toLocaleString()} pts · ${tier.toUpperCase()} · ${lifetimeOrders} orders`}</span>
                    </>
                  )
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
                <Stat label="Tier" value={isVip ? `${tier.toUpperCase()} · VIP` : tier.toUpperCase()} />
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
                    ? `${applied.promo.serverApplied ? "On ticket" : applied.promo.code} · MVR ${applied.promo.discount.toFixed(2)}`
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
                    ? `${applied.loyalty.serverApplied ? "On ticket" : `${applied.loyalty.points.toLocaleString()} pts`} · MVR ${applied.loyalty.discount.toFixed(2)}`
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
          {canApplyGiftCard && (
            <Section
              title="Gift card"
              hint="Dine-in / takeaway — enter code from SMS or card"
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
                  placeholder="Paste gift code"
                  disabled={!!applied.giftCard || readOnly}
                  style={fieldStyle}
                  autoCapitalize="characters"
                  autoComplete="off"
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
          )}

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
