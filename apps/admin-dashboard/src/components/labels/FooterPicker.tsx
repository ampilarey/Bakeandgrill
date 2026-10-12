import { useEffect, useState, type ReactNode } from 'react';
import { Pencil, Plus } from 'lucide-react';
import {
  createLabelFooter, deleteLabelFooter, fetchLabelBrands, updateLabelFooter,
  type LabelBrand, type LabelFooter, type LabelFooterPayload,
} from '../../api';
import { Btn, Modal, ModalActions } from '../SharedUI';
import { Button, useToast } from '../ui';

/*
 * Footer presets (owner, 2026-10-12: "No easy option to select and edit
 * branding footer"). One select with Edit and New beside it, the same on the
 * custom label editor, Pack stickers (one footer for the whole sheet) and a
 * label type (its default). The editor lists every line of the footer and
 * shows, in grey, what a blank line prints: the brand's and Business
 * Details' live values, so the standard footer follows the business.
 */

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

/** "Amma · Home-made, the Amma way · +960 912 0011 · bakeandgrill.mv": what the footer prints, in a line. */
export const describeFooter = (f: LabelFooter): string =>
  [f.effective.name, f.effective.tagline || f.effective.by, f.effective.phone, f.effective.website].filter(Boolean).join(' · ');

const upsert = (list: LabelFooter[], f: LabelFooter): LabelFooter[] =>
  list.some((x) => x.id === f.id) ? list.map((x) => (x.id === f.id ? f : x)) : [...list, f].sort((a, b) => a.sort - b.sort || a.id - b.id);

type PickerProps = {
  id: string;
  footers: LabelFooter[];
  value: number | null;
  onChange: (id: number | null) => void;
  onFootersChange: (footers: LabelFooter[]) => void;
  /** What "no footer picked" means here, e.g. "Amma's own footer". */
  noneLabel: string;
  /** Edit and New need Manage label settings. */
  canManage: boolean;
};

export function FooterPicker({ id, footers, value, onChange, onFootersChange, noneLabel, canManage }: PickerProps) {
  const [editing, setEditing] = useState<LabelFooter | null | 'new'>(null);
  const picked = footers.find((f) => f.id === value) ?? null;

  return (
    <div data-testid={`${id}-picker`}>
      <div className="flex gap-2">
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={fieldClass}>
          <option value="">{noneLabel}</option>
          {footers.map((f) => <option key={f.id} value={f.id}>{f.name}{f.is_default ? ' (standard)' : ''}</option>)}
        </select>
        {canManage && picked && (
          <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(picked)} aria-label={`Edit the footer ${picked.name}`} title="Change this footer" className="shrink-0" />
        )}
        {canManage && (
          <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setEditing('new')} aria-label="New footer" title="New footer" className="shrink-0" />
        )}
      </div>
      {picked && <p className="text-xs text-[var(--color-text-muted)] mt-1" data-testid={`${id}-lines`}>{describeFooter(picked)}</p>}
      {editing !== null && (
        <FooterModal
          footer={editing === 'new' ? null : editing}
          footers={footers}
          onClose={() => setEditing(null)}
          onSaved={(f) => { onFootersChange(upsert(footers, f)); onChange(f.id); }}
          onRemoved={(fid) => { onFootersChange(footers.filter((x) => x.id !== fid)); if (value === fid) onChange(null); }}
        />
      )}
    </div>
  );
}

type Draft = {
  name: string; brand_id: number | null;
  heading: string; heading_dv: string; tagline: string; tagline_dv: string; by_line: string; show_by: boolean;
  phone: string; ways: string; ways_dv: string; website: string; address: string; address_dv: string; landmark: string; landmark_dv: string;
  show_qr: boolean; show_mark: boolean;
};

