import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { fetchLabelSignoffs, saveLabelSettings, type LabelSignoffStatus } from '../../api';
import { Switch } from '../SharedUI';
import { Card, useToast } from '../ui';
import { SignoffChip, WordingSignoff, signoffWords } from './WordingSignoff';

/*
 * The wording lock under Labels → Settings (round 17, 2026-10-13): the
 * switch, and every label with where its legal lines stand, each opening
 * its lines and Sign off. With the switch on, a label whose legal lines are
 * not signed off as they stand does not print (previews still draw); every
 * print records the sign-off it printed under.
 */
export function WordingLockCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<LabelSignoffStatus[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => fetchLabelSignoffs().then((r) => { setRows(r.data); setLocked(r.locked); }).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);

  const lock = async (on: boolean) => {
    setLocked(on);
    try {
      await saveLabelSettings({ label_wording_lock: on ? '1' : '0' });
      toast('success', on ? 'Wording locked: only signed-off labels print.' : 'Wording unlocked.');
      void load();
    } catch (e) {
      setLocked(!on);
      toast('error', e instanceof Error ? e.message : 'Could not save the lock.');
    }
  };
  const waiting = (rows ?? []).filter((r) => r.state !== 'signed').length;

  return (
    <Card padding="none" header={
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-[var(--color-text)] inline-flex items-center gap-2"><Lock size={16} aria-hidden /> Wording lock</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">The legal lines on each label (name, ingredients, allergens, storage, after opening, net weight, nutrition) are signed off as they stand. Locked, a label prints only while its lines are the ones signed off; a change shows which line moved. Every print notes the sign-off it printed under.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--color-text)]">Lock the wording</span>
          <Switch checked={locked} disabled={!canManage} onChange={(v) => void lock(v)} aria-label="Lock the wording" />
        </div>
      </div>
    }>
      {rows !== null && rows.length > 0 && <p className="px-4 pt-3 text-xs text-[var(--color-text-secondary)]" data-testid="wording-lock-summary">{waiting === 0 ? 'Every label is signed off as it stands.' : `${waiting} of ${rows.length} ${rows.length === 1 ? 'label needs' : 'labels need'} signing off${locked ? ' before they print' : ''}.`}</p>}
      <ul className="divide-y divide-[var(--color-border-light)]" data-testid="wording-lock-list">
        {(rows ?? []).map((r) => {
          const key = `${r.kind}${r.id}`;
          return (
            <li key={key} className="px-4 py-2.5">
              <button type="button" onClick={() => setOpen((o) => (o === key ? null : key))} aria-expanded={open === key} className="w-full flex flex-wrap items-center gap-2 text-left min-h-[38px]" data-testid={`wording-row-${key}`}>
                <span className="text-sm font-semibold text-[var(--color-text)] flex-1 min-w-[140px]">{r.name}{r.kind === 'custom' ? <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">custom label</span> : null}</span>
                <SignoffChip status={r} />
                <span className="hidden sm:inline text-xs text-[var(--color-text-muted)] max-w-[320px] truncate">{signoffWords(r)}</span>
                {open === key ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
              </button>
              {open === key && (
                <div className="mt-2 pl-1">
                  <WordingSignoff kind={r.kind} id={r.id} canManage={canManage} initial={r} onChange={(s) => setRows((all) => (all ?? []).map((x) => (x.kind === s.kind && x.id === s.id ? s : x)))} />
                </div>
              )}
            </li>
          );
        })}
        {rows !== null && rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No labels yet.</li>}
      </ul>
    </Card>
  );
}
