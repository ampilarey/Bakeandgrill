import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  type OtpSendResult,
} from "../api";
import { persistGuestPhone } from "../utils/guestPhone";
import { useSiteSettingsContext } from "../context/SiteSettingsContext";
import { useLanguage } from "../context/LanguageContext";
import { brandLogoSrc } from "../lib/brandLogo";
import "./AuthBlock.css";

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
 * Keep the stored value as the local 7-digit number. A pasted or autofilled
 * "+960 777 1234" / "00960…" loses its country code; a local number that
 * happens to start with 960 is left alone because it is only 7 digits.
 */
export function normalisePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00960") && digits.length > 7) digits = digits.slice(5);
  else if (digits.startsWith("960") && digits.length > 7) digits = digits.slice(3);
  return digits.slice(0, 7);
}

/** "7771234" → "777 1234", the way numbers are written in the Maldives. */
export function formatPhone(digits: string): string {
  return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

/** Same rule as the server (MaldivesPhone): 7 digits starting 3, 6, 7 or 9. */
export function isValidPhone(digits: string): boolean {
  return /^[3679]\d{6}$/.test(digits);
}

type PhoneState = "empty" | "typing" | "ok" | "bad";

function phoneState(digits: string): PhoneState {
  if (!digits) return "empty";
  if (!/^[3679]/.test(digits)) return "bad";
  return digits.length === 7 ? "ok" : "typing";
}

// ── Icons (decorative, inline so the card has no extra requests) ─────────────

const Svg = ({ children, size = 18 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const MaldivesFlag = () => (
  <svg className="auth__flag" viewBox="0 0 30 20" aria-hidden="true">
    <rect width="30" height="20" fill="#D21034" />
    <rect x="7.5" y="5" width="15" height="10" fill="#007E3A" />
    <circle cx="16.2" cy="10" r="3.6" fill="#fff" />
    <circle cx="17.5" cy="10" r="3.1" fill="#007E3A" />
  </svg>
);

const IconCheck = () => <Svg size={16}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
const IconClear = () => <Svg size={18}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
const IconLock = () => <Svg size={15}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
const IconMail = () => <Svg size={18}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></Svg>;
const IconAlert = () => <Svg size={16}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></Svg>;
const IconTrack = () => <Svg><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></Svg>;
const IconStar = () => <Svg><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></Svg>;
const IconRepeat = () => <Svg><path d="M17 2.5l3 3-3 3" /><path d="M4 11v-1.5a4 4 0 0 1 4-4h12" /><path d="M7 21.5l-3-3 3-3" /><path d="M20 13v1.5a4 4 0 0 1-4 4H4" /></Svg>;

// ── Shared sub-components ────────────────────────────────────────────────────

/**
 * Phone number field: Maldives flag and +960 chip, digits shown as "777 1234",
 * and a status line that says how many digits are left or whether the number
 * can be used, before the customer presses Continue.
 */
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
  const inputRef = useRef<HTMLInputElement>(null);
  // Digits before the caret at the last edit, so the space we insert does
  // not push the caret to the end when someone corrects a middle digit.
  const caretDigits = useRef<number | null>(null);
  const state = phoneState(value);

  useLayoutEffect(() => {
    const el = inputRef.current;
    const n = caretDigits.current;
    caretDigits.current = null;
    if (!el || n === null || document.activeElement !== el) return;
    const shown = el.value;
    let pos = 0;
    for (let seen = 0; pos < shown.length && seen < n; pos++) {
      if (/\d/.test(shown[pos])) seen++;
    }
    el.setSelectionRange(pos, pos);
  }, [value]);

  const left = 7 - value.length;
  const status =
    state === "ok" ? t("auth.phone_ok")
    : state === "bad" ? t("auth.phone_bad_prefix")
    : state === "typing" ? (left === 1 ? t("auth.phone_one_left") : t("auth.phone_left").replace("{n}", String(left)))
    : t("auth.phone_help");

  return (
    <>
      <div className="auth__phone" data-state={state} dir="ltr">
        <span className="auth__cc" aria-hidden="true">
          <MaldivesFlag />
          +960
        </span>
        <input
          ref={inputRef}
          className="auth__phone-input"
          type="tel"
          inputMode="numeric"
          placeholder={t("auth.ph_phone")}
          value={formatPhone(value)}
          onChange={(e) => {
            const el = e.target;
            caretDigits.current = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, "").length;
            onChange(normalisePhone(el.value));
          }}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          autoFocus={autoFocus}
          autoComplete="tel-national"
          aria-label={t("auth.label_phone_cc")}
          aria-invalid={state === "bad" ? true : undefined}
          aria-describedby="auth-phone-status"
        />
        <span className="auth__phone-end">
          {state === "ok" ? (
            <span className="auth__phone-ok" aria-hidden="true"><IconCheck /></span>
          ) : value ? (
            <button
              type="button"
              className="auth__phone-clear"
              onClick={() => { onChange(""); inputRef.current?.focus(); }}
              aria-label={t("auth.clear_phone")}
            >
              <IconClear />
            </button>
          ) : null}
        </span>
      </div>
      <p id="auth-phone-status" className="auth__phone-status" data-state={state} aria-live="polite">
        {status}
      </p>
    </>
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
    const typed = e.target.value.replace(/\D/g, "");
    if (!typed) return;
    // iOS fills the whole code into the first box from the SMS suggestion.
    if (typed.length >= 4) {
      const code = typed.slice(-6);
      onChange(code);
      setTimeout(() => refs.current[Math.min(code.length, 5)]?.focus(), 0);
      return;
    }
    const arr = Array.from({ length: 6 }, (_, k) => value[k] ?? "");
    arr[i] = typed.slice(-1);
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
    <div className="auth__otp">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="auth__otp-box"
          type="text"
          inputMode="numeric"
          maxLength={i === 0 ? 6 : 1}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          autoFocus={autoFocus && i === 0}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          data-filled={value[i] ? "true" : "false"}
          aria-label={t("auth.digit_aria").replace("{n}", String(i + 1))}
        />
      ))}
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  loading,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="auth__btn auth__btn--primary"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="auth__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

