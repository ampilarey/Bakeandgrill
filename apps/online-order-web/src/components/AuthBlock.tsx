import React, { useEffect, useRef, useState } from "react";
import {
  checkPhone,
  requestOtp,
  verifyOtp,
  passwordLogin,
  forgotPassword,
  resetPassword,
  completeProfile,
  guestSession,
  type AuthCustomer,
} from "../api";
import { persistGuestPhone } from "../utils/guestPhone";
import { useSiteSettingsContext } from "../context/SiteSettingsContext";
import { useLanguage } from "../context/LanguageContext";
import { brandLogoSrc } from "../lib/brandLogo";

type Step =
  | "phone"
  | "guest"
  | "password"
  | "otp"
  | "forgot_phone"
  | "forgot_otp"
  | "reset_password"
  | "profile_setup";

type Props = {
  onSuccess: (name: string) => void;
  skipProfileSetup?: boolean;
};

function displayName(customer: AuthCustomer): string {
  const stripped = (customer.phone ?? "").replace(/^\+?960/, "").replace(/\D/g, "");
  return stripped.length === 7 ? stripped : (customer.name ?? customer.phone ?? "");
}

/**
 * Strip non-digits and remove a leading Maldives country code so the stored
 * value stays as a local 7-digit string. API calls receive the raw value.
 */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("960") ? digits.slice(3) : digits;
}

// ── Shared sub-components ────────────────────────────────────────────────────

/** Phone number field with a fixed +960 Maldives display prefix. */
function PhoneInput({
  value,
  onChange,
  onEnter,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div style={S.phoneRow}>
      <span style={S.prefix} aria-hidden="true">+960</span>
      <input
        style={S.phoneFieldInner}
        type="tel"
        inputMode="numeric"
        placeholder={t("auth.ph_phone")}
        value={value}
        onChange={(e) => onChange(normalisePhone(e.target.value))}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        autoFocus={autoFocus}
        autoComplete="tel-national"
      />
    </div>
  );
}

