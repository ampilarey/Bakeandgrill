import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { getSiteSettings, updateSiteSettings } from '../../api';

/**
 * House policy for stock corrections.
 *
 * Stock audit, 2026-09-03 (S2, S5): a stock count wrote whatever was typed and
 * a manual adjustment took any quantity, both with the note optional. The cash
 * count at close of shift is blind, valued and alerts on variance; stock is the
 * same class of risk and had none of it. This is the line above which a
 * correction has to say why — in money, because a kilo of saffron and a kilo of
 * rice are not the same mistake.
 */
export function StockSettings() {
  const [threshold, setThreshold] = useState('');
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
        setThreshold(map.stock_variance_reason_mvr ?? '500');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const n = Number(threshold);
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter an amount in MVR, zero or more.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateSiteSettings({ stock_variance_reason_mvr: String(n) });
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
            <label
              htmlFor="stock-variance"
              style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 6 }}
            >
              Stock difference needing a reason (MVR)
            </label>
            <input
              id="stock-variance"
              data-testid="stock-variance-threshold"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              inputMode="decimal"
              style={{
                width: '100%', maxWidth: 200, padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--color-border)', fontSize: 14,
                background: 'var(--color-surface)', color: 'var(--color-text)',
                boxSizing: 'border-box',
              }}
            />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              A stock count line or a manual adjustment worth this much or more has to
              say why before it is written. The value is the difference times what the
              item costs, so a kilo of saffron asks sooner than a kilo of rice.
              Set it to 0 to ask every time.
            </p>
          </div>

          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--color-danger)' }}>{error}</p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button onClick={() => void save()} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving…' : 'Save'}
            </Button>
            {saved && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)' }}>Saved</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
