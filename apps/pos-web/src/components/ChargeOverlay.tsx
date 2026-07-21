import { useEffect, useMemo, useRef, useState } from "react";
import { CashInput } from "./CashInput";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { z } from "../theme";

export type ChargeMethod = "cash" | "card" | "qr" | "digital_wallet" | "house_account" | "wallet";

type Props = {
  total: number;
  /** Optional breakdown — when supplied, the Charge screen shows the
   *  Subtotal / Discount / GST stack above the big "Amount due" number
   *  so the cashier (and customer) can see exactly how the total was
   *  built. Backed by `useCart`'s `cartSubtotal`, `discountValue`, and
   *  `cartTax`. Older callers can omit them; the overlay degrades to
   *  just the headline number. */
  subtotal?: number;
  discount?: number;
  tax?: number;
  serviceCharge?: number;
  serviceChargeLabel?: string;
  packagingFee?: number;
  /** Optional delivery fee line (POS phone-in delivery). */
  deliveryFee?: number;
  /** Gift-card tender applied to the ticket (MVR). Rendered as the
   *  last −MVR line before "Amount due" so the breakdown always sums
   *  to the headline total. */
  giftTender?: number;
  /** Show Credit Account tender when customer is approved for credit. */
  creditEligible?: boolean;
  creditAvailableMvr?: number;
  /** Show customer deposit tender when customer has prepaid balance. */
  walletEligible?: boolean;
  walletAvailableMvr?: number;
  /** When true, only cash / card / transfer / QR are offered. */
  isOffline?: boolean;
  /** Hide tender types the cashier is not permitted to use. */
  allowedTenders?: {
    cash?: boolean;
    card?: boolean;
    qr?: boolean;
    digital_wallet?: boolean;
    split?: boolean;
  };
  onClose: () => void;
  onConfirm: (rows: Array<{ method: ChargeMethod; amount: number; tendered_amount?: number }>) => Promise<void>;
  submitting: boolean;
  /** Optional inline error to surface inside the overlay. The overlay
   *  is z-index 900 (covers the cart status banner area), so without
   *  this any failure in handleCharge would look like "the Confirm
   *  button did nothing". Caller wires this to the order hook's
   *  statusMessage so device-blocked / table / network errors land
   *  on the cashier's screen. */
  errorMessage?: string;
  /** Amber reward-apply warning (promo/loyalty/gift failures) above Confirm. */
  rewardWarning?: string;
  /** When set, Confirm retries settlement only — no new order is created. */
  pendingPaymentOrderId?: number | null;
};

const METHOD_LABEL: Record<ChargeMethod, string> = {
  cash: "Cash",
  card: "Card",
  qr: "QR",
  digital_wallet: "Transfer",
  house_account: "Credit Account",
  wallet: "Pay from Deposit",
};

/**
 * Full-screen charge screen, the way every Loyverse-style POS works.
 * The cashier sees ONE huge number (the amount due), taps the tender,
 * optionally enters a received amount for cash, and gets a giant
 * change-due readout. The previous flow buried payment inputs in the
 * tiny cart sidebar — too cramped for a real counter.
 */
