import { useEffect, useState } from "react";
import { sendBill } from "../api";
import {
  palette, radius, shadow, space, type, z,
  btnPrimary, btnSecondary, inputField,
} from "../theme";

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

/**
 * Modal for SMS-ing the pre-payment bill to a customer. The cashier
 * either types a phone or picks one of the last 5 numbers they
 * texted from this device — those are stored locally so they don't
 * leak across devices.
 *
 * Number normalisation accepts a bare 7-digit Maldivian mobile and
 * promotes it to E.164 (+960…) before hitting the API; users can
 * also type the full international form.
 */
export function SendBillPanel({ orderId, onClose }: Props) {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recentPhones = getRecentPhones();

  // Esc dismisses the modal — matches every other modal convention.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

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
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
        animation: "pos-fade-in 120ms ease",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Send bill via SMS"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: palette.panel,
          borderRadius: radius.xl,
          width: "100%",
          maxWidth: 400,
          boxShadow: shadow.xl,
          overflow: "hidden",
          animation: "pos-scale-in 140ms ease",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: `${space.l}px ${space.xl}px`,
          borderBottom: `1px solid ${palette.border}`,
        }}>
          <div>
            <div style={{ ...type.subtitle, color: palette.panelInk }}>Send bill via SMS</div>
            {orderId && (
              <div style={{ ...type.caption, color: palette.panelMuted, marginTop: 2 }}>
                Order #{orderId}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              color: palette.panelMuted,
              padding: space.xxs,
              lineHeight: 1,
              minHeight: 32,
              minWidth: 32,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: space.xl }}>
          {result ? (
            <div>
              <div style={{
                background: palette.successBg,
                border: `1px solid ${palette.successBorder}`,
                color: palette.successDark,
                borderRadius: radius.m,
                padding: `${space.s + 2}px ${space.m}px`,
                marginBottom: space.m,
                ...type.body,
                fontWeight: 600,
              }}>
                ✓ Bill sent. Customer received the link.
              </div>
              <div style={{
                ...type.caption,
                color: palette.panelMuted,
                marginBottom: space.xs,
                fontWeight: 600,
              }}>
                Payment link
              </div>
              <div style={{
                ...type.bodySm,
                color: palette.panelInk,
                wordBreak: "break-all",
                background: palette.bgAlt,
                padding: space.m,
                borderRadius: radius.s,
                border: `1px solid ${palette.border}`,
                marginBottom: space.m,
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              }}>
                {result.link}
              </div>
              <div style={{ display: "flex", gap: space.s }}>
                <button
                  onClick={() => { void navigator.clipboard.writeText(result.link); }}
                  style={{ ...btnSecondary(), flex: 1 }}
                >
                  Copy link
                </button>
                <button
                  onClick={onClose}
                  style={{ ...btnPrimary(), flex: 1 }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label style={{ ...type.label, color: palette.panelMuted, display: "block", marginBottom: space.xxs }}>
                Customer mobile
              </label>
              <input
                type="tel"
                inputMode="tel"
                pattern="[0-9+\- ]*"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSend()}
                placeholder="7XXXXXX"
                maxLength={15}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                style={{ ...inputField, width: "100%", fontSize: type.subtitle.fontSize, marginBottom: space.s }}
              />

              {recentPhones.length > 0 && (
                <div style={{ marginBottom: space.m }}>
                  <div style={{ ...type.label, color: palette.panelSubtle, marginBottom: space.xs }}>
                    Recent
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
                    {recentPhones.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPhone(p.replace("+960", ""))}
                        style={{
                          padding: `${space.xxs + 2}px ${space.m}px`,
                          borderRadius: radius.pill,
                          border: `1px solid ${palette.border}`,
                          background: palette.bgAlt,
                          ...type.caption,
                          color: palette.panelInk,
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div style={{
                  background: palette.dangerBg,
                  color: palette.dangerDark,
                  border: `1px solid ${palette.dangerBorder}`,
                  borderRadius: radius.s,
                  padding: `${space.xs + 2}px ${space.m}px`,
                  ...type.bodySm,
                  marginBottom: space.m,
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: space.s }}>
                <button onClick={onClose} style={{ ...btnSecondary(), flex: 1 }}>
                  Cancel
                </button>
                <button
                  onClick={() => void handleSend()}
                  disabled={sending || !phone.trim()}
                  style={{ ...btnPrimary(sending || !phone.trim()), flex: 2 }}
                >
                  {sending ? "Sending…" : "Send bill"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
