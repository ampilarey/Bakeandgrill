import { useMemo, useState } from "react";
import { Card, Field, Overlay } from "./OpenShiftModal";
import { CashInput } from "./CashInput";
import type { ShiftSummary } from "../hooks/useShift";
import {
  COMMON_COIN_DENOMS_LAARI,
  NOTE_DENOMS_LAARI,
  RARE_COIN_DENOMS_LAARI,
  breakdownPayload,
  formatForeignHeldSummary,
  fromLaari,
  hasAnyDenomEntry,
  labelForLaari,
  parseCount,
  toLaari,
  totalLaariFromCounts,
  type CashCountMethod,
  type DenomCounts,
  type ForeignCurrencyRow,
} from "../utils/cashDenominations";

export type CloseShiftConfirmPayload = {
  closingCash: number;
  notes?: string;
  cashCountMethod: CashCountMethod;
  denominations?: Record<string, number>;
  foreignCurrency?: Array<{
    currency: string;
    denomination: number;
    count: number;
    accepted_mvr: number;
  }>;
};

type Props = {
  summary: ShiftSummary | null;
  pendingOfflineCount?: number;
  pendingOfflineCashTotal?: number;
  pendingOfflineCardTotal?: number;
  pendingOfflineTransferTotal?: number;
  onSyncNow?: () => void;
  onConfirm: (payload: CloseShiftConfirmPayload) => Promise<void>;
  onCancel: () => void;
};

/**
 * Blind cash count via denomination breakdown (default) or plain total.
 * Expected drawer total stays hidden until a count is entered.
 */
