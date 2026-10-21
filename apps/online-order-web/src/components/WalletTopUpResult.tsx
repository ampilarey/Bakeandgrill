// Back from the bank after Add money (owner, 2026-10-21): the Wallet panel
// asks how the top-up went until the bank's word is in. Each ask makes the
// server check with the bank itself, so a webhook that never came still
// lands the money while the customer watches. The same card, with its own
// words, is the Credit panel's answer after Pay now (OnlinePaymentResult).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { getWalletTopUp } from '../api';
import { useLanguage } from '../context/LanguageContext';

export type OnlinePaymentState = {
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  amount_mvr: number | null;
  balance_after_mvr: number | null;
  /** The receipt page, when there is one. */
  url?: string;
};

export type OnlinePaymentStrings = {
  done: string;
  checking: string;
  pending: string;
  failed: string;
  receipt?: string;
};

export function OnlinePaymentResult({ load, state, onSettled, strings, testId = 'online-payment-result' }: {
  /** Asks the server how it went; the server asks the bank while it is pending. */
  load: () => Promise<{ payment: OnlinePaymentState; balance_mvr: number }>;
  /** What the bank's return said: CONFIRMED, or anything else. */
  state: string;
  onSettled: () => void;
  strings: OnlinePaymentStrings;
  testId?: string;
}) {
  const [result, setResult] = useState<OnlinePaymentState | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let told = false;
    const maxTries = state === 'CONFIRMED' ? 20 : 6;

    const poll = async () => {
      try {
        const res = await loadRef.current();
        if (cancelled) return;
        setResult(res.payment);
        setBalance(res.balance_mvr);
        if (res.payment.status === 'paid') {
          if (!told) { told = true; settledRef.current(); }
          setDone(true);
          return;
        }
        if (res.payment.status !== 'pending') { setDone(true); return; }
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
  }, [state]);

  if (result?.status === 'paid') {
    const amount = (result.amount_mvr ?? 0).toFixed(2);
    const after = (result.balance_after_mvr ?? balance ?? 0).toFixed(2);
    return (
      <div data-testid={testId} data-state="paid" role="status" style={{ ...card, borderColor: 'color-mix(in srgb, var(--color-success) 40%, transparent)' }}>
        <p style={{ ...line, color: 'var(--color-success)', fontWeight: 700 }}>
          <CheckCircle2 size={18} aria-hidden /> {strings.done.replace('{amount}', amount).replace('{balance}', after)}
        </p>
        {result.url && strings.receipt && (
          <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 700 }}>
            {strings.receipt}
          </a>
        )}
      </div>
    );
  }

  if (!done) {
    return (
      <div data-testid={testId} data-state="checking" role="status" style={card}>
        <p style={{ ...line, color: 'var(--color-text-muted)' }}>{strings.checking}</p>
      </div>
    );
  }

  const failed = state !== 'CONFIRMED' || (result !== null && result.status !== 'pending');
  return (
    <div data-testid={testId} data-state={failed ? 'failed' : 'pending'} role="status" style={card}>
      <p style={{ ...line, color: failed ? 'var(--color-danger)' : 'var(--color-text)' }}>
        {failed ? strings.failed : strings.pending}
      </p>
    </div>
  );
}

/** The Wallet panel's answer after Add money. */
export function WalletTopUpResult({ token, state, onSettled }: { token: string; state: string; onSettled: () => void }) {
  const { t } = useLanguage();
  return (
    <OnlinePaymentResult
      testId="wallet-topup-result"
      state={state}
      onSettled={onSettled}
      load={async () => {
        const res = await getWalletTopUp(token);
        return { payment: { status: res.top_up.status, amount_mvr: res.top_up.amount_mvr, balance_after_mvr: res.top_up.balance_after_mvr, url: res.top_up.url }, balance_mvr: res.balance_mvr };
      }}
      strings={{
        done: t('wallet.topup_done'),
        checking: t('wallet.topup_checking'),
        pending: t('wallet.topup_pending'),
        failed: t('wallet.topup_failed'),
        receipt: t('wallet.topup_receipt'),
      }}
    />
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
