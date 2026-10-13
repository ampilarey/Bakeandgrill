import { useEffect, useState } from 'react';
import { LayoutTemplate, Plus } from 'lucide-react';
import { deleteLabelTemplate, fetchLabelTemplates, updateLabelTemplate, type LabelTemplate } from '../../api';
import { Btn } from '../SharedUI';
import { Button, Card, useToast } from '../ui';
import { InlineRename } from './InlineRename';
import { CustomLabelModal } from './CustomLabels';
import { templateLine } from './labelTemplates';

/*
 * Templates under Wording and logos (round 7, owner, 2026-10-13): the ones
 * saved from labels, renamed in place and removed after asking, and the
 * built-in ones beneath; any of them starts a new custom label from here.
 */
export function LabelTemplatesCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [saved, setSaved] = useState<LabelTemplate[] | null>(null);
  const [builtin, setBuiltin] = useState<LabelTemplate[]>([]);
  const [newFrom, setNewFrom] = useState<LabelTemplate | null>(null);
  const load = () => fetchLabelTemplates().then((r) => { setSaved(r.data); setBuiltin(r.builtin ?? []); }).catch(() => { setSaved([]); setBuiltin([]); });
  useEffect(() => { void load(); }, []);

  const rename = async (t: LabelTemplate, name: string) => {
    if (typeof t.id !== 'number') return;
    try {
      const r = await updateLabelTemplate(t.id, { name: name.trim() });
      setSaved((list) => (list ?? []).map((x) => (x.id === t.id ? r.data : x)));
      toast('success', 'Template renamed.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not rename it.');
    }
  };
  const remove = async (t: LabelTemplate) => {
    if (typeof t.id !== 'number') return;
    if (!window.confirm(`Remove the template "${t.name}"? Labels made from it keep their settings.`)) return;
    try {
      await deleteLabelTemplate(t.id);
      setSaved((list) => (list ?? []).filter((x) => x.id !== t.id));
      toast('success', 'Template removed.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not remove it.');
    }
  };

  const row = (t: LabelTemplate) => (
    <li key={String(t.id)} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-2">
          {canManage && !t.builtin
            ? <InlineRename name={t.name} onSave={(n) => rename(t, n)} buttonClassName="text-sm font-semibold text-[var(--color-text)]" />
            : <span>{t.name}</span>}
          {t.builtin && <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold bg-[var(--color-tone-brown-bg)] text-[var(--color-tone-brown-text)] border border-[var(--color-tone-brown-border)]">Built in</span>}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">{t.blurb ?? templateLine(t)}{t.source ? ` · from ${t.source}` : ''}</div>
      </div>
      {canManage && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setNewFrom(t)} aria-label={`New label from ${t.name}`}>New label from this</Button>
          {!t.builtin && <Btn variant="danger-outline" small onClick={() => void remove(t)} aria-label={`Remove ${t.name}`}>Remove</Btn>}
        </div>
      )}
    </li>
  );

  return (
    <>
      <Card
        padding="none"
        header={
          <div>
            <h3 className="font-bold text-[var(--color-text)] inline-flex items-center gap-2"><LayoutTemplate size={16} className="text-[var(--color-primary)]" aria-hidden /> Templates</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">A label's settings kept under a name: brand, type, wording, dates, pack size, bottom strip, wrap parts and the size. Start from one on any new label, or save one from any label with Save as template.</p>
          </div>
        }
      >
        <ul className="divide-y divide-[var(--color-border-light)]" data-testid="label-templates">
          {(saved ?? []).map(row)}
          {saved !== null && saved.length === 0 && (
            <li className="px-4 py-4 text-center text-sm text-[var(--color-text-muted)]">{canManage ? 'No templates of your own yet. Open any label and press Save as template.' : 'No templates of your own yet.'}</li>
          )}
          {builtin.map(row)}
        </ul>
      </Card>
      {newFrom && <CustomLabelModal label={null} startFrom={newFrom} onClose={() => setNewFrom(null)} onSaved={() => undefined} />}
    </>
  );
}
