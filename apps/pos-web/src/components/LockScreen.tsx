import { useCallback, useEffect, useRef, useState } from "react";
import { z as zScale } from "../theme";

const Z_LOCK = zScale.lock;

type Props = {
  cashierName?: string;
  onUnlock: (pin: string) => Promise<boolean>;
  onSwitchUser: () => void;
};

/**
 * Lightweight lock screen for "Switch user" without losing the shift.
 * Prompts for a PIN, defers the actual decision to the parent (so we
 * can validate against the existing token's user OR allow any owner/
 * manager to take over).
 *
 * Auto-submits after 1s of typing inactivity once the PIN has at least
 * 4 digits. Staff PINs run 4–8 digits in this codebase, so we can't
 * fire on the 4th tap (would lock 5–8 digit users out); a longer
 * debounce gives slow typists with 6+ digit PINs comfortable headroom
 * to finish before the unlock fires. The "Unlock" button remains as
 * an explicit commit for cashiers who don't want to wait the second.
 */
export function LockScreen({ cashierName, onUnlock, onSwitchUser }: Props) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // Locks out re-entry while a single PIN attempt is in flight or
  // after a wrong-PIN clear, so the auto-submit timer can't fire a
  // second request before the cashier has reacted.
  const submittingRef = useRef(false);

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    if (pin.length < 4) { setErr("Enter your PIN."); return; }
    submittingRef.current = true;
    setBusy(true);
    const ok = await onUnlock(pin);
    setBusy(false);
    submittingRef.current = false;
    if (!ok) { setErr("Wrong PIN."); setPin(""); }
  }, [pin, onUnlock]);

  // Auto-submit on typing pause. Effect re-runs on every pin change,
  // resetting the timer — so the cashier can keep typing extra digits
  // for a 5–8 digit PIN without prematurely firing. We bail when the
  // pin is too short, when there's a current error (user just got
  // "Wrong PIN" — let them deliberately retype), or when a submission
  // is already in flight. The 1000ms window is calibrated for slow
  // typists with longer PINs — a 6-digit PIN entered at one-key-per-
  // 800ms wouldn't fire prematurely; an 8-digit PIN takes ≤2s longer
  // than a 4-digit. Tap "Unlock" to skip the wait when in a hurry.
  // The 8-digit PIN auto-fires immediately since no more digits are
  // possible (the keypad caps input at 8), so the longer debounce
  // only slows down the 4–7 digit edge.
  useEffect(() => {
    if (pin.length < 4) return;
    if (err) return;
    if (busy || submittingRef.current) return;
    const delay = pin.length === 8 ? 0 : 1000;
    const id = window.setTimeout(() => {
      void submit();
    }, delay);
    return () => window.clearTimeout(id);
  }, [pin, err, busy, submit]);

  const tap = (d: string) => {
    setErr("");
    if (d === "⌫") setPin((p) => p.slice(0, -1));
    else if (d) setPin((p) => (p.length >= 8 ? p : p + d));
  };

  return (
    <div
      className="pos-app-root"
      style={{
      // Bug-031: when isLocked the App.tsx early-return is what
      // really covers the UI. But pin LockScreen to position:
      // fixed at z.lock (highest in the system) so even if it
      // ever lands as a sibling instead of replacing the tree,
      // it still wins over ChargeOverlay, modals, drawers,
      // toasts, etc. Defence in depth against a future refactor
      // that breaks the early-return.
      position: "fixed", inset: 0, zIndex: Z_LOCK,
      minHeight: "100dvh", background: "#0F172A",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: 16,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: 28,
        width: "100%", maxWidth: 340, textAlign: "center",
        margin: "auto",
      }}>
        <p style={{ fontSize: 36, margin: 0 }}>🔒</p>
        <p style={{ fontWeight: 700, fontSize: 18, color: "#0F172A", margin: "8px 0 4px" }}>
          {cashierName ?? "Cashier"}
        </p>
        <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 20px" }}>
          Enter your PIN — unlocks automatically
        </p>

        <div style={{
          display: "flex", justifyContent: "center", gap: 10,
          marginBottom: 20, minHeight: 24, alignItems: "center",
        }}>
          {pin.length === 0 ? <span style={{ color: "#94A3B8", fontSize: 13 }}>•••• ••</span> :
            Array.from({ length: pin.length }).map((_, i) => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: "#D4813A" }} />
            ))
          }
        </div>

        {err && <div style={{ padding: "8px 10px", borderRadius: 8, background: "#FEE2E2", color: "#B91C1C", fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
            <button
              key={i}
              onClick={() => tap(d)}
              disabled={d === ""}
              style={{
                height: 56, borderRadius: 12, border: "1px solid #E2E8F0",
                background: d === "" ? "transparent" : "#F8FAFC",
                fontSize: 18, fontWeight: 700, color: "#0F172A",
                cursor: d === "" ? "default" : "pointer",
              }}
            >{d}</button>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={busy || pin.length < 4}
          title={pin.length >= 4 ? "Unlocks automatically — tap to skip the wait" : undefined}
          style={{
            marginTop: 14, width: "100%", padding: "12px", borderRadius: 12,
            background: pin.length < 4 ? "#A7F3D0" : "#10B981", color: "#fff",
            border: "none", fontWeight: 800, fontSize: 14,
            cursor: (busy || pin.length < 4) ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Unlocking…" : pin.length >= 4 ? "Unlock now" : "Unlock"}
        </button>

        <button onClick={onSwitchUser} style={{
          marginTop: 10, background: "none", border: "none",
          color: "#64748B", fontSize: 13, cursor: "pointer", textDecoration: "underline",
        }}>Switch to a different user</button>
      </div>
    </div>
  );
}
