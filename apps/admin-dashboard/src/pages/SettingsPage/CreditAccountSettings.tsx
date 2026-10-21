import { useEffect, useState } from 'react';
import { SeeAlso } from '../../components/SeeAlso';
import { Link } from 'react-router-dom';
import { Save } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { Switch } from '../../components/SharedUI';
import { getSiteSettings, updateSiteSettings } from '../../api';
import { inputFont } from '../../utils/cssVars';

/**
 * House policy for customer credit accounts, and for the wallet.
 *
 * Audit, 2026-09-03: `credit_limit_max_mvr` governed every manager approval
 * and nothing in this app could change it, so the ceiling was whatever the
 * migration seeded. Payment terms were a constant, and credit could only be
 * turned off by taking permissions away. All three live here now.
 *
 * Owner, 2026-10-21: customers add money to their wallet by card from the
 * order app, or from a link staff send. The amounts offered, the smallest
 * and largest top-up, the daily cap and what a wallet may hold are set here
 * (WalletTopUpRules); the owner alert for a large top-up is on its row in
 * Notifications.
 */

const MODES = [
  {
    value: 'open',
    label: 'Open',
    desc: 'New accounts may be approved and sales charged to them, as normal.',
  },
  {
    value: 'no_new_accounts',
    label: 'No new accounts',
    desc: 'Existing accounts carry on as they are; nobody new is approved.',
  },
  {
    value: 'closed',
    label: 'Closed',
    desc: 'No new accounts and no new charges at the till. Repayments still work, so balances can be paid off.',
  },
] as const;

const WALLET_DEFAULTS = {
  enabled: '1',
  presets: '100,200,500,1000',
  min: '50',
  max: '5000',
  dailyCap: '10000',
  maxBalance: '20000',
};

const FIELD: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--color-border)', fontSize: 14,
  background: 'var(--color-surface)', color: 'var(--color-text)',
  boxSizing: 'border-box',
};

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--color-text-secondary)', marginBottom: 6,
};

const HINT: React.CSSProperties = {
  margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5,
};

function isOn(v: string | undefined, fallback: string): boolean {
  const s = (v ?? fallback).trim().toLowerCase();
  return !['0', 'false', 'off', ''].includes(s);
}

/** "100, 200, 500" → [100, 200, 500], or null when a part is not a number. */
function parsePresets(raw: string): number[] | null {
  const parts = raw.split(/[\s,;]+/).filter((p) => p !== '');
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n) || n <= 0) return null;
    out.push(n);
  }
  return out;
}

