import { useEffect, useRef, useState } from "react";
import { getShiftHistory } from "../api";
import { z } from "../theme";
import { CashInput } from "./CashInput";
import { useFocusTrap } from "../hooks/useFocusTrap";

type Props = {
  onConfirm: (openingCash: number, notes?: string) => Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
  /**
   * Suggested starting cash. If omitted, the modal will look up the
   * most recent closed shift's `closing_cash` (the float typically
   * left in the drawer) and pre-fill that. Falls back to "0.00".
   */
  suggestedOpeningCash?: number;
};

/**
 * Replaces the silent "no shift open" state with an explicit cashier
 * action. Mirrors Loyverse: the very first thing you do is count the
 * cash already in the drawer.
 *
 * UX note (May 2026): we pre-fill the starting-cash field with the
 * previous shift's closing total so a cashier who's just continuing
 * from the last close can hit "Open shift" without re-typing the
 * same number. They can still tap-and-overwrite to adjust.
 *
 * Bug-032 (May 2026): only pre-fill when the previous close is
 * RECENT (≤8h ago — i.e. you closed at 11pm last night and you're
 * opening at 7am today, the float in the drawer is genuinely the
 * same). When the last close was a day or more ago, somebody has
 * almost certainly touched the drawer (manager drop, bank deposit,
 * weekend skim) so we deliberately leave the field EMPTY (not a
 * grey "0.00" placeholder that looks entered) and warn the cashier
 * that they MUST count physical cash.
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
  // Empty string (not "0.00") when unfilled — CashInput shows "MVR" + a grey
  // "0.00" placeholder which cashiers mistook for an entered value (Bug-032 follow-up).
  const [openingCash, setOpeningCash] = useState<string>(
    suggestedOpeningCash != null ? suggestedOpeningCash.toFixed(2) : "",
  );
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [hint, setHint] = useState<string>("");
  const [warning, setWarning] = useState<string>("");

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
        const FRESH_WINDOW_HOURS = 8;
        if (hoursAgo <= FRESH_WINDOW_HOURS) {
          setOpeningCash((curr) => (curr === "0.00" || curr === "" ? cash.toFixed(2) : curr));
          if (cash > 0) {
            setHint(`Pre-filled from previous shift's closing cash (${label}). Tap to overwrite.`);
          }
        } else {
          // Stale — leave empty so the cashier must type the counted amount.
          setOpeningCash("");
          setWarning(
            `Last shift closed ${label} with MVR ${cash.toFixed(2)} in the drawer. ` +
            `Please physically count the cash in the drawer right now and enter that — the old close is too old to trust.`,
          );
        }
      } catch { /* ignore — leave field empty */ }
    })();
    return () => { cancelled = true; };
  }, [suggestedOpeningCash]);

  const submit = async () => {
    const trimmed = openingCash.trim();
    if (trimmed === "") {
      setErr("Enter the cash you counted in the drawer. Tap 0 if the drawer is empty.");
      return;
    }
    const n = Number.parseFloat(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      setErr("Enter a valid starting cash amount (0 or more).");
      return;
    }
    try {
      await onConfirm(n, notes.trim() || undefined);
    } catch (e) {
      setErr((e as Error).message || "Could not open shift.");
    }
  };

  return (
    <Overlay>
      <Card title="Open shift" subtitle="Count the cash in the drawer before you start ringing up sales.">
        <Field label="Starting cash (MVR)">
          <CashInput
            value={openingCash}
            onChange={(v) => { setOpeningCash(v); setErr(""); }}
            autoFocus
            placeholder="—"
          />
          {openingCash.trim() === "" && !hint && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#64748B", fontWeight: 600 }}>
              Use the keypad to enter the cash you counted. Tap 0 if the drawer is empty.
            </div>
          )}
          {hint && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#64748B" }}>{hint}</div>
          )}
          {warning && (
            <div style={{
              marginTop: 8, padding: "8px 10px", borderRadius: 8,
              background: "#FEF3C7", color: "#92400E",
              fontSize: 12, lineHeight: 1.45,
              border: "1px solid #FCD34D",
            }}>
              ⚠️ {warning}
            </div>
          )}
        </Field>
        <Field label="Notes (optional)">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Morning shift, Aisha"
            style={inputStyle}
          />
        </Field>
        {err && <div style={errorBox}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          {onCancel && (
            <button onClick={onCancel} disabled={busy} style={secondary}>Cancel</button>
          )}
          <button onClick={submit} disabled={busy} style={primary}>
            {busy ? "Opening…" : "Open shift"}
          </button>
        </div>
      </Card>
    </Overlay>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "12px 14px", borderRadius: 10,
  border: "1px solid #CBD5E1", fontSize: 16,
  background: "#fff", color: "#0F172A", outline: "none",
};
const errorBox: React.CSSProperties = {
  marginTop: 12, padding: "10px 12px", borderRadius: 8,
  background: "#FEE2E2", color: "#B91C1C", fontSize: 13,
};
const primary: React.CSSProperties = {
  flex: 1, padding: "12px 18px", borderRadius: 10,
  border: "none", background: "#10B981", color: "#fff",
  fontWeight: 700, fontSize: 14, cursor: "pointer",
};
const secondary: React.CSSProperties = {
  flex: 1, padding: "12px 18px", borderRadius: 10,
  border: "1px solid #CBD5E1", background: "#fff", color: "#475569",
  fontWeight: 600, fontSize: 14, cursor: "pointer",
};

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
