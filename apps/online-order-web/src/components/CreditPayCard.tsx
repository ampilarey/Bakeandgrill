// Pay the credit account online (owner, 2026-10-21): the whole balance in one
// tap, or part of it, by card through BML. The server takes it against the
// oldest invoices first; anything over what is owed lands in the wallet. The
// same card answers how it went when the bank sends the customer back
// (CreditPaymentResult), as the Wallet panel does after Add money.
import { useEffect, useState, type CSSProperties } from 'react';
import { FileText } from 'lucide-react';
import { getCreditPayment, getCreditStatement, startCreditPayment, type CreditStatement } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { OnlinePaymentResult } from './WalletTopUpResult';

export function CreditPayCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useLanguage();
  const [statement, setStatement] = useState<CreditStatement | null>(null);
  const [part, setPart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getCreditStatement().then((r) => { if (live) setStatement(r.statement); }).catch(() => {});
    return () => { live = false; };
  }, [refreshKey]);

  if (!statement || !statement.can_pay_online || statement.balance_mvr <= 0) return null;

  const owed = statement.balance_mvr;
  const partMvr = part.trim() === '' ? null : Number(part);
  const partValid = partMvr === null || (Number.isFinite(partMvr) && partMvr >= 1 && partMvr <= owed + 0.001);
  const paying = partMvr === null || !partValid ? owed : partMvr;

  const pay = async () => {
    if (busy || !partValid) return;
    setBusy(true);
    setError('');
    try {
      const res = await startCreditPayment(partMvr === null ? undefined : partMvr);
      window.location.href = res.payment_url;
    } catch (e) {
      setError((e as Error).message || t('credit.pay_error'));
      setBusy(false);
    }
  };

  return (
    <div data-testid="credit-pay-card" style={card}>
      <p style={title}>{t('credit.pay_title')}</p>
      {statement.overdue_mvr > 0 && (
        <p style={{ ...hint, color: 'var(--color-danger)', fontWeight: 700 }} data-testid="credit-overdue-total">
          {t('credit.overdue_total').replace('{amount}', statement.overdue_mvr.toFixed(2))}
        </p>
      )}
      <button
        type="button"
        onClick={() => void pay()}
        disabled={busy || !partValid}
        style={{ ...payBtn, opacity: busy || !partValid ? 0.6 : 1 }}
        data-testid="credit-pay-now"
      >
        {t('credit.pay_now').replace('{amount}', paying.toFixed(2))}
      </button>
      <label style={{ ...hint, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{t('credit.pay_part')}</span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={owed}
          step="0.01"
          value={part}
          onChange={(e) => setPart(e.target.value)}
          placeholder={owed.toFixed(2)}
          style={input}
          data-testid="credit-pay-part"
        />
      </label>
      <p style={hint}>{t('credit.pay_hint')}</p>
      {error && <p style={{ ...hint, color: 'var(--color-danger)' }} role="alert">{error}</p>}
      <a href={statement.statement_url} target="_blank" rel="noopener noreferrer" style={link} data-testid="credit-statement-link">
        <FileText size={14} aria-hidden /> {t('credit.statement_link')}
      </a>
    </div>
  );
}

/** The Credit panel's answer after Pay now. */
export function CreditPaymentResult({ token, state, onSettled }: { token: string; state: string; onSettled: () => void }) {
  const { t } = useLanguage();
  return (
    <OnlinePaymentResult
      testId="credit-pay-result"
      state={state}
      onSettled={onSettled}
      load={async () => {
        const res = await getCreditPayment(token);
        return {
          payment: {
            status: res.credit_payment.status,
            amount_mvr: res.credit_payment.amount_mvr,
            balance_after_mvr: res.credit_payment.balance_after_mvr,
          },
          balance_mvr: res.balance_mvr,
        };
      }}
      strings={{
        done: t('credit.pay_done'),
        checking: t('credit.pay_checking'),
        pending: t('credit.pay_pending'),
        failed: t('credit.pay_failed'),
      }}
    />
  );
}

const card: CSSProperties = {
  border: '1.5px solid var(--color-border)',
  borderRadius: 14,
  padding: '0.9rem 1rem',
  background: 'var(--color-surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const title: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--color-text)' };
const hint: CSSProperties = { margin: 0, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 };
const payBtn: CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '0.75rem 1rem',
  background: 'var(--color-primary)',
  color: 'var(--color-on-primary, #fff)',
  fontWeight: 800,
  fontSize: 15,
  cursor: 'pointer',
};
const input: CSSProperties = {
  width: 120,
  minHeight: 44,
  padding: '0 10px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: 16,
};
const link: CSSProperties = { fontSize: 13, color: 'var(--color-primary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 };
