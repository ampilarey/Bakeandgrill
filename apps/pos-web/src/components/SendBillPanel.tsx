import { useState } from "react";
import { sendBill } from "../api";

const RECENT_KEY = "pos_recent_phones";
const MAX_RECENT = 5;

function getRecentPhones(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); }
  catch { return []; }
}

function saveRecentPhone(phone: string): void {
  try {
    const existing = getRecentPhones().filter((p) => p !== phone);
    localStorage.setItem(RECENT_KEY, JSON.stringify([phone, ...existing].slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

type Props = {
  orderId: number | null;
  onClose: () => void;
};

export function SendBillPanel({ orderId, onClose }: Props) {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recentPhones = getRecentPhones();

  const normalise = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length === 7) return `+960${digits}`;
    if (digits.startsWith("960") && digits.length === 10) return `+${digits}`;
    return raw;
  };

  const handleSend = async () => {
    if (!orderId) return;
    const normalised = normalise(phone.trim());
    if (!/^\+960[379]\d{6}$/.test(normalised)) {
      setError("Enter a valid 7-digit Maldivian number");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await sendBill(orderId, normalised);
      setResult({ link: res.link });
      saveRecentPhone(normalised);
    } catch (e) {
      setError((e as Error).message ?? "Failed to send bill");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 24, width: 340,
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#1C1408" }}>Send Bill via SMS</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8B7355" }}>×</button>
        </div>

        {result ? (
          <div>
            <p style={{ color: "#047857", fontWeight: 600, marginBottom: 8 }}>✓ Bill sent successfully!</p>
            <p style={{ fontSize: 13, color: "#475569", wordBreak: "break-all", marginBottom: 16 }}>{result.link}</p>
            <button
              onClick={() => { void navigator.clipboard.writeText(result.link); }}
              style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "1px solid #EDE4D4", background: "#f9f5f0", fontSize: 14, cursor: "pointer", marginBottom: 8 }}
            >
              Copy Link
            </button>
            <button
              onClick={onClose}
              style={{ width: "100%", padding: "10px 0", borderRadius: 8, background: "#1C1408", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        ) : (
          <div>
            <label style={{ fontSize: 13, color: "#8B7355", display: "block", marginBottom: 4 }}>Customer phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSend()}
              placeholder="7654321"
              maxLength={15}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #EDE4D4", fontSize: 15, boxSizing: "border-box", marginBottom: 8 }}
              autoFocus
            />

            {recentPhones.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, color: "#8B7355", marginBottom: 4 }}>Recent:</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {recentPhones.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPhone(p.replace("+960", ""))}
                      style={{ padding: "4px 10px", borderRadius: 20, border: "1px solid #EDE4D4", background: "#f9f5f0", fontSize: 12, cursor: "pointer" }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 8 }}>{error}</p>}

            <button
              onClick={() => void handleSend()}
              disabled={sending || !phone.trim()}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 8,
                background: sending || !phone.trim() ? "#8B7355" : "#1C1408",
                color: "#fff", border: "none", fontSize: 14, fontWeight: 600,
                cursor: sending || !phone.trim() ? "not-allowed" : "pointer",
              }}
            >
              {sending ? "Sending…" : "Send Bill"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
