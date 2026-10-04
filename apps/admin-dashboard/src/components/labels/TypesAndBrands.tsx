import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Upload, Tag, BadgeCheck } from 'lucide-react';
import {
  createLabelBrand, createLabelType, deleteLabelBrand, deleteLabelType, fetchLabelBrands, fetchLabelTypes,
  updateLabelBrand, updateLabelType, uploadLabelBrandLogo,
  type LabelBrand, type LabelStorage, type LabelType, type LabelTypePayload,
} from '../../api';
import { Modal } from '../SharedUI';
import { Button, Card, useToast } from '../ui';

/*
 * Label Hub v2, step 1 (docs/LABEL_HUB_V2_PLAN.md). Owner, 2026-10-04:
 * "frozen hedika is a type of food so that label should be easily selected"
 * and "amma brand is a specific food under bake and grill. So option to add
 * name and brand logo". A label type is what kind of food the label is for
 * and carries all its wording; a brand is who it is from. Items pick a type.
 */

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const areaClass = 'w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] resize-y';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';
const STORAGE_NAMES: Record<LabelStorage, string> = { frozen: 'Frozen', chilled: 'Chilled', ambient: 'Room temperature' };
const MFG_CHOICES = ['MFG DATE', 'MADE ON', 'PACKED ON', 'BAKED ON'];
const EXP_CHOICES = ['EXP DATE', 'BEST BEFORE', 'USE BY', 'EXPIRY'];

type TypeDraft = Required<Pick<LabelType, 'name' | 'heading' | 'storage' | 'mfg_label' | 'exp_label' | 'show_qr' | 'is_active'>> & {
  brand_id: number | null; heading_dv: string; storage_line: string; storage_line_dv: string; use_within: string; use_within_dv: string;
  how_to_use: string; how_to_use_dv: string; note: string; note_dv: string; shelf_life_days: string;
};

const typeDraft = (t: LabelType | null, brands: LabelBrand[]): TypeDraft => ({
  name: t?.name ?? '', heading: t?.heading ?? '', heading_dv: t?.heading_dv ?? '',
  brand_id: t?.brand_id ?? (brands.find((b) => b.is_default)?.id ?? null),
  storage: t?.storage ?? 'frozen', storage_line: t?.storage_line ?? '', storage_line_dv: t?.storage_line_dv ?? '',
  use_within: t?.use_within ?? '', use_within_dv: t?.use_within_dv ?? '',
  mfg_label: t?.mfg_label ?? 'MFG DATE', exp_label: t?.exp_label ?? 'EXP DATE',
  how_to_use: t?.how_to_use ?? '', how_to_use_dv: t?.how_to_use_dv ?? '', note: t?.note ?? '', note_dv: t?.note_dv ?? '',
  shelf_life_days: t?.shelf_life_days ? String(t.shelf_life_days) : '', show_qr: t?.show_qr ?? true, is_active: t?.is_active ?? true,
});

const typePayload = (d: TypeDraft): LabelTypePayload => ({
  name: d.name.trim(), heading: d.heading.trim(), heading_dv: d.heading_dv.trim() || null, brand_id: d.brand_id,
  storage: d.storage, storage_line: d.storage_line.trim() || null, storage_line_dv: d.storage_line_dv.trim() || null,
  use_within: d.use_within.trim() || null, use_within_dv: d.use_within_dv.trim() || null,
  mfg_label: d.mfg_label.trim() || 'MFG DATE', exp_label: d.exp_label.trim() || 'EXP DATE',
  how_to_use: d.how_to_use.trim() || null, how_to_use_dv: d.how_to_use_dv.trim() || null,
  note: d.note.trim() || null, note_dv: d.note_dv.trim() || null,
  shelf_life_days: d.shelf_life_days ? Number(d.shelf_life_days) : null, show_qr: d.show_qr, is_active: d.is_active,
});

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