export function ChargeOverlay({
  total,
  subtotal,
  discount,
  tax,
  serviceCharge,
  serviceChargeLabel,
  packagingFee,
  deliveryFee,
  giftTender,
  creditEligible = false,
  creditAvailableMvr = 0,
  walletEligible = false,
  walletAvailableMvr = 0,
  isOffline = false,
  allowedTenders,
  onClose,
  onConfirm,
  submitting,
  errorMessage,
  rewardWarning,
  pendingPaymentOrderId = null,
}: Props) {
  const tenderAllowed = useMemo(() => ({
    cash: allowedTenders?.cash !== false,
    card: allowedTenders?.card !== false,
    qr: allowedTenders?.qr !== false,
    digital_wallet: allowedTenders?.digital_wallet !== false,
    split: allowedTenders?.split !== false,
  }), [allowedTenders?.cash, allowedTenders?.card, allowedTenders?.qr, allowedTenders?.digital_wallet, allowedTenders?.split]);
  const baseMethods = useMemo(
    () => (["cash", "card", "digital_wallet", "qr"] as const).filter((m) => tenderAllowed[m]),
    [tenderAllowed],
  );
  const showBreakdown =
    (typeof subtotal === "number" && (
      subtotal !== total
      || (tax ?? 0) > 0
      || (discount ?? 0) > 0
      || (serviceCharge ?? 0) > 0
      || (packagingFee ?? 0) > 0
      || (deliveryFee ?? 0) > 0
      || (giftTender ?? 0) > 0
    ));
  const [method, setMethod] = useState<ChargeMethod>("cash");
  const [received, setReceived] = useState<string>(total > 0 ? total.toFixed(2) : "");
  /**
   * Split-tender mode. When on, the cashier enters how much is being
   * collected on the selected non-cash method; the remainder is
   * automatically billed to cash. Two rows total — POS-019 audit
   * called out that the pre-fix overlay accepted an array but only
   * ever sent one row, dropping all split-payment intent on the floor.
   */
  const [split, setSplit] = useState(false);
  const [splitAmount, setSplitAmount] = useState<string>("");

  // Reset the received-amount input whenever the total or method changes —
  // otherwise a stale value from a prior order can linger.
  useEffect(() => { setReceived(total > 0 ? total.toFixed(2) : ""); }, [total, method]);

  useEffect(() => {
    if (method === "house_account" || method === "wallet") return;
    if (baseMethods.includes(method)) return;
    if (baseMethods.length > 0) setMethod(baseMethods[0]);
  }, [method, baseMethods]);

  // Esc closes; useful for keyboard-driven counters.
  // Guarded by `submitting` so a stray Escape mid-payment can't
  // tear down the overlay while handleCharge is still in flight —
  // otherwise the resolve would land on whatever cart the cashier
  // has built next and clear / advance the wrong order. The Cancel
  // button is disabled in the same state for the same reason.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  // ── Money math is done in integer laari (1 MVR = 100 laari) ──
  // Float arithmetic on MVR amounts looks innocent but combining
  // many split-tender + change calcs across a busy day produces
  // 1-laari drift between what the screen shows and what the
  // `payments` table records. Doing the math in integers and
  // converting back at the display boundary eliminates the
  // mismatch entirely (this is the same approach Stripe, Square
  // and Loyverse use internally).
  const toLaari = (n: number): number => Math.round(n * 100);
  const fromLaari = (laari: number): number => laari / 100;

  const receivedNum = Number.parseFloat(received);
  const fullyCovered = total <= 0;
  const change = useMemo(() => {
    if (fullyCovered || method !== "cash") return 0;
    if (!Number.isFinite(receivedNum)) return 0;
    const diff = toLaari(receivedNum) - toLaari(total);
    return diff > 0 ? fromLaari(diff) : 0;
  }, [method, receivedNum, total, fullyCovered]);

  // Zero-total (rewards/gift cover the bill): Confirm must stay enabled
  // without forcing the cashier to type "0" into Received.
  const enough = fullyCovered
    || (method === "cash"
      ? Number.isFinite(receivedNum) && receivedNum >= total
      : true);

  // Quick-amount buttons.
  //
  // Old logic produced nonsense like `ceil(total) + 5` (e.g. for a
  // 37.50 total it suggested 43, 48, 58, 88 …). Cashiers don't see
  // payments like that — customers hand them actual MVR denominations.
  //
  // New algorithm, tuned for Maldivian cash:
  //   - Notes:  5, 10, 20, 50, 100, 500, 1000
  //   - Coins:  0.25, 0.50, 1, 2  (rarely "quick", usually exact)
  //
  // We surface, in this order, capped at 6 chips:
  //   1. The exact total (cashier confirms when the customer hands
  //      the precise amount in coins).
  //   2. Each single-note denomination that's >= total — for
  //      "customer hands one bill" which is the dominant case.
  //   3. A few round-up combinations (the next multiple of 50 / 100
  //      / 500 etc.) so things like a 235 total surface 250 and 300,
  //      not 240 (which nobody actually hands in MVR notes). Steps
  //      are tiered by magnitude so the small/large total cases both
  //      stay sensible.
  const quick = useMemo<number[]>(() => {
    if (total <= 0) return [];

    const exact = Math.round(total * 100) / 100;
    const set = new Set<number>([exact]);

    const NOTES = [5, 10, 20, 50, 100, 500, 1000];
    for (const note of NOTES) {
      if (note >= total) set.add(note);
    }

    // Step sizes scale with the total so we don't suggest MVR 240 for
    // a MVR 235 order (no Maldivian customer combines notes like that).
    const steps =
      total < 20  ? [5, 10, 20, 50, 100] :
      total < 100 ? [10, 20, 50, 100, 500] :
      total < 500 ? [50, 100, 500, 1000] :
                    [100, 500, 1000];
    for (const step of steps) {
      const r = Math.ceil(total / step) * step;
      if (r > total) set.add(r);
    }

    return Array.from(set)
      .filter((v) => v >= total)
      .sort((a, b) => a - b)
      .slice(0, 6);
  }, [total]);

  // Pretty-print: whole MVR → no decimals, fractional → 2 dp.
  // The previous overlay used `.toFixed(0)` everywhere, which silently
  // turned a 37.50 "exact" chip into "MVR 38" — visibly wrong.
  const fmtChip = (n: number) =>
    Number.isInteger(n) ? `MVR ${n}` : `MVR ${n.toFixed(2)}`;

  const splitNum = Number.parseFloat(splitAmount);
  const splitValid =
    split
    && method !== "cash"
    && method !== "house_account"
    && method !== "wallet"
    && Number.isFinite(splitNum)
    && splitNum > 0
    && splitNum < total;

  const creditOverLimit = method === "house_account" && total > creditAvailableMvr + 0.001;
  const canConfirmCredit = method === "house_account" && creditEligible && !creditOverLimit && total > 0;
  const walletFullPay = method === "wallet" && walletEligible && total <= walletAvailableMvr + 0.001;
  const walletPartialPay = method === "wallet" && walletEligible && walletAvailableMvr > 0 && total > walletAvailableMvr + 0.001;
  const walletOverLimit = method === "wallet" && walletEligible && walletAvailableMvr <= 0;
  const canConfirmWallet = (walletFullPay || walletPartialPay) && total > 0;
  const canConfirmAccountTender = canConfirmCredit || canConfirmWallet;

  const confirm = async () => {
    // Split tender: send TWO rows — the requested non-cash portion +
    // the remainder as cash. settleOrder() already top-ups any
    // shortfall with cash, but being explicit here means the server
    // sees the actual split the cashier chose, which is what shows up
    // in the day's tender breakdown report.
    if (walletPartialPay) {
      const depositLaar = Math.min(toLaari(total), toLaari(walletAvailableMvr));
      const deposit = fromLaari(depositLaar);
      const rest = fromLaari(toLaari(total) - depositLaar);
      await onConfirm([
        { method: "wallet", amount: deposit },
        { method: "cash", amount: rest },
      ]);
      return;
    }
    if (splitValid) {
      // Compute the cash remainder in integer laari so the two
      // amounts we send the server sum exactly to `total` — no
      // 1-laari rounding gap between (split + rest) and the
      // order's recorded total.
      const restLaari = toLaari(total) - toLaari(splitNum);
      const rest = fromLaari(restLaari);
      const splitAmount = fromLaari(toLaari(splitNum));
      await onConfirm([
        { method, amount: splitAmount },
        { method: "cash", amount: rest },
      ]);
      return;
    }
    if (!enough && !splitValid && !canConfirmAccountTender) return;
    // FIX 11 — surface cash overpay as `tendered_amount` so change_given
    // is recorded server-side. The applied `amount` remains the order
    // total (drawer expected-cash stays honest).
    if (method === "cash" && Number.isFinite(receivedNum) && toLaari(receivedNum) > toLaari(total)) {
      await onConfirm([{ method, amount: total, tendered_amount: receivedNum }]);
      return;
    }
    await onConfirm([{ method, amount: total }]);
  };

  // Bug-035: trap Tab inside the charge overlay so keyboard focus
  // can't slip behind to the (hidden) sales UI mid-payment. Esc is
  // still gated on `submitting` via the existing useEffect.
  const trapRef = useRef<HTMLDivElement>(null);
  useFocusTrap(trapRef, true);

  return (
    <div
      ref={trapRef}
      className="pos-charge-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Charge"
      style={{
        position: "fixed", inset: 0, zIndex: z.overlay,
        background: "rgba(15,23,42,0.65)",
      }}
    >
      <div className="pos-charge" style={{
        background: "#fff",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div className="pos-charge-header" style={{
          padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid #E2E8F0",
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#0F172A" }}>Charge</h2>
          <button
            className="pos-charge-close-btn"
            onClick={onClose}
            disabled={submitting}
            style={{
            background: "none", border: "none", color: "#64748B",
            fontSize: 20, cursor: "pointer", lineHeight: 1,
          }} aria-label="Close charge screen">×</button>
        </div>

        {/* Body */}
        <div className="pos-charge-grid">
          {/* LEFT: total + change */}
          <div className="pos-charge-summary" style={{
            padding: 24, display: "flex", flexDirection: "column",
            justifyContent: "center", alignItems: "stretch", background: "#0F172A",
            color: "#fff",
          }}>
            {showBreakdown && (
              <div className="pos-charge-breakdown" style={{
                marginBottom: 18, padding: "10px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 13, color: "#CBD5E1",
                display: "grid", rowGap: 4,
              }}>
                <Line label="Subtotal" value={subtotal ?? 0} />
                {(discount ?? 0) > 0 && (
                  <Line label="Discount" value={-(discount ?? 0)} accent="#FCD34D" />
                )}
                {(serviceCharge ?? 0) > 0 && (
                  <Line label={serviceChargeLabel ?? "Service charge"} value={serviceCharge ?? 0} />
                )}
                {(packagingFee ?? 0) > 0 && (
                  <Line label="Packaging" value={packagingFee ?? 0} />
                )}
                {(deliveryFee ?? 0) > 0 && (
                  <Line label="Delivery fee" value={deliveryFee ?? 0} />
                )}
                {(tax ?? 0) > 0 && (
                  <Line label="GST" value={tax ?? 0} />
                )}
                {(giftTender ?? 0) > 0 && (
                  <Line label="Gift card" value={-(giftTender ?? 0)} accent="#FCD34D" />
                )}
              </div>
            )}
            <div className={`pos-charge-amounts${method === "cash" ? " pos-charge-amounts--cash" : ""}`}>
              <div className="pos-charge-due-block">
                <p className="pos-charge-due-label" style={{ margin: 0, fontSize: 12, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>
                  Amount due
                </p>
                <p className="pos-charge-due-value" style={{ margin: "8px 0 0", fontSize: 48, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  MVR {total.toFixed(2)}
                </p>
              </div>

              {method === "cash" && (
                <div className="pos-charge-change-block">
                  <p className="pos-charge-change-label" style={{ margin: "28px 0 0", fontSize: 12, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>
                    Change due
                  </p>
                  <p className="pos-charge-change-value" style={{
                    margin: "8px 0 0", fontSize: 40, fontWeight: 800,
                    color: change > 0 ? "#FCD34D" : "#fff",
                  }}>
                    MVR {change.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: tender + amount entry */}
          <div className="pos-charge-tender" style={{
            padding: 20, display: "flex", flexDirection: "column", gap: 14,
            background: "#F8FAFC", overflow: "auto",
          }}>
            <div>
              <p style={tinyLabel}>Tender</p>
              {/* Base tenders always share one equal-width row (iPad-friendly). */}
              <div
                className="pos-charge-tenders"
                style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.max(baseMethods.length, 1)}, minmax(0, 1fr))`,
                gap: 8,
              }}>
                {baseMethods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`pos-charge-tender-btn${method === m ? " pos-charge-tender-btn--active" : ""}`}
                    onClick={() => setMethod(m)}
                    style={{
                      padding: "12px 6px", borderRadius: 10,
                      background: method === m ? "#0F172A" : "#fff",
                      color: method === m ? "#fff" : "#0F172A",
                      border: `1px solid ${method === m ? "#0F172A" : "#CBD5E1"}`,
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                      minWidth: 0,
                    }}
                  >{METHOD_LABEL[m]}</button>
                ))}
              </div>
              {(creditEligible || walletEligible) && !isOffline && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {creditEligible && (
                    <button
                      onClick={() => setMethod("house_account")}
                      style={{
                        flex: "1 1 120px", padding: "12px 8px", borderRadius: 10,
                        background: method === "house_account" ? "#1D4ED8" : "#EFF6FF",
                        color: method === "house_account" ? "#fff" : "#1D4ED8",
                        border: `1px solid ${method === "house_account" ? "#1D4ED8" : "#BFDBFE"}`,
                        fontWeight: 700, fontSize: 13, cursor: "pointer",
                      }}
                    >Credit Account</button>
                  )}
                  {walletEligible && (
                    <button
                      onClick={() => setMethod("wallet")}
                      style={{
                        flex: "1 1 120px", padding: "12px 8px", borderRadius: 10,
                        background: method === "wallet" ? "#047857" : "#ECFDF5",
                        color: method === "wallet" ? "#fff" : "#047857",
                        border: `1px solid ${method === "wallet" ? "#047857" : "#A7F3D0"}`,
                        fontWeight: 700, fontSize: 13, cursor: "pointer",
                      }}
                    >{METHOD_LABEL.wallet}</button>
                  )}
                </div>
              )}
              {method === "house_account" && (
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 8,
                  background: creditOverLimit ? "#FEE2E2" : "#EFF6FF",
                  border: `1px solid ${creditOverLimit ? "#FCA5A5" : "#BFDBFE"}`,
                  fontSize: 12, color: creditOverLimit ? "#B91C1C" : "#1D4ED8",
                }}>
                  {creditOverLimit
                    ? `Amount exceeds available credit (MVR ${creditAvailableMvr.toFixed(2)}).`
                    : `Available credit: MVR ${creditAvailableMvr.toFixed(2)}`}
                </div>
              )}
              {method === "wallet" && (
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 8,
                  background: walletOverLimit ? "#FEE2E2" : "#ECFDF5",
                  border: `1px solid ${walletOverLimit ? "#FCA5A5" : "#A7F3D0"}`,
                  fontSize: 12, color: walletOverLimit ? "#B91C1C" : "#047857",
                }}>
                  {walletOverLimit
                    ? `No deposit balance available.`
                    : walletPartialPay
                      ? `Deposit balance MVR ${walletAvailableMvr.toFixed(2)} — remainder will be collected in cash.`
                      : `Deposit balance: MVR ${walletAvailableMvr.toFixed(2)}`}
                </div>
              )}
            </div>

            {isOffline && (
              <div style={{
                padding: "10px 12px", borderRadius: 8, background: "#FEF3C7",
                border: "1px solid #FDE68A", fontSize: 12, color: "#92400E",
              }}>
                Offline mode — cash, card, transfer, and QR only (manual record). Orders sync when internet returns.
              </div>
            )}

            {isOffline && (method === "card" || method === "qr" || method === "digital_wallet") && (
              <div style={{ fontSize: 12, color: "#64748B" }}>
                Payment must already be received — will sync when online.
              </div>
            )}

            {method !== "cash" && method !== "house_account" && method !== "wallet" && !isOffline && tenderAllowed.split && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 12px", borderRadius: 10, background: "#fff",
                border: "1px solid #E2E8F0",
              }}>
                <input
                  type="checkbox" id="split-tender" checked={split}
                  onChange={(e) => setSplit(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <label htmlFor="split-tender" style={{
                  fontSize: 13, color: "#0F172A", fontWeight: 600, cursor: "pointer",
                }}>
                  Split with cash
                </label>
              </div>
            )}

            {split && method !== "cash" && method !== "house_account" && method !== "wallet" && !isOffline && tenderAllowed.split && (
              <div>
                <p style={tinyLabel}>{METHOD_LABEL[method]} amount (rest paid in cash)</p>
                <CashInput
                  value={splitAmount}
                  onChange={setSplitAmount}
                  placeholder="0.00"
                />
                {splitValid && (
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "#64748B" }}>
                    + MVR {fromLaari(toLaari(total) - toLaari(splitNum)).toFixed(2)} cash
                  </p>
                )}
              </div>
            )}

            {method === "cash" && fullyCovered && (
              <div style={{
                padding: "12px 14px", borderRadius: 10,
                background: "#ECFDF5", border: "1px solid #A7F3D0",
                color: "#065F46", fontSize: 13, fontWeight: 600,
              }}>
                Nothing to collect — covered by rewards/gift card
              </div>
            )}

            {method === "cash" && !fullyCovered && (
              <>
                <div>
                  <p style={tinyLabel}>Received from customer</p>
                  <CashInput
                    autoFocus
                    value={received}
                    onChange={setReceived}
                    placeholder="0.00"
                  />
                </div>

                <div className="pos-charge-quick-amounts">
                  <p style={tinyLabel}>Quick amounts</p>
                  <div className="pos-charge-quick-grid">
                    {quick.map((q) => {
                      const isExact = Math.abs(q - total) < 0.005;
                      return (
                        <button
                          key={q}
                          type="button"
                          className="pos-charge-quick-btn"
                          onClick={() => setReceived(q.toFixed(2))}
                          style={{
                            fontWeight: 700,
                            background: isExact ? "#0F172A" : "#fff",
                            color: isExact ? "#fff" : "#0F172A",
                            border: `1px solid ${isExact ? "#0F172A" : "#CBD5E1"}`,
                            cursor: "pointer",
                          }}
                        >
                          <span className="pos-charge-quick-btn-label">{fmtChip(q)}</span>
                          {isExact && (
                            <span className="pos-charge-quick-exact" aria-hidden="true">EXACT</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {method !== "cash" && method !== "house_account" && method !== "wallet" && !split && (
              <div style={{
                padding: 14, borderRadius: 10, background: "#fff",
                border: "1px solid #E2E8F0", fontSize: 13, color: "#475569",
                lineHeight: 1.5,
              }}>
                Take the {METHOD_LABEL[method].toLowerCase()} payment for{" "}
                <strong>MVR {total.toFixed(2)}</strong>, then tap "Confirm payment".
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pos-charge-footer" style={{
          padding: 16, borderTop: "1px solid #E2E8F0", background: "#fff",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {/* Inline error banner — surfaces anything handleCharge sets
              into statusMessage while the overlay is open (table
              required, device blocked, server rejected, network down,
              etc). Without this the overlay would silently swallow
              failures because it covers the main app's banner area. */}
          {pendingPaymentOrderId != null && (
            <div role="status" style={{
              padding: "10px 12px", borderRadius: 8,
              background: "#FEF3C7", border: "1px solid #FCD34D",
              color: "#92400E", fontSize: 13, fontWeight: 600,
              animation: "pos-fade-in 0.18s ease",
            }}>
              Payment didn&apos;t complete for order #{pendingPaymentOrderId}. Confirm will retry the payment only — no new order will be created.
            </div>
          )}
          {rewardWarning && (
            <div role="status" style={{
              padding: "10px 12px", borderRadius: 8,
              background: "#FFFBEB", border: "1px solid #F59E0B",
              color: "#92400E", fontSize: 13, fontWeight: 600,
              animation: "pos-fade-in 0.18s ease",
            }}>
              {rewardWarning}
            </div>
          )}
          {errorMessage && (
            <div role="alert" style={{
              padding: "10px 12px", borderRadius: 8,
              background: "#FEE2E2", border: "1px solid #FCA5A5",
              color: "#B91C1C", fontSize: 13, fontWeight: 600,
              animation: "pos-fade-in 0.18s ease",
            }}>
              ⛔ {errorMessage}
            </div>
          )}
          <div className="pos-charge-footer-actions" style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="pos-charge-cancel"
              onClick={onClose}
              disabled={submitting}
              style={{
              flex: 1, padding: "14px 18px", borderRadius: 12,
              background: "#fff", border: "1px solid #CBD5E1", color: "#475569",
              fontWeight: 600, fontSize: 15, cursor: "pointer",
            }}>Cancel</button>
            <button
              type="button"
              className="pos-charge-confirm"
              onClick={confirm}
              disabled={(!enough && !splitValid && !canConfirmAccountTender) || submitting || creditOverLimit || walletOverLimit}
              style={{
              flex: 2, padding: "14px 18px", borderRadius: 12,
              background: ((!enough && !splitValid && !canConfirmAccountTender) || submitting || creditOverLimit || walletOverLimit) ? "#A7F3D0" : "#10B981",
              color: "#fff", border: "none",
              fontWeight: 800, fontSize: 16, letterSpacing: "0.04em",
              cursor: ((!enough && !splitValid && !canConfirmAccountTender) || submitting || creditOverLimit || walletOverLimit) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              flexWrap: "wrap",
              textAlign: "center",
              lineHeight: 1.25,
            }}>
              {submitting ? (
                <>
                  {/* Bug-018: an actual spinning indicator alongside
                      the text. Without it cashiers couldn't tell if
                      the tap registered (some hit the button again
                      and silently double-fired the charge on flaky
                      networks before the disabled state landed). */}
                  <span
                    aria-hidden="true"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.4)",
                      borderTopColor: "#fff",
                      animation: "pos-spin 0.7s linear infinite",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span>PROCESSING…</span>
                </>
              ) : total <= 0
                /* Bug-051: when promo / loyalty / gift card cover
                   the bill entirely the total is 0.00. The old
                   label read "CONFIRM PAYMENT — MVR 0.00" which
                   confused cashiers ("collect zero rufiyaa from
                   them?"). Spell it out so the action matches
                   the actual settlement (just close the bill). */
                ? "FINALISE — FULLY COVERED"
                : (
                  <span className="pos-charge-confirm-label">
                    <span>CONFIRM PAYMENT</span>
                    <span>MVR {total.toFixed(2)}</span>
                  </span>
                )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const tinyLabel: React.CSSProperties = {
  margin: "0 0 6px", fontSize: 11, fontWeight: 700,
  color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em",
};

function Line({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const sign = value < 0 ? "− " : "";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <span style={{ color: "#94A3B8", fontWeight: 600 }}>{label}</span>
      <span style={{ color: accent ?? "#F8FAFC", fontVariantNumeric: "tabular-nums" }}>
        {sign}MVR {Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}
