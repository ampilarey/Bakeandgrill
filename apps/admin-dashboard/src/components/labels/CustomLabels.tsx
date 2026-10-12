import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, ChevronDown, Copy, Eye, ImagePlus, Pencil, Plus, Printer, RefreshCw, Search, Tag, Upload, X } from 'lucide-react';
import {
  createCustomLabel, deleteCustomLabel, duplicateCustomLabel, fetchCustomLabels, fetchLabelBrands, fetchLabelLayouts, fetchLabelTypes,
  previewCustomDraft, stickerLinks, updateCustomLabel, uploadCustomLabelPicture,
  type CustomLabel, type CustomLabelPayload, type LabelBrand, type LabelLimits, type LabelPreset, type LabelStorage, type LabelType, type StickerLang,
} from '../../api';
import { DEFAULT_CHOICE, rememberedSize, requestFor, sizeName, sizeOf, stockOf, type SizeChoice } from './labelSize';
import { Btn, ConfirmDialog, Modal, ModalActions, useConfirmDialog } from '../SharedUI';
import { Button, Card, useToast } from '../ui';
import { MediaPicker } from '../MediaPicker';
import { SheetPreview } from './SheetPreview';
import { PhonePreviewBar } from './PhonePreviewBar';
import { LabelSizePicker } from './LabelSizePicker';
import { BrandModal } from './TypesAndBrands';
import { useIsBelowDesktop } from '../../hooks/useIsMobile';

/*
 * Custom labels (owner, 2026-10-11: "Add option to add custom labels using
 * different brands logos and other details. Not only from the menu list"):
 * a pack sticker for something that is not on the menu, with its own brand
 * and logo, label type and wording. It prints from Pack stickers beside the
 * menu items, on any size. Writing one needs Manage label settings.
 *
 * Audit, 2026-10-12 (owner: "Do a full audit and add important features and
 * make it user friendly and mobile friendly"). The editor previews the very
 * sticker Pack stickers would print, at any size (the same picker), and on a
 * phone the preview is a bar pinned under the title, not the end of a long
 * scroll. Save and Print… sit in the sheet's sticky footer; closing with
 * changes asks first. The label picks its footer (its brand's, the standard
 * main-brand footer, or its own words), says whether the complaints QR
 * prints, and remembers the language it prints in. The long form folds:
 * Shop till, Wording and Footer open when they hold something.
 */

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const areaClass = 'w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] resize-y';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';
const STORAGE_NAMES: Record<LabelStorage, string> = { frozen: 'Frozen', chilled: 'Chilled', ambient: 'Room temperature' };
type FooterStyle = CustomLabel['label_footer_style'];

type Draft = {
  name: string; name_dv: string; brand_id: number | null; label_type_id: number | null; label_storage: LabelStorage | '';
  label_heading: string; label_heading_dv: string; label_storage_line: string; label_storage_line_dv: string;
  label_ingredients: string; label_ingredients_dv: string; label_how_to_use: string; label_how_to_use_dv: string;
  label_note: string; label_note_dv: string; label_footer: string; label_footer_dv: string;
  label_footer_style: FooterStyle; label_show_qr: '' | 'on' | 'off'; label_lang: StickerLang | '';
  label_shelf_life_days: string; label_pack_qty: string; label_pack_unit: string;
  label_price: string; label_barcode: string; label_net_weight: string; label_allergens: string;
  label_photo_media_id: number | null; label_photo_url: string | null; label_title_media_id: number | null; label_title_url: string | null;
};

const toDraft = (c: CustomLabel | null): Draft => ({
  name: c?.name ?? '', name_dv: c?.name_dv ?? '', brand_id: c?.brand_id ?? null, label_type_id: c?.label_type_id ?? null, label_storage: c?.label_storage ?? '',
  label_heading: c?.label_heading ?? '', label_heading_dv: c?.label_heading_dv ?? '', label_storage_line: c?.label_storage_line ?? '', label_storage_line_dv: c?.label_storage_line_dv ?? '',
  label_ingredients: c?.label_ingredients ?? '', label_ingredients_dv: c?.label_ingredients_dv ?? '', label_how_to_use: c?.label_how_to_use ?? '', label_how_to_use_dv: c?.label_how_to_use_dv ?? '',
  label_note: c?.label_note ?? '', label_note_dv: c?.label_note_dv ?? '', label_footer: c?.label_footer ?? '', label_footer_dv: c?.label_footer_dv ?? '',
  label_footer_style: c?.label_footer_style ?? 'brand', label_show_qr: c?.label_show_qr == null ? '' : c.label_show_qr ? 'on' : 'off', label_lang: c?.label_lang ?? '',
  label_shelf_life_days: c?.label_shelf_life_days ? String(c.label_shelf_life_days) : '', label_pack_qty: c?.label_pack_qty ? String(c.label_pack_qty) : '', label_pack_unit: c?.label_pack_unit ?? '',
  label_price: c?.label_price != null ? String(c.label_price) : '', label_barcode: c?.label_barcode ?? '', label_net_weight: c?.label_net_weight ?? '', label_allergens: c?.label_allergens ?? '',
  label_photo_media_id: c?.label_photo_media_id ?? null, label_photo_url: c?.label_photo_url ?? null, label_title_media_id: c?.label_title_media_id ?? null, label_title_url: c?.label_title_url ?? null,
});