/** Six individual digit boxes backed by a single OTP string state. */
function OtpBoxes({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const { t } = useLanguage();
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const ch = e.target.value.replace(/\D/g, "").slice(-1);
    if (!ch) return;
    const arr = Array.from({ length: 6 }, (_, k) => value[k] ?? "");
    arr[i] = ch;
    onChange(arr.join(""));
    if (i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = Array.from({ length: 6 }, (_, k) => value[k] ?? "");
      if (arr[i]) {
        arr[i] = "";
        onChange(arr.join(""));
      } else if (i > 0) {
        arr[i - 1] = "";
        onChange(arr.join(""));
        refs.current[i - 1]?.focus();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    setTimeout(() => refs.current[focusIdx]?.focus(), 0);
  };

  return (
    <div style={S.otpRow}>
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          autoFocus={autoFocus && i === 0}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          style={{ ...S.otpBox, ...(value[i] ? S.otpBoxFilled : undefined) }}
          aria-label={t("auth.digit_aria").replace("{n}", String(i + 1))}
        />
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function AuthBlock({ onSuccess, skipProfileSetup = false }: Props) {
  const { settings, text } = useSiteSettingsContext();
  const { t } = useLanguage();

  const logoLight = brandLogoSrc(settings, false);
  const logoDark = brandLogoSrc(settings, true);
  const siteName = settings.site_name || "Bake & Grill";

  const [step, setStep]       = useState<Step>("phone");
  const [phone, setPhone]     = useState("");
  const [guestName, setGuestName] = useState("");
  const [password, setPassword]   = useState("");
  const [otp, setOtp]         = useState("");
  const [hint, setHint]       = useState<string | null>(null);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const [setupName, setSetupName]   = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPwd, setSetupPwd]     = useState("");
  const [setupPwdConfirm, setSetupPwdConfirm] = useState("");

  const [pendingCustomer, setPendingCustomer] = useState<AuthCustomer | null>(null);

  const [resetOtp, setResetOtp]     = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [newPwdConfirm, setNewPwdConfirm] = useState("");

  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const handleResendOtp = async (purpose: "register" | "reset_password" = "register") => {
    if (resendIn > 0) return;
    setError(""); setHint(null);
    try {
      const r = await requestOtp(phone, purpose);
      if (import.meta.env.DEV && r.otp) setHint(`Dev OTP: ${r.otp}`);
      else setHint(t("auth.hint_code_sent"));
      setResendIn(30);
    } catch (e) { setError((e as Error).message); }
  };

  const go = (s: Step) => {
    setError("");
    setStep(s);
    if (s === "otp" || s === "forgot_otp") setResendIn(30);
  };

  const handleCheckPhone = async () => {
    setError("");
    setLoading(true);
    try {
      persistGuestPhone(phone);
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

  const handleGuestCheckout = async () => {
    if (!guestName.trim()) { setError(t("auth.err_name_required")); return; }
    setError("");
    setLoading(true);
    try {
      persistGuestPhone(phone);
      const res = await guestSession({ phone, name: guestName.trim() });
      onSuccess(displayName(res.customer));
    } catch (e) {
      const msg = (e as Error).message;
      // Backend refuses guest sessions for existing accounts (takeover guard).
      // Route the customer into the verified login flow instead of dead-ending.
      if (/already has an account/i.test(msg)) {
        try {
          const res = await checkPhone(phone);
          if (res.has_password) {
            setHint(msg);
            go("password");
            return;
          }
          const r = await requestOtp(phone, "register");
          if (import.meta.env.DEV && r.otp) setHint(`Dev OTP: ${r.otp}`);
          else setHint(t("auth.hint_code_sent"));
          go("otp");
          return;
        } catch (e2) {
          setError((e2 as Error).message);
          return;
        } finally {
          setLoading(false);
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await passwordLogin({ phone, password });
      if (!res.customer.is_profile_complete) {
        setPendingCustomer(res.customer);
        go("profile_setup");
      } else {
        onSuccess(displayName(res.customer));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await verifyOtp({ phone, otp });
      if (!res.customer.is_profile_complete && !skipProfileSetup) {
        setPendingCustomer(res.customer);
        go("profile_setup");
      } else {
        onSuccess(displayName(res.customer));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteProfile = async () => {
    if (!pendingCustomer) return;
    if (setupPwd !== setupPwdConfirm) { setError(t("auth.err_password_mismatch")); return; }

    setError("");
    setLoading(true);
    try {
      const res = await completeProfile({
        name: setupName.trim(),
        email: setupEmail.trim() || undefined,
        password: setupPwd,
        password_confirmation: setupPwdConfirm,
      });
      const updated = { ...pendingCustomer, ...res.customer };
      onSuccess(displayName(updated));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
    if (newPwd !== newPwdConfirm) { setError(t("auth.err_password_mismatch")); return; }
    setError("");
    setLoading(true);
    try {
      const res = await resetPassword({
        phone,
        otp: resetOtp,
        password: newPwd,
        password_confirmation: newPwdConfirm,
      });
      onSuccess(displayName(res.customer));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const logo = (
    <div style={S.logoWrap}>
      <img className="brand-logo--light" src={logoLight} alt={siteName} style={S.logo} />
      <img className="brand-logo--dark" src={logoDark} alt={siteName} style={S.logo} />
    </div>
  );

  return (
    <div style={S.card}>
      {logo}

      {step === "phone" && (
        <>
          <h2 style={S.title}>{t("auth.title_phone")}</h2>
          <p style={S.sub}>{t("auth.sub_phone")}</p>
          {error && <p style={S.error}>{error}</p>}
          <PhoneInput
            value={phone}
            onChange={setPhone}
            onEnter={handleCheckPhone}
            autoFocus
          />
          <button
            style={{ ...S.primaryBtn, opacity: loading || !phone ? 0.55 : 1 }}
            onClick={handleCheckPhone}
            disabled={loading || !phone}
          >
            {loading ? t("auth.checking") : t("auth.continue")}
          </button>
          {skipProfileSetup && (
            <button style={S.ghostBtn} onClick={() => { go("guest"); setError(""); }}>
              {t("auth.guest_cta")}
            </button>
          )}
          <p style={S.note}>
            {text("order_auth_privacy_line", t("auth.privacy_line"))}
          </p>
        </>
      )}

      {step === "guest" && (
        <>
          <h2 style={S.title}>{t("auth.title_guest")}</h2>
          <p style={S.sub}>{t("auth.sub_guest")}</p>
          {error && <p style={S.error}>{error}</p>}
          <label style={S.label}>{t("auth.label_name")}</label>
          <input
            style={S.input}
            type="text"
            placeholder={t("auth.ph_name")}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            autoFocus
            autoComplete="name"
          />
          <label style={S.label}>{t("auth.label_phone")}</label>
          <PhoneInput value={phone} onChange={setPhone} onEnter={handleGuestCheckout} />
          <button
            style={{ ...S.primaryBtn, opacity: loading || !phone || !guestName.trim() ? 0.55 : 1 }}
            onClick={handleGuestCheckout}
            disabled={loading || !phone || !guestName.trim()}
          >
            {loading ? t("auth.guest_starting") : t("auth.guest_continue")}
          </button>
          <button style={S.ghostBtn} onClick={() => { go("phone"); setGuestName(""); }}>
            {t("auth.back_otp")}
          </button>
        </>
      )}

      {step === "password" && (
        <>
          <h2 style={S.title}>{t("auth.title_password")}</h2>
          <p style={S.sub}>{t("auth.signing_as").replace("{phone}", phone)}</p>
          {error && <p style={S.error}>{error}</p>}
          <input
            style={S.input}
            type="password"
            placeholder={t("auth.ph_password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
            autoFocus
            autoComplete="current-password"
          />
          <button
            style={{ ...S.primaryBtn, opacity: loading || !password ? 0.55 : 1 }}
            onClick={handlePasswordLogin}
            disabled={loading || !password}
          >
            {loading ? t("auth.signing_in") : t("auth.sign_in")}
          </button>
          <button style={S.ghostBtn} onClick={() => { go("forgot_phone"); setHint(null); }}>
            {t("auth.forgot")}
          </button>
          <button style={S.ghostBtn} onClick={() => { go("phone"); setPassword(""); }}>
            {t("auth.different_number")}
          </button>
        </>
      )}

      {step === "otp" && (
        <>
          <h2 style={S.title}>{t("auth.title_otp")}</h2>
          <p style={S.sub}>{t("auth.otp_sent").replace("{phone}", phone)}</p>
          {error && <p style={S.error}>{error}</p>}
          {hint && <p style={S.hint}>{hint}</p>}
          <OtpBoxes value={otp} onChange={setOtp} autoFocus />
          <button
            style={{ ...S.primaryBtn, opacity: loading || otp.length < 6 ? 0.55 : 1 }}
            onClick={handleVerifyOtp}
            disabled={loading || otp.length < 6}
          >
            {loading ? t("auth.verifying") : t("auth.confirm")}
          </button>
          <button
            style={{ ...S.ghostBtn, opacity: resendIn > 0 ? 0.55 : 1 }}
            onClick={() => void handleResendOtp("register")}
            disabled={resendIn > 0}
          >
            {resendIn > 0
              ? t("auth.resend_in").replace("{n}", String(resendIn))
              : t("auth.resend")}
          </button>
          <button
            style={S.ghostBtn}
            onClick={() => { go("phone"); setOtp(""); setHint(null); }}
          >
            {t("auth.different_number")}
          </button>
        </>
      )}

      {step === "profile_setup" && (
        <>
          <h2 style={S.title}>{t("auth.title_profile")}</h2>
          <p style={S.sub}>{t("auth.sub_profile")}</p>
          {error && <p style={S.error}>{error}</p>}
          <label style={S.label}>{t("auth.label_name")}</label>
          <input
            style={S.input}
            type="text"
            placeholder={t("auth.ph_name")}
            value={setupName}
            onChange={(e) => setSetupName(e.target.value)}
            autoFocus
            autoComplete="name"
          />
          <label style={S.label}>
            {t("auth.label_email")}{" "}
            <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>{t("auth.optional")}</span>
          </label>
          <input
            style={S.input}
            type="email"
            placeholder={t("auth.ph_email")}
            value={setupEmail}
            onChange={(e) => setSetupEmail(e.target.value)}
            autoComplete="email"
          />
          <label style={S.label}>{t("auth.label_password")}</label>
          <input
            style={S.input}
            type="password"
            placeholder={t("auth.ph_password_min")}
            value={setupPwd}
            onChange={(e) => setSetupPwd(e.target.value)}
            autoComplete="new-password"
          />
          <label style={S.label}>{t("auth.label_confirm_password")}</label>
          <input
            style={S.input}
            type="password"
            placeholder={t("auth.ph_password_repeat")}
            value={setupPwdConfirm}
            onChange={(e) => setSetupPwdConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCompleteProfile()}
            autoComplete="new-password"
          />
          <button
            style={{
              ...S.primaryBtn,
              opacity: loading || !setupName.trim() || !setupPwd ? 0.55 : 1,
            }}
            onClick={handleCompleteProfile}
            disabled={loading || !setupName.trim() || !setupPwd}
          >
            {loading ? t("auth.saving") : t("auth.create_account")}
          </button>
          <button
            style={{ ...S.ghostBtn, marginTop: "0.25rem" }}
            onClick={() => {
              if (!pendingCustomer) return;
              onSuccess(displayName(pendingCustomer));
            }}
          >
            {t("auth.skip_profile")}
          </button>
        </>
      )}

      {step === "forgot_phone" && (
        <>
          <h2 style={S.title}>{t("auth.title_forgot")}</h2>
          <p style={S.sub}>{t("auth.sub_forgot")}</p>
          {error && <p style={S.error}>{error}</p>}
          <PhoneInput
            value={phone}
            onChange={setPhone}
            onEnter={handleForgotRequest}
            autoFocus
          />
          <button
            style={{ ...S.primaryBtn, opacity: loading || !phone ? 0.55 : 1 }}
            onClick={handleForgotRequest}
            disabled={loading || !phone}
          >
            {loading ? t("auth.sending") : t("auth.send_reset")}
          </button>
          <button style={S.ghostBtn} onClick={() => go("password")}>
            {t("auth.back_pass")}
          </button>
        </>
      )}

      {step === "forgot_otp" && (
        <>
          <h2 style={S.title}>{t("auth.title_forgot_otp")}</h2>
          <p style={S.sub}>{t("auth.reset_sent").replace("{phone}", phone)}</p>
          {error && <p style={S.error}>{error}</p>}
          {hint && <p style={S.hint}>{hint}</p>}
          <OtpBoxes value={resetOtp} onChange={setResetOtp} autoFocus />
          <button
            style={{ ...S.primaryBtn, opacity: loading || resetOtp.length < 6 ? 0.55 : 1 }}
            onClick={() => go("reset_password")}
            disabled={loading || resetOtp.length < 6}
          >
            {t("auth.continue")}
          </button>
          <button
            style={{ ...S.ghostBtn, opacity: resendIn > 0 ? 0.55 : 1 }}
            onClick={() => void handleResendOtp("reset_password")}
            disabled={resendIn > 0}
          >
            {resendIn > 0
              ? t("auth.resend_in").replace("{n}", String(resendIn))
              : t("auth.resend")}
          </button>
          <button
            style={S.ghostBtn}
            onClick={() => { go("forgot_phone"); setResetOtp(""); setHint(null); }}
          >
            {t("auth.different_number")}
          </button>
        </>
      )}

      {step === "reset_password" && (
        <>
          <h2 style={S.title}>{t("auth.title_new_pass")}</h2>
          <p style={S.sub}>{t("auth.new_pass_for").replace("{phone}", phone)}</p>
          {error && <p style={S.error}>{error}</p>}
          <label style={S.label}>{t("auth.label_new_password")}</label>
          <input
            style={S.input}
            type="password"
            placeholder={t("auth.ph_password_min")}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            autoFocus
            autoComplete="new-password"
          />
          <label style={S.label}>{t("auth.label_confirm_password")}</label>
          <input
            style={S.input}
            type="password"
            placeholder={t("auth.ph_password_repeat")}
            value={newPwdConfirm}
            onChange={(e) => setNewPwdConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
            autoComplete="new-password"
          />
          <button
            style={{ ...S.primaryBtn, opacity: loading || !newPwd ? 0.55 : 1 }}
            onClick={handleResetPassword}
            disabled={loading || !newPwd}
          >
            {loading ? t("auth.saving") : t("auth.set_password")}
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
    padding: "2rem 1.75rem",
    marginBottom: "1rem",
    border: "1px solid var(--color-border)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)",
  },
  logoWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "1.5rem",
    position: "relative",
  },
  logo: {
    height: 48,
    width: "auto",
    objectFit: "contain" as const,
  },
  title: {
    fontSize: "1.375rem",
    fontWeight: 700,
    color: "var(--color-text)",
    marginBottom: "0.375rem",
    lineHeight: 1.3,
  },
  sub: {
    color: "var(--color-text-muted)",
    fontSize: "0.9rem",
    lineHeight: 1.6,
    marginBottom: "1.25rem",
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
    marginTop: "0.75rem",
    lineHeight: 1.55,
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
    padding: "0 0.875rem",
    border: "1.5px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    fontSize: "1rem",
    minHeight: 44,
    marginBottom: "0.75rem",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "var(--color-text)",
    background: "var(--color-surface)",
    outline: "none",
  },
  // Phone field with inline +960 prefix
  phoneRow: {
    display: "flex",
    alignItems: "stretch",
    border: "1.5px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    marginBottom: "0.75rem",
    overflow: "hidden",
    background: "var(--color-surface)",
  },
  prefix: {
    padding: "0 0.875rem",
    color: "var(--color-text-muted)",
    fontWeight: 600,
    fontSize: "1rem",
    borderRight: "1.5px solid var(--color-border)",
    display: "flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    userSelect: "none",
    flexShrink: 0,
  },
  phoneFieldInner: {
    flex: 1,
    minWidth: 0,
    padding: "0 0.875rem",
    border: "none",
    borderRadius: 0,
    fontSize: "1rem",
    minHeight: 44,
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "var(--color-text)",
    background: "transparent",
    outline: "none",
  },
  primaryBtn: {
    width: "100%",
    padding: "0 1rem",
    minHeight: 44,
    background: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s",
  },
  ghostBtn: {
    width: "100%",
    marginTop: "0.625rem",
    padding: "0 1rem",
    minHeight: 44,
    background: "transparent",
    color: "var(--color-text-muted)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    fontSize: "0.9rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  // OTP digit boxes
  otpRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  otpBox: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    border: "1.5px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    fontSize: "1.375rem",
    fontWeight: 700,
    textAlign: "center",
    minHeight: 52,
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "var(--color-text)",
    background: "var(--color-surface)",
    outline: "none",
    cursor: "text",
    caretColor: "var(--color-primary)",
  },
  otpBoxFilled: {
    borderColor: "var(--color-primary)",
  },
};
