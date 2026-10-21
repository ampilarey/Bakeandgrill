// Account → Wallet → "Add money" (owner, 2026-10-21: "when customer log in,
// option to pay deposit to his acc"). The owner's presets as chips, or an
// amount of their own, then off to BML; the bank brings them back to the
// Wallet panel, where WalletTopUpResult says how it went. What may be added
// comes from the server's rules, so a wallet on hold, a number nobody
// checked or a switched-off feature shows the reason, never a button that
// fails.
import { useEffect, useState, type CSSProperties } from 'react';
import { CreditCard } from 'lucide-react';
import { getWalletTopUpRules, startWalletTopUp, type WalletTopUpRules } from '../api';
import { useLanguage } from '../context/LanguageContext';

export function AddMoneyCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useLanguage();
  const [rules, setRules] = useState<WalletTopUpRules | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getWalletTopUpRules()
      .then((r) => {
        if (!live) return;
        setRules(r.rules);
        setPicked((p) => (p !== null && r.rules.presets_mvr.includes(p) ? p : (r.rules.presets_mvr[0] ?? null)));
      })
      .catch(() => { if (live) setRules(null); });
    return () => { live = false; };
  }, [refreshKey]);

  if (!rules || !rules.enabled) return null;

  const typed = custom.trim();
  const amount = typed !== '' ? Number(typed) : picked;
  const valid = amount !== null
    && Number.isFinite(amount)
    && amount >= rules.min_mvr
    && (rules.max_mvr === null || amount <= rules.max_mvr);

  const pay = async () => {
    if (!valid || amount === null) return;
    setBusy(true);
    setError('');
    try {
      const res = await startWalletTopUp(amount);
      window.location.href = res.payment_url;
    } catch (e) {
      setError((e as Error).message || t('wallet.topup_error'));
      setBusy(false);
    }
  };

  const limits = rules.max_mvr === null
    ? t('wallet.limits_min').replace('{min}', rules.min_mvr.toLocaleString())
    : t('wallet.limits').replace('{min}', rules.min_mvr.toLocaleString()).replace('{max}', rules.max_mvr.toLocaleString());

  return (
    <div data-testid="wallet-add-money" style={card}>
      <p style={title}><CreditCard size={16} aria-hidden /> {t('wallet.add_money')}</p>
      {!rules.can_top_up ? (
        <p data-testid="wallet-add-money-refused" style={hint}>{reasonText(rules, t)}</p>
      ) : (
        <>
          <p style={hint}>{t('wallet.add_money_hint')}</p>
          <div role="radiogroup" aria-label={t('wallet.amount')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {rules.presets_mvr.map((p) => {
              const on = typed === '' && picked === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => { setPicked(p); setCustom(''); }}
                  data-testid={`wallet-preset-${p}`}
                  style={chip(on)}
                >
                  MVR {p.toLocaleString()}
                </button>
              );
            })}
          </div>
          <label style={{ display: 'block', marginTop: 10 }}>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 4 }}>{t('wallet.custom_amount')}</span>
            <input
              inputMode="decimal"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={limits}
              data-testid="wallet-custom-amount"
              style={input}
            />
          </label>
          {rules.daily_cap_mvr !== null && rules.used_today_mvr > 0 && (
            <p style={hint}>
              {t('wallet.used_today').replace('{used}', rules.used_today_mvr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).replace('{cap}', rules.daily_cap_mvr.toLocaleString())}
            </p>
          )}
          {(rules.bonus_percent ?? 0) > 0 && (
            <p style={{ ...hint, color: 'var(--color-success)', fontWeight: 700 }} data-testid="wallet-bonus-line">
              {((rules.bonus_min_mvr ?? 0) > 0
                ? t('wallet.bonus_line').replace('{min}', (rules.bonus_min_mvr ?? 0).toLocaleString())
                : t('wallet.bonus_any')).replace('{percent}', String(rules.bonus_percent))}
              {valid && amount !== null && amount >= (rules.bonus_min_mvr ?? 0)
                ? ' ' + t('wallet.bonus_for_amount').replace('{bonus}', (Math.floor(amount * (rules.bonus_percent ?? 0)) / 100).toFixed(2))
                : ''}
            </p>
          )}
          <button
            type="button"
            onClick={() => void pay()}
            disabled={busy || !valid}
            data-testid="wallet-pay-by-card"
            style={{ ...btn, opacity: busy || !valid ? 0.6 : 1 }}
          >
            {busy ? '…' : t('wallet.pay_by_card').replace('{amount}', valid && amount !== null ? amount.toFixed(2) : '—')}
          </button>
          {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--color-danger)' }}>{error}</p>}
          <p style={{ ...hint, marginTop: 8 }}>{t('wallet.bank_note')}</p>
        </>
      )}
    </div>
  );
}

function reasonText(rules: WalletTopUpRules, t: (key: string) => string): string {
  switch (rules.reason) {
    case 'verify_phone': return t('wallet.verify_first');
    case 'on_hold': return t('wallet.on_hold');
    case 'closed': return t('wallet.closed');
    default: return rules.message || t('wallet.unavailable');
  }
}

const card: CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 14,
  padding: '0.9rem 1rem',
  background: 'var(--color-surface)',
  marginBottom: 12,
};
const title: CSSProperties = {
  margin: '0 0 6px', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text)',
};
const hint: CSSProperties = { margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.45 };
const input: CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 12px', borderRadius: 10,
  border: '1.5px solid var(--color-border)', fontSize: 16, background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit',
};
const btn: CSSProperties = {
  marginTop: 10, width: '100%', minHeight: 44, padding: '0 16px', borderRadius: 10, border: 'none',
  background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
};
const chip = (on: boolean): CSSProperties => ({
  minHeight: 40, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
  border: `1.5px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
  background: on ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'var(--color-surface)',
  color: on ? 'var(--color-primary)' : 'var(--color-text)',
});
