import { useEffect, useMemo, useRef, useState } from "react";
import { CashInput } from "./CashInput";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { z } from "../theme";

export type ChargeMethod = "cash" | "card" | "digital_wallet" | "house_account";

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
  /** Show Credit Account tender when customer is approved for credit. */
  creditEligible?: boolean;
  creditAvailableMvr?: number;
  /** When true, only cash / card / transfer are offered. */
  isOffline?: boolean;
  /** Optional delivery fee line (POS phone-in delivery). */
  deliveryFee?: number;
  onClose: () => void;
  onConfirm: (rows: Array<{ method: ChargeMethod; amount: number }>) => Promise<void>;
  submitting: boolean;
  /** Optional inline error to surface inside the overlay. The overlay
   *  is z-index 900 (covers the cart status banner area), so without
   *  this any failure in handleCharge would look like "the Confirm
   *  button did nothing". Caller wires this to the order hook's
   *  statusMessage so device-blocked / table / network errors land
   *  on the cashier's screen. */
  errorMessage?: string;
};

const METHOD_LABEL: Record<ChargeMethod, string> = {
  cash: "Cash",
  card: "Card",
  digital_wallet: "Transfer",
  house_account: "Credit Account",
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
  deliveryFee,
  creditEligible = false,
  creditAvailableMvr = 0,
  isOffline = false,
  onClose,
  onConfirm,
  submitting,
  errorMessage,
}: Props) {
  const showBreakdown =
    (typeof subtotal === "number" && (
      subtotal !== total
      || (tax ?? 0) > 0
      || (discount ?? 0) > 0
      || (deliveryFee ?? 0) > 0
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
  const change = useMemo(() => {
    if (method !== "cash") return 0;
    if (!Number.isFinite(receivedNum)) return 0;
    const diff = toLaari(receivedNum) - toLaari(total);
    return diff > 0 ? fromLaari(diff) : 0;
  }, [method, receivedNum, total]);

  const enough = method === "cash"
    ? Number.isFinite(receivedNum) && receivedNum >= total
    : true;

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
    && Number.isFinite(splitNum)
    && splitNum > 0
    && splitNum < total;

  const creditOverLimit = method === "house_account" && total > creditAvailableMvr + 0.001;
  const canConfirmCredit = method === "house_account" && creditEligible && !creditOverLimit && total > 0;

  const confirm = async () => {
    // Split tender: send TWO rows — the requested non-cash portion +
    // the remainder as cash. settleOrder() already top-ups any
    // shortfall with cash, but being explicit here means the server
    // sees the actual split the cashier chose, which is what shows up
    // in the day's tender breakdown report.
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
    if (!enough && !splitValid && !canConfirmCredit) return;
    const amount = method === "cash"
      ? Math.max(total, receivedNum) // record what the cashier collected
      : total;
    // We only send `total` to the payments endpoint; over-tender
    // is "change given" which the server doesn't store as a separate row.
    await onConfirm([{ method, amount: total }]);
    void amount;
  };

  // Bug-035: trap Tab inside the charge overlay so keyboard focus
  // can't slip behind to the (hidden) sales UI mid-payment. Esc is
  // still gated on `submitting` via the existing useEffect.
  const trapRef = useRef<HTMLDivElement>(null);
  useFocusTrap(trapRef, true);

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label="Charge"
      style={{
        position: "fixed", inset: 0, zIndex: z.overlay,
        background: "rgba(15,23,42,0.65)",
        display: "flex", alignItems: "stretch", justifyContent: "stretch",
      }}
    >
      <div className="pos-charge" style={{
        margin: "auto", background: "#fff", width: "100%", maxWidth: 760, maxHeight: "100%",
        borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid #E2E8F0",
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#0F172A" }}>Charge</h2>
          <button onClick={onClose} disabled={submitting} style={{
            background: "none", border: "none", color: "#64748B",
            fontSize: 20, cursor: "pointer", lineHeight: 1,
          }} aria-label="Close charge screen">×</button>
        </div>

        {/* Body */}
        <div className="pos-charge-grid" style={{
          flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0,
          gap: 0,
        }}>
          {/* LEFT: total + change */}
          <div style={{
            padding: 24, display: "flex", flexDirection: "column",
            justifyContent: "center", alignItems: "stretch", background: "#0F172A",
            color: "#fff",
          }}>
            {showBreakdown && (
              <div style={{
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
                {(deliveryFee ?? 0) > 0 && (
                  <Line label="Delivery fee" value={deliveryFee ?? 0} />
                )}
                {(tax ?? 0) > 0 && (
                  <Line label="GST" value={tax ?? 0} />
                )}
              </div>
            )}
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>
              Amount due
            </p>
            <p style={{ margin: "8px 0 0", fontSize: 48, fontWeight: 800, letterSpacing: "-0.02em" }}>
              MVR {total.toFixed(2)}
            </p>

            {method === "cash" && (
              <>
                <p style={{ margin: "28px 0 0", fontSize: 12, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8" }}>
                  Change due
                </p>
                <p style={{
                  margin: "8px 0 0", fontSize: 40, fontWeight: 800,
                  color: change > 0 ? "#FCD34D" : "#fff",
                }}>
                  MVR {change.toFixed(2)}
                </p>
              </>
            )}
          </div>

          {/* RIGHT: tender + amount entry */}
          <div style={{
            padding: 20, display: "flex", flexDirection: "column", gap: 14,
            background: "#F8FAFC", overflow: "auto",
          }}>
            <div>
              <p style={tinyLabel}>Tender</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["cash", "card", "digital_wallet"] as ChargeMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    style={{
                      flex: "1 1 80px", padding: "12px 8px", borderRadius: 10,
                      background: method === m ? "#0F172A" : "#fff",
                      color: method === m ? "#fff" : "#0F172A",
                      border: `1px solid ${method === m ? "#0F172A" : "#CBD5E1"}`,
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}
                  >{METHOD_LABEL[m]}</button>
                ))}
                {creditEligible && !isOffline && (
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
              </div>
              {method === "house_account" && (
                <div style={{
                  marginTop: 8, padding: "10px 12px", borderRadius: 8,
                  background: creditOverLimit ? "#FEE2E2" : "#EFF6FF",
                  border: `1px solid ${creditOverLimit ? "#FCA5A5" : "#BFDBFE"}`,
                  fontSize: 12, color: creditOverLimit ? "#B91C1C" : "#1D4ED8",
                }}>
                  {creditOverLimit
                    ? `This customer is not approved for credit. Available: MVR ${creditAvailableMvr.toFixed(2)}.`
                    : `Available credit: MVR ${creditAvailableMvr.toFixed(2)}`}
                </div>
              )}
            </div>

            {isOffline && (
              <div style={{
                padding: "10px 12px", borderRadius: 8, background: "#FEF3C7",
                border: "1px solid #FDE68A", fontSize: 12, color: "#92400E",
              }}>
                Offline mode — cash, card, and transfer only (manual record). Orders sync when internet returns.
              </div>
            )}

            {isOffline && (method === "card" || method === "digital_wallet") && (
              <div style={{ fontSize: 12, color: "#64748B" }}>
                Payment must already be received — will sync when online.
              </div>
            )}

            {method !== "cash" && method !== "house_account" && !isOffline && (
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

            {split && method !== "cash" && method !== "house_account" && !isOffline && (
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

            {method === "cash" && (
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

                <div>
                  <p style={tinyLabel}>Quick amounts</p>
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
                  }}>
                    {quick.map((q) => {
                      const isExact = Math.abs(q - total) < 0.005;
                      return (
                        <button
                          key={q}
                          onClick={() => setReceived(q.toFixed(2))}
                          style={{
                            padding: "14px 6px", borderRadius: 8, fontWeight: 700,
                            background: isExact ? "#0F172A" : "#fff",
                            color: isExact ? "#fff" : "#0F172A",
                            border: `1px solid ${isExact ? "#0F172A" : "#CBD5E1"}`,
                            cursor: "pointer", fontSize: 13,
                            minHeight: 48,
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center", gap: 2,
                          }}
                        >
                          <span>{fmtChip(q)}</span>
                          {isExact && (
                            <span style={{
                              fontSize: 10, fontWeight: 600,
                              opacity: 0.8, letterSpacing: "0.06em",
                            }}>EXACT</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {method !== "cash" && method !== "house_account" && !split && (
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
        <div style={{
          padding: 16, borderTop: "1px solid #E2E8F0", background: "#fff",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {/* Inline error banner — surfaces anything handleCharge sets
              into statusMessage while the overlay is open (table
              required, device blocked, server rejected, network down,
              etc). Without this the overlay would silently swallow
              failures because it covers the main app's banner area. */}
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
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} disabled={submitting} style={{
              flex: 1, padding: "14px 18px", borderRadius: 12,
              background: "#fff", border: "1px solid #CBD5E1", color: "#475569",
              fontWeight: 600, fontSize: 15, cursor: "pointer",
            }}>Cancel</button>
            <button onClick={confirm} disabled={(!enough && !splitValid && !canConfirmCredit) || submitting || creditOverLimit} style={{
              flex: 2, padding: "14px 18px", borderRadius: 12,
              background: ((!enough && !splitValid && !canConfirmCredit) || submitting || creditOverLimit) ? "#A7F3D0" : "#10B981",
              color: "#fff", border: "none",
              fontWeight: 800, fontSize: 16, letterSpacing: "0.04em",
              cursor: ((!enough && !splitValid && !canConfirmCredit) || submitting || creditOverLimit) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
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
                : `CONFIRM PAYMENT — MVR ${total.toFixed(2)}`}
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
