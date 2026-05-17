import { useEffect, useMemo, useState } from "react";

export type ChargeMethod = "cash" | "card" | "digital_wallet";

type Props = {
  total: number;
  onClose: () => void;
  onConfirm: (rows: Array<{ method: ChargeMethod; amount: number }>) => Promise<void>;
  submitting: boolean;
};

const METHOD_LABEL: Record<ChargeMethod, string> = {
  cash: "Cash",
  card: "Card",
  digital_wallet: "Transfer",
};

/**
 * Full-screen charge screen, the way every Loyverse-style POS works.
 * The cashier sees ONE huge number (the amount due), taps the tender,
 * optionally enters a received amount for cash, and gets a giant
 * change-due readout. The previous flow buried payment inputs in the
 * tiny cart sidebar — too cramped for a real counter.
 */
export function ChargeOverlay({ total, onClose, onConfirm, submitting }: Props) {
  const [method, setMethod] = useState<ChargeMethod>("cash");
  const [received, setReceived] = useState<string>(total > 0 ? total.toFixed(2) : "");

  // Reset the received-amount input whenever the total or method changes —
  // otherwise a stale value from a prior order can linger.
  useEffect(() => { setReceived(total > 0 ? total.toFixed(2) : ""); }, [total, method]);

  // Esc closes; useful for keyboard-driven counters.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const receivedNum = Number.parseFloat(received);
  const change = useMemo(() => {
    if (method !== "cash") return 0;
    if (!Number.isFinite(receivedNum)) return 0;
    return Math.max(0, receivedNum - total);
  }, [method, receivedNum, total]);

  const enough = method === "cash"
    ? Number.isFinite(receivedNum) && receivedNum >= total
    : true;

  // Quick-amount buttons: exact total + a few sensible bills around it.
  // Loyverse uses (exact, +5, +10, +20, round up to nearest 10/50/100).
  const quick = useMemo(() => {
    const set = new Set<number>();
    set.add(total);
    [5, 10, 20, 50, 100].forEach((bump) => set.add(Math.ceil(total / 1) + bump));
    // Round-up suggestions
    [10, 50, 100, 500].forEach((step) => set.add(Math.ceil(total / step) * step));
    return Array.from(set).filter((v) => v >= total).sort((a, b) => a - b).slice(0, 6);
  }, [total]);

  const confirm = async () => {
    if (!enough) return;
    const amount = method === "cash"
      ? Math.max(total, receivedNum) // record what the cashier collected
      : total;
    // We only send `total` to the payments endpoint though; over-tender
    // is "change given" which the server doesn't store as a separate row.
    await onConfirm([{ method, amount: total }]);
    void amount;
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 900,
      background: "rgba(15,23,42,0.65)",
      display: "flex", alignItems: "stretch", justifyContent: "stretch",
    }}>
      <div style={{
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
        <div style={{
          flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0,
          gap: 0,
        }}>
          {/* LEFT: total + change */}
          <div style={{
            padding: 24, display: "flex", flexDirection: "column",
            justifyContent: "center", alignItems: "stretch", background: "#0F172A",
            color: "#fff",
          }}>
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
              <div style={{ display: "flex", gap: 8 }}>
                {(["cash", "card", "digital_wallet"] as ChargeMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    style={{
                      flex: 1, padding: "12px 8px", borderRadius: 10,
                      background: method === m ? "#0F172A" : "#fff",
                      color: method === m ? "#fff" : "#0F172A",
                      border: `1px solid ${method === m ? "#0F172A" : "#CBD5E1"}`,
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}
                  >{METHOD_LABEL[m]}</button>
                ))}
              </div>
            </div>

            {method === "cash" && (
              <>
                <div>
                  <p style={tinyLabel}>Received from customer</p>
                  <input
                    autoFocus
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    style={{
                      width: "100%", boxSizing: "border-box",
                      padding: "14px 16px", borderRadius: 10,
                      border: "1px solid #CBD5E1", fontSize: 28, fontWeight: 700,
                      textAlign: "right", background: "#fff",
                    }}
                  />
                </div>

                <div>
                  <p style={tinyLabel}>Quick amounts</p>
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
                  }}>
                    {quick.map((q) => (
                      <button
                        key={q}
                        onClick={() => setReceived(q.toFixed(2))}
                        style={{
                          padding: "12px 6px", borderRadius: 8, fontWeight: 600,
                          background: "#fff", color: "#0F172A",
                          border: "1px solid #CBD5E1", cursor: "pointer", fontSize: 13,
                        }}
                      >MVR {q.toFixed(0)}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {method !== "cash" && (
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
          display: "flex", gap: 10,
        }}>
          <button onClick={onClose} disabled={submitting} style={{
            flex: 1, padding: "14px 18px", borderRadius: 12,
            background: "#fff", border: "1px solid #CBD5E1", color: "#475569",
            fontWeight: 600, fontSize: 15, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={confirm} disabled={!enough || submitting} style={{
            flex: 2, padding: "14px 18px", borderRadius: 12,
            background: !enough || submitting ? "#A7F3D0" : "#10B981",
            color: "#fff", border: "none",
            fontWeight: 800, fontSize: 16, letterSpacing: "0.04em",
            cursor: !enough || submitting ? "not-allowed" : "pointer",
          }}>
            {submitting ? "PROCESSING…" : `CONFIRM PAYMENT — MVR ${total.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const tinyLabel: React.CSSProperties = {
  margin: "0 0 6px", fontSize: 11, fontWeight: 700,
  color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em",
};
