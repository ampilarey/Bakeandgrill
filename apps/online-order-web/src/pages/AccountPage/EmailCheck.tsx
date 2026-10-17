import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { sendEmailCheckCode, verifyEmailCheckCode } from '../../api';
import { useLanguage } from '../../context/LanguageContext';
import { alertStyle, btnStyle, inputStyle } from './accountShared';

/**
 * Under the saved email: Checked, or Send code and a box for the 6-digit code
 * (iruali import plan, feature 2). Only a checked email gets offers by email.
 */
export function EmailCheck({ email, verified, onVerified }: { email: string; verified: boolean; onVerified: () => void }) {
  const { t } = useLanguage();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  if (verified) {
    return (
      <p data-testid="email-check-done" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--color-success)' }}>
        <CheckCircle2 size={14} aria-hidden /> {t('account.email_check_done')}
      </p>
    );
  }

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await sendEmailCheckCode();
      if (res.email_verified) { onVerified(); return; }
      setSent(true);
      setMsg({ type: 'success', text: t('account.email_check_sent').replace('{email}', email) });
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true); setMsg(null);
    try {
      await verifyEmailCheckCode(code.trim());
      setMsg({ type: 'success', text: t('account.email_check_ok') });
      onVerified();
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="email-check" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>{t('account.email_check_needed')}</p>
      {msg && <div style={alertStyle(msg.type)}>{msg.text}</div>}
      {sent ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            style={{ ...inputStyle, flex: '1 1 140px', letterSpacing: 4, textAlign: 'center' }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            aria-label={t('account.email_check_code')}
            placeholder={t('account.email_check_code')}
          />
          <button type="button" style={{ ...btnStyle, flex: '0 0 auto' }} disabled={busy || code.length !== 6} onClick={() => void check()}>
            {t('account.email_check_confirm')}
          </button>
        </div>
      ) : null}
      <button type="button" style={{ ...btnStyle, background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)' }} disabled={busy} onClick={() => void send()}>
        {t('account.email_check_send')}
      </button>
    </div>
  );
}
