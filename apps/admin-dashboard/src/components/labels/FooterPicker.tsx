import { useState, type ReactNode } from 'react';
import { Pencil, Plus } from 'lucide-react';
import {
  createLabelFooter, deleteLabelFooter, updateLabelFooter,
  type LabelFooter, type LabelFooterPayload,
} from '../../api';
import { Btn, Modal, ModalActions } from '../SharedUI';
import { Button, useToast } from '../ui';

/*
 * Footer presets (owner, 2026-10-12: "No easy option to select and edit
 * branding footer"). One select with Edit and New beside it, the same on the
 * custom label editor, Pack stickers (one footer for the whole sheet) and a
 * label type (its default). The footer is always the business's branding
 * (owner, 2026-10-12: "Footer should be always branding of Bake and Grill";
 * a food brand such as Amma keeps its logo and name on the header): the
 * editor lists every line of the footer and shows, in grey, what a blank
 * line prints, the live value from Business Details. With nothing picked the
 * footer that prints instead (the type's, else the standard one) is shown
 * and can be changed from the same pencil.
 */

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

/** "Bake & Grill · Fresh Baked, Fire Grilled · +960 912 0011 · bakeandgrill.mv": what the footer prints, in a line. */
export const describeFooter = (f: LabelFooter): string =>
  [f.effective.name, f.effective.tagline, f.effective.phone, f.effective.website].filter(Boolean).join(' · ');

const upsert = (list: LabelFooter[], f: LabelFooter): LabelFooter[] =>
  list.some((x) => x.id === f.id) ? list.map((x) => (x.id === f.id ? f : x)) : [...list, f].sort((a, b) => a.sort - b.sort || a.id - b.id);

type PickerProps = {
  id: string;
  footers: LabelFooter[];
  value: number | null;
  onChange: (id: number | null) => void;
  onFootersChange: (footers: LabelFooter[]) => void;
  /** What "no footer picked" means here, e.g. "Follow the type (Standard)". */
  noneLabel: string;
  /** The footer that prints when none is picked, so its lines show and the pencil reaches it. */
  fallback?: LabelFooter | null;
  /** Edit and New need Manage label settings. */
  canManage: boolean;
};

export function FooterPicker({ id, footers, value, onChange, onFootersChange, noneLabel, fallback = null, canManage }: PickerProps) {
  const [editing, setEditing] = useState<LabelFooter | null | 'new'>(null);
  const picked = footers.find((f) => f.id === value) ?? null;
  const shown = picked ?? fallback;

  return (
    <div data-testid={`${id}-picker`}>
      <div className="flex gap-2">
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={fieldClass}>
          <option value="">{noneLabel}</option>
          {footers.map((f) => <option key={f.id} value={f.id}>{f.name}{f.is_default ? ' (standard)' : ''}</option>)}
        </select>
        {canManage && shown && (
          <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(shown)} aria-label={`Edit the footer ${shown.name}`} title="Change this footer" className="shrink-0" />
        )}
        {canManage && (
          <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setEditing('new')} aria-label="New footer" title="New footer" className="shrink-0" />
        )}
      </div>
      {shown && <p className="text-xs text-[var(--color-text-muted)] mt-1" data-testid={`${id}-lines`}>{describeFooter(shown)}</p>}
      {editing !== null && (
        <FooterModal
          footer={editing === 'new' ? null : editing}
          footers={footers}
          onClose={() => setEditing(null)}
          onSaved={(f) => {
            onFootersChange(upsert(footers, f));
            // A new footer is picked; a changed one keeps its place (a fallback stays unpicked).
            if (editing === 'new' || picked) onChange(f.id);
          }}
          onRemoved={(fid) => { onFootersChange(footers.filter((x) => x.id !== fid)); if (value === fid) onChange(null); }}
        />
      )}
    </div>
  );
}

type Draft = {
  name: string;
  heading: string; heading_dv: string; tagline: string; tagline_dv: string;
  phone: string; ways: string; ways_dv: string; website: string; address: string; address_dv: string; landmark: string; landmark_dv: string;
  show_qr: boolean; show_mark: boolean;
};

const toDraft = (f: LabelFooter | null): Draft => ({
  name: f?.name ?? '',
  heading: f?.heading ?? '', heading_dv: f?.heading_dv ?? '', tagline: f?.tagline ?? '', tagline_dv: f?.tagline_dv ?? '',
  phone: f?.phone ?? '', ways: f?.ways ?? '', ways_dv: f?.ways_dv ?? '', website: f?.website ?? '',
  address: f?.address ?? '', address_dv: f?.address_dv ?? '', landmark: f?.landmark ?? '', landmark_dv: f?.landmark_dv ?? '',
  show_qr: f?.show_qr ?? true, show_mark: f?.show_mark ?? true,
});

const text = (v: string) => v.trim() || null;

