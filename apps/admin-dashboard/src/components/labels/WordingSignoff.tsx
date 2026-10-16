import { useEffect, useState } from 'react';
import { CheckCircle2, Lock, ShieldAlert } from 'lucide-react';
import { fetchLabelSignoff, signOffLabel, type LabelSignoffStatus } from '../../api';
import { Button } from '../ui';

/*
 * The wording lock (round 17, owner 2026-10-13: "a wording lock with sign-off
 * for legal lines, plus the print log already kept"). A label's legal lines
 * (name, ingredients, allergens, storage, after opening, net weight,
 * nutrition) as they print now, where they stand against the last sign-off,
 * and Sign off for someone with Manage label settings. A line changed since
 * shows what was signed off beside it. With the lock on, a label prints only
 * while its lines are the ones signed off.
 */

export const LINE_NAMES: Record<string, string> = {
  name: 'Name', size: 'Size', name_dv: 'Name (Dhivehi)', ingredients: 'Ingredients', ingredients_dv: 'Ingredients (Dhivehi)', allergens: 'Allergens',
  storage: 'Storage line', storage_dv: 'Storage line (Dhivehi)', use_within: 'After opening', net_weight: 'Net weight', nutrition: 'Nutrition',
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function signoffWords(s: LabelSignoffStatus): string {
  if (s.state === 'signed') return `Signed off${s.signed?.by ? ` by ${s.signed.by}` : ''}${s.signed?.at ? ` on ${when(s.signed.at)}` : ''}`;
  if (s.state === 'changed') return `Changed since the sign-off: ${s.changed.map((k) => LINE_NAMES[k] ?? k).join(', ')}`;
  return 'Not signed off yet';
}

export function SignoffChip({ status }: { status: LabelSignoffStatus }) {
  const tone = status.state === 'signed' ? 'var(--color-success)' : status.state === 'changed' ? 'var(--color-danger)' : 'var(--color-warning)';
  const Icon = status.state === 'signed' ? CheckCircle2 : ShieldAlert;
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone, border: `1px solid color-mix(in srgb, ${tone} 38%, transparent)` }} data-testid="signoff-chip" data-state={status.state}>
      <Icon size={12} aria-hidden /> {status.state === 'signed' ? 'Signed off' : status.state === 'changed' ? 'Changed' : 'Not signed off'}
    </span>
  );
}

type Props = {
  kind: 'item' | 'custom';
  id: number;
  /** One size of the item, signed off apart (label audit, 2026-10-16). */
  size?: number | null;
  canManage: boolean;
  /** Bumped by the host after a save, to read the lines again. */
  refresh?: number;
  /** Already loaded (the Settings list), to skip the fetch. */
  initial?: LabelSignoffStatus;
  onChange?: (s: LabelSignoffStatus) => void;
};

export function WordingSignoff({ kind, id, size = null, canManage, refresh = 0, initial, onChange }: Props) {
  const [status, setStatus] = useState<LabelSignoffStatus | null>(initial ?? null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (initial && refresh === 0) return;
    fetchLabelSignoff(kind, id, size).then((r) => setStatus(r.data)).catch(() => setStatus(null));
  }, [kind, id, size, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!status) return null;
  const signOff = async () => {
    setBusy(true); setError(null);
    try {
      const r = await signOffLabel(kind, id, note.trim() || null, size);
      setStatus(r.data);
      setNote('');
      onChange?.(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign it off.');
    } finally {
      setBusy(false);
    }
  };
  const shown = Object.entries(status.lines).filter(([k, v]) => v !== '' || (status.signed?.lines?.[k] ?? '') !== '');

  return (
    <div className="space-y-2" data-testid="wording-signoff">
      <div className="flex flex-wrap items-center gap-2">
        <SignoffChip status={status} />
        <span className="text-xs text-[var(--color-text-secondary)]" data-testid="signoff-words">{signoffWords(status)}{status.signed?.note ? `. “${status.signed.note}”` : ''}</span>
        {status.locked && <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)]"><Lock size={12} aria-hidden /> {status.printable ? 'Prints: the wording is locked and this is signed off.' : 'Will not print until signed off: the wording is locked.'}</span>}
      </div>
      <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[150px_minmax(0,1fr)]">
        {shown.map(([k, v]) => {
          const moved = status.changed.includes(k);
          return (
            <div key={k} className="contents">
              <dt className={['font-semibold', moved ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-secondary)]'].join(' ')}>{LINE_NAMES[k] ?? k}</dt>
              <dd className="m-0 min-w-0 break-words text-[var(--color-text)]" dir={k.endsWith('_dv') ? 'rtl' : undefined} data-testid={`signoff-line-${k}`}>
                {v || <span className="text-[var(--color-text-muted)]">(none)</span>}
                {moved && <span className="block text-[var(--color-text-muted)] line-through" dir={k.endsWith('_dv') ? 'rtl' : undefined}>{status.signed?.lines?.[k] || '(none)'}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {canManage && status.state !== 'signed' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note (optional): checked against the recipe" aria-label="Sign-off note" className="h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] flex-1 min-w-[200px]" />
          <Button size="sm" icon={<CheckCircle2 size={14} />} loading={busy} onClick={() => void signOff()} data-testid="signoff-button">Sign off these lines</Button>
        </div>
      )}
      {!canManage && status.state !== 'signed' && <p className="text-xs text-[var(--color-text-muted)]">Someone with Manage label settings signs the wording off.</p>}
      {error && <p role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
