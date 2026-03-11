import { useState } from "react";
import { requestOtp, verifyOtp } from "../api";

type Props = {
  onSuccess: (token: string, name: string) => void;
};

export function AuthBlock({ onSuccess }: Props) {
  const [phone, setPhone]   = useState("");
  const [otp, setOtp]       = useState("");
  const [step, setStep]     = useState<"phone" | "otp">("phone");
  const [hint, setHint]     = useState<string | null>(null);
  const [error, setError]   = useState("");
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
    <div style={authStyles.card}>
      <h2 style={authStyles.sectionTitle}>Sign in to continue</h2>
      <p style={{ color: "#6c757d", fontSize: 14, marginBottom: 16 }}>
        We'll send an OTP to your Maldivian number.
      </p>
      {error && <p style={authStyles.errorText}>{error}</p>}
      {hint && <p style={{ ...authStyles.hintText, marginBottom: 12 }}>{hint}</p>}

      {step === "phone" ? (
        <>
          <input
            style={authStyles.input}
            placeholder="Phone (e.g. 7xxxxxx)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRequestOtp()}
          />
          <button style={authStyles.primaryBtn} onClick={handleRequestOtp} disabled={loading || !phone}>
            {loading ? "Sending…" : "Send OTP"}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 14, color: "#495057", marginBottom: 8 }}>
            Enter the 6-digit code sent to {phone}
          </p>
          <input
            style={authStyles.input}
            placeholder="OTP code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
          />
          <button style={authStyles.primaryBtn} onClick={handleVerify} disabled={loading || otp.length < 6}>
            {loading ? "Verifying…" : "Verify"}
          </button>
          <button style={authStyles.ghostBtn} onClick={() => { setStep("phone"); setOtp(""); }}>
            Change number
          </button>
        </>
      )}
    </div>
  );
}

const authStyles = {
  card:         { background: "#fff", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)" },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: "#212529", marginBottom: 12 },
  errorText:    { color: "#dc3545", fontSize: 13, marginBottom: 8 },
  hintText:     { color: "#198754", fontSize: 13 },
  input:        { width: "100%", padding: "10px 12px", border: "1px solid #dee2e6", borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: "border-box" as const },
  primaryBtn:   { width: "100%", padding: "10px 0", background: "#1ba3b9", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 8 },
  ghostBtn:     { width: "100%", padding: "8px 0", background: "transparent", color: "#6c757d", border: "1px solid #dee2e6", borderRadius: 8, fontSize: 14, cursor: "pointer" },
};
