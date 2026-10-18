import { useEffect, useState } from 'react';
import { CheckCircle2, Gift } from 'lucide-react';
import { getPhoneStatus, sendPhoneCode, verifyPhoneCode } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

/**
 * "Verify your number to collect your rewards" (owner, 2026-10-18). Shown only to a
 * guest whose number was never checked with a code: a code texted to it proves it from
 * this session, the order history stays theirs and the points held back are added
 * (backend GuestNumbers::claim). Hidden for everyone else.
 */
export function VerifyNumberCard({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const [status, setStatus] = useState<{ phone: string; held_orders: number; held_points: number } | null>(null);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { setStatus(null); return; }
    let live = true;
    getPhoneStatus()
      .then((r) => { if (live) setStatus(r.unverified ? r : null); })
      .catch(() => { if (live) setStatus(null); });
    return () => { live = false; };
  }, [isAuthenticated]);

  if (done !== null) {
    return (
      <div data-testid="verify-number-done" style={{ ...card, borderColor: 'color-mix(in srgb, var(--color-success) 35%, transparent)' }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontWeight: 700, color: 'var(--color-success)' }}>
          <CheckCircle2 size={18} aria-hidden />
          {done > 0 ? t('verifyNumber.done_points').replace('{points}', String(done)) : t('verifyNumber.done')}
        </p>
      </div>
    );
  }
  if (!status) return null;

  const send = async () => {
    setBusy(true); setError('');
    try {
      const r = await sendPhoneCode();
      if (!r.unverified) { setDone(0); return; }
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true); setError('');
    try {
      const r = await verifyPhoneCode(code.trim());
      setDone(r.points_added);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const body = status.held_points > 0
    ? t('verifyNumber.body_points').replace('{points}', String(status.held_points)).replace('{orders}', String(status.held_orders)).replace('{phone}', status.phone)
    : t('verifyNumber.body').replace('{phone}', status.phone);

  return (
    <div data-testid="verify-number-card" style={card}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontWeight: 800, fontSize: compact ? 15 : 16, color: 'var(--color-text)' }}>
        <Gift size={18} aria-hidden style={{ color: 'var(--color-primary)', flex: '0 0 auto' }} />
        {t('verifyNumber.title')}
      </p>
      <p style={{ margin: '6px 0 10px', fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{body}</p>
      {error && <p role="alert" style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-danger)' }}>{error}</p>}
      {sent && (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('verifyNumber.sent').replace('{phone}', status.phone)}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input
              style={input}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              aria-label={t('verifyNumber.code')}
              placeholder={t('verifyNumber.code')}
            />
            <button type="button" style={btn} disabled={busy || code.length !== 6} onClick={() => void verify()}>{t('verifyNumber.confirm')}</button>
          </div>
        </>
      )}
      <button type="button" style={sent ? btnOutline : btn} disabled={busy} onClick={() => void send()}>{t('verifyNumber.send')}</button>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{t('verifyNumber.wrong_number')}</p>
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1.5px solid color-mix(in srgb, var(--color-primary) 35%, transparent)',
  borderRadius: 16,
  padding: '14px 16px',
  margin: '0 0 16px',
};
const btn: React.CSSProperties = {
  minHeight: 44, padding: '0 18px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15,
  background: 'var(--color-primary)', color: 'var(--color-primary-contrast)', fontFamily: 'inherit',
};
const btnOutline: React.CSSProperties = { ...btn, background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)' };
const input: React.CSSProperties = {
  flex: '1 1 140px', minHeight: 44, fontSize: 16, letterSpacing: 4, textAlign: 'center', borderRadius: 12,
  border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit',
};