function Message({ kind, children }: { kind: "error" | "hint"; children: React.ReactNode }) {
  return (
    <p className={kind === "error" ? "auth__error" : "auth__hint"} role={kind === "error" ? "alert" : "status"}>
      {kind === "error" ? <IconAlert /> : <IconCheck />}
      <span>{children}</span>
    </p>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function AuthBlock({ onSuccess, skipProfileSetup = false }: Props) {
  const { settings, text } = useSiteSettingsContext();
  const { t } = useLanguage();

  // Light logo in both themes: it sits in a cream well (see AuthBlock.css).
  const logoLight = brandLogoSrc(settings, false);
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

  const phoneOk = isValidPhone(phone);

  // "Email me the code instead": the masked address on the account (from the
  // server, after it texts a code) and which way the current code went.
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [codeChannel, setCodeChannel] = useState<"sms" | "email">("sms");
  const [switching, setSwitching] = useState(false);

  /** Remember what the server said about a texted code. */
  const noteTexted = (r: OtpSendResult) => {
    setEmailHint(r.email_hint ?? null);
    setCodeChannel("sms");
  };

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
      // Resend the same way the last code went.
      const r = await requestOtp(phone, purpose, { channel: codeChannel });
      if (codeChannel === "sms") noteTexted(r);
      if (import.meta.env.DEV && r.otp) setHint(`Dev OTP: ${r.otp}`);
      else setHint(t("auth.hint_code_sent"));
      setResendIn(30);
    } catch (e) { setError((e as Error).message); }
  };

  /** Send a fresh code the other way: to the account's email, or back to SMS. */
  const handleSwitchChannel = async (purpose: "register" | "reset_password") => {
    if (switching) return;
    const next = codeChannel === "sms" ? "email" : "sms";
    setError(""); setHint(null);
    setSwitching(true);
    try {
      const r = await requestOtp(phone, purpose, { channel: next });
      if (next === "sms") noteTexted(r);
      else setCodeChannel("email");
      if (purpose === "register") setOtp(""); else setResetOtp("");
      setResendIn(30);
      if (import.meta.env.DEV && r.otp) setHint(`Dev OTP: ${r.otp}`);
      else setHint(next === "email" ? t("auth.emailed_new") : t("auth.texted_new").replace("{phone}", formatPhone(phone)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSwitching(false);
    }
  };

  const go = (s: Step) => {
    setError("");
    setStep(s);
    if (s === "otp" || s === "forgot_otp") setResendIn(30);
  };

  const handleCheckPhone = async () => {
    if (!phoneOk || loading) return;
    setError("");
    setLoading(true);
    try {
      persistGuestPhone(phone);
      const res = await checkPhone(phone);
      if (res.has_password) {
        go("password");
      } else {
        const r = await requestOtp(phone, "register");
        noteTexted(r);
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
    if (!phoneOk || loading) return;
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
          noteTexted(r);
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
    if (!password || loading) return;
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
    if (otp.length < 6 || loading) return;
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
    if (!pendingCustomer || loading) return;
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
    if (!phoneOk || loading) return;
    setError("");
    setLoading(true);
    try {
      const r = await forgotPassword(phone);
      noteTexted(r);
      if (import.meta.env.DEV && r.otp) setHint(`Dev OTP: ${r.otp}`);
      go("forgot_otp");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPwd || loading) return;
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

  /** "Code sent to +960 777 1234 · Change" with the number in bold. */
  const sentTo = (
    template: string,
    onChangeNumber?: () => void,
    to: { token: string; value: string } = { token: "+960 {phone}", value: `+960 ${formatPhone(phone)}` },
  ) => {
    const [before, after = ""] = template.split(to.token);
    return (
      <p className="auth__sub">
        {before}
        <strong>{to.value}</strong>
        {after}
        {onChangeNumber && (
          <button type="button" className="auth__change" onClick={onChangeNumber}>
            {t("auth.change")}
          </button>
        )}
      </p>
    );
  };

  const resendLink = (purpose: "register" | "reset_password") => (
    <button
      type="button"
      className="auth__link"
      onClick={() => void handleResendOtp(purpose)}
      disabled={resendIn > 0}
    >
      {resendIn > 0
        ? t("auth.resend_in").replace("{n}", String(resendIn))
        : t("auth.resend")}
    </button>
  );

  /** Where the code went: the phone, or (after a switch) the account's email. */
  const codeSentTo = (smsTemplate: string, onChangeNumber: () => void) =>
    codeChannel === "email" && emailHint
      ? sentTo(t("auth.otp_emailed"), onChangeNumber, { token: "{email}", value: emailHint })
      : sentTo(smsTemplate, onChangeNumber);

  /**
   * Owner, 2026-10-06: "Why there is no email option in login?" The code can
   * go to the email already on the account; only offered when it has one.
   */
  const switchChannel = (purpose: "register" | "reset_password") => {
    if (!emailHint) return null;
    if (codeChannel === "sms") {
      return (
        <button
          type="button"
          className="auth__btn auth__btn--outline auth__btn--stacked"
          onClick={() => void handleSwitchChannel(purpose)}
          disabled={switching}
          aria-busy={switching || undefined}
        >
          {switching ? <span className="auth__spinner" aria-hidden="true" /> : <IconMail />}
          <span className="auth__btn-text">
            {t("auth.email_instead")}
            <small>{t("auth.email_instead_to").replace("{email}", emailHint)}</small>
          </span>
        </button>
      );
    }
    return (
      <button
        type="button"
        className="auth__link"
        onClick={() => void handleSwitchChannel(purpose)}
        disabled={switching || resendIn > 0}
      >
        {t("auth.sms_instead")}
      </button>
    );
  };

  const errorMsg = error ? <Message kind="error">{error}</Message> : null;
  const hintMsg = hint ? <Message kind="hint">{hint}</Message> : null;

  return (
    <section className="auth" data-step={step} aria-label={t("auth.region_label")}>
      <div className="auth__grid">
        <div className="auth__brand">
          <div className="auth__logo-well">
            <img src={logoLight} alt={siteName} />
          </div>
          <div className="auth__brand-text">
            <p className="auth__brand-name">{siteName}</p>
            <p className="auth__brand-line">{t("auth.brand_line")}</p>
          </div>
          <ul className="auth__perks">
            <li className="auth__perk"><span className="auth__perk-icon"><IconTrack /></span>{t("auth.perk_track")}</li>
            <li className="auth__perk"><span className="auth__perk-icon"><IconStar /></span>{t("auth.perk_rewards")}</li>
            <li className="auth__perk"><span className="auth__perk-icon"><IconRepeat /></span>{t("auth.perk_reorder")}</li>
          </ul>
        </div>

        <div className="auth__body">
          <div className="auth__form">

      {step === "phone" && (
        <>
          <h2 className="auth__title">{t("auth.title_phone")}</h2>
          <p className="auth__sub">{t("auth.sub_phone")}</p>
          {errorMsg}
          <PhoneInput
            value={phone}
            onChange={setPhone}
            onEnter={handleCheckPhone}
            autoFocus
          />
          <PrimaryButton onClick={handleCheckPhone} disabled={!phoneOk} loading={loading}>
            {loading ? t("auth.checking") : t("auth.continue")}
          </PrimaryButton>
          {skipProfileSetup && (
            <button type="button" className="auth__btn auth__btn--outline" onClick={() => { go("guest"); setError(""); }}>
              {t("auth.guest_cta")}
            </button>
          )}
          <p className="auth__note">
            <IconLock />
            <span>{text("order_auth_privacy_line", t("auth.privacy_line"))}</span>
          </p>
        </>
      )}

      {step === "guest" && (
        <>
          <h2 className="auth__title">{t("auth.title_guest")}</h2>
          <p className="auth__sub">{t("auth.sub_guest")}</p>
          {errorMsg}
          <label className="auth__label" htmlFor="auth-guest-name">{t("auth.label_name")}</label>
          <input
            id="auth-guest-name"
            className="auth__input"
            type="text"
            placeholder={t("auth.ph_name")}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            autoFocus
            autoComplete="name"
          />
          <label className="auth__label">{t("auth.label_phone")}</label>
          <PhoneInput value={phone} onChange={setPhone} onEnter={handleGuestCheckout} />
          <PrimaryButton onClick={handleGuestCheckout} disabled={!phoneOk || !guestName.trim()} loading={loading}>
            {loading ? t("auth.guest_starting") : t("auth.guest_continue")}
          </PrimaryButton>
          <div className="auth__links auth__links--center">
            <button type="button" className="auth__link" onClick={() => { go("phone"); setGuestName(""); }}>
              {t("auth.back_otp")}
            </button>
          </div>
        </>
      )}

      {step === "password" && (
        <>
          <h2 className="auth__title">{t("auth.title_password")}</h2>
          {sentTo(t("auth.signing_as"), () => { go("phone"); setPassword(""); })}
          {errorMsg}
          {hintMsg}
          <label className="auth__label" htmlFor="auth-password">{t("auth.label_password")}</label>
          <input
            id="auth-password"
            className="auth__input"
            type="password"
            placeholder={t("auth.ph_password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
            autoFocus
            autoComplete="current-password"
          />
          <PrimaryButton onClick={handlePasswordLogin} disabled={!password} loading={loading}>
            {loading ? t("auth.signing_in") : t("auth.sign_in")}
          </PrimaryButton>
          <div className="auth__links">
            <button type="button" className="auth__link" onClick={() => { go("forgot_phone"); setHint(null); }}>
              {t("auth.forgot")}
            </button>
            <button type="button" className="auth__link auth__link--muted" onClick={() => { go("phone"); setPassword(""); }}>
              {t("auth.different_number")}
            </button>
          </div>
        </>
      )}

      {step === "otp" && (
        <>
          <h2 className="auth__title">{t("auth.title_otp")}</h2>
          {codeSentTo(t("auth.otp_sent"), () => { go("phone"); setOtp(""); setHint(null); })}
          {errorMsg}
          {hintMsg}
          <OtpBoxes key={codeChannel} value={otp} onChange={setOtp} autoFocus />
          <PrimaryButton onClick={handleVerifyOtp} disabled={otp.length < 6} loading={loading}>
            {loading ? t("auth.verifying") : t("auth.confirm")}
          </PrimaryButton>
          {codeChannel === "sms" && switchChannel("register")}
          <div className="auth__links">
            {resendLink("register")}
            {codeChannel === "email" && switchChannel("register")}
            <button
              type="button"
              className="auth__link auth__link--muted"
              onClick={() => { go("phone"); setOtp(""); setHint(null); }}
            >
              {t("auth.different_number")}
            </button>
          </div>
        </>
      )}

      {step === "profile_setup" && (
        <>
          <h2 className="auth__title">{t("auth.title_profile")}</h2>
          <p className="auth__sub">{t("auth.sub_profile")}</p>
          {errorMsg}
          <label className="auth__label" htmlFor="auth-setup-name">{t("auth.label_name")}</label>
          <input
            id="auth-setup-name"
            className="auth__input"
            type="text"
            placeholder={t("auth.ph_name")}
            value={setupName}
            onChange={(e) => setSetupName(e.target.value)}
            autoFocus
            autoComplete="name"
          />
          <label className="auth__label" htmlFor="auth-setup-email">
            {t("auth.label_email")}{" "}
            <span className="auth__label-muted">{t("auth.optional")}</span>
          </label>
          <input
            id="auth-setup-email"
            className="auth__input"
            type="email"
            placeholder={t("auth.ph_email")}
            value={setupEmail}
            onChange={(e) => setSetupEmail(e.target.value)}
            autoComplete="email"
          />
          <label className="auth__label" htmlFor="auth-setup-pwd">{t("auth.label_password")}</label>
          <input
            id="auth-setup-pwd"
            className="auth__input"
            type="password"
            placeholder={t("auth.ph_password_min")}
            value={setupPwd}
            onChange={(e) => setSetupPwd(e.target.value)}
            autoComplete="new-password"
          />
          <label className="auth__label" htmlFor="auth-setup-pwd2">{t("auth.label_confirm_password")}</label>
          <input
            id="auth-setup-pwd2"
            className="auth__input"
            type="password"
            placeholder={t("auth.ph_password_repeat")}
            value={setupPwdConfirm}
            onChange={(e) => setSetupPwdConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCompleteProfile()}
            autoComplete="new-password"
          />
          <PrimaryButton onClick={handleCompleteProfile} disabled={!setupName.trim() || !setupPwd} loading={loading}>
            {loading ? t("auth.saving") : t("auth.create_account")}
          </PrimaryButton>
          <div className="auth__links auth__links--center">
            <button
              type="button"
              className="auth__link auth__link--muted"
              onClick={() => {
                if (!pendingCustomer) return;
                onSuccess(displayName(pendingCustomer));
              }}
            >
              {t("auth.skip_profile")}
            </button>
          </div>
        </>
      )}

      {step === "forgot_phone" && (
        <>
          <h2 className="auth__title">{t("auth.title_forgot")}</h2>
          <p className="auth__sub">{t("auth.sub_forgot")}</p>
          {errorMsg}
          <PhoneInput
            value={phone}
            onChange={setPhone}
            onEnter={handleForgotRequest}
            autoFocus
          />
          <PrimaryButton onClick={handleForgotRequest} disabled={!phoneOk} loading={loading}>
            {loading ? t("auth.sending") : t("auth.send_reset")}
          </PrimaryButton>
          <div className="auth__links auth__links--center">
            <button type="button" className="auth__link" onClick={() => go("password")}>
              {t("auth.back_pass")}
            </button>
          </div>
        </>
      )}

      {step === "forgot_otp" && (
        <>
          <h2 className="auth__title">{t("auth.title_forgot_otp")}</h2>
          {codeSentTo(t("auth.reset_sent"), () => { go("forgot_phone"); setResetOtp(""); setHint(null); })}
          {errorMsg}
          {hintMsg}
          <OtpBoxes key={codeChannel} value={resetOtp} onChange={setResetOtp} autoFocus />
          <PrimaryButton onClick={() => go("reset_password")} disabled={resetOtp.length < 6} loading={false}>
            {t("auth.continue")}
          </PrimaryButton>
          {codeChannel === "sms" && switchChannel("reset_password")}
          <div className="auth__links">
            {resendLink("reset_password")}
            {codeChannel === "email" && switchChannel("reset_password")}
            <button
              type="button"
              className="auth__link auth__link--muted"
              onClick={() => { go("forgot_phone"); setResetOtp(""); setHint(null); }}
            >
              {t("auth.different_number")}
            </button>
          </div>
        </>
      )}

      {step === "reset_password" && (
        <>
          <h2 className="auth__title">{t("auth.title_new_pass")}</h2>
          {sentTo(t("auth.new_pass_for"))}
          {errorMsg}
          <label className="auth__label" htmlFor="auth-new-pwd">{t("auth.label_new_password")}</label>
          <input
            id="auth-new-pwd"
            className="auth__input"
            type="password"
            placeholder={t("auth.ph_password_min")}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            autoFocus
            autoComplete="new-password"
          />
          <label className="auth__label" htmlFor="auth-new-pwd2">{t("auth.label_confirm_password")}</label>
          <input
            id="auth-new-pwd2"
            className="auth__input"
            type="password"
            placeholder={t("auth.ph_password_repeat")}
            value={newPwdConfirm}
            onChange={(e) => setNewPwdConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
            autoComplete="new-password"
          />
          <PrimaryButton onClick={handleResetPassword} disabled={!newPwd} loading={loading}>
            {loading ? t("auth.saving") : t("auth.set_password")}
          </PrimaryButton>
        </>
      )}
          </div>
        </div>
      </div>
    </section>
  );
}