const toDraft = (f: LabelFooter | null): Draft => ({
  name: f?.name ?? '', brand_id: f?.brand_id ?? null,
  heading: f?.heading ?? '', heading_dv: f?.heading_dv ?? '', tagline: f?.tagline ?? '', tagline_dv: f?.tagline_dv ?? '',
  by_line: f?.by_line ?? '', show_by: f?.show_by ?? true,
  phone: f?.phone ?? '', ways: f?.ways ?? '', ways_dv: f?.ways_dv ?? '', website: f?.website ?? '',
  address: f?.address ?? '', address_dv: f?.address_dv ?? '', landmark: f?.landmark ?? '', landmark_dv: f?.landmark_dv ?? '',
  show_qr: f?.show_qr ?? true, show_mark: f?.show_mark ?? true,
});

const text = (v: string) => v.trim() || null;

const toPayload = (d: Draft): LabelFooterPayload => ({
  name: d.name.trim(), brand_id: d.brand_id,
  heading: text(d.heading), heading_dv: text(d.heading_dv), tagline: text(d.tagline), tagline_dv: text(d.tagline_dv),
  by_line: text(d.by_line), show_by: d.show_by,
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
  const [brands, setBrands] = useState<LabelBrand[]>([]);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    fetchLabelBrands().then((r) => setBrands(r.data)).catch(() => setBrands([]));
  }, []);

  // What a blank line prints: this footer's own lines, else the lines of the
  // footer for the brand picked, else the standard one's.
  const template = footer ?? footers.find((f) => f.brand_id === d.brand_id) ?? footers.find((f) => f.is_default) ?? null;
  const ph = template?.effective;
  const brand = brands.find((b) => b.id === d.brand_id) ?? null;
  const mainName = brands.find((b) => b.is_default)?.name ?? 'Bake & Grill';

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
    if (!footer || !window.confirm(`Remove the footer "${footer.name}"? Labels and types that print it go back to their brand's footer.`)) return;
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
      <input id={id} dir={dv ? 'rtl' : undefined} value={String(d[k])} maxLength={max} onChange={(e) => set(k, e.target.value as Draft[typeof k])} className={fieldClass} placeholder={ph ? String(ph[(k === 'heading' ? 'name' : k === 'heading_dv' ? 'name_dv' : k === 'by_line' ? 'by' : k) as keyof typeof ph] ?? '') : ''} />
    </Field>
  );

  return (
    <Modal title={footer ? `Edit footer: ${footer.name}` : 'New footer'} onClose={onClose} maxWidth={760}>
      <div className="space-y-4" data-testid="label-footer-form">
        <p className="text-xs text-[var(--color-text-muted)]">A footer is picked by name on a custom label, a label type or a whole sheet. Leave a box empty to print what is shown in grey: the brand's and Business Details' current values.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="lf-name" label="Footer name (for the list)"><input id="lf-name" value={d.name} maxLength={60} onChange={(e) => set('name', e.target.value)} className={fieldClass} placeholder="Kitchen stamp" /></Field>
          <Field id="lf-brand" label="Whose lines fill the blanks" hint={brand && !brand.is_default ? `${brand.name}'s name, tagline and logo, by ${mainName}.` : `${mainName} itself, from Business Details.`}>
            <select id="lf-brand" value={d.brand_id ?? ''} onChange={(e) => set('brand_id', e.target.value ? Number(e.target.value) : null)} className={fieldClass}>
              <option value="">{mainName} (the business)</option>
              {brands.filter((b) => !b.is_default).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        </div>

        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">Name and tagline</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {input('heading', 'lf-heading', 'Name printed big', 60)}
            {input('heading_dv', 'lf-heading-dv', 'Name (Dhivehi)', 60, true)}
            {input('tagline', 'lf-tagline', 'Tagline, or your own words', 120, false, 'On the small stickers it prints where the website would.')}
            {input('tagline_dv', 'lf-tagline-dv', 'Tagline (Dhivehi)', 120, true)}
            {input('by_line', 'lf-by', 'By-line', 60, false, `Empty prints "by ${mainName}" for a brand under it.`)}
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer sm:mt-5"><input type="checkbox" checked={d.show_by} onChange={(e) => set('show_by', e.target.checked)} className="w-5 h-5 accent-[var(--color-primary)]" /><span className="text-sm text-[var(--color-text)]">Print the by-line</span></label>
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
