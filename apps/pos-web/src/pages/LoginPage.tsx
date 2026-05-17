import { useEffect, useRef } from 'react';

type Props = {
  username: string;
  setUsername: (v: string) => void;
  pin: string;
  setPin: (v: string) => void;
  deviceId: string;
  setDeviceId: (v: string) => void;
  authError: string;
  onLogin: () => void;
};

export function LoginPage({ username, setUsername, pin, setPin, deviceId, setDeviceId, authError, onLogin }: Props) {
  const append = (d: string) => { if (pin.length < 8) setPin(pin + d); };
  const back   = ()          => setPin(pin.slice(0, -1));
  const clear  = ()          => setPin('');
  const emailRef    = useRef<HTMLInputElement>(null);
  const deviceIdRef = useRef<HTMLInputElement>(null);

  const isEmailFocused    = () => document.activeElement === emailRef.current;
  const isDeviceIdFocused = () => document.activeElement === deviceIdRef.current;

  // When the numpad is tapped, route the digit to whichever field is active.
  const handleNumpad = (d: string) => {
    if (d === '⌫') {
      if (isEmailFocused()) {
        setUsername(username.slice(0, -1));
        emailRef.current?.focus();
      } else if (isDeviceIdFocused()) {
        setDeviceId(deviceId.slice(0, -1));
        deviceIdRef.current?.focus();
      } else {
        back();
      }
    } else if (d !== '') {
      if (isEmailFocused()) {
        setUsername(username + d);
        emailRef.current?.focus();
      } else if (isDeviceIdFocused()) {
        setDeviceId(deviceId + d);
        deviceIdRef.current?.focus();
      } else {
        append(d);
      }
    }
  };

  // Allow typing the PIN directly from a hardware keyboard when no input is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEmailFocused() || isDeviceIdFocused()) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      if (/^[0-9]$/.test(e.key))     append(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Escape')    clear();
      else if (e.key === 'Enter')     onLogin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, username, onLogin]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1C1408',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 20,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 380,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.png" alt="Bake & Grill" style={{ width: 64, height: 64, borderRadius: 14, marginBottom: 10, display: 'inline-block' }} />
          <p style={{ color: '#8B7355', fontSize: 14, margin: 0 }}>POS — Sign in with mobile or email + PIN</p>
        </div>

        {/* Mobile / Email */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8B7355', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Mobile or Email
          </label>
          <input
            ref={emailRef}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onLogin()}
            placeholder="Mobile number or email"
            autoComplete="username"
            style={{
              width: '100%', boxSizing: 'border-box',
              borderRadius: 10, padding: '10px 12px',
              border: '1px solid #EDE4D4', fontSize: 14,
              color: '#2A1E0C', background: '#FFFDF9', outline: 'none',
            }}
          />
        </div>

        {/* Device ID */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#8B7355', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Device ID
          </label>
          <input
            ref={deviceIdRef}
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              borderRadius: 10, padding: '10px 12px',
              border: '1px solid #EDE4D4', fontSize: 14,
              color: '#2A1E0C', background: '#FFFDF9', outline: 'none',
            }}
          />
        </div>

        {/* PIN dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 10,
          marginBottom: 20, minHeight: 48, alignItems: 'center',
        }}>
          {pin.length === 0 ? (
            <span style={{ color: '#C4A882', fontSize: 14 }}>Enter your PIN below</span>
          ) : (
            Array.from({ length: pin.length }).map((_, i) => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: '50%',
                background: '#D4813A', transition: 'all 0.1s',
              }} />
            ))
          )}
        </div>

        {authError && (
          <div style={{
            background: '#fee2e2', color: '#991b1b', borderRadius: 10,
            padding: '10px 14px', fontSize: 13, marginBottom: 14, textAlign: 'center',
          }}>
            {authError}
          </div>
        )}

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d) => (
            <button
              key={d}
              onMouseDown={(e) => {
                // Prevent blur on the active input when tapping a numpad key
                e.preventDefault();
                handleNumpad(d);
              }}
              disabled={d === ''}
              aria-label={d === '⌫' ? 'Backspace' : d === '' ? undefined : `Digit ${d}`}
              style={{
                height: 56, borderRadius: 12, border: '1px solid #EDE4D4',
                background: d === '⌫' ? '#FFF3E8' : d === '' ? 'transparent' : '#FFFDF9',
                fontSize: 18, fontWeight: 700,
                color: d === '⌫' ? '#D4813A' : '#2A1E0C',
                cursor: d === '' ? 'default' : 'pointer',
                transition: 'background 0.1s',
              }}
            >
              {d}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={clear} style={{
            flex: 1, height: 48, borderRadius: 12,
            border: '1px solid #EDE4D4', background: '#FFFDF9',
            fontSize: 14, fontWeight: 600, color: '#8B7355', cursor: 'pointer',
          }}>
            Clear
          </button>
          <button onClick={onLogin} disabled={!username.trim() || pin.length < 4} style={{
            flex: 2, height: 48, borderRadius: 12, border: 'none',
            background: (!username.trim() || pin.length < 4) ? '#F5C99A' : '#D4813A',
            fontSize: 14, fontWeight: 700, color: '#fff',
            cursor: (!username.trim() || pin.length < 4) ? 'default' : 'pointer',
            transition: 'background 0.15s',
          }}>
            Sign In →
          </button>
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <a href="/" style={{ fontSize: 12, color: '#C4A882', textDecoration: 'none' }}>← Main Website</a>
        </div>

        {import.meta.env.DEV && (
          <p style={{ fontSize: 11, color: '#C4A882', marginTop: 12, textAlign: 'center', lineHeight: 1.6 }}>
            Dev mode — check your local DB for staff PINs.
          </p>
        )}
      </div>
    </div>
  );
}
