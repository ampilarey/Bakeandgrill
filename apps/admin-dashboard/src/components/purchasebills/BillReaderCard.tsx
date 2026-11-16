import { useEffect, useState } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { getBillReader, saveBillReader, testBillReader, type BillReaderProvider, type BillReaderSettings } from '../../api/purchasing';
import { Btn } from '../SharedUI';
import { inputFont } from '../../utils/cssVars';

/**
 * Purchasing → Settings → Reading bills (owner, 2026-11-15: "add api key entry to admin
 * so I can switch between Claude, Google etc. if I want").
 *
 * One block per service: its key (typed in, kept encrypted on the server and never shown
 * again, only its last four), its model, and Test, which sends a made-up bill. Use this
 * one picks the service that reads the bills. Someone who may not change settings is
 * refused by the server and sees nothing here.
 */

function keyLine(p: BillReaderProvider): string {
  if (!p.has_key) return 'No key yet.';
  return p.key_from === 'env'
    ? `Using the key in the server's .env file, ending ${p.key_hint}. A key typed here is used instead.`
    : `Key saved, ending ${p.key_hint}.`;
}

function ProviderBlock({ p, inUse, busy, onSave, onUse }: {
  p: BillReaderProvider;
  inUse: boolean;
  busy: boolean;
  onSave: (data: { keys?: Record<string, string>; models?: Record<string, string> }) => Promise<void>;
  onUse: () => void;
}) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState(p.model === p.default_model ? '' : p.model);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const test = async () => {
    setTesting(true); setResult(null);
    try { setResult(await testBillReader(p.key)); } catch (e) { setResult({ ok: false, message: (e as Error).message }); } finally { setTesting(false); }
  };

  return (
    <div className={`br-block${inUse ? ' br-block--on' : ''}`} data-testid={`bill-reader-${p.key}`}>
      <div className="br-block__head">
        <strong>{p.label}</strong>
        {inUse
          ? <span className="br-chip"><Check size={13} aria-hidden />Reads the bills</span>
          : <Btn small variant="secondary" disabled={busy || !p.has_key} onClick={onUse} data-testid={`bill-reader-use-${p.key}`}>Use this one</Btn>}
      </div>
      <p className="br-line" data-testid={`bill-reader-state-${p.key}`}>{keyLine(p)}</p>

      <label className="br-label" htmlFor={`br-key-${p.key}`}>{p.has_key ? 'Replace the key' : 'Paste the key'}</label>
      <div className="br-row">
        <input
          id={`br-key-${p.key}`} type="password" autoComplete="off" spellCheck={false}
          value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste it here"
          className="br-input" style={inputFont({})}
        />
        <Btn small disabled={busy || key.trim() === ''} onClick={() => void onSave({ keys: { [p.key]: key.trim() } }).then(() => { setKey(''); setResult(null); })}>
          <KeyRound size={14} aria-hidden />Save key
        </Btn>
        {p.key_from === 'admin' && (
          <Btn small variant="danger-outline" disabled={busy} onClick={() => void onSave({ keys: { [p.key]: '' } }).then(() => setResult(null))}>Remove key</Btn>
        )}
      </div>
      <p className="br-help">Get one at {p.where}.</p>

      <details className="br-more">
        <summary>Model</summary>
        <p className="br-help">Leave empty for the usual one ({p.default_model}). Type another only if you know its exact name.</p>
        <div className="br-row">
          <input
            aria-label={`${p.label} model`} value={model} onChange={(e) => setModel(e.target.value)}
            placeholder={p.default_model} spellCheck={false} className="br-input" style={inputFont({})}
          />
          <Btn small variant="secondary" disabled={busy || model.trim() === (p.model === p.default_model ? '' : p.model)} onClick={() => void onSave({ models: { [p.key]: model.trim() } })}>Save model</Btn>
        </div>
      </details>

      <div className="br-row">
        <Btn small variant="secondary" disabled={!p.has_key || testing || busy} onClick={() => void test()} data-testid={`bill-reader-test-${p.key}`}>
          {testing ? 'Testing…' : 'Test'}
        </Btn>
        <span className="br-help">Sends a made-up bill to check the key. It can take up to a minute. Costs about one bill.</span>
      </div>
      {result && (
        <p className={`po-note${result.ok ? '' : ' po-note--warn'}`} role="status" data-testid={`bill-reader-result-${p.key}`}>{result.message}</p>
      )}
    </div>
  );
}

export function BillReaderCard() {
  const [settings, setSettings] = useState<BillReaderSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [names, setNames] = useState('');

  useEffect(() => {
    let gone = false;
    getBillReader().then((s) => { if (!gone) { setSettings(s); setNames(s.our_names ?? ''); } }).catch(() => { /* not theirs to see */ });
    return () => { gone = true; };
  }, []);

  if (!settings) return null;

  const save = async (data: Parameters<typeof saveBillReader>[0]) => {
    setBusy(true); setError('');
    try { setSettings(await saveBillReader(data)); } catch (e) { setError((e as Error).message); throw e; } finally { setBusy(false); }
  };
  const active = settings.providers.find((p) => p.key === settings.provider);

  return (
    <section className="br-card" data-testid="bill-reader-card">
      <h3 className="br-title">7 · Reading bills</h3>
      <p className="br-lead">
        Purchase orders → Read bills sends each bill's picture to an outside service that reads it. Pick the service and give it a key.
        A key is kept encrypted and is never shown again. The bill's picture goes to that service and nowhere else.
      </p>
      {error && <p className="po-note po-note--warn">{error}</p>}
      {active && !active.has_key && (
        <p className="po-note po-note--warn" data-testid="bill-reader-off">Reading bills is off: {active.label} has no key yet.</p>
      )}
      <div className="br-grid">
        {settings.providers.map((p) => (
          <ProviderBlock
            key={p.key} p={p} inUse={p.key === settings.provider} busy={busy}
            onSave={(d) => save(d).catch(() => { /* shown above */ })}
            onUse={() => void save({ provider: p.key }).catch(() => { /* shown above */ })}
          />
        ))}
      </div>

      <div className="br-names">
        <label className="br-label" htmlFor="br-our-names">Bills are made out to</label>
        <p className="br-help">
          Your own names, with commas between them: the shop and the company it belongs to. A bill addressed to any of them is read as yours.
        </p>
        <div className="br-row">
          <input
            id="br-our-names" value={names} onChange={(e) => setNames(e.target.value)} spellCheck={false}
            className="br-input" style={inputFont({})} data-testid="bill-reader-names"
          />
          <Btn small variant="secondary" disabled={busy || names.trim() === (settings.our_names ?? '')}
            onClick={() => void save({ our_names: names.trim() }).then(() => undefined).catch(() => { /* shown above */ })}>
            Save names
          </Btn>
        </div>
      </div>
    </section>
  );
}
