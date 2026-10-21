// Back from the bank after Add money (owner, 2026-10-21): the Wallet panel
// asks how the top-up went until the bank's word is in. Each ask makes the
// server check with the bank itself, so a webhook that never came still
// lands the money while the customer watches.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { getWalletTopUp, type WalletTopUp } from '../api';
import { useLanguage } from '../context/LanguageContext';

export function WalletTopUpResult({ token, state, onSettled }: { token: string; state: string; onSettled: () => void }) {
  const { t } = useLanguage();
  const [topUp, setTopUp] = useState<WalletTopUp | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let told = false;
    const maxTries = state === 'CONFIRMED' ? 20 : 6;

    const poll = async () => {
      try {
        const res = await getWalletTopUp(token);
        if (cancelled) return;
        setTopUp(res.top_up);
        setBalance(res.balance_mvr);
        if (res.top_up.status === 'paid') {
          if (!told) { told = true; settledRef.current(); }
          setDone(true);
          return;
        }
        if (res.top_up.status !== 'pending') { setDone(true); return; }
      } catch {
        if (cancelled) return;
      }
      tries += 1;
      if (tries < maxTries) {
        window.setTimeout(() => { void poll(); }, 1500);
      } else {
        setDone(true);
      }
    };

    void poll();
    return () => { cancelled = true; };
  }, [token, state]);

  if (topUp?.status === 'paid') {
    const amount = (topUp.amount_mvr ?? 0).toFixed(2);
    const after = (topUp.balance_after_mvr ?? balance ?? 0).toFixed(2);
    return (
      <div data-testid="wallet-topup-result" data-state="paid" role="status" style={{ ...card, borderColor: 'color-mix(in srgb, var(--color-success) 40%, transparent)' }}>
        <p style={{ ...line, color: 'var(--color-success)', fontWeight: 700 }}>
          <CheckCircle2 size={18} aria-hidden /> {t('wallet.topup_done').replace('{amount}', amount).replace('{balance}', after)}
        </p>
        <a href={topUp.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 700 }}>
          {t('wallet.topup_receipt')}
        </a>
      </div>
    );
  }

  if (!done) {
    return (
      <div data-testid="wallet-topup-result" data-state="checking" role="status" style={card}>
        <p style={{ ...line, color: 'var(--color-text-muted)' }}>{t('wallet.topup_checking')}</p>
      </div>
    );
  }

  const failed = state !== 'CONFIRMED' || (topUp !== null && topUp.status !== 'pending');
  return (
    <div data-testid="wallet-topup-result" data-state={failed ? 'failed' : 'pending'} role="status" style={card}>
      <p style={{ ...line, color: failed ? 'var(--color-danger)' : 'var(--color-text)' }}>
        {failed ? t('wallet.topup_failed') : t('wallet.topup_pending')}
      </p>
    </div>
  );
}

const card: CSSProperties = {
  border: '1.5px solid var(--color-border)',
  borderRadius: 14,
  padding: '0.9rem 1rem',
  background: 'var(--color-surface)',
  marginBottom: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const line: CSSProperties = { margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.4 };
