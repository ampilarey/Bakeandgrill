import { useEffect, useState } from "react";
import { ApiRequestError } from "@shared/api";
import { clockIn, clockOut, getTimeClockStatus, setAuthToken, staffLogin } from "../api";

type Props = {
  deviceId: string;
  onBack: () => void;
};

/**
 * Lightweight time-clock screen accessible from the login screen so
 * staff can punch in / out without holding up a register. Authenticates
 * with the same PIN as the POS, runs the punch, then immediately logs
 * out — no shift is required, no order UI is loaded.
 */
export function TimeClockPanel({ deviceId, onBack }: Props) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState<null | { clocked_in: boolean; since?: string }>(null);

  const doAuth = async (): Promise<boolean> => {
    setErr("");
    if (!username.trim() || pin.length < 4) {
      setErr("Enter your mobile/email and PIN.");
      return false;
    }
    try {
      const res = await staffLogin(username.trim(), pin.trim(), deviceId);
      setAuthToken(res.token);
      const s = await getTimeClockStatus();
      setStatus({ clocked_in: s.clocked_in, since: s.punch?.clocked_in_at });
      return true;
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Sign in failed.");
      return false;
    }
  };

  const punchIn = async () => {
    setBusy(true); setMsg("");
    try {
      if (status === null && !(await doAuth())) { setBusy(false); return; }
      const res = await clockIn();
      setStatus({ clocked_in: true, since: res.punch.clocked_in_at });
      setMsg(`Clocked in at ${formatTime(res.punch.clocked_in_at)}.`);
    } catch (e) { setErr(e instanceof ApiRequestError ? e.message : "Clock-in failed."); }
    finally { setBusy(false); cleanup(); }
  };

  const punchOut = async () => {
    setBusy(true); setMsg("");
    try {
      if (status === null && !(await doAuth())) { setBusy(false); return; }
      const res = await clockOut();
      setStatus({ clocked_in: false });
      setMsg(`Clocked out at ${formatTime(res.punch.clocked_out_at)} (${res.punch.total_hours.toFixed(2)}h).`);
    } catch (e) { setErr(e instanceof ApiRequestError ? e.message : "Clock-out failed."); }
    finally { setBusy(false); cleanup(); }
  };

  // Time-clock auth is intentionally NOT persistent — we drop the token
  // as soon as the punch is recorded so the next staffer must re-enter
  // their PIN. Crucially we never write the token to localStorage so the
  // POS-login flow is unaffected.
  const cleanup = () => {
    setAuthToken(null);
    setPin("");
  };

  useEffect(() => () => cleanup(), []);

  return (
    <div style={{
      minHeight: "100vh", background: "#1C1408",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: 32,
        width: "100%", maxWidth: 380,
      }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <p style={{ fontSize: 40, margin: 0 }}>⏰</p>
          <h2 style={{ margin: "8px 0 4px", fontSize: 20, color: "#2A1E0C" }}>Time Clock</h2>
          <p style={{ margin: 0, color: "#8B7355", fontSize: 13 }}>Punch in or out without signing in to the POS.</p>
        </div>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Mobile or email"
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", marginBottom: 10,
            border: "1px solid #EDE4D4", borderRadius: 10, fontSize: 14, background: "#FFFDF9" }}
        />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          type="password"
          inputMode="numeric"
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px",
            border: "1px solid #EDE4D4", borderRadius: 10, fontSize: 14, background: "#FFFDF9" }}
        />

        {err && <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#FEE2E2", color: "#B91C1C", fontSize: 13 }}>{err}</div>}
        {msg && <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#DCFCE7", color: "#15803D", fontSize: 13 }}>{msg}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={punchIn} disabled={busy} style={{
            flex: 1, padding: "12px 14px", borderRadius: 10, border: "none",
            background: "#10B981", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>Clock in</button>
          <button onClick={punchOut} disabled={busy} style={{
            flex: 1, padding: "12px 14px", borderRadius: 10, border: "none",
            background: "#EF4444", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>Clock out</button>
        </div>

        <button onClick={onBack} style={{
          marginTop: 14, width: "100%", padding: "10px", borderRadius: 10,
          background: "transparent", border: "none", color: "#94A3B8",
          fontSize: 13, cursor: "pointer", textDecoration: "underline",
        }}>← Back to sign in</button>
      </div>
    </div>
  );
}

function formatTime(iso?: string): string {
  if (!iso) return "now";
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
