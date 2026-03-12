import { useState } from "react";
import { requestOtp, verifyOtp } from "../api";

type Props = {
  onSuccess: (token: string, name: string) => void;
};

export function AuthBlock({ onSuccess }: Props) {
  const [phone, setPhone]     = useState("");
  const [otp, setOtp]         = useState("");
  const [step, setStep]       = useState<"phone" | "otp">("phone");
  const [hint, setHint]       = useState<string | null>(null);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await requestOtp(phone);
      if (res.otp) setHint(`Dev OTP: ${res.otp}`);
      setStep("otp");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await verifyOtp({ phone, otp });
      localStorage.setItem("online_token", res.token);
      localStorage.setItem("online_customer_name", res.customer.name ?? res.customer.phone);
      window.dispatchEvent(new Event("auth_change"));
      onSuccess(res.token, res.customer.name ?? res.customer.phone);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.card}>
      {step === "phone" ? (
        <>
          <h2 style={S.title}>Enter your phone number</h2>
          <p style={S.sub}>
            We'll send a one-time code so we can track your order and let you know when it's ready.
          </p>
          {error && <p style={S.error}>{error}</p>}
          <input
            style={S.input}
            type="tel"
            inputMode="numeric"
            placeholder="7xxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRequestOtp()}
            autoFocus
          />
          <button
            style={{ ...S.primaryBtn, opacity: loading || !phone ? 0.55 : 1 }}
            onClick={handleRequestOtp}
            disabled={loading || !phone}
          >
            {loading ? "Sending code…" : "Send code"}
          </button>
          <p style={S.note}>
            Your number is used only for order updates. No spam.
          </p>
        </>
      ) : (
        <>
          <h2 style={S.title}>Enter the code we sent</h2>
          <p style={S.sub}>
            A 6-digit code was sent to <strong>{phone}</strong>.
          </p>
          {error && <p style={S.error}>{error}</p>}
          {hint && <p style={S.hint}>{hint}</p>}
          <input
            style={S.input}
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            autoFocus
          />
          <button
            style={{ ...S.primaryBtn, opacity: loading || otp.length < 6 ? 0.55 : 1 }}
            onClick={handleVerify}
            disabled={loading || otp.length < 6}
          >
            {loading ? "Verifying…" : "Confirm order"}
          </button>
          <button style={S.ghostBtn} onClick={() => { setStep("phone"); setOtp(""); setError(""); }}>
            ← Use a different number
          </button>
        </>
      )}
    </div>
  );
}

const S = {
  card: {
    background: "var(--color-surface)",
    borderRadius: "var(--radius-lg)",
    padding: "1.5rem",
    marginBottom: "1rem",
    border: "1px solid var(--color-border)",
    boxShadow: "var(--shadow-sm)",
  } as React.CSSProperties,
  title: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "var(--color-text)",
    marginBottom: "0.375rem",
  } as React.CSSProperties,
  sub: {
    color: "var(--color-text-muted)",
    fontSize: "0.875rem",
    lineHeight: 1.55,
    marginBottom: "1rem",
  } as React.CSSProperties,
  note: {
    color: "var(--color-text-muted)",
    fontSize: "0.78rem",
    textAlign: "center" as const,
    marginTop: "0.5rem",
  } as React.CSSProperties,
  error: {
    color: "var(--color-error)",
    background: "var(--color-error-bg)",
    border: "1px solid rgba(220,38,38,0.2)",
    borderRadius: "var(--radius-sm)",
    padding: "0.5rem 0.75rem",
    fontSize: "0.85rem",
    marginBottom: "0.75rem",
  } as React.CSSProperties,
  hint: {
    color: "var(--color-success)",
    background: "var(--color-success-bg)",
    borderRadius: "var(--radius-sm)",
    padding: "0.4rem 0.75rem",
    fontSize: "0.85rem",
    marginBottom: "0.75rem",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "0.75rem 0.875rem",
    border: "1.5px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    fontSize: "1rem",
    marginBottom: "0.75rem",
    boxSizing: "border-box" as const,
    fontFamily: "inherit",
    color: "var(--color-text)",
    background: "var(--color-surface)",
    outline: "none",
  } as React.CSSProperties,
  primaryBtn: {
    width: "100%",
    padding: "0.8rem",
    background: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontSize: "0.975rem",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s",
  } as React.CSSProperties,
  ghostBtn: {
    width: "100%",
    marginTop: "0.625rem",
    padding: "0.625rem",
    background: "transparent",
    color: "var(--color-text-muted)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    fontSize: "0.875rem",
    cursor: "pointer",
    fontFamily: "inherit",
  } as React.CSSProperties,
};
