import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Switch } from '../components/SharedUI';
import { fetchAiSettings, saveAiSettings, type AiFeature, type AiSettings } from '../api/ai';
import { refreshAi } from '../components/ai/useAi';

/*
 * System → Integrations → Assistant (owner, 2026-11-24: "Build all. But add admin
 * settings to on/off"). One master switch and one per feature. Each switch saves as it
 * is flipped. The service and its key are the ones under Purchasing → Settings →
 * Reading bills: there is one key, and it is typed there.
 */
export default function AssistantPage() {
  const [s, setS] = useState<AiSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchAiSettings().then(setS).catch((e: Error) => setError(e.message)); }, []);

  const save = async (patch: { enabled?: boolean; features?: Partial<Record<AiFeature, boolean>> }) => {
    setBusy(true); setError('');
    try { setS(await saveAiSettings(patch)); refreshAi(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (error && !s) return <Card><p role="alert" style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p></Card>;
  if (!s) return <Card><p style={{ margin: 0, color: 'var(--color-text-muted)' }}>Loading…</p></Card>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Assistant</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Claude writes drafts and suggestions on the screens below. Nothing it writes is saved or sent until a person checks it and presses the screen&apos;s own button.
        </p>
        {!s.ready && (
          <p data-testid="ai-no-key" style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 10, fontSize: 13, background: 'var(--color-tone-gold-bg)', color: 'var(--color-tone-gold-text)', border: '1px solid var(--color-tone-gold-border)' }}>
            No key yet, so none of these work. Add one under <Link to="/purchasing/settings">Purchasing → Settings → Reading bills</Link>.
          </p>
        )}
        <label className="ai-row ai-row--master">
          <Switch checked={s.enabled} disabled={busy} onChange={(v) => void save({ enabled: v })} aria-label="Use the assistant" data-testid="ai-master" />
          <span>
            <strong>Use the assistant</strong>
            <span className="ai-row__about">Off, every feature below stops and its buttons disappear. Each switch keeps its setting. Reading supplier bills has its own key and is not affected.</span>
          </span>
        </label>
      </Card>

      <Card>
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Features</h3>
        {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 13, margin: '0 0 8px' }}>{error}</p>}
        <div style={{ opacity: s.enabled ? 1 : 0.55 }}>
          {s.features.map((f) => (
            <label key={f.key} className="ai-row">
              <Switch checked={f.on} disabled={busy || !s.enabled} onChange={(v) => void save({ features: { [f.key]: v } })} aria-label={f.label} data-testid={`ai-feature-${f.key}`} />
              <span>
                <strong>{f.label}</strong>
                <span className="ai-row__about">{f.about}</span>
                <span className="ai-row__where">{f.where}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}
