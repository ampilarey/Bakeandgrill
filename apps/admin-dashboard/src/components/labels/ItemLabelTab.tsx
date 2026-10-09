import { useEffect, useState } from 'react';
import { ImagePlus, X, RefreshCw } from 'lucide-react';
import { fetchLabelItem, fetchLabelTypes, stickerLinks, updateItemLabel, type IngredientsSource, type LabelProduct, type LabelStorage, type LabelType } from '../../api';
import { SheetPreview } from './SheetPreview';
import { MediaPicker } from '../MediaPicker';
import { Button } from '../ui';

/*
 * A menu item's label settings (owner, 2026-10-04): on labels or not, where
 * the ingredient line comes from ("add option to include manual ingredients if
 * recipe is not there in the item"), shelf life ("add option to add life"),
 * storage, pack size, the hand lettering and the photo, with a preview of the
 * sticker as it will print. Saved on its own, with labels.manage.
 */

type Draft = {
  label_enabled: boolean;
  label_ingredients_source: IngredientsSource;
  label_ingredients: string;
  label_ingredients_dv: string;
  label_shelf_life_days: string;
  label_storage: LabelStorage;
  label_pack_qty: string;
  label_heading: string;
  label_heading_dv: string;
  label_storage_line: string;
  label_storage_line_dv: string;
  label_note: string;
  label_note_dv: string;
  label_pack_unit: string;
  label_type_id: number | null;
  label_how_to_use: string;
  label_how_to_use_dv: string;
  label_title_media_id: number | null;
  label_title_url: string | null;
  label_photo_media_id: number | null;
  label_photo_url: string | null;
};

const toDraft = (p: LabelProduct): Draft => ({
  label_enabled: p.label_enabled,
  label_ingredients_source: p.label_ingredients_source,
  label_ingredients: p.label_ingredients ?? '',
  label_ingredients_dv: p.label_ingredients_dv ?? '',
  label_shelf_life_days: p.label_shelf_life_days ? String(p.label_shelf_life_days) : '',
  label_storage: p.label_storage,
  label_pack_qty: p.label_pack_qty ? String(p.label_pack_qty) : '',
  label_heading: p.label_heading ?? '',
  label_heading_dv: p.label_heading_dv ?? '',
  label_storage_line: p.label_storage_line ?? '',
  label_storage_line_dv: p.label_storage_line_dv ?? '',
  label_note: p.label_note ?? '',
  label_note_dv: p.label_note_dv ?? '',
  label_pack_unit: p.label_pack_unit ?? '',
  label_type_id: p.label_type_id,
  label_how_to_use: p.label_how_to_use ?? '',
  label_how_to_use_dv: p.label_how_to_use_dv ?? '',
  label_title_media_id: p.label_title_media_id,
  label_title_url: p.label_title_url,
  label_photo_media_id: p.label_photo_media_id,
  label_photo_url: p.label_photo_url,
});

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

