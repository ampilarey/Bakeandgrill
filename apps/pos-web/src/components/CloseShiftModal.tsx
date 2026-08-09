import { useMemo, useState } from "react";
import { Field, Overlay } from "./OpenShiftModal";
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
 * Mobile: dense one-line rows + sticky integer pad (no OS keyboard).
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
  const [showExpected, setShowExpected] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [foreignRows, setForeignRows] = useState<ForeignCurrencyRow[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** Selected face for the sticky count pad (laari). */
  const [activeFace, setActiveFace] = useState<number>(NOTE_DENOMS_LAARI[0]);

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
  const runningTotal = fromLaari(totalLaariFromCounts(counts));
  const activeCount = counts[activeFace] ?? "";
  const needsVarianceNote = variance != null && Math.abs(variance) >= 0.005;

  const setCount = (face: number, raw: string) => {
    if (raw !== "" && !/^\d{0,5}$/.test(raw)) return;
    setCounts((prev) => ({ ...prev, [face]: raw }));
    setErr("");
  };

  const bumpCount = (face: number, delta: number) => {
    setActiveFace(face);
    setCounts((prev) => {
      const next = Math.max(0, Math.min(99999, parseCount(prev[face]) + delta));
      return { ...prev, [face]: next === 0 ? "" : String(next) };
    });
    setErr("");
  };

  const padPress = (key: string) => {
    const cur = counts[activeFace] ?? "";
    if (key === "clear") {
      setCount(activeFace, "");
      return;
    }
    if (key === "back") {
      setCount(activeFace, cur.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key)) return;
    if (cur === "0") {
      setCount(activeFace, key);
      return;
    }
    if (cur.length >= 5) return;
    setCount(activeFace, cur + key);
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
    <Overlay className="close-shift-overlay" onEscape={busy ? undefined : onCancel}>
      <div className="close-shift-sheet" data-testid="close-shift-sheet">
        <header className="close-shift-sheet__header">
          <div className="close-shift-sheet__title-row">
            <h2 className="close-shift-sheet__title">Close shift</h2>
            <button
              type="button"
              data-testid="close-shift-method-toggle"
              className="close-shift-method-link"
              onClick={() => {
                setMethod((m) => (m === "denominations" ? "plain_total" : "denominations"));
                setErr("");
              }}
            >
              {method === "denominations" ? "Enter total instead" : "Count by note"}
            </button>
          </div>
          <p className="close-shift-sheet__subtitle">
            Tap a note, enter how many. Expected stays hidden until you count.
          </p>
        </header>

        <div className="close-shift-sheet__body">
          {hasCount && (
            <div className="close-shift-summary-wrap">
              <button
                type="button"
                className="close-shift-summary-toggle"
                aria-expanded={showExpected}
                onClick={() => setShowExpected((v) => !v)}
              >
                <span>Expected MVR {expected.toFixed(2)}</span>
                <span className="close-shift-summary-toggle__chev">{showExpected ? "Hide" : "Details"}</span>
              </button>
              {showExpected && (
                <div className="close-shift-summary" data-testid="close-shift-expected-summary">
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
                </div>
              )}
            </div>
          )}

          {pendingOfflineCount > 0 && (
            <div className="close-shift-alert close-shift-alert--danger">
              {pendingOfflineCount} offline order{pendingOfflineCount === 1 ? "" : "s"} not synced yet.
              {pendingOfflineCashTotal > 0 && (
                <div className="close-shift-alert__meta">Pending cash: MVR {pendingOfflineCashTotal.toFixed(2)}</div>
              )}
              {(pendingOfflineCardTotal > 0 || pendingOfflineTransferTotal > 0) && (
                <div className="close-shift-alert__meta">
                  Pending card/QR MVR {pendingOfflineCardTotal.toFixed(2)} · transfer MVR {pendingOfflineTransferTotal.toFixed(2)}
                </div>
              )}
              {onSyncNow && (
                <button type="button" onClick={onSyncNow} className="close-shift-alert__action">
                  Sync now
                </button>
              )}
            </div>
          )}

          {Number(summary?.open_unpaid_orders ?? 0) > 0 && (
            <div className="close-shift-alert close-shift-alert--warn">
              This shift has {summary!.open_unpaid_orders} open unpaid order
              {summary!.open_unpaid_orders === 1 ? "" : "s"} created during it.
              They will stay active and can be paid by another staff shift.
            </div>
          )}

          {method === "denominations" ? (
            <div data-testid="close-shift-denomination-grid" className="close-shift-denoms">
              <DenomSection
                title="Notes"
                faces={[...NOTE_DENOMS_LAARI]}
                counts={counts}
                activeFace={activeFace}
                onSelect={setActiveFace}
                onBump={bumpCount}
              />
              <DenomSection
                title="Coins"
                faces={[...COMMON_COIN_DENOMS_LAARI]}
                counts={counts}
                activeFace={activeFace}
                onSelect={setActiveFace}
                onBump={bumpCount}
              />
              <button
                type="button"
                data-testid="close-shift-more-coins"
                className="close-shift-link-btn"
                onClick={() => setShowRareCoins((v) => !v)}
              >
                {showRareCoins ? "Hide rare coins" : "More coins"}
              </button>
              {showRareCoins && (
                <DenomSection
                  title="Rare coins"
                  faces={[...RARE_COIN_DENOMS_LAARI]}
                  counts={counts}
                  activeFace={activeFace}
                  onSelect={setActiveFace}
                  onBump={bumpCount}
                />
              )}
            </div>
          ) : (
            <Field label="Counted cash">
              <CashInput
                autoFocus
                value={plainTotal}
                onChange={(v) => { setPlainTotal(v); setErr(""); }}
              />
              <div className="close-shift-hint">
                Escape hatch for a chaotic till. Prefer counting by denomination when you can.
              </div>
            </Field>
          )}

          <div className="close-shift-foreign">
            <button
              type="button"
              data-testid="close-shift-foreign-toggle"
              className="close-shift-link-btn"
              onClick={() => setShowForeign((v) => !v)}
            >
              {showForeign ? "Hide foreign currency" : "Foreign currency held (optional)"}
            </button>
            {showForeign && (
              <div data-testid="close-shift-foreign-section" className="close-shift-foreign__panel">
                <div className="close-shift-hint">
                  Record only — does not change expected cash, counted cash, or variance.
                  Enter the MVR value you accepted it as at the till.
                </div>
                {foreignRows.map((row, idx) => (
                  <div key={idx} className="close-shift-fx-row">
                    <input
                      aria-label={`Foreign currency ${idx + 1}`}
                      value={row.currency}
                      onChange={(e) => {
                        const next = [...foreignRows];
                        next[idx] = { ...row, currency: e.target.value.toUpperCase().slice(0, 3) };
                        setForeignRows(next);
                      }}
                      placeholder="USD"
                      className="close-shift-input"
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
                      className="close-shift-input"
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
                      className="close-shift-input"
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
                      className="close-shift-input"
                    />
                    <button
                      type="button"
                      aria-label={`Remove foreign row ${idx + 1}`}
                      className="close-shift-fx-remove"
                      onClick={() => setForeignRows(foreignRows.filter((_, i) => i !== idx))}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="close-shift-add-fx"
                  onClick={() => setForeignRows([...foreignRows, { currency: "USD", denomination: "", count: "1", accepted_mvr: "" }])}
                >
                  + Add foreign note
                </button>
              </div>
            )}
          </div>

          {variance != null && (
            <div
              data-testid="close-shift-variance"
              className={`close-shift-variance${
                Math.abs(variance) < 0.005
                  ? " is-ok"
                  : variance > 0
                    ? " is-over"
                    : " is-short"
              }`}
            >
              <div className="close-shift-variance__row">
                <span>Variance</span>
                <span>{variance >= 0 ? "+" : ""}MVR {variance.toFixed(2)}</span>
              </div>
              {foreignSummary && Math.abs(variance) >= 0.005 && (
                <div data-testid="close-shift-fx-beside-variance" className="close-shift-variance__fx">
                  {variance < 0 ? `Short MVR ${Math.abs(variance).toFixed(2)}` : `Over MVR ${variance.toFixed(2)}`}
                  {" · "}
                  {foreignSummary}
                </div>
              )}
            </div>
          )}

          {(needsVarianceNote || showNotes) && (
            <Field label={needsVarianceNote ? "Variance reason (required)" : "Notes (optional)"}>
              <input
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setErr(""); }}
                placeholder={
                  needsVarianceNote
                    ? "e.g. Short change / found cash on floor"
                    : "e.g. Found MVR 10 on floor"
                }
                className={`close-shift-input close-shift-notes${
                  needsVarianceNote && !notes.trim() ? " is-required" : ""
                }`}
              />
            </Field>
          )}

          {!needsVarianceNote && !showNotes && (
            <button
              type="button"
              className="close-shift-link-btn close-shift-link-btn--quiet"
              onClick={() => setShowNotes(true)}
            >
              Add a note (optional)
            </button>
          )}

          {err && <div className="close-shift-alert close-shift-alert--danger">{err}</div>}
        </div>

        <footer className="close-shift-sheet__footer">
          {method === "denominations" && (
            <>
              <div data-testid="close-shift-running-total" className="close-shift-running-total">
                <span>Running total</span>
                <strong>MVR {runningTotal.toFixed(2)}</strong>
              </div>

              <div className="close-shift-pad" data-testid="close-shift-count-pad">
                <div className="close-shift-pad__active">
                  <span className="close-shift-pad__face">{labelForLaari(activeFace)}</span>
                  <span className="close-shift-pad__count" data-testid="close-shift-pad-count">
                    {activeCount === "" ? "0" : activeCount}
                    <span className="close-shift-pad__unit">
                      {" "}
                      {(() => {
                        const n = parseCount(activeCount);
                        const kind = activeFace >= 500 ? "note" : "coin";
                        return n === 1 ? kind : `${kind}s`;
                      })()}
                    </span>
                  </span>
                </div>
                <div className="close-shift-pad__keys" role="group" aria-label="Count keypad">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`close-shift-pad__key${key === "clear" || key === "back" ? " is-muted" : ""}`}
                      aria-label={
                        key === "clear" ? "Clear count" : key === "back" ? "Backspace" : `Digit ${key}`
                      }
                      onClick={() => padPress(key)}
                    >
                      {key === "clear" ? "C" : key === "back" ? "⌫" : key}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="close-shift-actions">
            <button type="button" onClick={onCancel} disabled={busy} className="close-shift-btn close-shift-btn--secondary">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={busy} className="close-shift-btn close-shift-btn--danger">
              {busy ? "Closing…" : "Close shift"}
            </button>
          </div>
        </footer>
      </div>
    </Overlay>
  );
}

function DenomSection({
  title,
  faces,
  counts,
  activeFace,
  onSelect,
  onBump,
}: {
  title: string;
  faces: number[];
  counts: DenomCounts;
  activeFace: number;
  onSelect: (face: number) => void;
  onBump: (face: number, delta: number) => void;
}) {
  const unit = title.toLowerCase().includes("coin") ? "coin" : "note";
  return (
    <div className="close-shift-denom-section">
      <div className="close-shift-denom-section__title">{title}</div>
      <div className="close-shift-denom-grid">
        {faces.map((face) => {
          const qty = parseCount(counts[face]);
          const lineMvr = fromLaari(face * qty).toFixed(2);
          const selected = activeFace === face;
          return (
            <div
              key={face}
              role="button"
              tabIndex={0}
              data-testid={`denom-row-${face}`}
              aria-pressed={selected}
              className={`close-shift-denom-row${selected ? " is-selected" : ""}${qty > 0 ? " has-count" : ""}`}
              onClick={() => onSelect(face)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(face);
                }
              }}
            >
              <span className="close-shift-denom-row__face">{labelForLaari(face)}</span>
              <div className="close-shift-denom-row__stepper" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  aria-label={`Decrease ${labelForLaari(face)}`}
                  className="close-shift-stepper-btn"
                  onClick={() => onBump(face, -1)}
                >
                  −
                </button>
                <span
                  data-testid={`denom-count-${face}`}
                  className="close-shift-denom-row__count"
                  aria-label={`Count of ${labelForLaari(face)}`}
                >
                  {qty}
                </span>
                <button
                  type="button"
                  aria-label={`Increase ${labelForLaari(face)}`}
                  className="close-shift-stepper-btn"
                  onClick={() => onBump(face, 1)}
                >
                  +
                </button>
              </div>
              <span className="close-shift-denom-row__totals" data-testid={`denom-line-${face}`}>
                <span className="close-shift-denom-row__qty">{qty} {unit}{qty === 1 ? "" : "s"}</span>
                <span className="close-shift-denom-row__line">MVR {lineMvr}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Summary({ label, value, bold, negative }: { label: string; value: number; bold?: boolean; negative?: boolean }) {
  return (
    <div className={`close-shift-summary__row${bold ? " is-bold" : ""}`}>
      <span>{label}</span>
      <span>{negative ? "−" : ""}MVR {Math.abs(value).toFixed(2)}</span>
    </div>
  );
}
