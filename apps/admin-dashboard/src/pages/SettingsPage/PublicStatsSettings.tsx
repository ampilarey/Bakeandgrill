import { useEffect, useState } from 'react';
import {
  getPublicStatsSettings, updatePublicStatsSettings,
  type PublicStatsSettings as Config, type PublicStatsSurfaceConfig,
} from '../../api';
import { Btn, Card, ErrorMsg, Spinner } from '../../components/Layout';

const SURFACE_LABELS: Record<keyof Config, { title: string; desc: string }> = {
  web: { title: 'Website', desc: 'bakeandgrill.mv home page' },
  order: { title: 'Order app', desc: 'Order app home screen' },
};

const COUNTER_DESCS: Record<string, string> = {
  orders: 'Retail orders: POS, pickup, delivery, dine-in (cancelled excluded)',
  wholesale: 'Trade deliveries that went out (drafts excluded)',
  catering: 'Confirmed or completed catering events',
  customers: 'Registered customer accounts',
  visitors: 'Unique visitors, last 30 days',
};

/**
 * Which "social proof" counters each public surface shows — the website and
 * the order app are managed independently. All off by default; values are
 * always displayed rounded down ("12,500+"); zero counters hide themselves;
 * revenue is never offered.
 */
export function PublicStatsSettings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [counters, setCounters] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getPublicStatsSettings()
      .then((res) => { setConfig(res.settings); setCounters(res.counters); })
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
      setNotice('Saved. Public pages update within ~10 minutes (cached).');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const setSurface = (surface: keyof Config, patch: Partial<PublicStatsSurfaceConfig>) =>
    setConfig((c) => (c ? { ...c, [surface]: { ...c[surface], ...patch } } : c));

  const surfaceCard = (surface: keyof Config) => {
    const cfg = config[surface];
    const meta = SURFACE_LABELS[surface];

    return (
      <Card key={surface} style={{ padding: '16px 18px', flex: '1 1 260px', minWidth: 260 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{meta.title}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>{meta.desc}</div>

        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => setSurface(surface, { enabled: e.target.checked })}
            />
            Show counters here
          </label>
          <div style={{ display: 'grid', gap: 8, paddingLeft: 22, opacity: cfg.enabled ? 1 : 0.5 }}>
            {Object.entries(counters).map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: cfg.enabled ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg.counters[key])}
                  disabled={!cfg.enabled}
                  onChange={(e) => setSurface(surface, { counters: { ...cfg.counters, [key]: e.target.checked } })}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <span style={{ fontWeight: 600 }}>{label}</span>
                  {COUNTER_DESCS[key] && (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)' }}>{COUNTER_DESCS[key]}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Each counter shows separately (orders, wholesale, events, customers, visitors),
        and the website and order app are managed independently. Numbers are always
        rounded down (e.g. "12,500+"), counters at zero hide themselves, and revenue
        is never available publicly.
      </p>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        {surfaceCard('web')}
        {surfaceCard('order')}
      </div>

      {error && <ErrorMsg message={error} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Btn onClick={() => { void save(); }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        {notice && <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{notice}</span>}
      </div>
    </div>
  );
}
