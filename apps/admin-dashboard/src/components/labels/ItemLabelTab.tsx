import { useEffect, useState } from 'react';
import { ImagePlus, X, RefreshCw } from 'lucide-react';
import { fetchLabelItem, stickerLinks, updateItemLabel, type IngredientsSource, type LabelProduct, type LabelStorage } from '../../api';
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

  useEffect(() => {
    fetchLabelItem(itemId).then((r) => { setProduct(r.data); setDraft(toDraft(r.data)); }).catch(() => setMessage('Could not load the label settings.'));
  }, [itemId]);

  const refreshPreview = async (l: 'en' | 'dv' = lang) => {
    try {
      const r = await stickerLinks({ items: [{ id: itemId, copies: 1 }], layout: 'single-105x148', lang: l, preview: true });
      setPreview(`${window.location.origin}${r.url}`);
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
        <div className="flex items-center gap-3">
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
          <div><label className={labelClass} htmlFor="lbl-life">Shelf life (days)</label><input id="lbl-life" type="number" min={1} max={730} value={draft.label_shelf_life_days} onChange={(e) => set('label_shelf_life_days', e.target.value)} className={fieldClass} placeholder="Blank: write by hand" /></div>
          <div>
            <label className={labelClass} htmlFor="lbl-storage">Storage</label>
            <select id="lbl-storage" value={draft.label_storage} onChange={(e) => set('label_storage', e.target.value as LabelStorage)} className={fieldClass}>
              <option value="frozen">Frozen</option><option value="chilled">Chilled</option><option value="ambient">Room temperature</option>
            </select>
          </div>
          <div><label className={labelClass} htmlFor="lbl-pack">Pieces per pack</label><input id="lbl-pack" type="number" min={1} max={999} value={draft.label_pack_qty} onChange={(e) => set('label_pack_qty', e.target.value)} className={fieldClass} placeholder="Blank: write by hand" /></div>
        </div>

        {pictureSlot('title', 'Hand-lettered name', 'A PNG with a clear background. Without one, the name is typed in the brand font.')}
        {pictureSlot('photo', 'Food photo', 'A cut-out PNG. Without one, the item\'s cut-out from Photos is used, then the flame.')}

        <div className="flex items-center gap-3">
          <Button onClick={save} loading={saving}>Save label settings</Button>
          {message && <span className="text-sm text-[var(--color-text-secondary)]" role="status">{message}</span>}
        </div>
      </div>

      <div className="lg:w-[300px]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Preview (saved settings)</span>
          <div className="flex gap-1">
            {(['en', 'dv'] as const).map((l) => (
              <button key={l} type="button" onClick={() => { setLang(l); void refreshPreview(l); }} className={['px-2 h-8 rounded-md text-xs font-semibold border', lang === l ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-white border-[var(--color-border)]'].join(' ')}>{l === 'en' ? 'EN' : 'ދިވެހި'}</button>
            ))}
            <button type="button" onClick={() => void refreshPreview()} className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-border)]" aria-label="Refresh preview"><RefreshCw size={14} /></button>
          </div>
        </div>
        {preview ? (
          <div className="rounded-lg border border-[var(--color-border)] overflow-hidden bg-white" style={{ width: 300, height: 424 }}>
            <iframe title="Sticker preview" src={preview} style={{ width: 397, height: 561, border: 0, transform: 'scale(0.756)', transformOrigin: '0 0' }} />
          </div>
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