const text = (v: string) => v.trim() || null;

const toPayload = (d: Draft): CustomLabelPayload => ({
  name: d.name.trim(), name_dv: text(d.name_dv), brand_id: d.brand_id, label_type_id: d.label_type_id, label_storage: d.label_storage || null,
  label_heading: text(d.label_heading), label_heading_dv: text(d.label_heading_dv), label_storage_line: text(d.label_storage_line), label_storage_line_dv: text(d.label_storage_line_dv),
  label_ingredients: text(d.label_ingredients), label_ingredients_dv: text(d.label_ingredients_dv), label_how_to_use: text(d.label_how_to_use), label_how_to_use_dv: text(d.label_how_to_use_dv),
  label_note: text(d.label_note), label_note_dv: text(d.label_note_dv), label_footer: text(d.label_footer), label_footer_dv: text(d.label_footer_dv),
  label_footer_style: d.label_footer_style, label_show_qr: d.label_show_qr === '' ? null : d.label_show_qr === 'on', label_lang: d.label_lang || null,
  label_shelf_life_days: d.label_shelf_life_days ? Number(d.label_shelf_life_days) : null, label_pack_qty: d.label_pack_qty ? Number(d.label_pack_qty) : null, label_pack_unit: text(d.label_pack_unit),
  label_price: d.label_price !== '' ? Number(d.label_price) : null, label_barcode: text(d.label_barcode), label_net_weight: text(d.label_net_weight), label_allergens: text(d.label_allergens),
  label_photo_media_id: d.label_photo_media_id, label_title_media_id: d.label_title_media_id,
});

/** The language a label usually prints in: what it says, else both when it has a Dhivehi name. */
export const langOf = (c: Pick<CustomLabel, 'label_lang' | 'name_dv'>): StickerLang => c.label_lang ?? (c.name_dv ? 'both' : 'en');

/** What a custom label prepares at one tap: the remembered size, a full sheet of it. */
function savedSheetRequest(presets: LabelPreset[]): { layout: string; w: number | null; h: number | null; copies: number } {
  const choice = rememberedSize() ?? DEFAULT_CHOICE;
  if (presets.length === 0) return { layout: 'a4-4', w: null, h: null, copies: 4 };
  return { ...requestFor(choice, presets), copies: Math.max(1, stockOf(choice, presets).perPage) };
}

const WORDING_KEYS: (keyof Draft)[] = ['label_heading', 'label_heading_dv', 'label_storage_line', 'label_storage_line_dv', 'label_note', 'label_note_dv', 'label_how_to_use', 'label_how_to_use_dv'];

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

/** A part of the form that folds: the title stays, with a line saying what it holds. */
function Section({ title, summary, open, testId, children }: { title: string; summary?: ReactNode; open: boolean; testId?: string; children: ReactNode }) {
  return (
    <details className="cl-section rounded-xl border border-[var(--color-border)]" open={open} data-testid={testId}>
      <summary className="cursor-pointer list-none px-3 min-h-[44px] flex items-center gap-2 text-sm font-bold text-[var(--color-text)] select-none">
        <ChevronDown size={16} className="cl-chev shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        <span>{title}</span>
        {summary && <span className="ml-auto text-xs font-normal text-[var(--color-text-muted)] text-right min-w-0">{summary}</span>}
      </summary>
      <div className="px-3 pb-3 space-y-3">{children}</div>
    </details>
  );
}

