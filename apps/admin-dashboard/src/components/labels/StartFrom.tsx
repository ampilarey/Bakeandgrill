import { useEffect, useState } from 'react';
import { BookmarkPlus } from 'lucide-react';
import { createLabelTemplate, fetchCustomLabels, fetchLabelProducts, fetchLabelTemplates, type LabelTemplate, type LabelTemplateFields } from '../../api';
import { Modal, ModalActions } from '../SharedUI';
import { Button, useToast } from '../ui';
import { sizeForTemplate, templateOfCustom, templateOfItem } from './labelTemplates';
import { sizeName, type SizeChoice } from './labelSize';

/*
 * Start from and Save as template (round 7 of the usability work, owner,
 * 2026-10-13: "Start from a saved label or a built-in template, and Save as
 * template from any label, so a new sauce takes thirty seconds").
 *
 * StartFromRow is one select at the top of a new custom label and of a menu
 * item's label: the built-in templates, the ones saved here, and every other
 * label to copy from (a custom label, a menu item's label). SaveAsTemplate is
 * the button on any label that keeps its settings under a name of your own.
 */

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

/** A call that may fail or be refused: its fallback instead. */
async function safe<T>(call: () => Promise<T>, fallback: T): Promise<T> {
  try { return await call(); } catch { return fallback; }
}

export type StartFromChoices = { builtin: LabelTemplate[]; saved: LabelTemplate[]; customs: LabelTemplate[]; items: LabelTemplate[] };

/** The templates and labels one can start from, read once. */
export async function loadStartFromChoices(exclude?: { kind: 'custom' | 'item'; id: number }): Promise<StartFromChoices> {
  const [templates, customs, items] = await Promise.all([
    safe(() => fetchLabelTemplates(), { data: [] as LabelTemplate[], builtin: [] as LabelTemplate[] }),
    safe(() => fetchCustomLabels().then((r) => r.data), []),
    safe(() => fetchLabelProducts(true).then((r) => r.data.filter((p) => p.label_enabled)), []),
  ]);
  return {
    builtin: templates.builtin ?? [],
    saved: templates.data ?? [],
    customs: customs.filter((c) => !(exclude?.kind === 'custom' && exclude.id === c.id)).map(templateOfCustom),
    items: items.filter((p) => !(exclude?.kind === 'item' && exclude.id === p.id)).map(templateOfItem),
  };
}

export function StartFromRow({ onPick, exclude, hint, idPrefix = 'start-from' }: {
  onPick: (t: LabelTemplate) => void;
  /** The label being edited, left out of the copy-from lists. */
  exclude?: { kind: 'custom' | 'item'; id: number };
  hint?: string;
  idPrefix?: string;
}) {
  const [choices, setChoices] = useState<StartFromChoices | null>(null);
  const [picked, setPicked] = useState('');
  useEffect(() => {
    let alive = true;
    void loadStartFromChoices(exclude).then((c) => { if (alive) setChoices(c); });
    return () => { alive = false; };
  }, [exclude?.kind, exclude?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = choices ? [...choices.builtin, ...choices.saved, ...choices.customs, ...choices.items] : [];
  const pick = (key: string) => {
    setPicked(key);
    const t = all.find((x) => String(x.id) === key);
    if (t) onPick(t);
  };
  const pickedName = all.find((x) => String(x.id) === picked)?.name ?? null;
  const id = `${idPrefix}-select`;
  return (
    <div data-testid="start-from">
      <label className={labelClass} htmlFor={id}>Start from</label>
      <select id={id} value={picked} onChange={(e) => pick(e.target.value)} className={fieldClass} disabled={choices === null}>
        <option value="">{choices === null ? 'Loading…' : 'Blank'}</option>
        {choices && choices.builtin.length > 0 && (
          <optgroup label="Built-in templates">
            {choices.builtin.map((t) => <option key={String(t.id)} value={String(t.id)}>{t.name}</option>)}
          </optgroup>
        )}
        {choices && choices.saved.length > 0 && (
          <optgroup label="Your templates">
            {choices.saved.map((t) => <option key={String(t.id)} value={String(t.id)}>{t.name}{t.source ? ` (from ${t.source})` : ''}</option>)}
          </optgroup>
        )}
        {choices && choices.customs.length > 0 && (
          <optgroup label="Copy a custom label">
            {choices.customs.map((t) => <option key={String(t.id)} value={String(t.id)}>{t.name}</option>)}
          </optgroup>
        )}
        {choices && choices.items.length > 0 && (
          <optgroup label="Copy a menu item's label">
            {choices.items.map((t) => <option key={String(t.id)} value={String(t.id)}>{t.name}</option>)}
          </optgroup>
        )}
      </select>
      <p className="text-xs text-[var(--color-text-muted)] mt-1" data-testid="start-from-hint">
        {pickedName ? `Started from ${pickedName}. Change anything below.` : (hint ?? 'Its brand, type, wording, dates and size fill in; the name and pictures stay yours.')}
      </p>
    </div>
  );
}

/** The button on any label that keeps its settings as a template under a name of your own. */
export function SaveAsTemplate({ fields, at, source, onSaved, variant = 'ghost', className }: {
  fields: LabelTemplateFields;
  /** The size it prints at, kept with the template; null when the screen has no size. */
  at: SizeChoice | null;
  /** The label it comes from, which names the template to start with. */
  source: string;
  onSaved?: (t: LabelTemplate) => void;
  variant?: 'ghost' | 'secondary';
  className?: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const start = () => { setName(source.trim() ? `${source.trim()} template` : ''); setOpen(true); };
  const save = async () => {
    if (!name.trim()) { toast('error', 'Give the template a name.'); return; }
    setSaving(true);
    try {
      const r = await createLabelTemplate({ name: name.trim(), source: source.trim() || null, fields, size: sizeForTemplate(at) });
      toast('success', `Template "${r.data.name}" saved. Start from it on any new label.`);
      setOpen(false);
      onSaved?.(r.data);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save the template.');
    } finally {
      setSaving(false);
    }
  };
  const carries = [
    'brand, type and storage', 'the wording', 'shelf life and pack settings', 'the bottom strip and language',
    fields.label_wrap ? 'the wrap parts' : null, at ? `the size (${sizeName(at.shape, at.w, at.h)})` : null,
  ].filter(Boolean).join(', ');
  return (
    <>
      <Button variant={variant} size="sm" icon={<BookmarkPlus size={14} />} onClick={start} className={className} data-testid="save-as-template">Save as template</Button>
      {open && (
        <Modal title="Save as template" onClose={() => setOpen(false)} maxWidth={460}>
          <div className="space-y-3" data-testid="save-template">
            <div>
              <label className={labelClass} htmlFor="save-template-name">Template name</label>
              <input id="save-template-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Sauce in a jar" autoFocus />
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">Keeps {carries}. Not the name, pictures, barcode or price. A new label can then start from it, under Start from.</p>
          </div>
          <ModalActions>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} loading={saving} data-testid="save-template-save">Save template</Button>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
