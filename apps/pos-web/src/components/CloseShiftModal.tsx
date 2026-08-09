import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Field, Overlay } from "./OpenShiftModal";
import { CashInput } from "./CashInput";
import type { ShiftSummary } from "../hooks/useShift";
import {
  COMMON_COIN_DENOMS_LAARI,
  DEFAULT_NOTE_DENOMS_LAARI,
  MORE_DENOMS_LAARI,
  breakdownPayload,
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

export type CountAttemptResult = {
  /** Server verdict — the only thing a cashier learns. */
  matches: boolean;
  attempt_number: number;
  /** Present only when the server chose to reveal them (owner/manager). */
  counted_cash?: number;
  expected_cash?: number;
  variance?: number;
};

type Props = {
  summary: ShiftSummary | null;
  pendingOfflineCount?: number;
  pendingOfflineCashTotal?: number;
  pendingOfflineCardTotal?: number;
  pendingOfflineTransferTotal?: number;
  onSyncNow?: () => void;
  /** Records a count attempt server-side and returns the reconciliation. */
  onReviewCount: (payload: CloseShiftConfirmPayload) => Promise<CountAttemptResult>;
  onConfirm: (payload: CloseShiftConfirmPayload) => Promise<void>;
  onCancel: () => void;
};

/**
 * Two-step blind close.
 *
 * Step 1 (count screen): denomination list or plain total, foreign currency,
 * counted cash + keypad. NOTHING here reveals the expected drawer total or
 * the variance — the count must be blind.
 *
 * Step 2 (review popup, via "Review & close"): records a count attempt on
 * the server, then shows counted vs expected vs variance. Balanced closes
 * straight away; a difference requires a written reason (the server enforces
 * this too). "Count again" returns to step 1 with every number preserved —
 * every attempt is recorded, so recounting is visible to the owner.
 */
export function CloseShiftModal({
  summary,
  pendingOfflineCount = 0,
  pendingOfflineCashTotal = 0,
  pendingOfflineCardTotal = 0,
  pendingOfflineTransferTotal = 0,
  onSyncNow,
  onReviewCount,
  onConfirm,
  onCancel,
}: Props) {
  const [method, setMethod] = useState<CashCountMethod>("denominations");
  const [counts, setCounts] = useState<DenomCounts>({});
  const [plainTotal, setPlainTotal] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [showForeign, setShowForeign] = useState(false);
  const [foreignRows, setForeignRows] = useState<ForeignCurrencyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** Selected face for the sticky count pad (laari). */
  const [activeFace, setActiveFace] = useState<number>(DEFAULT_NOTE_DENOMS_LAARI[0]);
  /** Two-step flow. */
  const [step, setStep] = useState<"count" | "review">("count");
  const [review, setReview] = useState<CountAttemptResult | null>(null);
  const [reason, setReason] = useState("");
  /** Attempts recorded so far — shown quietly after a recount. */
  const [attemptsSoFar, setAttemptsSoFar] = useState(0);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

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

  /** Counted cash — live for both methods, integer laari underneath. */
  const countedDisplay =
    method === "denominations"
      ? fromLaari(totalLaariFromCounts(counts))
      : countedLaari != null
        ? fromLaari(countedLaari)
        : 0;

  /**
   * A count against a hidden face must never be silently dropped: force the
   * "More notes & coins" section open (and un-collapsible) while it holds one.
   */
  const hiddenHasCount = MORE_DENOMS_LAARI.some((face) => parseCount(counts[face]) > 0);
  const moreOpen = showMore || hiddenHasCount;

  const activeCount = counts[activeFace] ?? "";

  const setCount = (face: number, raw: string) => {
    if (raw !== "" && !/^\d{0,5}$/.test(raw)) return;
    setCounts((prev) => ({ ...prev, [face]: raw }));
    setErr("");
  };

  const selectFace = (face: number) => {
    setActiveFace(face);
    // Keep the row the keypad is driving visible in the scroll list.
    // (Optional-called: jsdom has no scrollIntoView.)
    rowRefs.current[face]?.scrollIntoView?.({ block: "nearest" });
  };

  const bumpCount = (face: number, delta: number) => {
    selectFace(face);
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

  const basePayload = (): CloseShiftConfirmPayload | null => {
    if (!hasCount || countedLaari == null) return null;
    return {
      closingCash: fromLaari(countedLaari),
      cashCountMethod: method,
      denominations: method === "denominations" ? breakdownPayload(counts) : undefined,
      foreignCurrency: foreignPayload.length ? foreignPayload : undefined,
    };
  };

  /** Step 1 → step 2. Blocks exactly as the old single-step close did. */
  const startReview = async () => {
    if (pendingOfflineCount > 0) {
      setErr(`Sync ${pendingOfflineCount} offline order${pendingOfflineCount === 1 ? "" : "s"} before closing the shift.`);
      return;
    }
    const payload = basePayload();
    if (payload == null) {
      setErr(method === "denominations"
        ? "Enter the count for each denomination in the drawer."
        : "Enter the cash you counted in the drawer.");
      return;
    }
    setBusy(true);
    try {
      const res = await onReviewCount(payload);
      setReview(res);
      setAttemptsSoFar(res.attempt_number);
      setReason("");
      setStep("review");
      setErr("");
    } catch (e) {
      setErr((e as Error).message || "Could not check the count.");
    } finally {
      setBusy(false);
    }
  };

  const reviewBalanced = review?.matches === true;

  const submitClose = async () => {
    const payload = basePayload();
    if (payload == null || review == null) return;
    if (!reviewBalanced && !reason.trim()) {
      setErr("Enter a reason for the cash variance before closing.");
      return;
    }
    setBusy(true);
    try {
      await onConfirm({ ...payload, notes: reason.trim() || undefined });
    } catch (e) {
      setErr((e as Error).message || "Could not close shift.");
    } finally {
      setBusy(false);
    }
  };

  const backToCount = () => {
    setStep("count");
    setErr("");
  };

  // Stable identity: Overlay's focus trap re-runs (and moves focus) whenever
  // onEscape changes, so an inline closure here would steal focus from the
  // reason input on every keystroke.
  const handleEscape = useCallback(() => {
    if (busy) return;
    if (step === "review") {
      setStep("count");
      setErr("");
      return;
    }
    onCancel();
  }, [busy, step, onCancel]);

  return (
    <Overlay className="close-shift-overlay" onEscape={handleEscape}>
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
            {method === "denominations"
              ? "Count what is in the drawer — use − and + on each note (hold to repeat)."
              : "Enter the total cash you counted in the drawer."}
          </p>
          {attemptsSoFar >= 1 && step === "count" && (
            <p className="close-shift-recount-note" data-testid="close-shift-recount-note">
              You have counted this drawer {attemptsSoFar + 1} times.
            </p>
          )}
        </header>

        <div className="close-shift-sheet__content">
          {/* ── Step 1: the count. Nothing here reveals the target. ─────── */}
          <div className="close-shift-sheet__body">
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
                  faces={[...DEFAULT_NOTE_DENOMS_LAARI]}
                  counts={counts}
                  activeFace={activeFace}
                  onSelect={selectFace}
                  onBump={bumpCount}
                  rowRefs={rowRefs}
                />
                <DenomSection
                  title="Coins"
                  faces={[...COMMON_COIN_DENOMS_LAARI]}
                  counts={counts}
                  activeFace={activeFace}
                  onSelect={selectFace}
                  onBump={bumpCount}
                  rowRefs={rowRefs}
                />
                {moreOpen && (
                  <DenomSection
                    title="More notes & coins"
                    faces={[...MORE_DENOMS_LAARI]}
                    counts={counts}
                    activeFace={activeFace}
                    onSelect={selectFace}
                    onBump={bumpCount}
                    rowRefs={rowRefs}
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
              <div className="close-shift-inline-toggles">
                {method === "denominations" && !hiddenHasCount && (
                  <button
                    type="button"
                    data-testid="close-shift-more-coins"
                    className="close-shift-link-btn"
                    onClick={() => setShowMore((v) => !v)}
                  >
                    {moreOpen ? "Hide notes & coins" : "More notes & coins"}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="close-shift-foreign-toggle"
                  className="close-shift-link-btn"
                  onClick={() => setShowForeign((v) => !v)}
                >
                  {showForeign ? "Hide foreign currency" : "Foreign currency"}
                </button>
              </div>
              {showForeign && (
                <div data-testid="close-shift-foreign-section" className="close-shift-foreign__panel">
                  <div className="close-shift-hint">
                    Record only — does not change the counted cash.
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
          </div>

          {/* ── Footer/rail: counted cash, keypad, actions. No target. ──── */}
          <aside className="close-shift-rail">
            <div className="close-shift-totals" data-testid="close-shift-totals">
              <div className="close-shift-totals__counted" data-testid="close-shift-running-total">
                <span>Counted cash</span>
                <strong>MVR {countedDisplay.toFixed(2)}</strong>
              </div>
            </div>

            {method === "denominations" && (
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
                {/* iPad/desktop rail keypad (hidden on phones, where the
                    per-cell − / + steppers do the job and "Enter total
                    instead" covers typing a number). 4 columns = 3 rows. */}
                <div className="close-shift-pad__keys" role="group" aria-label="Count keypad">
                  {["1", "2", "3", "clear", "4", "5", "6", "back", "7", "8", "9", "0"].map((key) => (
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
            )}

            {err && step === "count" && <div className="close-shift-alert close-shift-alert--danger">{err}</div>}

            <div className="close-shift-actions">
              <button type="button" onClick={onCancel} disabled={busy} className="close-shift-btn close-shift-btn--secondary">
                Cancel
              </button>
              <button
                type="button"
                data-testid="close-shift-review-btn"
                onClick={() => void startReview()}
                disabled={busy}
                className="close-shift-btn close-shift-btn--primary"
              >
                {busy && step === "count" ? "Checking…" : "Review & close"}
              </button>
            </div>
          </aside>
        </div>

        {/* ── Step 2: review popup. The only place variance is shown. ───── */}
        {step === "review" && review != null && (
          <div className="close-shift-review-backdrop" data-testid="close-shift-review">
            <div className="close-shift-review" role="dialog" aria-modal="true" aria-label="Review count">
              {reviewBalanced ? (
                /* No figures here either — the count list already shows them. */
                <>
                  <div className="close-shift-review__badge is-ok" data-testid="close-shift-review-balanced">
                    Balanced
                  </div>
                  <p className="close-shift-review__message">
                    Balanced — the cash matches.
                  </p>
                </>
              ) : (
                /* NEVER render a cash figure in this popup — not the expected
                   total, not the variance, not even the counted echo — no
                   matter what the server returned or who is logged in.
                   Owners reconcile in the Z-report / shift history instead. */
                <>
                  <div className="close-shift-review__title" data-testid="close-shift-review-mismatch">
                    The cash does not match
                  </div>
                  <p className="close-shift-review__message">
                    Your counted amount does not match the actual cash amount. Please enter the reason.
                  </p>
                  <label className="close-shift-review__reason-label" htmlFor="close-shift-reason">
                    Reason (required)
                  </label>
                  <input
                    id="close-shift-reason"
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); setErr(""); }}
                    placeholder="e.g. Short change / found cash on floor"
                    className={`close-shift-input close-shift-notes${!reason.trim() ? " is-required" : ""}`}
                  />
                </>
              )}

              {err && <div className="close-shift-alert close-shift-alert--danger">{err}</div>}

              <div className="close-shift-actions">
                <button
                  type="button"
                  data-testid="close-shift-count-again"
                  onClick={backToCount}
                  disabled={busy}
                  className="close-shift-btn close-shift-btn--secondary"
                >
                  {reviewBalanced ? "Back to count" : "Count again"}
                </button>
                <button
                  type="button"
                  data-testid="close-shift-confirm-btn"
                  onClick={() => void submitClose()}
                  disabled={busy}
                  className="close-shift-btn close-shift-btn--danger"
                >
                  {busy ? "Closing…" : "Close shift"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

/**
 * − / + with press-and-hold auto-repeat: one step on press, then repeats
 * after 450ms every 110ms while held. The click that follows pointerup is
 * suppressed so a tap never double-steps; keyboard activation (plain click
 * with no pointerdown) still works.
 */
function StepperBtn({ label, onStep, children }: {
  label: string;
  onStep: () => void;
  children: React.ReactNode;
}) {
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const skipClickRef = useRef(false);

  const stop = () => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => stop, []);

  return (
    <button
      type="button"
      aria-label={label}
      className="close-shift-stepper-btn"
      onPointerDown={() => {
        skipClickRef.current = true;
        onStep();
        stop();
        timeoutRef.current = window.setTimeout(() => {
          intervalRef.current = window.setInterval(onStep, 110);
        }, 450);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (skipClickRef.current) {
          skipClickRef.current = false;
          return;
        }
        onStep();
      }}
    >
      {children}
    </button>
  );
}

function DenomSection({
  title,
  faces,
  counts,
  activeFace,
  onSelect,
  onBump,
  rowRefs,
}: {
  title: string;
  faces: number[];
  counts: DenomCounts;
  activeFace: number;
  onSelect: (face: number) => void;
  onBump: (face: number, delta: number) => void;
  rowRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
}) {
  return (
    <div className="close-shift-denom-section">
      <div className="close-shift-denom-section__title">{title}</div>
      <div className="close-shift-denom-grid">
        {faces.map((face) => {
          // Mixed sections ("More notes & coins") need a per-face unit.
          const unit = face >= 500 ? "note" : "coin";
          const qty = parseCount(counts[face]);
          const lineMvr = fromLaari(face * qty).toFixed(2);
          const selected = activeFace === face;
          return (
            <div
              key={face}
              role="button"
              tabIndex={0}
              ref={(el) => { rowRefs.current[face] = el; }}
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
                <StepperBtn label={`Decrease ${labelForLaari(face)}`} onStep={() => onBump(face, -1)}>
                  −
                </StepperBtn>
                <span
                  data-testid={`denom-count-${face}`}
                  className="close-shift-denom-row__count"
                  aria-label={`Count of ${labelForLaari(face)}`}
                >
                  {qty}
                </span>
                <StepperBtn label={`Increase ${labelForLaari(face)}`} onStep={() => onBump(face, 1)}>
                  +
                </StepperBtn>
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
