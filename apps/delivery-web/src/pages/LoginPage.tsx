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
    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    if (value && index < 3) {
      pinRefs[index + 1].current?.focus();
    }
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
    if (pinStr.length < 4) { setError('Please enter your 4-digit PIN.'); return; }
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }

    setLoading(true);
    try {
      const { token, driver } = await api.pinLogin(phone.trim(), pinStr);
      localStorage.setItem('driver_token', token);
      onLogin(driver);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed.');
      setPin(['', '', '', '']);
      pinRefs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1C1408] flex flex-col items-center justify-center px-6 safe-top safe-bottom">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="w-20 h-20 rounded-2xl bg-[#D4813A] flex items-center justify-center mx-auto mb-4 text-white text-3xl shadow-lg">
          🚚
        </div>
        <h1 className="text-white text-2xl font-bold">Bake &amp; Grill</h1>
        <p className="text-[#8B7355] text-sm mt-1">Driver Portal</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
        {/* Phone */}
        <div>
          <label className="block text-[#EDE4D4] text-sm font-medium mb-2">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+960 7XX XXXX"
            className="w-full bg-[#2C1E0A] border border-[#3D2910] text-white placeholder-[#5C4A30] rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[#D4813A] transition"
            autoComplete="tel"
          />
        </div>

        {/* PIN */}
        <div>
          <label className="block text-[#EDE4D4] text-sm font-medium mb-2">PIN</label>
          <div className="flex gap-3 justify-center">
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
                className="w-14 h-14 bg-[#2C1E0A] border border-[#3D2910] text-white text-center text-2xl font-bold rounded-xl focus:outline-none focus:border-[#D4813A] transition"
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 text-red-300 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#D4813A] hover:bg-[#B5681F] text-white font-bold py-4 rounded-xl text-base transition disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
