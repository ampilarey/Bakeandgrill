import { useEffect, useState } from "react";
import { getShiftHistory } from "../api";

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
 */
export function OpenShiftModal({ onConfirm, onCancel, busy, suggestedOpeningCash }: Props) {
  const [openingCash, setOpeningCash] = useState<string>(
    suggestedOpeningCash != null ? suggestedOpeningCash.toFixed(2) : "0.00",
  );
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [hint, setHint] = useState<string>("");

  // If the caller didn't supply a suggestion, pull the last closed
  // shift's closing_cash. We only do this once on mount and only if
  // the cashier hasn't typed anything yet.
  useEffect(() => {
    if (suggestedOpeningCash != null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getShiftHistory();
        const last = res.shifts?.find((s) => s.closed_at != null);
        if (cancelled || !last) return;
        const cash = Number(last.closing_cash) || 0;
        setOpeningCash((curr) => (curr === "0.00" || curr === "" ? cash.toFixed(2) : curr));
        if (cash > 0) {
          setHint(`Pre-filled from previous shift's closing cash. Tap to overwrite.`);
        }
      } catch { /* ignore — fall back to 0.00 */ }
    })();
    return () => { cancelled = true; };
  }, [suggestedOpeningCash]);

  const submit = async () => {
    const n = Number.parseFloat(openingCash);
    if (!Number.isFinite(n) || n < 0) {
      setErr("Enter the starting cash amount (0 or more).");
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
          <input
            autoFocus
            value={openingCash}
            inputMode="decimal"
            onChange={(e) => { setOpeningCash(e.target.value); setErr(""); }}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="0.00"
            style={inputStyle}
          />
          {hint && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#64748B" }}>{hint}</div>
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

export function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      {children}
    </div>
  );
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16,
      width: "100%", maxWidth: 440,
      padding: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
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
