import { useState } from "react";

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
 */
export function LockScreen({ cashierName, onUnlock, onSwitchUser }: Props) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (pin.length < 4) { setErr("Enter your PIN."); return; }
    setBusy(true);
    const ok = await onUnlock(pin);
    setBusy(false);
    if (!ok) { setErr("Wrong PIN."); setPin(""); }
  };

  const tap = (d: string) => {
    setErr("");
    if (d === "⌫") setPin((p) => p.slice(0, -1));
    else if (d) setPin((p) => (p.length >= 8 ? p : p + d));
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0F172A",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: 28,
        width: "100%", maxWidth: 340, textAlign: "center",
      }}>
        <p style={{ fontSize: 36, margin: 0 }}>🔒</p>
        <p style={{ fontWeight: 700, fontSize: 18, color: "#0F172A", margin: "8px 0 4px" }}>
          {cashierName ?? "Cashier"}
        </p>
        <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 20px" }}>
          Enter your PIN to continue
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

        <button onClick={submit} disabled={busy} style={{
          marginTop: 14, width: "100%", padding: "12px", borderRadius: 12,
          background: pin.length < 4 ? "#A7F3D0" : "#10B981", color: "#fff",
          border: "none", fontWeight: 800, fontSize: 14, cursor: pin.length < 4 ? "not-allowed" : "pointer",
        }}>{busy ? "Unlocking…" : "Unlock"}</button>

        <button onClick={onSwitchUser} style={{
          marginTop: 10, background: "none", border: "none",
          color: "#64748B", fontSize: 13, cursor: "pointer", textDecoration: "underline",
        }}>Switch to a different user</button>
      </div>
    </div>
  );
}