export function ItemLabelTab({ itemId }: { itemId: number }) {
  const [product, setProduct] = useState<LabelProduct | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picker, setPicker] = useState<'title' | 'photo' | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'dv'>('en');
  const [types, setTypes] = useState<LabelType[]>([]);
  useEffect(() => { fetchLabelTypes().then((r) => setTypes(r.data.filter((t) => t.is_active || t.id === product?.label_type_id))).catch(() => setTypes([])); }, [product?.label_type_id]);

  useEffect(() => {
    fetchLabelItem(itemId).then((r) => { setProduct(r.data); setDraft(toDraft(r.data)); }).catch(() => setMessage('Could not load the label settings.'));
  }, [itemId]);

  const refreshPreview = async (l: 'en' | 'dv' = lang) => {
    try {
      const r = await stickerLinks({ items: [{ id: itemId, copies: 1 }], layout: 'single-105x148', lang: l, preview: true });
      setPreview(r.one_url ?? r.url);
    } catch {
      setPreview(null);
    }
  };
  useEffect(() => { void refreshPreview(); }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft || !product) return <p className="text-sm text-[var(--color-text-muted)] p-4">{message ?? 'Loading…'}</p>;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const r = await updateItemLabel(itemId, {
        label_enabled: draft.label_enabled,
        label_ingredients_source: draft.label_ingredients_source,
        label_ingredients: draft.label_ingredients || null,
        label_ingredients_dv: draft.label_ingredients_dv || null,
        label_shelf_life_days: draft.label_shelf_life_days ? Number(draft.label_shelf_life_days) : null,
        label_storage: draft.label_storage,
        label_pack_qty: draft.label_pack_qty ? Number(draft.label_pack_qty) : null,
        label_heading: draft.label_heading.trim() || null,
        label_heading_dv: draft.label_heading_dv.trim() || null,
        label_storage_line: draft.label_storage_line.trim() || null,
        label_storage_line_dv: draft.label_storage_line_dv.trim() || null,
        label_note: draft.label_note.trim() || null,
        label_note_dv: draft.label_note_dv.trim() || null,
        label_pack_unit: draft.label_pack_unit.trim() || null,
        label_type_id: draft.label_type_id,
        label_how_to_use: draft.label_how_to_use.trim() || null,
        label_how_to_use_dv: draft.label_how_to_use_dv.trim() || null,
        label_title_media_id: draft.label_title_media_id,
        label_photo_media_id: draft.label_photo_media_id,
      });
      setProduct(r.data); setDraft(toDraft(r.data));
      setMessage('Label settings saved.');
      void refreshPreview();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const recipeLine = product.ingredients.recipe_en;
  const usesRecipe = draft.label_ingredients_source !== 'manual' && recipeLine !== '';

  const pictureSlot = (slot: 'title' | 'photo', label: string, hint: string) => {
    const url = slot === 'title' ? draft.label_title_url : draft.label_photo_url;
    return (
      <div>
        <span className={labelClass}>{label}</span>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-24 h-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-center overflow-hidden">
            {url ? <img src={url} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-[var(--color-text-muted)] text-center px-1">{slot === 'title' ? 'Typed name' : 'Cut-out or flame'}</span>}
          </div>
          <Button variant="secondary" size="sm" icon={<ImagePlus size={14} />} onClick={() => setPicker(slot)}>Choose</Button>
          {url && <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => { set(slot === 'title' ? 'label_title_media_id' : 'label_photo_media_id', null); set(slot === 'title' ? 'label_title_url' : 'label_photo_url', null); }}>Remove</Button>}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>
      </div>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto]" data-testid="item-label-tab">
      <div className="space-y-4">
        <label className="flex items-center gap-3 min-h-[44px]">
          <input type="checkbox" checked={draft.label_enabled} onChange={(e) => set('label_enabled', e.target.checked)} className="w-5 h-5 accent-[var(--color-primary)]" />
          <span className="text-sm font-semibold text-[var(--color-text)]">Print pack stickers for this item</span>
        </label>

        {/* v2 point 3: "frozen hedika is a type of food so that label should be easily selected". */}
        <div>
          <label className={labelClass} htmlFor="lbl-type">Label type</label>
          <select id="lbl-type" value={draft.label_type_id ?? ''} onChange={(e) => { const t = types.find((x) => x.id === Number(e.target.value)); set('label_type_id', t ? t.id : null); if (t) set('label_storage', t.storage); }} className={fieldClass}>
            <option value="">No type: the usual wording for its storage</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.brand_name && t.brand_name !== product.defaults.brand ? ` · ${t.brand_name}` : ''}</option>)}
          </select>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Brings the heading, storage, dates wording, shelf life, how-to-use and brand ({product.defaults.brand}). Anything typed below prints instead. Types are managed on Labels → Types &amp; brands.</p>
        </div>

        <div>
          <label className={labelClass} htmlFor="lbl-source">Ingredients</label>
          <select id="lbl-source" value={draft.label_ingredients_source} onChange={(e) => set('label_ingredients_source', e.target.value as IngredientsSource)} className={fieldClass}>
            <option value="auto">From the recipe; typed in below if there is no recipe</option>
            <option value="recipe">From the recipe</option>
            <option value="manual">Typed in below</option>
          </select>
          {usesRecipe ? (
            <p className="text-xs text-[var(--color-text-secondary)] mt-2 p-2 rounded-lg bg-[var(--color-bg)]"><strong>From the recipe:</strong> {recipeLine}</p>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{product.has_recipe ? 'The recipe has no food ingredients ticked for labels, so the typed line prints.' : 'This item has no recipe, so the typed line prints.'}</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="lbl-ing">Typed ingredients (English)</label>
          <textarea id="lbl-ing" rows={2} maxLength={500} value={draft.label_ingredients} onChange={(e) => set('label_ingredients', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm" placeholder="Flour, salt, oil, onion, smoked tuna" />
        </div>
        <div>
          <label className={labelClass} htmlFor="lbl-ing-dv">Ingredients in Dhivehi (for the Dhivehi sticker)</label>
          <textarea id="lbl-ing-dv" rows={2} maxLength={500} dir="rtl" value={draft.label_ingredients_dv} onChange={(e) => set('label_ingredients_dv', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className={labelClass} htmlFor="lbl-life">Shelf life (days)</label><input id="lbl-life" type="number" min={1} max={730} value={draft.label_shelf_life_days} onChange={(e) => set('label_shelf_life_days', e.target.value)} className={fieldClass} placeholder={product.defaults.shelf_life_days ? `${product.defaults.shelf_life_days} from the type` : 'Blank: write by hand'} /></div>
          <div>
            <label className={labelClass} htmlFor="lbl-storage">Storage</label>
            <select id="lbl-storage" value={draft.label_storage} onChange={(e) => set('label_storage', e.target.value as LabelStorage)} className={fieldClass}>
              <option value="frozen">Frozen</option><option value="chilled">Chilled</option><option value="ambient">Room temperature</option>
            </select>
          </div>
          <div><label className={labelClass} htmlFor="lbl-pack">Pieces per pack</label><input id="lbl-pack" type="number" min={1} max={999} value={draft.label_pack_qty} onChange={(e) => set('label_pack_qty', e.target.value)} className={fieldClass} placeholder="Blank: write by hand" /></div>
        </div>

        {/* Owner, 2026-10-04: "it says frozen hedhika even though its not a
            frozen hedhika". The wording that was one setting for every
            product; empty prints the default for the storage picked above. */}
        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">Wording on this sticker</legend>
          <p className="text-xs text-[var(--color-text-muted)]">Leave a box empty to print the usual wording for {({ frozen: 'frozen', chilled: 'chilled', ambient: 'room-temperature' } as const)[draft.label_storage]} items, shown in grey. Change the usual wording in Labels → Settings.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="lbl-heading">Heading (top of the sticker)</label><input id="lbl-heading" maxLength={40} value={draft.label_heading} onChange={(e) => set('label_heading', e.target.value)} className={fieldClass} placeholder={product.defaults.heading} /></div>
            <div><label className={labelClass} htmlFor="lbl-heading-dv">Heading (Dhivehi)</label><input id="lbl-heading-dv" dir="rtl" maxLength={40} value={draft.label_heading_dv} onChange={(e) => set('label_heading_dv', e.target.value)} className={fieldClass} placeholder={product.defaults.heading_dv} /></div>
            <div><label className={labelClass} htmlFor="lbl-storage-line">Storage line (strip above the footer)</label><input id="lbl-storage-line" maxLength={160} value={draft.label_storage_line} onChange={(e) => set('label_storage_line', e.target.value)} className={fieldClass} placeholder={product.defaults.storage_line} /></div>
            <div><label className={labelClass} htmlFor="lbl-storage-line-dv">Storage line (Dhivehi)</label><input id="lbl-storage-line-dv" dir="rtl" maxLength={160} value={draft.label_storage_line_dv} onChange={(e) => set('label_storage_line_dv', e.target.value)} className={fieldClass} placeholder={product.defaults.storage_line_dv} /></div>
            <div><label className={labelClass} htmlFor="lbl-note">Note under the ingredients</label><input id="lbl-note" maxLength={120} value={draft.label_note} onChange={(e) => set('label_note', e.target.value)} className={fieldClass} placeholder={product.defaults.note || 'Contains egg and gluten'} /></div>
            <div><label className={labelClass} htmlFor="lbl-note-dv">Note (Dhivehi)</label><input id="lbl-note-dv" dir="rtl" maxLength={120} value={draft.label_note_dv} onChange={(e) => set('label_note_dv', e.target.value)} className={fieldClass} placeholder={product.defaults.note_dv} /></div>
            <div><label className={labelClass} htmlFor="lbl-use">How to use</label><textarea id="lbl-use" rows={2} maxLength={200} value={draft.label_how_to_use} onChange={(e) => set('label_how_to_use', e.target.value)} className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm resize-y" placeholder={product.defaults.how_to_use || 'Thaw 10 min. Deep fry 4–5 min until golden.'} /></div>
            <div><label className={labelClass} htmlFor="lbl-use-dv">How to use (Dhivehi)</label><textarea id="lbl-use-dv" dir="rtl" rows={2} maxLength={200} value={draft.label_how_to_use_dv} onChange={(e) => set('label_how_to_use_dv', e.target.value)} className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm resize-y" placeholder={product.defaults.how_to_use_dv} /></div>
            <div><label className={labelClass} htmlFor="lbl-unit">Unit after the quantity</label><input id="lbl-unit" maxLength={10} value={draft.label_pack_unit} onChange={(e) => set('label_pack_unit', e.target.value)} className={fieldClass} placeholder={product.defaults.unit} /><p className="text-xs text-[var(--color-text-muted)] mt-1">PCS, SLICES, PACK, G…</p></div>
          </div>
        </fieldset>

        {pictureSlot('title', 'Hand-lettered name', 'A PNG with a clear background. Without one, the name is typed in the brand font.')}
        {pictureSlot('photo', 'Food photo (labels only)', product.cutout_url ? 'Without one, the item\'s cut-out from the Photos tab prints, the same picture the menu cards use.' : 'Without one, the flame prints. Add a background-less PNG as the item\'s cut-out on the Photos tab and it is used here, on the menu cards and the POS.')}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} loading={saving} className="w-full sm:w-auto justify-center">Save label settings</Button>
          {message && <span className="text-sm text-[var(--color-text-secondary)]" role="status">{message}</span>}
        </div>
      </div>

      <div className="lg:w-[300px] w-[300px] max-w-full mx-auto lg:mx-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Preview (saved settings)</span>
          <div className="flex gap-1">
            {(['en', 'dv'] as const).map((l) => (
              <button key={l} type="button" onClick={() => { setLang(l); void refreshPreview(l); }} className={['px-3 h-9 min-w-[44px] rounded-md text-xs font-semibold border', lang === l ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-white border-[var(--color-border)]'].join(' ')}>{l === 'en' ? 'EN' : 'ދިވެހި'}</button>
            ))}
            <button type="button" onClick={() => void refreshPreview()} className="w-9 h-9 inline-flex items-center justify-center rounded-md border border-[var(--color-border)]" aria-label="Refresh preview"><RefreshCw size={14} /></button>
          </div>
        </div>
        {preview ? (
          <SheetPreview url={preview} ratio={105 / 148.5} title="Sticker preview" />
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">The preview needs the Print labels permission.</p>
        )}
      </div>

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        mediaType="image"
        title={picker === 'title' ? 'Hand-lettered name' : 'Food photo'}
        onPick={(asset) => {
          if (picker === 'title') { set('label_title_media_id', asset.id); set('label_title_url', asset.url); }
          if (picker === 'photo') { set('label_photo_media_id', asset.id); set('label_photo_url', asset.url); }
          setPicker(null);
        }}
      />
    </div>
  );
}
