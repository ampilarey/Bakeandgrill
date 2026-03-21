import { useState } from "react";
import {
  checkPhone,
  requestOtp,
  verifyOtp,
  passwordLogin,
  forgotPassword,
  resetPassword,
  completeProfile,
  type AuthCustomer,
} from "../api";

type Step =
  | "phone"
  | "password"
  | "otp"
  | "forgot_phone"
  | "forgot_otp"
  | "reset_password"
  | "profile_setup";

type Props = {
  onSuccess: (token: string, name: string) => void;
  skipProfileSetup?: boolean;
};

function persistAuth(token: string, customer: AuthCustomer) {
  // Show phone without +960 prefix (e.g. "7972434") — shorter than full name in header
  const stripped = (customer.phone ?? "").replace(/^\+?960/, "").replace(/\D/g, "");
  const display = stripped.length === 7 ? stripped : (customer.name ?? customer.phone ?? "");
  localStorage.setItem("online_token", token);
  if (display) localStorage.setItem("online_customer_name", display);
  window.dispatchEvent(new Event("auth_change"));
  return display;
}

export function AuthBlock({ onSuccess, skipProfileSetup = false }: Props) {
  const [step, setStep]       = useState<Step>("phone");
  const [phone, setPhone]     = useState("");
  const [password, setPassword]   = useState("");
  const [otp, setOtp]         = useState("");
  const [hint, setHint]       = useState<string | null>(null);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  // Profile setup fields
  const [setupName, setSetupName]   = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPwd, setSetupPwd]     = useState("");
  const [setupPwdConfirm, setSetupPwdConfirm] = useState("");

  // Stored mid-flow so profile setup can finish auth
  const [pendingToken, setPendingToken]     = useState("");
  const [pendingCustomer, setPendingCustomer] = useState<AuthCustomer | null>(null);

  // Reset form state
  const [resetOtp, setResetOtp]     = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [newPwdConfirm, setNewPwdConfirm] = useState("");

  const go = (s: Step) => { setError(""); setStep(s); };

  // ── Step 1: phone submitted ───────────────────────────────────────────────

  const handleCheckPhone = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await checkPhone(phone);
      if (res.has_password) {
        go("password");
      } else {
        const r = await requestOtp(phone, "register");
        if (import.meta.env.DEV && r.otp) setHint(`Dev OTP: ${r.otp}`);
        go("otp");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2a: password login ───────────────────────────────────────────────

  const handlePasswordLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await passwordLogin({ phone, password });
      if (!res.customer.is_profile_complete) {
        setPendingToken(res.token);
        setPendingCustomer(res.customer);
        go("profile_setup");
      } else {
        const name = persistAuth(res.token, res.customer);
        onSuccess(res.token, name);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2b: OTP verify ───────────────────────────────────────────────────

  const handleVerifyOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await verifyOtp({ phone, otp });
      if (!res.customer.is_profile_complete && !skipProfileSetup) {
        setPendingToken(res.token);
        setPendingCustomer(res.customer);
        go("profile_setup");
      } else {
        const name = persistAuth(res.token, res.customer);
        onSuccess(res.token, name);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3 (conditional): profile setup ──────────────────────────────────

  const handleCompleteProfile = async () => {
    if (!pendingToken || !pendingCustomer) return;
    if (setupPwd !== setupPwdConfirm) { setError("Passwords don't match."); return; }

    setError("");
    setLoading(true);
    try {
      const res = await completeProfile(pendingToken, {
        name: setupName.trim(),
        email: setupEmail.trim() || undefined,
        password: setupPwd,
        password_confirmation: setupPwdConfirm,
      });
      const updated = { ...pendingCustomer, ...res.customer };
      const name = persistAuth(pendingToken, updated);
      onSuccess(pendingToken, name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password flow ──────────────────────────────────────────────────

  const handleForgotRequest = async () => {
    setError("");
    setLoading(true);
    try {
      const r = await forgotPassword(phone);
      if (import.meta.env.DEV && r.otp) setHint(`Dev OTP: ${r.otp}`);
      go("forgot_otp");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPwd !== newPwdConfirm) { setError("Passwords don't match."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await resetPassword({
        phone,
        otp: resetOtp,
        password: newPwd,
        password_confirmation: newPwdConfirm,
      });
      const name = persistAuth(res.token, res.customer);
      onSuccess(res.token, name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={S.card}>
      {/* ── Phone entry ─────────────────────────────────── */}
      {step === "phone" && (
        <>
          <h2 style={S.title}>Your phone number</h2>
          <p style={S.sub}>We'll send a code or show a password field depending on your account.</p>
          {error && <p style={S.error}>{error}</p>}
          <input
            style={S.input} type="tel" inputMode="numeric" placeholder="7xxxxxxx"
            value={phone} onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCheckPhone()}
            autoFocus
          />
          <button style={{ ...S.primaryBtn, opacity: loading || !phone ? 0.55 : 1 }}
            onClick={handleCheckPhone} disabled={loading || !phone}>
            {loading ? "Checking…" : "Continue →"}
          </button>
          <p style={S.note}>Your number is used only for order updates. No spam.</p>
        </>
      )}

      {/* ── Password login ──────────────────────────────── */}
      {step === "password" && (
        <>
          <h2 style={S.title}>Welcome back</h2>
          <p style={S.sub}>Signing in as <strong>{phone}</strong></p>
          {error && <p style={S.error}>{error}</p>}
          <input
            style={S.input} type="password" placeholder="Your password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handlePasswordLogin()}
            autoFocus autoComplete="current-password"
          />
          <button style={{ ...S.primaryBtn, opacity: loading || !password ? 0.55 : 1 }}
            onClick={handlePasswordLogin} disabled={loading || !password}>
            {loading ? "Signing in…" : "Sign in →"}
          </button>
          <button style={S.ghostBtn} onClick={() => {
            go("forgot_phone");
            setHint(null);
          }}>
            Forgot password?
          </button>
          <button style={S.ghostBtn} onClick={() => { go("phone"); setPassword(""); }}>
            ← Use a different number
          </button>
        </>
      )}

      {/* ── OTP verification ────────────────────────────── */}
      {step === "otp" && (
        <>
          <h2 style={S.title}>Enter the code we sent</h2>
          <p style={S.sub}>A 6-digit code was sent to <strong>{phone}</strong>.</p>
          {error && <p style={S.error}>{error}</p>}
          {hint && <p style={S.hint}>{hint}</p>}
          <input
            style={S.input} type="text" inputMode="numeric" placeholder="6-digit code"
            value={otp} onChange={e => setOtp(e.target.value)} maxLength={6}
            onKeyDown={e => e.key === "Enter" && handleVerifyOtp()}
            autoFocus autoComplete="one-time-code"
          />
          <button style={{ ...S.primaryBtn, opacity: loading || otp.length < 6 ? 0.55 : 1 }}
            onClick={handleVerifyOtp} disabled={loading || otp.length < 6}>
            {loading ? "Verifying…" : "Confirm →"}
          </button>
          <button style={S.ghostBtn} onClick={() => { go("phone"); setOtp(""); setHint(null); }}>
            ← Use a different number
          </button>
        </>
      )}

      {/* ── Profile setup (first time) ──────────────────── */}
      {step === "profile_setup" && (
        <>
          <h2 style={S.title}>One last step</h2>
          <p style={S.sub}>Set your name and a password so you can sign in easily next time.</p>
          {error && <p style={S.error}>{error}</p>}
          <label style={S.label}>Your name</label>
          <input style={S.input} type="text" placeholder="Ahmed Ali"
            value={setupName} onChange={e => setSetupName(e.target.value)} autoFocus autoComplete="name" />
          <label style={S.label}>Email <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>(optional)</span></label>
          <input style={S.input} type="email" placeholder="you@example.com"
            value={setupEmail} onChange={e => setSetupEmail(e.target.value)} autoComplete="email" />
          <label style={S.label}>Password</label>
          <input style={S.input} type="password" placeholder="At least 6 characters"
            value={setupPwd} onChange={e => setSetupPwd(e.target.value)} autoComplete="new-password" />
          <label style={S.label}>Confirm password</label>
          <input style={S.input} type="password" placeholder="Repeat your password"
            value={setupPwdConfirm} onChange={e => setSetupPwdConfirm(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCompleteProfile()} autoComplete="new-password" />
          <button style={{ ...S.primaryBtn, opacity: loading || !setupName.trim() || !setupPwd ? 0.55 : 1 }}
            onClick={handleCompleteProfile} disabled={loading || !setupName.trim() || !setupPwd}>
            {loading ? "Saving…" : "Create account →"}
          </button>
          <p style={{ ...S.note, marginTop: "0.5rem" }}>
            You can skip this — your order will still go through.
          </p>
        </>
      )}

      {/* ── Forgot password: phone ───────────────────────── */}
      {step === "forgot_phone" && (
        <>
          <h2 style={S.title}>Reset your password</h2>
          <p style={S.sub}>We'll send a code to verify it's you.</p>
          {error && <p style={S.error}>{error}</p>}
          <input
            style={S.input} type="tel" inputMode="numeric" placeholder="Your phone number"
            value={phone} onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleForgotRequest()}
            autoFocus
          />
          <button style={{ ...S.primaryBtn, opacity: loading || !phone ? 0.55 : 1 }}
            onClick={handleForgotRequest} disabled={loading || !phone}>
            {loading ? "Sending…" : "Send reset code →"}
          </button>
          <button style={S.ghostBtn} onClick={() => go("password")}>← Back to sign in</button>
        </>
      )}

      {/* ── Forgot password: OTP ─────────────────────────── */}
      {step === "forgot_otp" && (
        <>
          <h2 style={S.title}>Enter the code</h2>
          <p style={S.sub}>A reset code was sent to <strong>{phone}</strong>.</p>
          {error && <p style={S.error}>{error}</p>}
          {hint && <p style={S.hint}>{hint}</p>}
          <input
            style={S.input} type="text" inputMode="numeric" placeholder="6-digit code"
            value={resetOtp} onChange={e => setResetOtp(e.target.value)} maxLength={6}
            onKeyDown={e => e.key === "Enter" && resetOtp.length === 6 && go("reset_password")}
            autoFocus autoComplete="one-time-code"
          />
          <button style={{ ...S.primaryBtn, opacity: loading || resetOtp.length < 6 ? 0.55 : 1 }}
            onClick={() => go("reset_password")} disabled={loading || resetOtp.length < 6}>
            Continue →
          </button>
          <button style={S.ghostBtn} onClick={() => { go("forgot_phone"); setResetOtp(""); setHint(null); }}>
            ← Use a different number
          </button>
        </>
      )}

      {/* ── Forgot password: set new password ───────────── */}
      {step === "reset_password" && (
        <>
          <h2 style={S.title}>New password</h2>
          <p style={S.sub}>Choose a new password for {phone}</p>
          {error && <p style={S.error}>{error}</p>}
          <label style={S.label}>New password</label>
          <input style={S.input} type="password" placeholder="At least 6 characters"
            value={newPwd} onChange={e => setNewPwd(e.target.value)} autoFocus autoComplete="new-password" />
          <label style={S.label}>Confirm password</label>
          <input style={S.input} type="password" placeholder="Repeat your password"
            value={newPwdConfirm} onChange={e => setNewPwdConfirm(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleResetPassword()} autoComplete="new-password" />
          <button style={{ ...S.primaryBtn, opacity: loading || !newPwd ? 0.55 : 1 }}
            onClick={handleResetPassword} disabled={loading || !newPwd}>
            {loading ? "Saving…" : "Set password →"}
          </button>
        </>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--color-surface)",
    borderRadius: "var(--radius-lg)",
    padding: "1.5rem",
    marginBottom: "1rem",
    border: "1px solid var(--color-border)",
    boxShadow: "var(--shadow-sm)",
  },
  title: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "var(--color-text)",
    marginBottom: "0.375rem",
  },
  sub: {
    color: "var(--color-text-muted)",
    fontSize: "0.875rem",
    lineHeight: 1.55,
    marginBottom: "1rem",
  },
  label: {
    display: "block",
    fontWeight: 600,
    fontSize: "0.85rem",
    color: "var(--color-text)",
    marginBottom: "0.35rem",
  },
  note: {
    color: "var(--color-text-muted)",
    fontSize: "0.78rem",
    textAlign: "center",
    marginTop: "0.5rem",
  },
  error: {
    color: "var(--color-error)",
    background: "var(--color-error-bg)",
    border: "1px solid rgba(220,38,38,0.2)",
    borderRadius: "var(--radius-sm)",
    padding: "0.5rem 0.75rem",
    fontSize: "0.85rem",
    marginBottom: "0.75rem",
  },
  hint: {
    color: "var(--color-success)",
    background: "var(--color-success-bg)",
    borderRadius: "var(--radius-sm)",
    padding: "0.4rem 0.75rem",
    fontSize: "0.85rem",
    marginBottom: "0.75rem",
  },
  input: {
    width: "100%",
    padding: "0.75rem 0.875rem",
    border: "1.5px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    fontSize: "1rem",
    marginBottom: "0.75rem",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "var(--color-text)",
    background: "var(--color-surface)",
    outline: "none",
  },
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
  },
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
  },
};
