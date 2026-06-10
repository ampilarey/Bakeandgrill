import { useEffect, useRef, useState } from 'react';
import { PosVersionLabel } from '../components/PosUpdateBanner';
import { POS_BUILD_INFO } from '../posBuildInfo';
import { palette, radius, shadow, space, type, btnPrimary, btnSecondary, inputField } from '../theme';

type SignInMode = 'pin' | 'password';

type Props = {
  username: string;
  setUsername: (v: string) => void;
  pin: string;
  setPin: (v: string) => void;
  deviceId: string;
  authError: string;
  onLogin: () => void;
  onPasswordLogin: (password: string) => void;
};

/**
 * POS sign-in screen. Designed around a tap-first workflow: cashier
 * usually has the mobile number already typed by the previous shift,
 * so we autofocus PIN-first and route on-screen numpad taps to the
 * email field only when it has focus.
 *
 * Layout is a centered card on tablet/desktop and stacks on small
 * screens. The dark band on the left is a deliberate brand moment so
 * the POS doesn't look like a generic admin form.
 */
export function LoginPage({ username, setUsername, pin, setPin, deviceId, authError, onLogin, onPasswordLogin }: Props) {
  const [signInMode, setSignInMode] = useState<SignInMode>('pin');
  const [password, setPassword] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Refs that always reflect the latest props, so the keydown listener stays
  // stable and the effect can have an empty dependency array. The previous
  // implementation depended on `[pin, username, onLogin]`, churning the
  // listener on every keystroke and silencing the lint rule.
  const pinRef = useRef(pin);
  const usernameRef = useRef(username);
  const onLoginRef = useRef(onLogin);
  const setPinRef = useRef(setPin);
  useEffect(() => { pinRef.current = pin; }, [pin]);
  useEffect(() => { usernameRef.current = username; }, [username]);
  useEffect(() => { onLoginRef.current = onLogin; }, [onLogin]);
  useEffect(() => { setPinRef.current = setPin; }, [setPin]);

  const isEmailFocused = () => document.activeElement === emailRef.current;

  const append = (d: string) => { if (pinRef.current.length < 8) setPinRef.current(pinRef.current + d); };
  const back   = ()          => setPinRef.current(pinRef.current.slice(0, -1));
  const clear  = ()          => setPinRef.current('');

  // When the numpad is tapped, route the digit to whichever field is active.
  const handleNumpad = (d: string) => {
    if (d === '⌫') {
      if (isEmailFocused()) {
        setUsername(usernameRef.current.slice(0, -1));
        emailRef.current?.focus();
      } else {
        back();
      }
    } else if (d !== '') {
      if (isEmailFocused()) {
        setUsername(usernameRef.current + d);
        emailRef.current?.focus();
      } else {
        append(d);
      }
    }
  };

  // Allow typing the PIN directly from a hardware keyboard when no input is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEmailFocused()) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      if (/^[0-9]$/.test(e.key))     append(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Escape')    clear();
      else if (e.key === 'Enter')     onLoginRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // append/back/clear read from refs; safe to depend on nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmitPin = !!username.trim() && pin.length >= 4;
  const canSubmitPassword = !!username.trim() && password.length >= 6;

  const switchMode = (mode: SignInMode) => {
    setSignInMode(mode);
    setPin('');
    setPassword('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${palette.ink} 0%, ${palette.inkSoft} 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.xxl,
      fontFamily: 'inherit',
    }}>
      <div style={{
        background: palette.panel,
        borderRadius: radius.xxl,
        width: '100%',
        maxWidth: 420,
        boxShadow: shadow.xl,
        overflow: 'hidden',
        animation: 'pos-scale-in 200ms ease',
      }}>
        {/* Hero band — keeps the brand orange visible without making
            the whole screen warm. */}
        <div style={{
          background: `linear-gradient(120deg, ${palette.primaryDark} 0%, ${palette.primary} 100%)`,
          padding: `${space.xxl}px ${space.xxl}px ${space.xl}px`,
          color: '#FFFFFF',
          textAlign: 'center',
        }}>
          <img
            src="/logo.png"
            alt="Bake & Grill"
            style={{
              width: 56,
              height: 56,
              borderRadius: radius.l,
              marginBottom: space.s,
              boxShadow: shadow.m,
              background: 'rgba(255,255,255,0.16)',
              padding: 4,
            }}
          />
          <div style={{ ...type.title, color: '#FFFFFF' }}>Bake &amp; Grill POS</div>
          <div style={{ ...type.bodySm, color: 'rgba(255,255,255,0.85)', marginTop: space.xxs }}>
            Sign in to start a shift
          </div>
        </div>

        <div style={{ padding: space.xxl }}>
          {/* Mobile / Email */}
          <div style={{ marginBottom: space.l }}>
            <label style={{ ...type.label, color: palette.panelMuted, display: 'block', marginBottom: space.xxs }}>
              Mobile or email
            </label>
            <input
              ref={emailRef}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onLogin()}
              placeholder="7XXXXXX or you@example.com"
              autoComplete="username"
              style={{ ...inputField, width: '100%' }}
            />
          </div>

          {/* Device ID — read-only display */}
          <div style={{ marginBottom: space.l }}>
            <label style={{ ...type.label, color: palette.panelMuted, display: 'block', marginBottom: space.xxs }}>
              Device ID
            </label>
            <div style={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: radius.s,
              padding: `${space.s}px ${space.m}px`,
              border: `1px dashed ${palette.borderStrong}`,
              ...type.caption,
              color: palette.panelMuted,
              background: palette.bgAlt,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              letterSpacing: '0.05em',
              userSelect: 'all',
            }}>
              {deviceId}
            </div>
          </div>

          <div style={{ display: 'flex', gap: space.xs, marginBottom: space.l }}>
            <button
              type="button"
              onClick={() => switchMode('pin')}
              style={{
                flex: 1,
                height: 40,
                borderRadius: radius.s,
                border: `1px solid ${signInMode === 'pin' ? palette.primary : palette.border}`,
                background: signInMode === 'pin' ? palette.primaryBg : palette.panel,
                color: signInMode === 'pin' ? palette.primaryDark : palette.panelMuted,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Staff PIN
            </button>
            <button
              type="button"
              onClick={() => switchMode('password')}
              style={{
                flex: 1,
                height: 40,
                borderRadius: radius.s,
                border: `1px solid ${signInMode === 'password' ? palette.primary : palette.border}`,
                background: signInMode === 'password' ? palette.primaryBg : palette.panel,
                color: signInMode === 'password' ? palette.primaryDark : palette.panelMuted,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Owner / admin
            </button>
          </div>

          {signInMode === 'pin' ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: space.s,
            marginBottom: space.l,
            minHeight: 36,
            alignItems: 'center',
          }}>
            {pin.length === 0 ? (
              <span style={{ ...type.bodySm, color: palette.panelSubtle }}>Enter your 4–8 digit PIN</span>
            ) : (
              Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: i < pin.length ? palette.primary : palette.border,
                    transition: 'background 0.1s',
                  }}
                />
              ))
            )}
          </div>
          ) : (
          <div style={{ marginBottom: space.l }}>
            <label style={{ ...type.label, color: palette.panelMuted, display: 'block', marginBottom: space.xxs }}>
              Admin password
            </label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canSubmitPassword && onPasswordLogin(password)}
              placeholder="Same password as admin dashboard"
              autoComplete="current-password"
              style={{ ...inputField, width: '100%' }}
            />
            <p style={{ ...type.caption, color: palette.panelSubtle, marginTop: space.xs, lineHeight: 1.5 }}>
              For owner/manager accounts without a POS PIN.
            </p>
          </div>
          )}

          {authError && (
            <div style={{
              background: palette.dangerBg,
              color: palette.dangerDark,
              border: `1px solid ${palette.dangerBorder}`,
              borderRadius: radius.s,
              padding: `${space.s}px ${space.m}px`,
              ...type.bodySm,
              marginBottom: space.m,
              textAlign: 'center',
            }}>
              {authError}
            </div>
          )}

          {signInMode === 'pin' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space.s }}>
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d) => (
              <button
                key={d}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleNumpad(d);
                }}
                disabled={d === ''}
                aria-label={d === '⌫' ? 'Backspace' : d === '' ? undefined : `Digit ${d}`}
                style={{
                  height: 56,
                  borderRadius: radius.m,
                  border: `1px solid ${palette.border}`,
                  background: d === '⌫' ? palette.bgAlt : d === '' ? 'transparent' : palette.panel,
                  fontSize: 20,
                  fontWeight: 700,
                  color: d === '⌫' ? palette.panelMuted : palette.panelInk,
                  cursor: d === '' ? 'default' : 'pointer',
                  transition: 'background 0.1s, transform 60ms ease',
                }}
                onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
                onTouchStart={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
                onTouchEnd={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
              >
                {d}
              </button>
            ))}
          </div>
          )}

          <div style={{ display: 'flex', gap: space.s, marginTop: space.l }}>
            {signInMode === 'pin' ? (
              <>
                <button onClick={clear} style={{ ...btnSecondary(), flex: 1, height: 52 }}>
                  Clear
                </button>
                <button
                  onClick={onLogin}
                  disabled={!canSubmitPin}
                  style={{ ...btnPrimary(!canSubmitPin), flex: 2, height: 52 }}
                >
                  Sign In →
                </button>
              </>
            ) : (
              <button
                onClick={() => onPasswordLogin(password)}
                disabled={!canSubmitPassword}
                style={{ ...btnPrimary(!canSubmitPassword), flex: 1, height: 52 }}
              >
                Sign In with Password →
              </button>
            )}
          </div>

          <div style={{ marginTop: space.l, textAlign: 'center' }}>
            <a href="/" style={{ ...type.caption, color: palette.panelSubtle, textDecoration: 'none' }}>
              ← Main website
            </a>
            <div style={{ marginTop: 8 }}>
              <PosVersionLabel version={POS_BUILD_INFO.version} build={POS_BUILD_INFO.build} />
            </div>
          </div>

          {import.meta.env.DEV && (
            <p style={{ ...type.caption, color: palette.panelSubtle, marginTop: space.m, textAlign: 'center', lineHeight: 1.6 }}>
              Dev mode — check your local DB for staff PINs.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
