import { useEffect, useState } from 'react';
import {
  getPublicStatsSettings, updatePublicStatsSettings, type PublicStatsSettings as Config,
} from '../../api';
import { Btn, Card, ErrorMsg, Spinner } from '../../components/Layout';

const COUNTERS: { key: keyof Config; label: string; desc: string }[] = [
  { key: 'show_orders', label: 'Orders served', desc: 'Lifetime completed orders (cancelled excluded)' },
  { key: 'show_customers', label: 'Happy customers', desc: 'Registered customer accounts' },
  { key: 'show_visitors', label: 'Visitors this month', desc: 'Unique visitors, last 30 days' },
];

/**
 * Which "social proof" counters the public website and order app show.
 * Off by default; values are always displayed rounded down ("12,500+") so
 * exact business figures are never exposed. Revenue is never offered.
 */
export function PublicStatsSettings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getPublicStatsSettings()
      .then((res) => setConfig(res.settings))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error && config === null) return <ErrorMsg message={error} />;
  if (config === null) return <Spinner />;

  const save = async () => {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const res = await updatePublicStatsSettings(config);
      setConfig(res.settings);
      setNotice('Saved. The public pages update within ~10 minutes (cached).');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const row = (checked: boolean, onChange: (v: boolean) => void, label: string, desc: string, disabled = false) => (
    <label
      key={label}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <span>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)' }}>{desc}</span>
      </span>
    </label>
  );

  return (
    <Card style={{ padding: '16px 18px', maxWidth: 560 }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Shows a counters strip on the website home page and the order app home.
        Numbers are always rounded down (e.g. "12,500+") — exact figures are never
        shown publicly, and revenue is never available here. Counters at zero hide
        themselves automatically.
      </p>

      <div style={{ display: 'grid', gap: 12 }}>
        {row(config.enabled, (v) => setConfig({ ...config, enabled: v }), 'Show public counters', 'Master switch for the strip on both surfaces')}
        <div style={{ display: 'grid', gap: 10, paddingLeft: 22 }}>
          {COUNTERS.map((c) => row(
            Boolean(config[c.key]),
            (v) => setConfig({ ...config, [c.key]: v }),
            c.label,
            c.desc,
            !config.enabled,
          ))}
        </div>

        {error && <ErrorMsg message={error} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn onClick={() => { void save(); }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          {notice && <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{notice}</span>}
        </div>
      </div>
    </Card>
  );
}
