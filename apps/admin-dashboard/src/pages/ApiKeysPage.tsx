import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Card } from '../components/SharedUI';
import { inputFont } from '../utils/cssVars';
import { fetchAiSettings, saveAiSettings, type AiSettings } from '../api/ai';
import { refreshAi } from '../components/ai/useAi';
import { BillReaderCard } from '../components/purchasebills/BillReaderCard';

/*
 * System → Integrations → API keys (owner, 2026-11-24: "Where to setup API. Before I
 * added Claude and Google API to bill. How about make all API related in admin
 * separately"). Everything about the outside services in one place: each service's key
 * and model, Test, which one is in use, and the model that makes pictures. What the
 * services are used for is switched on the Assistant tab; nothing here is typed anywhere
 * else.
 */
export default function ApiKeysPage() {
  const [s, setS] = useState<AiSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** The picture model as typed, until saved; null while untouched. */
  const [model, setModel] = useState<string | null>(null);

  useEffect(() => { fetchAiSettings().then(setS).catch(() => { /* the keys card still shows */ }); }, []);

  const saveModel = async () => {
    setBusy(true); setError('');
    try { setS(await saveAiSettings({ image_model: (model ?? '').trim() })); setModel(null); refreshAi(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>API keys</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }} data-testid="api-keys-uses">
          One key serves everything: reading supplier bills (Purchasing → Orders → Bills to check, and bills sent to the staff bot) and the assistant.
          Which of the assistant&apos;s jobs run is on <Link to="/integrations/assistant" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Assistant</Link>.
        </p>
      </Card>

      <BillReaderCard part="keys" />

      {s?.images && (
        <Card data-testid="ai-images">
          <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Making pictures</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Claude reads pictures but cannot make one, so made photos come from Google. {s.images.ready
              ? 'A Google key is set.'
              : 'Add a Google key above to use it; Claude can go on doing the rest.'}
          </p>
          <div className="ai-model">
            <input
              type="text" value={model ?? (s.images.model === s.images.default_model ? '' : s.images.model)} onChange={(e) => setModel(e.target.value)}
              placeholder={s.images.default_model} aria-label="Picture model" spellCheck={false} style={inputFont({})} data-testid="ai-image-model"
            />
            <Btn small variant="secondary" disabled={busy || model === null} onClick={() => void saveModel()}>Save model</Btn>
          </div>
          {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 13, margin: '6px 0 0' }}>{error}</p>}
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>Leave empty for the usual one ({s.images.default_model}). Google renames these; type the current name only if making a picture says the model is not known.</p>
        </Card>
      )}
    </div>
  );
}
