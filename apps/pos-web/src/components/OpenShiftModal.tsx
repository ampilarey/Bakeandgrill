import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCurrencyImages, getShiftHistory } from "../api";
import type { OpenShiftConflict } from "../api/shifts";
import { z } from "../theme";
import { CashInput } from "./CashInput";
import { DenomSection, compactMvr } from "./CloseShiftModal";
import { useFocusTrap } from "../hooks/useFocusTrap";
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
} from "../utils/cashDenominations";

export type OpenShiftConfirmPayload = {
  openingCash: number;
  notes?: string;
  /** Set when a manager opens over another cashier's shift on this till. */
  override?: boolean;
  cashCountMethod: CashCountMethod;
  /** denomination (laari) → count, when counted note by note. */
  denominations?: Record<string, number>;
};

type Props = {
  onConfirm: (payload: OpenShiftConfirmPayload) => Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
  /**
   * Suggested starting cash. If omitted, the modal will look up the
   * most recent closed shift and pre-fill from its count (the float
   * typically left in the drawer).
   */
  suggestedOpeningCash?: number;
};

/** Within this many hours of the last close, its count is a fair starting point. */
const FRESH_WINDOW_HOURS = 8;

/**
 * Opening the shift starts with counting the drawer.
 *
 * Owner, 2026-10-03: "in shift opening also add the shift-closing type of
 * money counting." The float is counted the way the drawer is counted at
 * close: tap or hold each note and coin photo to add, − to take away, a
 * keypad for the selected one, "More notes & coins" for the rare faces,
 * and "Enter total instead" for a plain amount. The server totals the
 * notes and keeps the breakdown.
 *
 * Pre-fill (May 2026, Bug-032): when the last close on record is recent
 * (8 hours or less), its count is loaded so a cashier continuing from it
 * only checks and adjusts, note by note when the close was counted that
 * way. An older close is not trusted: nothing is pre-filled and the
 * cashier is told to count the drawer now.
 */
function formatStaleness(closedAt: string): { label: string; hoursAgo: number } {
  const closedMs = new Date(closedAt).getTime();
  const hoursAgo = Math.max(0, (Date.now() - closedMs) / 36e5);
  if (hoursAgo < 1) return { label: "less than an hour ago", hoursAgo };
  if (hoursAgo < 24) return { label: `${Math.round(hoursAgo)}h ago`, hoursAgo };
  const days = Math.round(hoursAgo / 24);
  return { label: `${days} day${days === 1 ? "" : "s"} ago`, hoursAgo };
}