function LangChips({ lang, onChange }: { lang: StickerLang; onChange: (l: StickerLang) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Print in">
      {(['en', 'dv', 'both'] as const).map((l) => (
        <button key={l} type="button" onClick={() => onChange(l)} aria-pressed={lang === l} className={['px-2.5 h-8 rounded-md text-xs font-semibold border', lang === l ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ')}>{l === 'en' ? 'EN' : l === 'dv' ? 'ދިވެހި' : 'Both'}</button>
      ))}
    </div>
  );
}

export function CustomLabelModal({ label, onClose, onSaved }: { label: CustomLabel | null; onClose: () => void; onSaved: (c: CustomLabel) => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const stacked = useIsBelowDesktop();
  const dialog = useConfirmDialog();
  const [saved, setSaved] = useState<CustomLabel | null>(label);
  const [d, setD] = useState<Draft>(() => toDraft(label));
  const [brands, setBrands] = useState<LabelBrand[]>([]);
  const [types, setTypes] = useState<LabelType[]>([]);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [newBrand, setNewBrand] = useState(false);
  const [picker, setPicker] = useState<'photo' | 'title' | null>(null);
  const [uploading, setUploading] = useState<'photo' | 'title' | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [presets, setPresets] = useState<LabelPreset[]>([]);
  const [limits, setLimits] = useState<LabelLimits | null>(null);
  const [choice, setChoice] = useState<SizeChoice>(() => rememberedSize() ?? DEFAULT_CHOICE);
  const [rounded, setRounded] = useState(false);
  const previewSeq = useRef(0);
  const files = { photo: useRef<HTMLInputElement>(null), title: useRef<HTMLInputElement>(null) };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    fetchLabelBrands().then((r) => setBrands(r.data)).catch(() => setBrands([]));
    fetchLabelTypes().then((r) => setTypes(r.data.filter((t) => t.is_active || t.id === label?.label_type_id))).catch(() => setTypes([]));
  }, [label?.label_type_id]);
  useEffect(() => {
    fetchLabelLayouts().then((r) => { setPresets(r.presets); setLimits(r.limits ?? null); }).catch(() => setPresets([]));
  }, []);

  // The language the preview and Print… use: the label's own, else both when
  // it has a Dhivehi name. The chips write it into the label, so it is kept.
  const lang: StickerLang = d.label_lang || (d.name_dv.trim() ? 'both' : 'en');
  // Unsaved changes: the draft against what the label holds.
  const baseline = useMemo(() => JSON.stringify(toPayload(toDraft(saved))), [saved]);
  const dirty = JSON.stringify(toPayload(d)) !== baseline;

  // The preview is the first sticker of the sheet Pack stickers would print
  // at this size, so what is seen here is what comes out.
  const sized = requestFor(choice, presets);
  const dims = sizeOf(choice, presets);
  const round = choice.shape === 'circle';
  // The preview redraws from the draft as it is typed (2026-10-12), half a
  // second after the last change, saved or not; a reply that arrives after
  // a newer request is ignored. It waits for the size presets, which say
  // what a preset's name measures.
  const draftKey = JSON.stringify([toPayload(d), lang, sized, rounded, presets.length]);
  const refreshPreview = async () => {
    if (presets.length === 0) return;
    const seq = ++previewSeq.current;
    setPreviewBusy(true);
    try {
      const payload = toPayload(d);
      if (!payload.name) delete payload.name;
      const r = await previewCustomDraft({ ...payload, layout: sized.layout, w: sized.w, h: sized.h, lang });
      if (seq !== previewSeq.current) return;
      setPreview(r.one_url ?? r.url);
    } catch {
      if (seq === previewSeq.current) setPreview(null);
    } finally {
      if (seq === previewSeq.current) setPreviewBusy(false);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => { void refreshPreview(); }, 500);
    return () => clearTimeout(timer);
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // What prints in an empty box: the chosen type's wording, else the usual wording.
  const type = types.find((t) => t.id === d.label_type_id) ?? null;
  const ph = {
    heading: type?.heading || saved?.defaults.heading || 'FROZEN HEDHIKA',
    heading_dv: type?.heading_dv || saved?.defaults.heading_dv || '',
    storage_line: type ? (type.storage_line || type.defaults.storage_line) : (saved?.defaults.storage_line || 'The usual line for its storage'),
    storage_line_dv: type ? (type.storage_line_dv || type.defaults.storage_line_dv) : (saved?.defaults.storage_line_dv || ''),
    how_to_use: type?.how_to_use || 'Thaw 10 min. Deep fry 4–5 min until golden.',
    note: type?.note || 'Contains egg and gluten',
    shelf: type?.shelf_life_days ? `${type.shelf_life_days} from the type` : 'Blank: write by hand',
  };
  const brandOf = (id: number | null) => brands.find((b) => b.id === id);
  const mainBrand = brands.find((b) => b.is_default)?.name ?? 'Bake & Grill';
  const typeBrand = type?.brand_name ?? mainBrand;
  const printedBrand = brandOf(d.brand_id)?.name ?? typeBrand;
  const printedIsMain = printedBrand === mainBrand;

  const save = async (): Promise<CustomLabel | null> => {
    if (!d.name.trim()) { toast('error', 'Give the label a name.'); return null; }
    setSaving(true);
    try {
      const r = saved ? await updateCustomLabel(saved.id, toPayload(d)) : await createCustomLabel(toPayload(d));
      setSaved(r.data);
      setD(toDraft(r.data));
      onSaved(r.data);
      toast('success', saved ? 'Custom label saved.' : 'Custom label added.');
      return r.data;
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Print…: Pack stickers opens on this label at the size and language
  // previewed here. A changed or new label is saved first.
  const printIt = async () => {
    setPrinting(true);
    try {
      const target = saved && !dirty ? saved : await save();
      if (!target) return;
      const q = new URLSearchParams({ custom: String(target.id), layout: sized.layout, lang });
      if (sized.w != null) q.set('w', String(sized.w));
      if (sized.h != null) q.set('h', String(sized.h));
      if (rounded) q.set('rounded', '1');
      navigate(`/labels/stickers?${q.toString()}`);
    } finally {
      setPrinting(false);
    }
  };

  const requestClose = () => {
    if (!dirty) { onClose(); return; }
    dialog.ask({
      title: 'Close without saving?',
      message: `${saved ? `Changes to ${saved.name}` : 'This new label'} ${saved ? 'are' : 'is'} not saved.`,
      confirmLabel: 'Discard changes',
      danger: true,
      onConfirm: onClose,
    });
  };

  // A picture is uploaded to a saved label; a new one is saved first.
  const upload = async (slot: 'photo' | 'title', file: File | null) => {
    if (!file) return;
    setUploading(slot);
    try {
      const target = saved ?? (await save());
      if (!target) return;
      const r = await uploadCustomLabelPicture(target.id, file, slot);
      setSaved(r.data);
      setD((s) => ({ ...s, [`label_${slot}_media_id`]: r.data[`label_${slot}_media_id`], [`label_${slot}_url`]: r.data[`label_${slot}_url`] }));
      onSaved(r.data);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not upload the picture.');
    } finally {
      setUploading(null);
      const input = files[slot].current;
      if (input) input.value = '';
    }
  };

  const pictureSlot = (slot: 'photo' | 'title', title: string, hint: string) => {
    const url = slot === 'photo' ? d.label_photo_url : d.label_title_url;
    return (
      <div>
        <span className={labelClass}>{title}</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-20 h-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-center overflow-hidden">
            {url ? <img src={url} alt="" className="max-w-full max-h-full object-contain" /> : <Tag size={18} className="text-[var(--color-text-muted)]" />}
          </div>
          <input ref={files[slot]} type="file" accept="image/png,image/webp" className="hidden" onChange={(e) => void upload(slot, e.target.files?.[0] ?? null)} data-testid={`custom-label-${slot}-file`} />
          <Button variant="secondary" size="sm" icon={<Upload size={14} />} loading={uploading === slot} onClick={() => files[slot].current?.click()}>Upload PNG</Button>
          <Button variant="ghost" size="sm" icon={<ImagePlus size={14} />} onClick={() => setPicker(slot)}>From library</Button>
          {url && <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => { set(slot === 'photo' ? 'label_photo_media_id' : 'label_title_media_id', null); set(slot === 'photo' ? 'label_photo_url' : 'label_title_url', null); }}>Remove</Button>}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>
      </div>
    );
  };

  // What each folded part holds, for its title line.
  const wordingSet = WORDING_KEYS.filter((k) => String(d[k]).trim() !== '').length;
  const shopSummary = [d.label_price !== '' ? `MVR ${d.label_price}` : null, d.label_barcode.trim() ? 'barcode' : null].filter(Boolean).join(' · ') || 'Price and barcode';
  const footerName = d.label_footer_style === 'standard' ? `Standard ${mainBrand}` : d.label_footer_style === 'own' ? 'Your own words' : `${printedBrand}'s`;
  const qrWord = d.label_show_qr === 'on' ? 'printed' : d.label_show_qr === 'off' ? 'off' : `as the type${type ? ` (${type.show_qr ? 'printed' : 'off'})` : ''}`;
  const sizeLine = `${sizeName(choice.shape, dims.w, dims.h)} · ${presets.length ? stockOf(choice, presets).label : 'A4 sheet'}`;

  const sizeSection = (
    <Section title="Sticker size" summary={sizeLine} open={false} testId="custom-label-size">
      <p className="text-xs text-[var(--color-text-muted)]">The preview and Print… use this size; it starts as the one Pack stickers last printed.</p>
      <LabelSizePicker presets={presets} limits={limits} choice={choice} onChange={setChoice} rounded={rounded} onRounded={setRounded} />
    </Section>
  );
  const previewCaption = `${sizeName(choice.shape, dims.w, dims.h)} · the first sticker of the sheet Pack stickers prints at this size. Redraws as you type, saved or not.`;

  return (
    <>
      <Modal title={saved ? `Edit ${saved.name}` : 'New custom label'} onClose={requestClose} maxWidth={980}>
        {stacked && (
          <PhonePreviewBar
            url={preview}
            ratio={dims.w / dims.h}
            busy={previewBusy}
            round={round}
            title="Custom label preview"
            empty="Drawing…"
            caption={previewCaption}
            controls={<div className="flex flex-wrap items-center gap-2"><LangChips lang={lang} onChange={(l) => set('label_lang', l)} /><button type="button" onClick={() => void refreshPreview()} className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]" aria-label="Refresh preview"><RefreshCw size={14} /></button></div>}
          />
        )}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]" data-testid="custom-label-form">
          <div className="space-y-4 min-w-0">
            {stacked && sizeSection}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="cl-name" label="Product name"><input id="cl-name" value={d.name} maxLength={80} onChange={(e) => set('name', e.target.value)} className={fieldClass} placeholder="Garlic sauce" /></Field>
              <Field id="cl-name-dv" label="Product name (Dhivehi)"><input id="cl-name-dv" dir="rtl" value={d.name_dv} maxLength={80} onChange={(e) => set('name_dv', e.target.value)} className={fieldClass} /></Field>
              <Field id="cl-brand" label="Brand and logo" hint={d.brand_id ? undefined : `Empty follows the label type: ${typeBrand}.`}>
                <div className="flex gap-2">
                  <select id="cl-brand" value={d.brand_id ?? ''} onChange={(e) => set('brand_id', e.target.value ? Number(e.target.value) : null)} className={fieldClass}>
                    <option value="">As the label type</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_default ? ' (main)' : ''}</option>)}
                  </select>
                  <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setNewBrand(true)} aria-label="New brand" title="New brand with its own logo" className="shrink-0" />
                </div>
                {d.brand_id && brandOf(d.brand_id)?.logo_url && <img src={brandOf(d.brand_id)?.logo_url ?? ''} alt="" className="mt-2 h-10 object-contain" />}
              </Field>
              <Field id="cl-type" label="Label type" hint="Brings the heading, storage, dates wording, shelf life and how-to-use. Anything typed below prints instead.">
                <select id="cl-type" value={d.label_type_id ?? ''} onChange={(e) => set('label_type_id', e.target.value ? Number(e.target.value) : null)} className={fieldClass}>
                  <option value="">No type: the usual wording for its storage</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.brand_name ? ` · ${t.brand_name}` : ''}</option>)}
                </select>
              </Field>
            </div>

            <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3">
              <legend className="px-1 text-sm font-bold text-[var(--color-text)]">Ingredients and keeping</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="cl-ing" label="Ingredients"><textarea id="cl-ing" rows={2} maxLength={500} value={d.label_ingredients} onChange={(e) => set('label_ingredients', e.target.value)} className={areaClass} placeholder="Garlic, oil, lemon, salt" /></Field>
                <Field id="cl-ing-dv" label="Ingredients (Dhivehi)"><textarea id="cl-ing-dv" dir="rtl" rows={2} maxLength={500} value={d.label_ingredients_dv} onChange={(e) => set('label_ingredients_dv', e.target.value)} className={areaClass} /></Field>
                <Field id="cl-storage" label="Storage">
                  <select id="cl-storage" value={d.label_storage} onChange={(e) => set('label_storage', e.target.value as LabelStorage | '')} className={fieldClass}>
                    <option value="">{type ? `As the type (${STORAGE_NAMES[type.storage]})` : 'Frozen (usual)'}</option>
                    {(Object.keys(STORAGE_NAMES) as LabelStorage[]).map((k) => <option key={k} value={k}>{STORAGE_NAMES[k]}</option>)}
                  </select>
                </Field>
                <Field id="cl-life" label="Shelf life (days)" hint="Expiry = made-on date + this."><input id="cl-life" type="number" inputMode="numeric" min={1} max={730} value={d.label_shelf_life_days} onChange={(e) => set('label_shelf_life_days', e.target.value)} className={fieldClass} placeholder={ph.shelf} /></Field>
                <Field id="cl-qty" label="Quantity per pack"><input id="cl-qty" type="number" inputMode="numeric" min={1} max={9999} value={d.label_pack_qty} onChange={(e) => set('label_pack_qty', e.target.value)} className={fieldClass} placeholder="Blank: write by hand" /></Field>
                <Field id="cl-unit" label="Unit after the quantity" hint="PCS, G, ML, KG, PACK…"><input id="cl-unit" maxLength={10} value={d.label_pack_unit} onChange={(e) => set('label_pack_unit', e.target.value.toUpperCase())} className={fieldClass} placeholder="PCS" /></Field>
                <Field id="cl-allergens" label="Allergens" hint="Printed bold in the ingredients, and as “Contains …” when the note is empty."><input id="cl-allergens" maxLength={200} value={d.label_allergens} onChange={(e) => set('label_allergens', e.target.value)} className={fieldClass} placeholder="egg, gluten, peanuts" /></Field>
                <Field id="cl-weight" label="Net weight" hint="Beside the quantity."><input id="cl-weight" maxLength={20} value={d.label_net_weight} onChange={(e) => set('label_net_weight', e.target.value)} className={fieldClass} placeholder="250 g" /></Field>
              </div>
            </fieldset>

            <Section title="For the shop till" summary={shopSummary} open={d.label_price !== '' || d.label_barcode.trim() !== ''} testId="custom-label-shop">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="cl-price" label="Price (MVR)" hint="Empty prints no price."><input id="cl-price" type="number" inputMode="decimal" min={0} step="0.5" value={d.label_price} onChange={(e) => set('label_price', e.target.value)} className={fieldClass} placeholder="25.00" /></Field>
                <Field id="cl-barcode" label="Barcode (EAN-13 or EAN-8)" hint="12 digits: the check digit is added. Prints on the full-size sticker."><input id="cl-barcode" inputMode="numeric" maxLength={20} value={d.label_barcode} onChange={(e) => set('label_barcode', e.target.value)} className={fieldClass} placeholder="590123412345" /></Field>
              </div>
            </Section>

            <Section title="Wording on the sticker" summary={wordingSet > 0 ? `${wordingSet} of ${WORDING_KEYS.length} set` : 'As the type'} open={wordingSet > 0} testId="custom-label-wording">
              <p className="text-xs text-[var(--color-text-muted)]">Leave a box empty to print what is shown in grey.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="cl-heading" label="Heading (top of the sticker)"><input id="cl-heading" maxLength={40} value={d.label_heading} onChange={(e) => set('label_heading', e.target.value.toUpperCase())} className={fieldClass} placeholder={ph.heading} /></Field>
                <Field id="cl-heading-dv" label="Heading (Dhivehi)"><input id="cl-heading-dv" dir="rtl" maxLength={40} value={d.label_heading_dv} onChange={(e) => set('label_heading_dv', e.target.value)} className={fieldClass} placeholder={ph.heading_dv} /></Field>
                <Field id="cl-line" label="Storage line (strip above the footer)"><input id="cl-line" maxLength={160} value={d.label_storage_line} onChange={(e) => set('label_storage_line', e.target.value)} className={fieldClass} placeholder={ph.storage_line} /></Field>
                <Field id="cl-line-dv" label="Storage line (Dhivehi)"><input id="cl-line-dv" dir="rtl" maxLength={160} value={d.label_storage_line_dv} onChange={(e) => set('label_storage_line_dv', e.target.value)} className={fieldClass} placeholder={ph.storage_line_dv} /></Field>
                <Field id="cl-note" label="Note under the ingredients"><input id="cl-note" maxLength={120} value={d.label_note} onChange={(e) => set('label_note', e.target.value)} className={fieldClass} placeholder={ph.note} /></Field>
                <Field id="cl-note-dv" label="Note (Dhivehi)"><input id="cl-note-dv" dir="rtl" maxLength={120} value={d.label_note_dv} onChange={(e) => set('label_note_dv', e.target.value)} className={fieldClass} /></Field>
                <Field id="cl-use" label="How to use"><textarea id="cl-use" rows={2} maxLength={200} value={d.label_how_to_use} onChange={(e) => set('label_how_to_use', e.target.value)} className={areaClass} placeholder={ph.how_to_use} /></Field>
                <Field id="cl-use-dv" label="How to use (Dhivehi)"><textarea id="cl-use-dv" dir="rtl" rows={2} maxLength={200} value={d.label_how_to_use_dv} onChange={(e) => set('label_how_to_use_dv', e.target.value)} className={areaClass} /></Field>
              </div>
            </Section>

            <Section title="Footer and complaints QR" summary={`${footerName} · QR ${qrWord}`} open={d.label_footer_style !== 'brand' || d.label_show_qr !== ''} testId="custom-label-footer">
              <div role="radiogroup" aria-label="Footer" className="space-y-2">
                {([
                  ['brand', `${printedBrand}'s footer`, printedIsMain ? `${mainBrand}, its tagline, phone, website and address.` : `${printedBrand} and its tagline, by ${mainBrand}, with the phone, website and address.`],
                  ['standard', `Standard ${mainBrand} footer`, `The main brand's name and tagline with the phone, website and address, whatever brand is on the header.`],
                  ['own', 'Your own words', 'Typed below, where the tagline or the website would be. The phone stays.'],
                ] as const).map(([value, name, desc]) => (
                  <label key={value} className={['flex items-start gap-3 min-h-[44px] p-2.5 rounded-lg border cursor-pointer', d.label_footer_style === value ? 'border-[var(--color-tone-rust-border)] bg-[var(--color-tone-rust-bg)]' : 'border-[var(--color-border)]'].join(' ')}>
                    <input type="radio" name="cl-footer-style" value={value} checked={d.label_footer_style === value} onChange={() => set('label_footer_style', value)} className="mt-1 w-4 h-4 shrink-0 accent-[var(--color-primary)]" />
                    <span className="min-w-0"><span className="block text-sm font-semibold text-[var(--color-text)]">{name}</span><span className="block text-xs text-[var(--color-text-muted)]">{desc}</span></span>
                  </label>
                ))}
              </div>
              {d.label_footer_style === 'own' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="cl-footer" label="Footer line"><input id="cl-footer" maxLength={120} value={d.label_footer} onChange={(e) => set('label_footer', e.target.value)} className={fieldClass} placeholder={printedIsMain ? 'Fresh Baked, Fire Grilled' : 'Home-made, the Amma way'} /></Field>
                  <Field id="cl-footer-dv" label="Footer line (Dhivehi)"><input id="cl-footer-dv" dir="rtl" maxLength={120} value={d.label_footer_dv} onChange={(e) => set('label_footer_dv', e.target.value)} className={fieldClass} /></Field>
                </div>
              )}
              <Field id="cl-qr" label="Complaints QR in the footer" hint="The same code as the receipts and the poster: with the brand mark inside on the full sticker, bare on the small ones.">
                <select id="cl-qr" value={d.label_show_qr} onChange={(e) => set('label_show_qr', e.target.value as Draft['label_show_qr'])} className={fieldClass}>
                  <option value="">As the label type{type ? ` (${type.show_qr ? 'printed' : 'off'})` : ' (printed)'}</option>
                  <option value="on">Print it</option>
                  <option value="off">Leave it off</option>
                </select>
              </Field>
            </Section>

            {pictureSlot('photo', 'Picture', 'A PNG with a clear background prints over the label; kept exactly as uploaded.')}
            {pictureSlot('title', 'Hand-lettered name (optional)', 'A PNG of the name drawn by hand. Without one, the name is typed in the brand font.')}
          </div>

          {!stacked && (
            <aside className="space-y-2 min-w-0 lg:sticky lg:top-0 self-start" data-testid="custom-label-preview">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-[var(--color-text)] inline-flex items-center gap-1.5 mr-auto"><Eye size={15} className="text-[var(--color-primary)]" /> Preview</span>
                <LangChips lang={lang} onChange={(l) => set('label_lang', l)} />
                <button type="button" onClick={() => void refreshPreview()} className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]" aria-label="Refresh preview"><RefreshCw size={14} /></button>
              </div>
              <div className={round ? 'max-w-[240px] mx-auto' : 'max-w-[240px] mx-auto'}>
                <SheetPreview url={preview} ratio={dims.w / dims.h} round={round} busy={previewBusy} title="Custom label preview" empty="Drawing…" />
              </div>
              <p className="text-xs text-[var(--color-text-muted)]" data-testid="custom-preview-size">{previewCaption} The language is kept with the label.</p>
              {sizeSection}
            </aside>
          )}
        </div>
        <ModalActions>
          <Button variant="ghost" onClick={requestClose}>Close</Button>
          <Button variant="secondary" icon={<Printer size={16} />} loading={printing} onClick={() => void printIt()} data-testid="custom-label-print">Print…</Button>
          <Button onClick={() => void save()} loading={saving && !printing} data-testid="custom-label-save">{saved ? 'Save' : 'Add label'}</Button>
        </ModalActions>
      </Modal>
      <ConfirmDialog state={dialog.state} close={dialog.close} />
      {newBrand && (
        <BrandModal
          brand={null}
          onClose={() => setNewBrand(false)}
          onSaved={(b) => { setBrands((s) => [...s.filter((x) => x.id !== b.id), b]); set('brand_id', b.id); }}
        />
      )}
      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        mediaType="image"
        title={picker === 'title' ? 'Hand-lettered name' : 'Picture'}
        onPick={(asset) => {
          const url = asset.original_url ?? asset.url;
          if (picker === 'title') { set('label_title_media_id', asset.id); set('label_title_url', url); }
          if (picker === 'photo') { set('label_photo_media_id', asset.id); set('label_photo_url', url); }
          setPicker(null);
        }}
      />
    </>
  );
}