const toPayload = (d: Draft): LabelFooterPayload => ({
  name: d.name.trim(),
  heading: text(d.heading), heading_dv: text(d.heading_dv), tagline: text(d.tagline), tagline_dv: text(d.tagline_dv),
  phone: text(d.phone), ways: text(d.ways), ways_dv: text(d.ways_dv), website: text(d.website),
  address: text(d.address), address_dv: text(d.address_dv), landmark: text(d.landmark), landmark_dv: text(d.landmark_dv),
  show_qr: d.show_qr, show_mark: d.show_mark,
});

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

/** Make or change a footer. The grey text in an empty box is what it prints. */
export function FooterModal({ footer, footers, onClose, onSaved, onRemoved }: {
  footer: LabelFooter | null;
  footers: LabelFooter[];
  onClose: () => void;
  onSaved: (f: LabelFooter) => void;
  onRemoved?: (id: number) => void;
}) {
  const { toast } = useToast();
  const [d, setD] = useState<Draft>(() => toDraft(footer));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));

  // What a blank line prints: this footer's own lines, else the standard footer's (the business's).
  const standard = footers.find((f) => f.is_default) ?? null;
  const ph = (footer ?? standard)?.effective;
  const business = standard?.effective.name ?? 'Bake & Grill';

  const save = async () => {
    if (!d.name.trim()) { toast('error', 'Give the footer a name.'); return; }
    setSaving(true);
    try {
      const r = footer ? await updateLabelFooter(footer.id, toPayload(d)) : await createLabelFooter(toPayload(d));
      onSaved(r.data);
      toast('success', footer ? 'Footer saved.' : 'Footer added.');
      onClose();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!footer || !window.confirm(`Remove the footer "${footer.name}"? Labels and types that print it go back to the standard footer.`)) return;
    setRemoving(true);
    try {
      await deleteLabelFooter(footer.id);
      onRemoved?.(footer.id);
      toast('success', 'Footer removed.');
      onClose();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not remove it.');
    } finally {
      setRemoving(false);
    }
  };

  const input = (k: keyof Draft, id: string, label: string, max: number, dv = false, hint?: string) => (
    <Field id={id} label={label} hint={hint}>
      <input id={id} dir={dv ? 'rtl' : undefined} value={String(d[k])} maxLength={max} onChange={(e) => set(k, e.target.value as Draft[typeof k])} className={fieldClass} placeholder={ph ? String(ph[(k === 'heading' ? 'name' : k === 'heading_dv' ? 'name_dv' : k) as keyof typeof ph] ?? '') : ''} />
    </Field>
  );

  return (
    <Modal title={footer ? `Edit footer: ${footer.name}` : 'New footer'} onClose={onClose} maxWidth={760}>
      <div className="space-y-4" data-testid="label-footer-form">
        <p className="text-xs text-[var(--color-text-muted)]">The footer is always {business}'s branding: a food brand such as Amma keeps its logo and name on the header. A footer is picked by name on a custom label, a label type or a whole sheet. Leave a box empty to print what is shown in grey, the current value from Business Details.</p>
        <Field id="lf-name" label="Footer name (for the list)"><input id="lf-name" value={d.name} maxLength={60} onChange={(e) => set('name', e.target.value)} className={fieldClass} placeholder="Kitchen stamp" /></Field>

        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">Name and tagline</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {input('heading', 'lf-heading', 'Name printed big', 60)}
            {input('heading_dv', 'lf-heading-dv', 'Name (Dhivehi)', 60, true)}
            {input('tagline', 'lf-tagline', 'Tagline, or your own words', 120, false, 'On the small stickers it prints where the website would.')}
            {input('tagline_dv', 'lf-tagline-dv', 'Tagline (Dhivehi)', 120, true)}
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">How to reach you</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {input('phone', 'lf-phone', 'Phone', 40)}
            {input('website', 'lf-website', 'Website', 80)}
            {input('ways', 'lf-ways', 'Ways to reach you', 80)}
            {input('ways_dv', 'lf-ways-dv', 'Ways to reach you (Dhivehi)', 80, true)}
            {input('address', 'lf-address', 'Address', 120)}
            {input('address_dv', 'lf-address-dv', 'Address (Dhivehi)', 120, true)}
            {input('landmark', 'lf-landmark', 'Landmark', 80)}
            {input('landmark_dv', 'lf-landmark-dv', 'Landmark (Dhivehi)', 80, true)}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" checked={d.show_qr} onChange={(e) => set('show_qr', e.target.checked)} className="w-5 h-5 accent-[var(--color-primary)]" /><span className="text-sm text-[var(--color-text)]">Print the complaints QR</span></label>
          <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" checked={d.show_mark} onChange={(e) => set('show_mark', e.target.checked)} className="w-5 h-5 accent-[var(--color-primary)]" /><span className="text-sm text-[var(--color-text)]">Print the brand mark</span></label>
        </div>
      </div>
      <ModalActions>
        {footer && !footer.is_default && onRemoved && <Btn variant="danger-outline" onClick={() => void remove()} disabled={removing} data-testid="label-footer-remove">Remove</Btn>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void save()} loading={saving} data-testid="label-footer-save">{footer ? 'Save footer' : 'Add footer'}</Button>
      </ModalActions>
    </Modal>
  );
}
