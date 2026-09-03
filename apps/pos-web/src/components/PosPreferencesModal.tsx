import { useEffect, useState } from "react";
import { updateMyPreferences } from "../api";
import { resolveIdleLockMinutes } from "../hooks/useIdleLock";
import {
  palette, radius, shadow, space, type, z,
  btnPrimary, btnSecondary,
} from "../theme";

const LOCK_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 2, label: "2 minutes" },
  { value: 5, label: "5 minutes (default)" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 0, label: "Never auto-lock" },
];

type CartSide = "left" | "right";

type Props = {
  idleLockMinutes: number;
  cartSide?: CartSide;
  onClose: () => void;
  onSaved: (resolvedMinutes: number, cartSide: CartSide) => void;
};

/**
 * Personal POS settings — auto-lock timeout and which side the ticket sits
 * on, saved to the staff user's account (same values as Admin → My Account).
 */
export function PosPreferencesModal({ idleLockMinutes, cartSide = "left", onClose, onSaved }: Props) {
  const [minutes, setMinutes] = useState(idleLockMinutes);
  const [side, setSide] = useState<CartSide>(cartSide);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setMinutes(idleLockMinutes);
  }, [idleLockMinutes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const handleSave = async () => {
    setBusy(true);
    setErr("");
    setOk(false);
    try {
      const res = await updateMyPreferences({ pos_idle_lock_minutes: minutes, pos_cart_side: side });
      const resolved = resolveIdleLockMinutes(res.user);
      onSaved(resolved, res.user.pos_cart_side === "right" ? "right" : "left");
      setOk(true);
      window.setTimeout(onClose, 800);
    } catch (e) {
      setErr((e as Error).message || "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="My POS settings"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: z.modal,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.m,
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          background: "#fff",
          borderRadius: radius.l,
          boxShadow: shadow.l,
          padding: space.l,
        }}
      >
        <h2 style={{ ...type.title, margin: "0 0 4px", color: palette.panelInk }}>
          My settings
        </h2>
        <p style={{ ...type.bodySm, margin: "0 0 16px", color: palette.panelMuted }}>
          Saved to your staff account — applies on every POS when you sign in.
        </p>

        <label style={{ display: "block" }}>
          <span style={{ ...type.label, display: "block", marginBottom: 6, color: palette.panelMuted }}>
            Auto-lock after inactivity
          </span>
          <select
            value={minutes}
            disabled={busy}
            onChange={(e) => setMinutes(Number(e.target.value))}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: radius.m,
              border: `1px solid ${palette.border}`,
              fontSize: 15,
              background: "#fff",
              minHeight: 44,
            }}
          >
            {LOCK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        {/* Owner, 2026-09-02: a left-hand option. On a phone the ticket is
            docked at the bottom, so this only shows on a wide till. */}
        <div style={{ marginTop: 16 }}>
          <span style={{ ...type.label, display: "block", marginBottom: 6, color: palette.panelMuted }}>
            Ticket side on the till
          </span>
          <div role="group" aria-label="Ticket side" style={{ display: "flex", gap: 8 }}>
            {(["left", "right"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                disabled={busy}
                onClick={() => setSide(s)}
                style={{
                  flex: 1, minHeight: 44, borderRadius: radius.m, fontWeight: 700, fontSize: 14, cursor: "pointer",
                  border: `1px solid ${side === s ? palette.primaryDark : palette.border}`,
                  background: side === s ? palette.primary : "#fff",
                  color: side === s ? "#fff" : palette.panelInk,
                }}
              >
                {s === "left" ? "Left (default)" : "Right"}
              </button>
            ))}
          </div>
          <p style={{ ...type.bodySm, margin: "6px 0 0", color: palette.panelMuted }}>
            Puts the ticket on the other side of the menu. It applies where the two sit side by side — a wide till, or an iPad in landscape. In portrait, and on a phone, the ticket is docked at the bottom and neither side means anything.
          </p>
        </div>

        {err && (
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "#B91C1C" }}>{err}</p>
        )}
        {ok && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#15803D", fontWeight: 600 }}>Saved</p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy} style={btnSecondary(busy)}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={busy} style={btnPrimary(busy)}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