/** Labels → Custom labels: every custom label, to print, save a sheet of, change, copy or remove. */
export function CustomLabelsTab({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<CustomLabel[] | null>(null);
  const [edit, setEdit] = useState<CustomLabel | null | 'new'>(null);
  const [query, setQuery] = useState('');
  const load = () => fetchCustomLabels().then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);

  const copy = async (c: CustomLabel) => {
    try { const r = await duplicateCustomLabel(c.id); await load(); setEdit(r.data); } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not copy it.'); }
  };
  const remove = async (c: CustomLabel) => {
    if (!window.confirm(`Remove the custom label "${c.name}"? Prints already made stay in the log.`)) return;
    try { await deleteCustomLabel(c.id); await load(); toast('success', 'Custom label removed.'); } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not remove it.'); }
  };
  // Owner, 2026-10-12: "no option to send to saved labels". One tap prepares
  // a full sheet of this label at the size Pack stickers last printed (full
  // stickers, four to an A4 page, until a size is picked there), in the
  // language the label says, and lands on Saved labels, where it can be
  // printed again, pinned or changed.
  const [savingId, setSavingId] = useState<number | null>(null);
  const [presets, setPresets] = useState<LabelPreset[]>([]);
  useEffect(() => {
    fetchLabelLayouts().then((r) => setPresets(r.presets)).catch(() => setPresets([]));
  }, []);
  const saveToSaved = async (c: CustomLabel) => {
    setSavingId(c.id);
    try {
      const { copies, ...sized } = savedSheetRequest(presets);
      const r = await stickerLinks({ items: [{ id: c.id, copies, kind: 'custom' }], ...sized, lang: langOf(c), fill: true });
      toast('success', r.job ? `Saved as “${r.job.name}”.` : 'Saved to Saved labels.');
      navigate('/labels/saved');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save it.');
    } finally {
      setSavingId(null);
    }
  };
  const iconBtn = 'w-9 h-9 inline-flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]';

  const needle = query.trim().toLowerCase();
  const shown = (rows ?? []).filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.name_dv ?? '').includes(query.trim()) || c.brand_name.toLowerCase().includes(needle) || (c.label_type_name ?? '').toLowerCase().includes(needle));

  return (
    <div className="space-y-5" data-testid="custom-labels">
      <Card
        padding="none"
        header={
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex-1 min-w-[200px]">
                <h3 className="font-bold text-[var(--color-text)]">Custom labels</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Stickers for things that are not on the menu, with any brand and logo, wording and picture. They print from Pack stickers, on any size, beside the menu items.</p>
              </div>
              {canManage && <Button size="sm" icon={<Plus size={16} />} onClick={() => setEdit('new')} data-testid="custom-label-new">New custom label</Button>}
            </div>
            {(rows?.length ?? 0) >= 4 && (
              <label className="relative block max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a label by name, brand or type" aria-label="Find a custom label" className={`${fieldClass} pl-9`} />
              </label>
            )}
          </div>
        }
      >
        <ul className="divide-y divide-[var(--color-border-light)]">
          {shown.map((c) => (
            <li key={c.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="w-12 h-12 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-center overflow-hidden">
                {c.label_photo_url || c.brand_logo_url ? <img src={c.label_photo_url ?? c.brand_logo_url ?? ''} alt="" className="max-w-full max-h-full object-contain" /> : <Tag size={18} className="text-[var(--color-text-muted)]" />}
              </div>
              <div className="flex-1 min-w-[160px]">
                <div className="text-sm font-semibold text-[var(--color-text)]">{c.name}{c.name_dv ? <span className="ml-2 font-normal text-[var(--color-text-muted)]" dir="rtl">{c.name_dv}</span> : null}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {c.brand_name} · {c.label_type_name ?? 'No type'} · {STORAGE_NAMES[c.storage]}
                  {c.label_shelf_life_days || c.defaults.shelf_life_days ? ` · keeps ${c.label_shelf_life_days ?? c.defaults.shelf_life_days} days` : ''}
                  {c.ingredients.from === 'none' ? ' · no ingredients' : ''}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]" data-testid={`custom-printed-${c.id}`}>
                  {c.print_count > 0 ? `Printed ${c.print_count} ${c.print_count === 1 ? 'time' : 'times'}${c.last_printed_at ? `, last ${fmtDay(c.last_printed_at)}` : ''}` : 'Not printed yet'}
                  {` · prints in ${langOf(c) === 'both' ? 'English and Dhivehi' : langOf(c) === 'dv' ? 'Dhivehi' : 'English'}`}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <Button size="sm" icon={<Printer size={14} />} onClick={() => navigate(`/labels/stickers?custom=${c.id}&lang=${langOf(c)}`)} aria-label={`Print ${c.name}`}>Print</Button>
                <Button size="sm" variant="secondary" icon={<Bookmark size={14} />} loading={savingId === c.id} onClick={() => void saveToSaved(c)} aria-label={`Save ${c.name} to Saved labels`} data-testid={`custom-save-${c.id}`}>Save</Button>
                {canManage && (
                  <>
                    <button type="button" className={iconBtn} onClick={() => setEdit(c)} aria-label={`Edit ${c.name}`}><Pencil size={16} /></button>
                    <button type="button" className={iconBtn} onClick={() => void copy(c)} aria-label={`Copy ${c.name}`}><Copy size={16} /></button>
                    <Btn variant="danger-outline" small onClick={() => void remove(c)} aria-label={`Remove ${c.name}`}>Remove</Btn>
                  </>
                )}
              </div>
            </li>
          ))}
          {rows !== null && rows.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">{canManage ? 'No custom labels yet. Press New custom label to make one: a product name, a brand with its logo, and the details to print.' : 'No custom labels yet. Someone with Manage label settings can add them.'}</li>
          )}
          {rows !== null && rows.length > 0 && shown.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No label matches “{query.trim()}”.</li>
          )}
        </ul>
      </Card>
      {edit !== null && <CustomLabelModal label={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => void load()} />}
    </div>
  );
}