export function OpenShiftModal({ onConfirm, onCancel, busy, suggestedOpeningCash }: Props) {
  const [method, setMethod] = useState<CashCountMethod>(suggestedOpeningCash != null ? "plain_total" : "denominations");
  const [counts, setCounts] = useState<DenomCounts>({});
  // Empty string (not "0.00") when unfilled — CashInput shows "MVR" + a grey
  // "0.00" placeholder which cashiers mistook for an entered value (Bug-032 follow-up).
  const [plainTotal, setPlainTotal] = useState<string>(
    suggestedOpeningCash != null ? suggestedOpeningCash.toFixed(2) : "",
  );
  const [activeFace, setActiveFace] = useState<number>(DEFAULT_NOTE_DENOMS_LAARI[0]);
  const [showMore, setShowMore] = useState(false);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [hint, setHint] = useState<string>("");
  const [warning, setWarning] = useState<string>("");
  // Another cashier's shift is open on this till (shift history audit,
  // 2026-10-02): the server refuses with 409 and says whether this
  // person may open over it.
  const [conflict, setConflict] = useState<OpenShiftConflict | null>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [customImages, setCustomImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void fetchCurrencyImages().then((images) => { if (alive) setCustomImages(images); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (suggestedOpeningCash != null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getShiftHistory();
        const last = res.shifts?.find((s) => s.closed_at != null);
        if (cancelled || !last || !last.closed_at) return;
        const cash = Number(last.closing_cash) || 0;
        const { label, hoursAgo } = formatStaleness(last.closed_at);
        if (hoursAgo > FRESH_WINDOW_HOURS) {
          // Stale — leave it empty so the cashier must count.
          setWarning(
            `Last shift closed ${label} with MVR ${cash.toFixed(2)} in the drawer. ` +
            `Please physically count the cash in the drawer right now and enter that — the old close is too old to trust.`,
          );
          return;
        }
        const breakdown = last.cash_count_method === "denominations" ? last.cash_count_breakdown : null;
        if (breakdown && Object.keys(breakdown).length > 0) {
          const next: DenomCounts = {};
          for (const [face, n] of Object.entries(breakdown)) {
            if (Number(n) > 0) next[Number(face)] = String(n);
          }
          setCounts((curr) => (hasAnyDenomEntry(curr) ? curr : next));
          setHint(`Pre-filled from the last close (${label}). Check each note and adjust.`);
        } else if (cash > 0) {
          setMethod("plain_total");
          setPlainTotal((curr) => (curr === "" ? cash.toFixed(2) : curr));
          setHint(`Pre-filled from previous shift's closing cash (${label}). Tap to overwrite.`);
        }
      } catch { /* ignore — leave it empty */ }
    })();
    return () => { cancelled = true; };
  }, [suggestedOpeningCash]);

  const countedLaari = useMemo(() => {
    if (method === "denominations") return totalLaariFromCounts(counts);
    const n = Number.parseFloat(plainTotal);
    if (plainTotal.trim() === "" || !Number.isFinite(n) || n < 0) return null;
    return toLaari(n);
  }, [method, counts, plainTotal]);

  const hiddenLaari = MORE_DENOMS_LAARI.reduce((sum, face) => sum + face * parseCount(counts[face]), 0);
  const activeCount = counts[activeFace] ?? "";

  const setCount = (face: number, raw: string) => {
    if (raw !== "" && !/^\d{0,5}$/.test(raw)) return;
    setCounts((prev) => ({ ...prev, [face]: raw }));
    setErr("");
  };

  const selectFace = (face: number) => {
    setActiveFace(face);
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
    if (key === "clear") { setCount(activeFace, ""); return; }
    if (key === "back") { setCount(activeFace, cur.slice(0, -1)); return; }
    if (!/^\d$/.test(key)) return;
    if (cur === "0") { setCount(activeFace, key); return; }
    if (cur.length >= 5) return;
    setCount(activeFace, cur + key);
  };

  const submit = async (override = false) => {
    let payload: OpenShiftConfirmPayload;
    if (method === "denominations") {
      if (!hasAnyDenomEntry(counts)) {
        setErr("Count the notes and coins in the drawer. If the drawer is empty, tap 0.");
        return;
      }
      payload = {
        openingCash: fromLaari(totalLaariFromCounts(counts)),
        cashCountMethod: "denominations",
        denominations: breakdownPayload(counts),
      };
    } else {
      const trimmed = plainTotal.trim();
      if (trimmed === "") {
        setErr("Enter the cash you counted in the drawer. Tap 0 if the drawer is empty.");
        return;
      }
      const n = Number.parseFloat(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        setErr("Enter a valid starting cash amount (0 or more).");
        return;
      }
      payload = { openingCash: n, cashCountMethod: "plain_total" };
    }
    if (notes.trim()) payload.notes = notes.trim();
    if (override) payload.override = true;
    try {
      setConflict(null);
      await onConfirm(payload);
    } catch (e) {
      const body = (e as { status?: number; body?: unknown }).body;
      if ((e as { status?: number }).status === 409 && body && typeof body === "object" && "open_shift" in body) {
        setConflict(body as OpenShiftConflict);
        setErr("");
        return;
      }
      setErr((e as Error).message || "Could not open shift.");
    }
  };

  const handleEscape = useCallback(() => {
    if (busy) return;
    if (showMore) { setShowMore(false); return; }
    onCancel?.();
  }, [busy, showMore, onCancel]);

  return (
    <Overlay className="close-shift-overlay" onEscape={handleEscape}>
      <div className="close-shift-sheet" data-testid="open-shift-sheet">
        <header className="close-shift-sheet__header">
          <div className="close-shift-sheet__title-row">
            <h2 className="close-shift-sheet__title">Open shift</h2>
            <button
              type="button"
              data-testid="open-shift-method-toggle"
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
              ? "Count the cash in the drawer before you start. Tap or hold a note/coin photo to add — use − to remove."
              : "Enter the total cash you counted in the drawer before you start."}
          </p>
        </header>

        <div className="close-shift-sheet__content">
          <div className="close-shift-sheet__body">
            {warning && (
              <div className="close-shift-alert close-shift-alert--warn" data-testid="open-shift-warning">⚠️ {warning}</div>
            )}
            {hint && <div className="close-shift-hint" data-testid="open-shift-hint">{hint}</div>}

            {method === "denominations" ? (
              <div data-testid="open-shift-denomination-grid" className="close-shift-denoms">
                <DenomSection title="Notes" faces={[...DEFAULT_NOTE_DENOMS_LAARI]} counts={counts} activeFace={activeFace}
                  onSelect={selectFace} onBump={bumpCount} rowRefs={rowRefs} customImages={customImages} />
                <DenomSection title="Coins" faces={[...COMMON_COIN_DENOMS_LAARI]} counts={counts} activeFace={activeFace}
                  onSelect={selectFace} onBump={bumpCount} rowRefs={rowRefs} customImages={customImages} />
              </div>
            ) : (
              <div className="close-shift-plain-total">
                <Field label="Starting cash (MVR)">
                  <CashInput
                    value={plainTotal}
                    onChange={(v) => { setPlainTotal(v); setErr(""); }}
                    autoFocus
                    placeholder="—"
                  />
                  {plainTotal.trim() === "" && !hint && (
                    <div className="close-shift-hint">
                      Use the keypad to enter the cash you counted. Tap 0 if the drawer is empty.
                    </div>
                  )}
                </Field>
              </div>
            )}

            {method === "denominations" && showMore && (
              <div className="close-shift-more-overlay" data-testid="open-shift-more-overlay" onClick={() => setShowMore(false)}>
                <div className="close-shift-more-overlay__panel" onClick={(e) => e.stopPropagation()}>
                  <DenomSection className="close-shift-denom-section--more" title="More notes & coins" faces={[...MORE_DENOMS_LAARI]}
                    counts={counts} activeFace={activeFace} onSelect={selectFace} onBump={bumpCount} rowRefs={rowRefs} customImages={customImages} />
                  <button type="button" className="close-shift-more-overlay__done" onClick={() => setShowMore(false)}>Done</button>
                </div>
              </div>
            )}

            {method === "denominations" && (
              <div className="close-shift-foreign">
                <div className="close-shift-inline-toggles">
                  <button
                    type="button"
                    data-testid="open-shift-more-coins"
                    className={`close-shift-link-btn${hiddenLaari > 0 ? " close-shift-link-btn--counted" : ""}`}
                    onClick={() => setShowMore((v) => !v)}
                  >
                    {hiddenLaari > 0 ? `More · ${compactMvr(hiddenLaari)} counted` : "More notes & coins"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <aside className="close-shift-rail">
            {method === "denominations" && (
              <div className="close-shift-totals">
                <div className="close-shift-totals__counted" data-testid="open-shift-running-total">
                  <span>Starting cash</span>
                  <strong>MVR {fromLaari(countedLaari ?? 0).toFixed(2)}</strong>
                </div>
              </div>
            )}

            {method === "denominations" && (
              <div className="close-shift-pad" data-testid="open-shift-count-pad">
                <div className="close-shift-pad__active">
                  <span className="close-shift-pad__face">{labelForLaari(activeFace)}</span>
                  <span className="close-shift-pad__count">
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
                  {["1", "2", "3", "clear", "4", "5", "6", "back", "7", "8", "9", "0"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`close-shift-pad__key${key === "clear" || key === "back" ? " is-muted" : ""}`}
                      aria-label={key === "clear" ? "Clear count" : key === "back" ? "Backspace" : `Digit ${key}`}
                      onClick={() => padPress(key)}
                    >
                      {key === "clear" ? "C" : key === "back" ? "⌫" : key}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional), e.g. Morning shift"
              aria-label="Notes (optional)"
              className="close-shift-input close-shift-notes"
            />

            {err && <div className="close-shift-alert close-shift-alert--danger">{err}</div>}
            {conflict && (
              <div data-testid="open-shift-conflict" className="close-shift-alert close-shift-alert--warn">
                {conflict.message}
              </div>
            )}

            <div className="close-shift-actions">
              {onCancel && (
                <button type="button" onClick={onCancel} disabled={busy} className="close-shift-btn close-shift-btn--secondary">
                  Cancel
                </button>
              )}
              {conflict?.can_override ? (
                <button type="button" onClick={() => void submit(true)} disabled={busy} className="close-shift-btn close-shift-btn--danger">
                  {busy ? "Opening…" : "Open anyway (manager)"}
                </button>
              ) : (
                <button type="button" data-testid="open-shift-confirm" onClick={() => void submit()} disabled={busy} className="close-shift-btn close-shift-btn--primary">
                  {busy ? "Opening…" : "Open shift"}
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </Overlay>
  );
}


export function Overlay({
  children,
  onEscape,
  className,
  zIndex = z.shiftModal,
}: {
  children: React.ReactNode;
  onEscape?: () => void;
  className?: string;
  /** Which layer this dialog sits on; see `z` in theme.ts. Shift dialogs
   *  keep the default, above everything but the lock screen. */
  zIndex?: number;
}) {
  // Bug-035: shared modal overlay traps focus while open. Several
  // call-sites (OpenShift, CloseShift, ShiftPanel, history) all
  // route through this Overlay so wiring the trap once here gives
  // every shift dialog the same a11y guarantee for free.
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onEscape);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      className={className}
      style={{
        // Top-anchored and sized to the visible screen, not `inset: 0`. iOS
        // resolves the bottom of a fixed element against the layout viewport —
        // the screen as it would be with no browser toolbar — so with the
        // toolbar up this box ran past the bottom of the glass and everything
        // centred in it sat low, with the buttons behind the toolbar. Same
        // fault as the Charge overlay; see the note there.
        position: "fixed", top: 0, left: 0, right: 0,
        height: "var(--pos-vh, 100dvh)",
        zIndex,
        background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px))",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {children}
    </div>
  );
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16,
      width: "100%", maxWidth: 440,
      maxHeight: "min(90dvh, 720px)",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      padding: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
      margin: "auto",
    }}>
      <h2 style={{ margin: 0, fontSize: 20, color: "#0F172A" }}>{title}</h2>
      {subtitle && <p style={{ margin: "6px 0 16px", fontSize: 13, color: "#64748B" }}>{subtitle}</p>}
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginTop: 12 }}>
      <span style={{
        display: "block", fontSize: 12, fontWeight: 600,
        color: "#64748B", marginBottom: 6,
        textTransform: "uppercase", letterSpacing: "0.05em",
      }}>{label}</span>
      {children}
    </label>
  );
}
