import { useState } from 'react';
import { pinLogin, type StaffUser } from '../api';

export function LoginPage({ onLogin }: { onLogin: (token: string, user: StaffUser) => void }) {
  const [pin, setPin]       = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (pin.length < 4) return;
    setError('');
    setLoading(true);
    try {
      const res = await pinLogin(pin);
      localStorage.setItem('admin_token', res.token);
      onLogin(res.token, res.user);
    } catch (e) {
      setError((e as Error).message);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const append = (d: string) => { if (pin.length < 8) setPin((p) => p + d); };
  const clear  = ()          => setPin('');
  const back   = ()          => setPin((p) => p.slice(0, -1));

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
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo.svg" alt="Bake & Grill" style={{ height: 64, marginBottom: 10, display: 'inline-block' }} />
          <p style={{ color: '#8B7355', fontSize: 14, margin: 0 }}>Admin — Enter your PIN</p>
        </div>

        {/* PIN dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 10,
          marginBottom: 24, minHeight: 54, alignItems: 'center',
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

        {error && (
          <div style={{
            background: '#fee2e2', color: '#991b1b', borderRadius: 10,
            padding: '10px 14px', fontSize: 13, marginBottom: 16, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d) => (
            <button
              key={d}
              onClick={() => {
                if (d === '⌫') back();
                else if (d !== '') append(d);
              }}
              disabled={d === ''}
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
          <button onClick={submit} disabled={pin.length < 4 || loading} style={{
            flex: 2, height: 48, borderRadius: 12, border: 'none',
            background: loading || pin.length < 4 ? '#F5C99A' : '#D4813A',
            fontSize: 14, fontWeight: 700, color: '#fff', cursor: pin.length < 4 ? 'default' : 'pointer',
            transition: 'background 0.15s',
          }}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <a href="/" style={{ fontSize: 12, color: '#C4A882', textDecoration: 'none' }}>← Main Website</a>
        </div>

        {import.meta.env.DEV && (
          <p style={{ fontSize: 11, color: '#C4A882', marginTop: 12, textAlign: 'center', lineHeight: 1.6 }}>
            Dev PINs: Owner (1111) · Admin (2222) · Manager (3333) · Cashier (4444)
          </p>
        )}
      </div>
    </div>
  );
}