export function CreditAccountSettings() {
  const [maxLimit, setMaxLimit] = useState('');
  const [terms, setTerms] = useState('');
  const [mode, setMode] = useState<string>('open');
  // The wallet (owner, 2026-10-21).
  const [walletOn, setWalletOn] = useState(true);
  const [presets, setPresets] = useState(WALLET_DEFAULTS.presets);
  const [minTopUp, setMinTopUp] = useState(WALLET_DEFAULTS.min);
  const [maxTopUp, setMaxTopUp] = useState(WALLET_DEFAULTS.max);
  const [dailyCap, setDailyCap] = useState(WALLET_DEFAULTS.dailyCap);
  const [maxBalance, setMaxBalance] = useState(WALLET_DEFAULTS.maxBalance);
  // The chasing numbers (wholesale audit, 2026-09-26) are "When it sends" on
  // their alerts in Notifications since the re-audit of 2026-10-10.
  const [loading, setLoading] = useState(true);
  // Save stays off until the real values are in: the fields hold defaults until
  // then, and saving those would overwrite the owner's settings (a manager
  // could not read them before 2026-10-08 and saw "Open" and a blank limit).
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSiteSettings()
      .then((res) => {
        const map: Record<string, string> = {};
        Object.values(res.settings ?? {}).forEach((group) => {
          (group as { key: string; value: string | null }[]).forEach((s) => {
            if (s.value !== null) map[s.key] = s.value;
          });
        });
        setMaxLimit(map.credit_limit_max_mvr ?? '50000');
        setTerms(map.credit_payment_terms_default_days ?? '30');
        setMode(map.credit_accounts_mode ?? 'open');
        setWalletOn(isOn(map.wallet_topup_enabled, WALLET_DEFAULTS.enabled));
        setPresets(map.wallet_topup_presets ?? WALLET_DEFAULTS.presets);
        setMinTopUp(map.wallet_topup_min_mvr ?? WALLET_DEFAULTS.min);
        setMaxTopUp(map.wallet_topup_max_mvr ?? WALLET_DEFAULTS.max);
        setDailyCap(map.wallet_topup_daily_cap_mvr ?? WALLET_DEFAULTS.dailyCap);
        setMaxBalance(map.wallet_balance_max_mvr ?? WALLET_DEFAULTS.maxBalance);
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const limitNum = Number(maxLimit);
    const termsNum = Number(terms);
    if (!Number.isFinite(limitNum) || limitNum < 0) {
      setError('Maximum credit limit must be a number, zero or more.');
      return;
    }
    if (!Number.isInteger(termsNum) || termsNum < 7 || termsNum > 90) {
      setError('Payment terms must be a whole number of days between 7 and 90.');
      return;
    }
    const presetList = parsePresets(presets);
    const minNum = Number(minTopUp);
    const maxNum = Number(maxTopUp);
    const capNum = Number(dailyCap);
    const ceilingNum = Number(maxBalance);
    if (presetList === null) {
      setError('Amounts to offer must be numbers above zero, separated by commas.');
      return;
    }
    if (!Number.isFinite(minNum) || minNum < 1) {
      setError('The smallest top-up must be MVR 1 or more.');
      return;
    }
    if (!Number.isFinite(maxNum) || maxNum < 0 || (maxNum > 0 && maxNum < minNum)) {
      setError('The largest top-up must be 0 (no limit) or at least the smallest top-up.');
      return;
    }
    if (!Number.isFinite(capNum) || capNum < 0 || !Number.isFinite(ceilingNum) || ceilingNum < 0) {
      setError('The daily cap and the most a wallet may hold must be numbers, zero or more (0 means no limit).');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateSiteSettings({
        credit_limit_max_mvr: String(limitNum),
        credit_payment_terms_default_days: String(termsNum),
        credit_accounts_mode: mode,
        wallet_topup_enabled: walletOn ? '1' : '0',
        wallet_topup_presets: presetList.join(','),
        wallet_topup_min_mvr: String(minNum),
        wallet_topup_max_mvr: String(maxNum),
        wallet_topup_daily_cap_mvr: String(capNum),
        wallet_balance_max_mvr: String(ceilingNum),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading…</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <SeeAlso to="/customers/credit" label="Customers → Accounts on credit" testId="credit-see-accounts">
        Who owes money, reminders and pay links are in
      </SeeAlso>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={LABEL} htmlFor="credit-max-limit">
              Maximum credit limit a manager may approve (MVR)
            </label>
            <input
              id="credit-max-limit"
              data-testid="credit-max-limit"
              value={maxLimit}
              onChange={(e) => setMaxLimit(e.target.value)}
              inputMode="decimal"
              style={inputFont(FIELD)}
            />
            <p style={HINT}>
              A manager cannot approve a customer above this. You can, with a reason
              — the override and the reason are both recorded.
            </p>
          </div>

          <div>
            <label style={LABEL} htmlFor="credit-terms">
              Default payment terms (days)
            </label>
            <input
              id="credit-terms"
              data-testid="credit-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              inputMode="numeric"
              style={inputFont({ ...FIELD, maxWidth: 160 })}
            />
            <p style={HINT}>
              How long a new account gets to pay, unless the approver sets otherwise.
              Between 7 and 90 days.
            </p>
          </div>

          <div>
            <span style={LABEL}>Credit accounts</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MODES.map((m) => (
                <label
                  key={m.value}
                  data-testid={`credit-mode-${m.value}`}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${mode === m.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: mode === m.value ? 'var(--color-warning-bg)' : 'var(--color-surface)',
                  }}
                >
                  <input
                    type="radio"
                    name="credit-accounts-mode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
                      {m.label}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                      {m.desc}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div data-testid="credit-chasing-link">
            <span style={{ ...LABEL, marginBottom: 2 }}>Chasing</span>
            <p style={{ ...HINT, margin: 0 }}>
              Every open invoice is texted three days before it is due, on the day, and three days after; owners are texted when a
              wholesale invoice passes 30 and 60 days overdue, and shops get a statement on the 1st. How often it repeats, when a
              shop is nudged to report sales and when owners hear about unreconciled stock are set on those alerts in Notifications,
              beside their switches:{' '}
              <Link to="/notifications/messages?open=credit_payment_reminder" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>credit reminder</Link>
              {' · '}
              <Link to="/notifications/messages?open=trade_report_reminder_shop" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>shop sales report nudge</Link>
              {' · '}
              <Link to="/notifications/messages?open=owner_trade_unreconciled" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>unreconciled stock alert</Link>.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="wallet-settings">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ ...LABEL, marginBottom: 2 }}>Wallet: money in by card</span>
              <p style={{ ...HINT, margin: 0 }}>
                Customers add money to their wallet from the order app (Account → Wallet → Add money), and staff can text them a
                link to pay by card. Off, both go away; money at the counter still works.
              </p>
            </div>
            <Switch
              checked={walletOn}
              onChange={setWalletOn}
              aria-label="Customers can add money to their wallet by card"
              data-testid="wallet-topup-enabled"
            />
          </div>

          <div>
            <label style={LABEL} htmlFor="wallet-presets">Amounts to offer (MVR, separated by commas)</label>
            <input
              id="wallet-presets"
              data-testid="wallet-presets"
              value={presets}
              onChange={(e) => setPresets(e.target.value)}
              inputMode="decimal"
              style={inputFont(FIELD)}
            />
            <p style={HINT}>Shown as one-tap buttons in the app and on the link's page. Customers may also type their own amount.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12 }}>
            <div>
              <label style={LABEL} htmlFor="wallet-min">Smallest top-up (MVR)</label>
              <input id="wallet-min" data-testid="wallet-min" value={minTopUp} onChange={(e) => setMinTopUp(e.target.value)} inputMode="decimal" style={inputFont(FIELD)} />
            </div>
            <div>
              <label style={LABEL} htmlFor="wallet-max">Largest top-up (MVR)</label>
              <input id="wallet-max" data-testid="wallet-max" value={maxTopUp} onChange={(e) => setMaxTopUp(e.target.value)} inputMode="decimal" style={inputFont(FIELD)} />
            </div>
            <div>
              <label style={LABEL} htmlFor="wallet-daily-cap">Card top-ups a day (MVR)</label>
              <input id="wallet-daily-cap" data-testid="wallet-daily-cap" value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} inputMode="decimal" style={inputFont(FIELD)} />
            </div>
            <div>
              <label style={LABEL} htmlFor="wallet-max-balance">Most a wallet may hold (MVR)</label>
              <input id="wallet-max-balance" data-testid="wallet-max-balance" value={maxBalance} onChange={(e) => setMaxBalance(e.target.value)} inputMode="decimal" style={inputFont(FIELD)} />
            </div>
          </div>
          <p style={{ ...HINT, margin: 0 }}>
            0 means no limit. Only a customer whose number was checked with a code may add money; a wallet on hold takes none.
            A large top-up texts the owners; the amount is on that alert in Notifications:{' '}
            <Link to="/notifications/messages?open=owner_deposit_large_topup" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>large wallet top-up</Link>.
          </p>
        </div>
      </Card>

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--color-danger)' }}>{error}</p>
      )}
      {!loaded && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          The current settings did not load, so Save is off: saving now would replace them with what is shown.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button onClick={() => void save()} disabled={saving || !loaded}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save'}
        </Button>
        {saved && (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)' }}>Saved</span>
        )}
      </div>
    </div>
  );
}
