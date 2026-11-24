import { useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { AiFeature, DhivehiKind } from '../../api/ai';
import { draftDhivehi } from '../../api/ai';
import { Btn } from '../SharedUI';
import { useAi } from './useAi';
import { inputFont } from '../../utils/cssVars';

/**
 * One assistant button (owner, 2026-11-24). It shows only while its feature is switched
 * on (System → Integrations → Assistant) and the service has a key; pressed, it runs the
 * job and hands the draft to the page, which puts it in a box for the person to change.
 * It never saves or sends. What went wrong is said under the button.
 */
export function AiButton({ feature, run, children, disabled, testId, title }: {
  feature: AiFeature;
  run: () => Promise<void>;
  children: ReactNode;
  disabled?: boolean;
  testId?: string;
  title?: string;
}) {
  const on = useAi(feature);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!on) return null;
  const press = async () => {
    setBusy(true); setError('');
    try { await run(); } catch (e) { setError((e as Error).message || 'The assistant could not do that just now.'); } finally { setBusy(false); }
  };
  return (
    <span className="ai-btn">
      <Btn small variant="secondary" type="button" disabled={busy || disabled} onClick={() => void press()} data-testid={testId} title={title}>
        <Sparkles size={14} aria-hidden />{busy ? 'Writing…' : children}
      </Btn>
      {error && <span className="ai-btn__error" role="alert">{error}</span>}
    </span>
  );
}

/**
 * Draft Dhivehi, beside a Dhivehi box: fills it from the English. A box that already
 * holds Dhivehi is asked before it is replaced. A Dhivehi speaker should read the draft.
 */
export function DhivehiDraft({ from, current, onDraft, kind = 'text', testId }: {
  from: string;
  current?: string;
  onDraft: (dv: string) => void;
  kind?: DhivehiKind;
  testId?: string;
}) {
  return (
    <AiButton
      feature="dhivehi"
      disabled={from.trim() === ''}
      testId={testId}
      title={from.trim() === '' ? 'Type the English first' : 'Fills the Dhivehi from the English. Have a Dhivehi speaker check it.'}
      run={async () => {
        if ((current ?? '').trim() !== '' && !window.confirm('Replace the Dhivehi that is there with a new draft?')) return;
        const { dv } = await draftDhivehi(from.trim(), kind);
        if (dv) onDraft(dv);
      }}
    >
      Draft Dhivehi
    </AiButton>
  );
}

/** A line for the assistant about what to say, shown only while the feature is on. */
export function AiHint({ value, onChange, feature = 'newsletter', placeholder = 'Anything it should mention? e.g. Friday brunch is back (optional)' }: {
  value: string; onChange: (v: string) => void; feature?: AiFeature; placeholder?: string;
}) {
  const on = useAi(feature);
  if (!on) return null;
  return (
    <input
      type="text" value={value} maxLength={600} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="What the draft should mention"
      style={inputFont({ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 14 })}
    />
  );
}
