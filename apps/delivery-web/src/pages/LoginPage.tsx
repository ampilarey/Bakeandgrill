import { useState, useRef } from 'react';
import type { Driver } from '../types';
import { api } from '../api';

interface Props {
  onLogin: (driver: Driver) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...pin];
    next[index] = value.slice(-1);
    setPin(next);
    if (value && index < 3) pinRefs[index + 1].current?.focus();
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs[index - 1].current?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const pinStr = pin.join('');
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }
    if (pinStr.length < 4) { setError('Please enter your 4-digit PIN.'); return; }

    setLoading(true);
    try {
      const { token, driver } = await api.pinLogin(phone.trim(), pinStr);
      localStorage.setItem('driver_token', token);
      onLogin(driver);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your phone and PIN.');
      setPin(['', '', '', '']);
      pinRefs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--color-bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1.5rem',
    }}>
      {/* Logo / Brand */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'var(--color-dark)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem', fontSize: 32,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}>
          🚚
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          Bake &amp; Grill
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          Driver Portal
        </p>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 360,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-2xl)',
        padding: '2rem',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Phone */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+960 7XX XXXX"
              autoComplete="tel"
              style={{
                width: '100%', height: 44, padding: '0 12px',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                fontSize: '0.9375rem', fontFamily: 'inherit',
                color: 'var(--color-text)',
                background: 'var(--color-surface)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--color-primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--color-border)')}
            />
          </div>

          {/* PIN */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 10 }}>
              PIN
            </label>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={pinRefs[i]}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handlePinChange(i, e.target.value)}
                  onKeyDown={e => handlePinKeyDown(i, e)}
                  style={{
                    width: 56, height: 56,
                    border: '1.5px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    fontSize: '1.5rem', fontWeight: 700,
                    textAlign: 'center', fontFamily: 'inherit',
                    color: 'var(--color-text)',
                    background: digit ? 'var(--color-primary-light)' : 'var(--color-surface)',
                    outline: 'none',
                    transition: 'all 0.15s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--color-primary)')}
                  onBlur={e => (e.target.style.borderColor = digit ? 'var(--color-primary)' : 'var(--color-border)')}
                />
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'var(--color-error-bg)',
              border: '1px solid rgba(220,38,38,0.2)',
              color: '#7f1d1d',
              borderRadius: 'var(--radius-lg)',
              padding: '10px 14px',
              fontSize: '0.875rem',
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', height: 48,
              background: loading ? '#9ca3af' : 'var(--color-primary)',
              color: 'white', border: 'none',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.9375rem', fontWeight: 700,
              fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              boxShadow: loading ? 'none' : '0 4px 12px var(--color-primary-glow)',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>

      <p style={{ marginTop: '1.5rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
        Contact your admin if you don't have a PIN.
      </p>
    </div>
  );
}
