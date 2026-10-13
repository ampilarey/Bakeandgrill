import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { fetchLabelLayouts, saveLabelSettings, type LabelLimits, type LabelPreset, type LabelRoll } from '../../api';
import { Btn } from '../SharedUI';
import { Button, Card, useToast } from '../ui';
import { InlineRename } from './InlineRename';
import { LabelSizePicker } from './LabelSizePicker';
import { DEFAULT_CHOICE, parseRolls, rollName, sizeName, sizeOf, stockOf, type SizeChoice } from './labelSize';

/*
 * My label rolls (round 6 of the usability work, owner, 2026-10-13: "only the
 * sizes you own"): the rolls and sheets the business actually has, each with a
 * name, kept as the setting `label_rolls`. Every size picker on the hub shows
 * them first and folds the rest under More sizes.
 */
export function LabelRollsCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [rolls, setRolls] = useState<LabelRoll[] | null>(null);
  const [presets, setPresets] = useState<LabelPreset[]>([]);
  const [limits, setLimits] = useState<LabelLimits | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<SizeChoice>(DEFAULT_CHOICE);
  const [rounded, setRounded] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetchLabelLayouts().then((r) => { setPresets(r.presets); setLimits(r.limits ?? null); setRolls(r.rolls ?? []); }).catch(() => setRolls([]));
  }, []);

  const save = async (next: LabelRoll[], said: string) => {
    setSaving(true);
    try {
      const r = await saveLabelSettings({ label_rolls: JSON.stringify(next) });
      setRolls(parseRolls(r.data.label_rolls));
      toast('success', said);
      return true;
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save the rolls.');
      return false;
    } finally {
      setSaving(false);
    }
  };
  const add = async () => {
    const roll: LabelRoll = { id: `roll-${Date.now().toString(36)}`, name: name.trim(), shape: choice.shape, preset: choice.preset, on: choice.on, w: choice.w, h: choice.h };
    if (await save([...(rolls ?? []), roll], `${rollName(roll)} added.`)) { setAdding(false); setName(''); }
  };
  const remove = (roll: LabelRoll) => {
    if (!window.confirm(`Remove ${rollName(roll)} from your rolls? The size itself stays under More sizes.`)) return;
    void save((rolls ?? []).filter((r) => r.id !== roll.id), `${rollName(roll)} removed.`);
  };
  const rename = (roll: LabelRoll, n: string) => void save((rolls ?? []).map((r) => (r.id === roll.id ? { ...r, name: n.trim() } : r)), 'Roll renamed.');

  return (
    <Card
      padding="none"
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-[var(--color-text)]">My label rolls</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">The rolls and sheets you actually have. Every size picker shows these first, by name, and keeps the other sizes under More sizes.</p>
          </div>
          {canManage && !adding && <Button size="sm" icon={<Plus size={16} />} onClick={() => setAdding(true)} data-testid="label-roll-new">Add a roll</Button>}
        </div>
      }
    >
      <ul className="divide-y divide-[var(--color-border-light)]" data-testid="label-rolls">
        {(rolls ?? []).map((r) => {
          const { w, h } = sizeOf({ shape: r.shape, preset: r.preset, on: r.on, w: r.w, h: r.h }, presets);
          const stock = stockOf({ shape: r.shape, preset: r.preset, on: r.on, w: r.w, h: r.h }, presets);
          return (
            <li key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex-1 min-w-[180px]">
                {canManage
                  ? <InlineRename name={rollName(r)} onSave={(n) => rename(r, n)} buttonClassName="text-sm font-semibold text-[var(--color-text)]" />
                  : <div className="text-sm font-semibold text-[var(--color-text)]">{rollName(r)}</div>}
                <div className="text-xs text-[var(--color-text-muted)]">{sizeName(r.shape, w, h)} · {stock.label}{stock.on !== 'printer' && stock.perPage > 0 ? ` · ${stock.perPage} a sheet` : ''}</div>
              </div>
              {canManage && <Btn variant="danger-outline" small onClick={() => remove(r)} aria-label={`Remove ${rollName(r)}`}>Remove</Btn>}
            </li>
          );
        })}
        {rolls !== null && rolls.length === 0 && !adding && (
          <li className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">{canManage ? 'No rolls yet: every size shows everywhere. Add the ones you have and they come first.' : 'No rolls registered yet, so every size shows everywhere.'}</li>
        )}
      </ul>
      {adding && (
        <div className="px-4 py-3 border-t border-[var(--color-border-light)] space-y-3" data-testid="label-roll-form">
          <div className="max-w-sm">
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor="label-roll-name">Name (optional)</label>
            <input id="label-roll-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Big roll, jar lids, the A4 sheets…" className="h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] w-full" />
          </div>
          <LabelSizePicker presets={presets} limits={limits} choice={choice} onChange={setChoice} rounded={rounded} onRounded={setRounded} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void add()} loading={saving} data-testid="label-roll-save">Add this roll</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setName(''); }}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
