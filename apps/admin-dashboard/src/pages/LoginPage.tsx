import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  needsTwoFactor, phoneLogin, pinLogin, staffPasswordResetRequest, staffPasswordResetVerify,
  twoFactorChallenge,
  type StaffUser,
} from '../api';

type Screen = 'login' | 'two-factor' | 'reset-phone' | 'reset-otp';
type LoginMode = 'password' | 'pin';

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  borderRadius: 10, padding: '11px 14px',
  border: '1px solid #EDE4D4', fontSize: 15,
  color: '#2A1E0C', background: '#FFFDF9', outline: 'none',
  fontFamily: 'inherit',
};

const BTN_PRIMARY: React.CSSProperties = {
  width: '100%', height: 50, borderRadius: 12, border: 'none',
  background: 'var(--color-primary)', color: '#fff',
  fontSize: 15, fontWeight: 700, cursor: 'pointer',
  transition: 'background 0.15s', fontFamily: 'inherit',
};

const BTN_GHOST: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--color-primary)', fontSize: 13, fontWeight: 600,
  fontFamily: 'inherit', padding: 0,
};

export function LoginPage({ onLogin }: { onLogin: (user: StaffUser, returnTo?: string) => void }) {
  const location = useLocation();
  const returnTo = (location.state as { from?: string } | null)?.from;

  const [screen, setScreen]         = useState<Screen>('login');
  const [loginMode, setLoginMode]   = useState<LoginMode>('password');

  // Login
  const [phone, setPhone]           = useState('');
  const [pin, setPin]               = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Second factor — only reached when the account has one enrolled.
  const [challenge, setChallenge]   = useState('');
  const [code, setCode]             = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [codeError, setCodeError]   = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  // Reset — step 1
  const [resetPhone, setResetPhone]   = useState('');
  const [resetMsg, setResetMsg]       = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Reset — step 2
  const [otp, setOtp]               = useState('');
  const [newPass, setNewPass]       = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [otpError, setOtpError]     = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    if (loginMode === 'password' && !password) return;
    if (loginMode === 'pin' && pin.length < 4) return;
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = loginMode === 'pin'
        ? await pinLogin(phone.trim(), pin.trim())
        : await phoneLogin(phone.trim(), password);

      if (needsTwoFactor(res)) {
        // The password was right, but nothing is signed in yet.
        setChallenge(res.challenge);
        setCode('');
        setUseRecovery(false);
        setCodeError('');
        setScreen('two-factor');
        return;
      }

      onLogin(res.user, returnTo);
    } catch (err) {
      setLoginError((err as Error).message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setCodeError('');
    setCodeLoading(true);
    try {
      const res = await twoFactorChallenge(challenge, code.trim());
      if (res.recovery_code_used) {
        // They got in without the phone, so the phone is gone. Say it out
        // loud — otherwise the codes get burned one at a time until none are
        // left and the account is locked for good.
        window.alert(res.message);
      }
      onLogin(res.user, returnTo);
    } catch (err) {
      setCodeError((err as Error).message);
      setCode('');
    } finally {
      setCodeLoading(false);
    }
  };

  const backToPassword = () => {
    // The challenge is spent either way; make them start over cleanly.
    setScreen('login');
    setChallenge('');
    setCode('');
    setCodeError('');
    setPassword('');
    setPin('');
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPhone.trim()) return;
    setResetLoading(true);
    setResetMsg('');
    try {
      await staffPasswordResetRequest(resetPhone.trim());
      setResetMsg('OTP sent. Enter it below.');
      setScreen('reset-otp');
    } catch (err) {
      setResetMsg((err as Error).message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !newPass || newPass !== confirmPass) {
      setOtpError('Passwords do not match.');
      return;
    }
    setOtpError('');
    setOtpLoading(true);
    try {
      await staffPasswordResetVerify(resetPhone.trim(), otp.trim(), newPass, confirmPass);
      setOtpSuccess('Password updated! You can now log in.');
      setTimeout(() => setScreen('login'), 2000);
    } catch (err) {
      setOtpError((err as Error).message);
    } finally {
      setOtpLoading(false);
    }
  };

  const card: React.CSSProperties = {
    background: 'var(--color-surface)', borderRadius: 20, padding: '40px 36px',
    width: '100%', maxWidth: 400, boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
  };

  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: 'var(--color-text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  };

  const logo = (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <img src="/logo.png" alt="Bake & Grill" style={{ width: 64, height: 64, borderRadius: 14, marginBottom: 10, display: 'inline-block' }} />
    </div>
  );

  // ── Login screen ────────────────────────────────────────────────────────────
  if (screen === 'login') {
    return (
      <div style={wrap}>
        <div style={card}>
          {logo}
          <h2 style={{ textAlign: 'center', margin: '0 0 24px', fontSize: 20, color: 'var(--color-text)', fontWeight: 700 }}>
            Admin Sign In
          </h2>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['password', 'pin'] as LoginMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => { setLoginMode(mode); setLoginError(''); }}
                style={{
                  flex: 1, height: 40, borderRadius: 10, cursor: 'pointer', fontWeight: 700,
                  border: `1px solid ${loginMode === mode ? 'var(--color-primary)' : '#EDE4D4'}`,
                  background: loginMode === mode ? '#FEF3E8' : '#FFFDF9',
                  color: loginMode === mode ? '#9A3412' : '#8B7355',
                }}
              >
                {mode === 'password' ? 'Password' : 'PIN'}
              </button>
            ))}
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Mobile or email
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="7820288 or you@example.com"
                autoComplete="username"
                autoFocus
                style={INPUT}
              />
            </div>

            {loginMode === 'password' ? (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your admin password"
                  autoComplete="current-password"
                  style={{ ...INPUT, paddingRight: 48 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)', fontSize: 13, fontFamily: 'inherit',
                  }}
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            ) : (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="4–8 digit staff PIN"
                autoComplete="one-time-code"
                style={INPUT}
              />
            </div>
            )}

            {loginError && (
              <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)', borderRadius: 10, padding: '10px 14px', fontSize: 13, textAlign: 'center' }}>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading || !phone.trim() || (loginMode === 'password' ? !password : pin.length < 4)}
              style={{ ...BTN_PRIMARY, opacity: (loginLoading || !phone.trim() || (loginMode === 'password' ? !password : pin.length < 4)) ? 0.6 : 1, marginTop: 4 }}
            >
              {loginLoading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <a href="/" style={{ fontSize: 12, color: '#C4A882', textDecoration: 'none' }}>← Main Website</a>
            {loginMode === 'password' && (
              <button style={BTN_GHOST} onClick={() => { setScreen('reset-phone'); setResetPhone(phone); }}>
                Forgot password?
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Second factor ───────────────────────────────────────────────────────────
  if (screen === 'two-factor') {
    return (
      <div style={wrap}>
        <div style={card}>
          {logo}
          <h2 style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 20, color: 'var(--color-text)', fontWeight: 700 }}>
            Two-Factor Code
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 24px' }}>
            {useRecovery
              ? 'Enter one of the recovery codes you saved when you set this up.'
              : 'Open your authenticator app and enter the 6-digit code.'}
          </p>

          <form onSubmit={handleTwoFactor} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              type="text"
              inputMode={useRecovery ? 'text' : 'numeric'}
              value={code}
              onChange={(e) => setCode(
                useRecovery
                  ? e.target.value.toUpperCase().slice(0, 12)
                  : e.target.value.replace(/\D/g, '').slice(0, 6),
              )}
              placeholder={useRecovery ? 'XXXXX-XXXXX' : '000000'}
              // The code is on the phone in the user's hand; a password
              // manager has nothing useful to offer here.
              autoComplete="one-time-code"
              autoFocus
              style={{
                ...INPUT,
                letterSpacing: '0.3em',
                textAlign: 'center',
                fontSize: 22,
                fontVariantNumeric: 'tabular-nums',
              }}
            />

            {codeError && (
              <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)', borderRadius: 10, padding: '10px 14px', fontSize: 13, textAlign: 'center' }}>
                {codeError}
              </div>
            )}

            <button
              type="submit"
              disabled={codeLoading || code.trim().length < (useRecovery ? 10 : 6)}
              style={{ ...BTN_PRIMARY, opacity: (codeLoading || code.trim().length < (useRecovery ? 10 : 6)) ? 0.6 : 1 }}
            >
              {codeLoading ? 'Checking…' : 'Verify →'}
            </button>
          </form>

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button style={BTN_GHOST} onClick={backToPassword}>← Back</button>
            {/* The way back in when the phone is lost, broken, or at home. */}
            <button
              style={BTN_GHOST}
              onClick={() => { setUseRecovery((v) => !v); setCode(''); setCodeError(''); }}
            >
              {useRecovery ? 'Use authenticator app' : 'Lost your phone?'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Reset step 1: enter phone ───────────────────────────────────────────────
  if (screen === 'reset-phone') {
    return (
      <div style={wrap}>
        <div style={card}>
          {logo}
          <h2 style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 20, color: 'var(--color-text)', fontWeight: 700 }}>
            Reset Password
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 24px' }}>
            Enter your mobile number — we'll send a 6-digit code.
          </p>

          <form onSubmit={handleResetRequest} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              type="tel"
              value={resetPhone}
              onChange={(e) => setResetPhone(e.target.value)}
              placeholder="+960 7XX XXXX"
              autoFocus
              style={INPUT}
            />
            {resetMsg && (
              <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)', borderRadius: 10, padding: '10px 14px', fontSize: 13, textAlign: 'center' }}>
                {resetMsg}
              </div>
            )}
            <button type="submit" disabled={resetLoading || !resetPhone.trim()} style={{ ...BTN_PRIMARY, opacity: (resetLoading || !resetPhone.trim()) ? 0.6 : 1 }}>
              {resetLoading ? 'Sending…' : 'Send OTP →'}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button style={BTN_GHOST} onClick={() => setScreen('login')}>← Back to login</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Reset step 2: enter OTP + new password ─────────────────────────────────
  return (
    <div style={wrap}>
      <div style={card}>
        {logo}
        <h2 style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 20, color: 'var(--color-text)', fontWeight: 700 }}>
          Set New Password
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14, margin: '0 0 24px' }}>
          Enter the 6-digit code sent to <strong>{resetPhone}</strong>
        </p>

        {otpSuccess ? (
          <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-strong)', borderRadius: 10, padding: '14px', fontSize: 14, textAlign: 'center', fontWeight: 600 }}>
            {otpSuccess}
          </div>
        ) : (
          <form onSubmit={handleResetVerify} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>OTP Code</label>
              <input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" autoFocus style={{ ...INPUT, letterSpacing: '0.3em', textAlign: 'center', fontSize: 20 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Password</label>
              <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Min 8 characters" style={INPUT} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirm Password</label>
              <input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="Repeat new password" style={INPUT} />
            </div>

            {otpError && (
              <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)', borderRadius: 10, padding: '10px 14px', fontSize: 13, textAlign: 'center' }}>
                {otpError}
              </div>
            )}

            <button type="submit" disabled={otpLoading || !otp || !newPass || !confirmPass} style={{ ...BTN_PRIMARY, opacity: (otpLoading || !otp || !newPass || !confirmPass) ? 0.6 : 1, marginTop: 4 }}>
              {otpLoading ? 'Updating…' : 'Update Password →'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
          <button style={BTN_GHOST} onClick={() => setScreen('reset-phone')}>← Resend OTP</button>
          <button style={BTN_GHOST} onClick={() => setScreen('login')}>Back to login</button>
        </div>
      </div>
    </div>
  );
}