/** A select of the usual choices that also takes a typed value. */
function ChoiceInput({ id, value, choices, onChange }: { id: string; value: string; choices: string[]; onChange: (v: string) => void }) {
  return (
    <>
      <input id={id} list={`${id}-choices`} value={value} maxLength={20} onChange={(e) => onChange(e.target.value.toUpperCase())} className={fieldClass} />
      <datalist id={`${id}-choices`}>{choices.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}

function TypeModal({ type, brands, defaults, onClose, onSaved }: { type: LabelType | null; brands: LabelBrand[]; defaults: LabelType['defaults'] | null; onClose: () => void; onSaved: (t: LabelType) => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<TypeDraft>(() => typeDraft(type, brands));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof TypeDraft>(k: K, v: TypeDraft[K]) => setD((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (!d.name.trim() || !d.heading.trim()) { toast('error', 'Give the type a name and a heading.'); return; }
    setSaving(true);
    try {
      const r = type ? await updateLabelType(type.id, typePayload(d)) : await createLabelType(typePayload(d));
      onSaved(r.data);
      toast('success', type ? 'Label type saved.' : 'Label type added.');
      onClose();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={type ? `Edit ${type.name}` : 'New label type'} onClose={onClose} maxWidth={720}>
      <div className="space-y-4" data-testid="label-type-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="lt-name" label="Type name (for the list)"><input id="lt-name" value={d.name} maxLength={60} onChange={(e) => set('name', e.target.value)} className={fieldClass} placeholder="Frozen Hedhika" /></Field>
          <Field id="lt-brand" label="Brand">
            <select id="lt-brand" value={d.brand_id ?? ''} onChange={(e) => set('brand_id', e.target.value ? Number(e.target.value) : null)} className={fieldClass}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_default ? ' (main)' : ''}</option>)}
            </select>
          </Field>
          <Field id="lt-heading" label="Heading on the sticker"><input id="lt-heading" value={d.heading} maxLength={40} onChange={(e) => set('heading', e.target.value)} className={fieldClass} placeholder="FROZEN HEDHIKA" /></Field>
          <Field id="lt-heading-dv" label="Heading (Dhivehi)"><input id="lt-heading-dv" dir="rtl" value={d.heading_dv} maxLength={40} onChange={(e) => set('heading_dv', e.target.value)} className={fieldClass} /></Field>
        </div>

        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">Storage</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="lt-storage" label="Kept">
              <select id="lt-storage" value={d.storage} onChange={(e) => set('storage', e.target.value as LabelStorage)} className={fieldClass}>
                {(Object.keys(STORAGE_NAMES) as LabelStorage[]).map((k) => <option key={k} value={k}>{STORAGE_NAMES[k]}</option>)}
              </select>
            </Field>
            <Field id="lt-life" label="Shelf life (days)" hint="Expiry = made-on date + this, unless the item has its own."><input id="lt-life" type="number" inputMode="numeric" min={1} max={730} value={d.shelf_life_days} onChange={(e) => set('shelf_life_days', e.target.value)} className={fieldClass} placeholder="Blank: write by hand" /></Field>
            <Field id="lt-line" label="Storage line (strip above the footer)"><input id="lt-line" value={d.storage_line} maxLength={160} onChange={(e) => set('storage_line', e.target.value)} className={fieldClass} placeholder={defaults?.storage_line ?? 'Usual line for this storage'} /></Field>
            <Field id="lt-line-dv" label="Storage line (Dhivehi)"><input id="lt-line-dv" dir="rtl" value={d.storage_line_dv} maxLength={160} onChange={(e) => set('storage_line_dv', e.target.value)} className={fieldClass} placeholder={defaults?.storage_line_dv ?? ''} /></Field>
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">Dates</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="lt-mfg" label="Made-on box says" hint="Pick one or type your own."><ChoiceInput id="lt-mfg" value={d.mfg_label} choices={MFG_CHOICES} onChange={(v) => set('mfg_label', v)} /></Field>
            <Field id="lt-exp" label="Expiry box says"><ChoiceInput id="lt-exp" value={d.exp_label} choices={EXP_CHOICES} onChange={(v) => set('exp_label', v)} /></Field>
            <Field id="lt-within" label="Use-within line (under the dates)"><input id="lt-within" value={d.use_within} maxLength={80} onChange={(e) => set('use_within', e.target.value)} className={fieldClass} placeholder="Use within 2 days of opening" /></Field>
            <Field id="lt-within-dv" label="Use-within line (Dhivehi)"><input id="lt-within-dv" dir="rtl" value={d.use_within_dv} maxLength={80} onChange={(e) => set('use_within_dv', e.target.value)} className={fieldClass} /></Field>
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">How to use, and a note</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="lt-use" label="How to use" hint="An item can have its own instead."><textarea id="lt-use" rows={2} value={d.how_to_use} maxLength={200} onChange={(e) => set('how_to_use', e.target.value)} className={areaClass} placeholder="Thaw 10 min. Deep fry 4–5 min on medium heat until golden." /></Field>
            <Field id="lt-use-dv" label="How to use (Dhivehi)"><textarea id="lt-use-dv" dir="rtl" rows={2} value={d.how_to_use_dv} maxLength={200} onChange={(e) => set('how_to_use_dv', e.target.value)} className={areaClass} /></Field>
            <Field id="lt-note" label="Note under the ingredients"><input id="lt-note" value={d.note} maxLength={120} onChange={(e) => set('note', e.target.value)} className={fieldClass} placeholder="Contains fish and gluten" /></Field>
            <Field id="lt-note-dv" label="Note (Dhivehi)"><input id="lt-note-dv" dir="rtl" value={d.note_dv} maxLength={120} onChange={(e) => set('note_dv', e.target.value)} className={fieldClass} /></Field>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" checked={d.show_qr} onChange={(e) => set('show_qr', e.target.checked)} className="w-5 h-5 accent-[var(--color-primary)]" /><span className="text-sm text-[var(--color-text)]">Print the complaints QR in the footer</span></label>
          <label className="flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" checked={d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-5 h-5 accent-[var(--color-primary)]" /><span className="text-sm text-[var(--color-text)]">Offered when picking a type</span></label>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} data-testid="label-type-save">{type ? 'Save type' : 'Add type'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function BrandModal({ brand, onClose, onSaved }: { brand: LabelBrand | null; onClose: () => void; onSaved: (b: LabelBrand) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(brand?.name ?? '');
  const [nameDv, setNameDv] = useState(brand?.name_dv ?? '');
  const [tagline, setTagline] = useState(brand?.tagline ?? '');
  const [taglineDv, setTaglineDv] = useState(brand?.tagline_dv ?? '');
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(brand?.logo_url ?? null);
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setLogo(f);
    if (f) setPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!name.trim()) { toast('error', 'Give the brand a name.'); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), name_dv: nameDv.trim() || null, tagline: tagline.trim() || null, tagline_dv: taglineDv.trim() || null };
      let saved = brand ? (await updateLabelBrand(brand.id, body)).data : (await createLabelBrand(body)).data;
      if (logo) saved = (await uploadLabelBrandLogo(saved.id, logo)).data;
      onSaved(saved);
      toast('success', brand ? 'Brand saved.' : 'Brand added.');
      onClose();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={brand ? `Edit ${brand.name}` : 'New brand'} onClose={onClose} maxWidth={560}>
      <div className="space-y-4" data-testid="label-brand-form">
        {brand?.is_default && <p className="text-xs text-[var(--color-text-muted)]">The main brand's name, tagline, phone, address and website come from Business Details. Only the Dhivehi name is set here.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="lb-name" label="Brand name"><input id="lb-name" value={name} maxLength={60} disabled={brand?.is_default} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Amma" /></Field>
          <Field id="lb-name-dv" label="Brand name (Dhivehi)"><input id="lb-name-dv" dir="rtl" value={nameDv} maxLength={60} onChange={(e) => setNameDv(e.target.value)} className={fieldClass} /></Field>
          <Field id="lb-tag" label="Tagline"><input id="lb-tag" value={tagline} maxLength={80} disabled={brand?.is_default} onChange={(e) => setTagline(e.target.value)} className={fieldClass} placeholder="Home-made, the Amma way" /></Field>
          <Field id="lb-tag-dv" label="Tagline (Dhivehi)"><input id="lb-tag-dv" dir="rtl" value={taglineDv} maxLength={80} onChange={(e) => setTaglineDv(e.target.value)} className={fieldClass} /></Field>
        </div>
        {!brand?.is_default && (
          <div>
            <span className={labelClass}>Logo</span>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-24 h-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-center overflow-hidden">
                {preview ? <img src={preview} alt="" className="max-w-full max-h-full object-contain" /> : <Tag size={20} className="text-[var(--color-text-muted)]" />}
              </div>
              <input ref={file} type="file" accept="image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} data-testid="label-brand-logo" />
              <Button variant="secondary" icon={<Upload size={16} />} onClick={() => file.current?.click()}>{preview ? 'Change logo' : 'Upload logo'}</Button>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">A PNG with a clear background, square works best. Kept exactly as uploaded.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} data-testid="label-brand-save">{brand ? 'Save brand' : 'Add brand'}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function TypesAndBrands({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [types, setTypes] = useState<LabelType[]>([]);
  const [brands, setBrands] = useState<LabelBrand[]>([]);
  const [editType, setEditType] = useState<LabelType | null | 'new'>(null);
  const [editBrand, setEditBrand] = useState<LabelBrand | null | 'new'>(null);

  const load = () => {
    fetchLabelTypes().then((r) => setTypes(r.data)).catch(() => setTypes([]));
    fetchLabelBrands().then((r) => setBrands(r.data)).catch(() => setBrands([]));
  };
  useEffect(load, []);

  const removeType = async (t: LabelType) => {
    if (!window.confirm(`Remove the label type "${t.name}"?`)) return;
    try { await deleteLabelType(t.id); load(); toast('success', 'Label type removed.'); } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not remove it.'); }
  };
  const removeBrand = async (b: LabelBrand) => {
    if (!window.confirm(`Remove the brand "${b.name}"?`)) return;
    try { await deleteLabelBrand(b.id); load(); toast('success', 'Brand removed.'); } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not remove it.'); }
  };

  return (
    <div className="space-y-5" data-testid="types-and-brands">
      <Card
        padding="none"
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-[var(--color-text)]">Label types</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">What kind of food a label is for, with its wording. Each item picks one on its Label tab; a sheet can also be printed as a type.</p>
            </div>
            {canManage && <Button size="sm" icon={<Plus size={16} />} onClick={() => setEditType('new')} data-testid="label-type-new">New type</Button>}
          </div>
        }
      >
        <ul className="divide-y divide-[var(--color-border-light)]">
          {types.map((t) => (
            <li key={t.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-semibold text-[var(--color-text)]">{t.name}{!t.is_active && <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">(hidden)</span>}</div>
                <div className="text-xs text-[var(--color-text-muted)]">{t.heading} · {STORAGE_NAMES[t.storage]} · {t.brand_name ?? 'Bake & Grill'}{t.shelf_life_days ? ` · keeps ${t.shelf_life_days} days` : ''}{t.items_count ? ` · ${t.items_count} ${t.items_count === 1 ? 'item' : 'items'}` : ''}</div>
              </div>
              {canManage && (
                <span className="inline-flex">
                  <button type="button" onClick={() => setEditType(t)} className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]" aria-label={`Edit ${t.name}`}><Pencil size={16} /></button>
                  <button type="button" onClick={() => removeType(t)} className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]" aria-label={`Remove ${t.name}`}><Trash2 size={16} /></button>
                </span>
              )}
            </li>
          ))}
          {types.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No label types yet.</li>}
        </ul>
      </Card>

      <Card
        padding="none"
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-[var(--color-text)]">Brands</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Who the label is from. The main brand is the business itself; a brand under it, like Amma, prints its own name and logo with "by Bake &amp; Grill" in the footer.</p>
            </div>
            {canManage && <Button size="sm" icon={<Plus size={16} />} onClick={() => setEditBrand('new')} data-testid="label-brand-new">New brand</Button>}
          </div>
        }
      >
        <ul className="divide-y divide-[var(--color-border-light)]">
          {brands.map((b) => (
            <li key={b.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-12 h-12 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-center overflow-hidden">
                {b.logo_url ? <img src={b.logo_url} alt="" className="max-w-full max-h-full object-contain" /> : <Tag size={18} className="text-[var(--color-text-muted)]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-1">{b.name}{b.is_default && <BadgeCheck size={14} className="text-[var(--color-primary)]" aria-label="Main brand" />}</div>
                <div className="text-xs text-[var(--color-text-muted)] truncate">{b.tagline || (b.is_default ? 'From Business Details' : 'No tagline')}{b.types_count ? ` · ${b.types_count} ${b.types_count === 1 ? 'type' : 'types'}` : ''}</div>
              </div>
              {canManage && (
                <span className="inline-flex">
                  <button type="button" onClick={() => setEditBrand(b)} className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]" aria-label={`Edit ${b.name}`}><Pencil size={16} /></button>
                  {!b.is_default && <button type="button" onClick={() => removeBrand(b)} className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]" aria-label={`Remove ${b.name}`}><Trash2 size={16} /></button>}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {editType !== null && <TypeModal type={editType === 'new' ? null : editType} brands={brands} defaults={editType === 'new' ? null : editType.defaults} onClose={() => setEditType(null)} onSaved={load} />}
      {editBrand !== null && <BrandModal brand={editBrand === 'new' ? null : editBrand} onClose={() => setEditBrand(null)} onSaved={load} />}
    </div>
  );
}