export function CloseShiftModal({
  summary,
  pendingOfflineCount = 0,
  pendingOfflineCashTotal = 0,
  pendingOfflineCardTotal = 0,
  pendingOfflineTransferTotal = 0,
  onSyncNow,
  onConfirm,
  onCancel,
}: Props) {
  const [method, setMethod] = useState<CashCountMethod>("denominations");
  const [counts, setCounts] = useState<DenomCounts>({});
  const [plainTotal, setPlainTotal] = useState("");
  const [showRareCoins, setShowRareCoins] = useState(false);
  const [showForeign, setShowForeign] = useState(false);
  const [foreignRows, setForeignRows] = useState<ForeignCurrencyRow[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const expected = Number(summary?.cash_drawer.expected_cash ?? 0);
  const expectedLaari = toLaari(expected);

  const countedLaari = useMemo(() => {
    if (method === "denominations") return totalLaariFromCounts(counts);
    const n = Number.parseFloat(plainTotal);
    if (plainTotal.trim() === "" || !Number.isFinite(n) || n < 0) return null;
    return toLaari(n);
  }, [method, counts, plainTotal]);

  const hasCount =
    method === "denominations"
      ? hasAnyDenomEntry(counts)
      : plainTotal.trim() !== "" && countedLaari != null;

  const closing = hasCount && countedLaari != null ? fromLaari(countedLaari) : null;
  const varianceLaari =
    hasCount && countedLaari != null ? countedLaari - expectedLaari : null;
  const variance = varianceLaari != null ? fromLaari(varianceLaari) : null;

  const foreignPayload = useMemo(() => {
    return foreignRows
      .map((r) => {
        const denomination = Number.parseFloat(r.denomination);
        const count = parseCount(r.count);
        const accepted = Number.parseFloat(r.accepted_mvr);
        if (!r.currency.trim() || !Number.isFinite(denomination) || count < 1) return null;
        if (!Number.isFinite(accepted) || accepted < 0) return null;
        return {
          currency: r.currency.trim().toUpperCase().slice(0, 3),
          denomination,
          count,
          accepted_mvr: accepted,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [foreignRows]);

  const foreignSummary = formatForeignHeldSummary(foreignPayload);

  const setCount = (face: number, raw: string) => {
    if (raw !== "" && !/^\d{0,5}$/.test(raw)) return;
    setCounts((prev) => ({ ...prev, [face]: raw }));
    setErr("");
  };

  const submit = async () => {
    if (pendingOfflineCount > 0) {
      setErr(`Sync ${pendingOfflineCount} offline order${pendingOfflineCount === 1 ? "" : "s"} before closing the shift.`);
      return;
    }
    if (!hasCount || closing == null || countedLaari == null) {
      setErr(method === "denominations"
        ? "Enter the count for each denomination in the drawer."
        : "Enter the cash you counted in the drawer.");
      return;
    }
    if (varianceLaari != null && Math.abs(varianceLaari) >= 1 && !notes.trim()) {
      setErr("Enter a reason for the cash variance before closing.");
      return;
    }
    setBusy(true);
    try {
      await onConfirm({
        closingCash: closing,
        notes: notes.trim() || undefined,
        cashCountMethod: method,
        denominations: method === "denominations" ? breakdownPayload(counts) : undefined,
        foreignCurrency: foreignPayload.length ? foreignPayload : undefined,
      });
    } catch (e) {
      setErr((e as Error).message || "Could not close shift.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay>
      <Card
        title="Close shift"
        subtitle="Count the notes and coins in the drawer. The expected amount stays hidden until you enter a count."
      >
        {hasCount && (
          <>
            <Summary label="Opening cash" value={Number(summary?.cash_drawer.opening_cash ?? 0)} />
            <Summary label="+ Cash sales" value={Number(summary?.cash_drawer.cash_sales ?? 0)} />
            {Number(summary?.cash_drawer.paid_in ?? 0) > 0 && <Summary label="+ Paid in" value={Number(summary!.cash_drawer.paid_in)} />}
            {Number(summary?.cash_drawer.credit_repayments_cash ?? 0) > 0 && (
              <Summary
                label="  incl. credit repayments (cash)"
                value={Number(summary!.cash_drawer.credit_repayments_cash ?? 0)}
              />
            )}
            {Number(summary?.cash_drawer.paid_out ?? 0) > 0 && <Summary label="− Paid out" value={Number(summary!.cash_drawer.paid_out)} negative />}
            {Number(summary?.cash_drawer.cash_refunds ?? 0) > 0 && <Summary label="− Refunds" value={Number(summary!.cash_drawer.cash_refunds)} negative />}
            <Summary label="Expected in drawer" value={expected} bold />
          </>
        )}

        {pendingOfflineCount > 0 && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: "#FEE2E2", color: "#B91C1C", fontSize: 13,
          }}>
            {pendingOfflineCount} offline order{pendingOfflineCount === 1 ? "" : "s"} not synced yet.
            {pendingOfflineCashTotal > 0 && (
              <div style={{ marginTop: 4 }}>Pending cash: MVR {pendingOfflineCashTotal.toFixed(2)}</div>
            )}
            {(pendingOfflineCardTotal > 0 || pendingOfflineTransferTotal > 0) && (
              <div style={{ marginTop: 4, color: "#991B1B" }}>
                Pending card/QR MVR {pendingOfflineCardTotal.toFixed(2)} · transfer MVR {pendingOfflineTransferTotal.toFixed(2)}
              </div>
            )}
            {onSyncNow && (
              <button
                type="button"
                onClick={onSyncNow}
                style={{
                  marginTop: 8, padding: "8px 12px", borderRadius: 8, border: "none",
                  background: "#B91C1C", color: "#fff", fontWeight: 700, cursor: "pointer",
                }}
              >
                Sync now
              </button>
            )}
          </div>
        )}

        {Number(summary?.open_unpaid_orders ?? 0) > 0 && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: "#FEF3C7", color: "#92400E", fontSize: 13,
          }}>
            This shift has {summary!.open_unpaid_orders} open unpaid order
            {summary!.open_unpaid_orders === 1 ? "" : "s"} created during it.
            They will stay active and can be paid by another staff shift.
          </div>
        )}

        <div style={{ marginTop: 14, marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
            {method === "denominations" ? "Denomination count" : "Counted cash total"}
          </div>
          <button
            type="button"
            data-testid="close-shift-method-toggle"
            onClick={() => {
              setMethod((m) => (m === "denominations" ? "plain_total" : "denominations"));
              setErr("");
            }}
            style={{
              border: "none", background: "transparent", color: "#64748B",
              fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline",
              padding: 0,
            }}
          >
            {method === "denominations" ? "Enter total instead" : "Count by denomination"}
          </button>
        </div>

        {method === "denominations" ? (
          <div data-testid="close-shift-denomination-grid">
            <DenomSection title="Notes" faces={[...NOTE_DENOMS_LAARI]} counts={counts} onChange={setCount} />
            <DenomSection title="Coins" faces={[...COMMON_COIN_DENOMS_LAARI]} counts={counts} onChange={setCount} />
            <button
              type="button"
              data-testid="close-shift-more-coins"
              onClick={() => setShowRareCoins((v) => !v)}
              style={{
                marginTop: 8, border: "none", background: "transparent",
                color: "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer",
                padding: 0, textDecoration: "underline",
              }}
            >
              {showRareCoins ? "Hide rare coins" : "More coins"}
            </button>
            {showRareCoins && (
              <DenomSection title="Rare coins" faces={[...RARE_COIN_DENOMS_LAARI]} counts={counts} onChange={setCount} />
            )}
            <div
              data-testid="close-shift-running-total"
              style={{
                marginTop: 12, padding: "10px 12px", borderRadius: 8,
                background: "#F1F5F9", color: "#0F172A",
                display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700,
              }}
            >
              <span>Running total</span>
              <span>MVR {fromLaari(totalLaariFromCounts(counts)).toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <Field label="Counted cash">
            <CashInput
              autoFocus
              value={plainTotal}
              onChange={(v) => { setPlainTotal(v); setErr(""); }}
            />
            <div style={{ marginTop: 6, fontSize: 11, color: "#64748B" }}>
              Escape hatch for a chaotic till. Prefer counting by denomination when you can.
            </div>
          </Field>
        )}

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            data-testid="close-shift-foreign-toggle"
            onClick={() => setShowForeign((v) => !v)}
            style={{
              border: "none", background: "transparent", color: "#64748B",
              fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0,
              textDecoration: "underline",
            }}
          >
            {showForeign ? "Hide foreign currency" : "Foreign currency held (optional)"}
          </button>
          {showForeign && (
            <div data-testid="close-shift-foreign-section" style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, lineHeight: 1.4 }}>
                Record only — does not change expected cash, counted cash, or variance.
                Enter the MVR value you accepted it as at the till.
              </div>
              {foreignRows.map((row, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "70px 1fr 70px 1fr auto", gap: 6, marginBottom: 6 }}>
                  <input
                    aria-label={`Foreign currency ${idx + 1}`}
                    value={row.currency}
                    onChange={(e) => {
                      const next = [...foreignRows];
                      next[idx] = { ...row, currency: e.target.value.toUpperCase().slice(0, 3) };
                      setForeignRows(next);
                    }}
                    placeholder="USD"
                    style={fxInput}
                  />
                  <input
                    aria-label={`Foreign denomination ${idx + 1}`}
                    value={row.denomination}
                    onChange={(e) => {
                      const next = [...foreignRows];
                      next[idx] = { ...row, denomination: e.target.value };
                      setForeignRows(next);
                    }}
                    placeholder="Denom"
                    inputMode="decimal"
                    style={fxInput}
                  />
                  <input
                    aria-label={`Foreign count ${idx + 1}`}
                    value={row.count}
                    onChange={(e) => {
                      if (e.target.value !== "" && !/^\d{0,4}$/.test(e.target.value)) return;
                      const next = [...foreignRows];
                      next[idx] = { ...row, count: e.target.value };
                      setForeignRows(next);
                    }}
                    placeholder="Qty"
                    inputMode="numeric"
                    style={fxInput}
                  />
                  <input
                    aria-label={`Accepted MVR ${idx + 1}`}
                    value={row.accepted_mvr}
                    onChange={(e) => {
                      const next = [...foreignRows];
                      next[idx] = { ...row, accepted_mvr: e.target.value };
                      setForeignRows(next);
                    }}
                    placeholder="Accepted MVR"
                    inputMode="decimal"
                    style={fxInput}
                  />
                  <button
                    type="button"
                    aria-label={`Remove foreign row ${idx + 1}`}
                    onClick={() => setForeignRows(foreignRows.filter((_, i) => i !== idx))}
                    style={{ border: "none", background: "transparent", color: "#94A3B8", cursor: "pointer", fontSize: 16 }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForeignRows([...foreignRows, { currency: "USD", denomination: "", count: "1", accepted_mvr: "" }])}
                style={{
                  marginTop: 4, border: "1px dashed #CBD5E1", background: "#fff",
                  borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 600,
                  color: "#475569", cursor: "pointer", width: "100%",
                }}
              >
                + Add foreign note
              </button>
            </div>
          )}
        </div>

        {variance != null && (
          <div
            data-testid="close-shift-variance"
            style={{
              marginTop: 12, padding: "10px 12px", borderRadius: 8,
              background: Math.abs(variance) < 0.005 ? "#DCFCE7"
                : variance > 0 ? "#FEF3C7" : "#FEE2E2",
              color: Math.abs(variance) < 0.005 ? "#15803D"
                : variance > 0 ? "#92400E" : "#B91C1C",
              fontSize: 13, fontWeight: 700,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Variance</span>
              <span>{variance >= 0 ? "+" : ""}MVR {variance.toFixed(2)}</span>
            </div>
            {foreignSummary && Math.abs(variance) >= 0.005 && (
              <div data-testid="close-shift-fx-beside-variance" style={{ marginTop: 6, fontWeight: 600, fontSize: 12, opacity: 0.9 }}>
                {variance < 0 ? `Short MVR ${Math.abs(variance).toFixed(2)}` : `Over MVR ${variance.toFixed(2)}`}
                {" · "}
                {foreignSummary}
              </div>
            )}
          </div>
        )}

        <Field label={variance != null && Math.abs(variance) >= 0.005 ? "Variance reason (required)" : "Notes (optional)"}>
          <input
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setErr(""); }}
            placeholder={
              variance != null && Math.abs(variance) >= 0.005
                ? "e.g. Short change / found cash on floor"
                : "e.g. Found MVR 10 on floor"
            }
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 14px", borderRadius: 10,
              border: variance != null && Math.abs(variance) >= 0.005 && !notes.trim()
                ? "1.5px solid #F87171"
                : "1px solid #CBD5E1",
              fontSize: 14, background: "#fff",
            }}
          />
        </Field>

        {err && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#FEE2E2", color: "#B91C1C", fontSize: 13 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onCancel} disabled={busy} style={{
            flex: 1, padding: "12px 18px", borderRadius: 10,
            border: "1px solid #CBD5E1", background: "#fff", color: "#475569",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{
            flex: 1, padding: "12px 18px", borderRadius: 10,
            border: "none", background: "#EF4444", color: "#fff",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>{busy ? "Closing…" : "Close shift"}</button>
        </div>
      </Card>
    </Overlay>
  );
}

const fxInput: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "8px 10px", borderRadius: 8,
  border: "1px solid #CBD5E1", fontSize: 13, background: "#fff",
};

function DenomSection({
  title,
  faces,
  counts,
  onChange,
}: {
  title: string;
  faces: number[];
  counts: DenomCounts;
  onChange: (face: number, raw: string) => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {faces.map((face) => (
          <label
            key={face}
            style={{
              display: "grid", gridTemplateColumns: "100px 1fr 90px", gap: 8, alignItems: "center",
              fontSize: 13, color: "#334155",
            }}
          >
            <span style={{ fontWeight: 600 }}>{labelForLaari(face)}</span>
            <input
              data-testid={`denom-count-${face}`}
              aria-label={`Count of ${labelForLaari(face)}`}
              inputMode="numeric"
              value={counts[face] ?? ""}
              placeholder="0"
              onChange={(e) => onChange(face, e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "10px 12px", borderRadius: 8,
                border: "1px solid #CBD5E1", fontSize: 15, fontWeight: 600,
                background: "#fff", textAlign: "right",
              }}
            />
            <span style={{ textAlign: "right", color: "#64748B", fontSize: 12 }}>
              {parseCount(counts[face]) > 0
                ? `MVR ${fromLaari(face * parseCount(counts[face])).toFixed(2)}`
                : ""}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Summary({ label, value, bold, negative }: { label: string; value: number; bold?: boolean; negative?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "6px 0",
      fontSize: 13, color: bold ? "#0F172A" : "#475569",
      fontWeight: bold ? 700 : 500,
      borderTop: bold ? "1px solid #E2E8F0" : "none",
      marginTop: bold ? 6 : 0,
    }}>
      <span>{label}</span>
      <span>{negative ? "−" : ""}MVR {Math.abs(value).toFixed(2)}</span>
    </div>
  );
}
