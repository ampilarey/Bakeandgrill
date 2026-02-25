import { useState } from 'react';
import { pinLogin, type StaffUser } from '../api';

export function LoginPage({ onLogin }: { onLogin: (token: string, user: StaffUser) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
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

  const append = (d: string) => {
    if (pin.length < 8) setPin((p) => p + d);
  };

  const clear = () => setPin('');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
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
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🍞</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Bake & Grill</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>Staff Admin — Enter your PIN</p>
        </div>

        {/* PIN display */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 10,
          marginBottom: 24,
        }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              border: `2px solid ${pin.length > i ? '#0ea5e9' : '#e2e8f0'}`,
              background: pin.length > i ? '#e0f2fe' : '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 800,
              color: '#0f172a',
              transition: 'all 0.15s',
            }}>
              {pin.length > i ? '●' : ''}
            </div>
          ))}
        </div>

        {error && (
          <div style={{
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 16,
            textAlign: 'center',
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
                if (d === '⌫') { setPin((p) => p.slice(0, -1)); }
                else if (d !== '') append(d);
              }}
              disabled={d === ''}
              style={{
                height: 56,
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: d === '⌫' ? '#fee2e2' : d === '' ? 'transparent' : '#f8fafc',
                fontSize: 18,
                fontWeight: 700,
                color: d === '⌫' ? '#991b1b' : '#0f172a',
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
            border: '1px solid #e2e8f0', background: '#f1f5f9',
            fontSize: 14, fontWeight: 600, color: '#64748b', cursor: 'pointer',
          }}>
            Clear
          </button>
          <button onClick={submit} disabled={pin.length < 4 || loading} style={{
            flex: 2, height: 48, borderRadius: 12,
            border: 'none', background: loading || pin.length < 4 ? '#bae6fd' : '#0ea5e9',
            fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer',
            transition: 'background 0.15s',
          }}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </div>
      </div>
    </div>
  );
}
