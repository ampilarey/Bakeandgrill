import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { getSiteSettings, updateSiteSettings } from '../../api';

/**
 * House policy for customer credit accounts.
 *
 * Audit, 2026-09-03: `credit_limit_max_mvr` governed every manager approval
 * and nothing in this app could change it, so the ceiling was whatever the
 * migration seeded. Payment terms were a constant, and credit could only be
 * turned off by taking permissions away. All three live here now.
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

export function CreditAccountSettings() {
  const [maxLimit, setMaxLimit] = useState('');
  const [terms, setTerms] = useState('');
  const [mode, setMode] = useState<string>('open');
  const [loading, setLoading] = useState(true);
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

    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateSiteSettings({
        credit_limit_max_mvr: String(limitNum),
        credit_payment_terms_default_days: String(termsNum),
        credit_accounts_mode: mode,
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
              style={FIELD}
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
              style={{ ...FIELD, maxWidth: 160 }}
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

          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--color-danger)' }}>{error}</p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button onClick={() => void save()} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving…' : 'Save'}
            </Button>
            {saved && (
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)' }}>Saved</span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
