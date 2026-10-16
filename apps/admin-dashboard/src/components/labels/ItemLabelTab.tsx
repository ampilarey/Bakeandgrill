import { useEffect, useState } from 'react';
import { ImagePlus, X, RefreshCw } from 'lucide-react';
import { fetchLabelItem, fetchLabelLayouts, fetchLabelTypes, stickerLinks, updateItemLabel, type ShelfLifeSuggestions, type IngredientsSource, type LabelArrangement, type LabelBadge, type LabelProduct, type LabelSpot, type LabelSpotKey, type LabelStorage, type LabelType, type WrapCatalogue } from '../../api';
import { SheetPreview } from './SheetPreview';
import { WrapParts } from './WrapParts';
import { SpotOverlay } from './SpotOverlay';
import { FoldHelp } from './FoldHelp';
import { ShelfLifeHint } from './ShelfLifeHint';
import { WordingSignoff } from './WordingSignoff';
import { QuickEditSheet, quickSpec } from './QuickEdit';
import { itemDraft as toDraft, itemPayload, nutritionWords, pickKeys, type ItemDraft as Draft, type ItemLabelPayload } from './labelDrafts';
import { SaveAsTemplate, StartFromRow } from './StartFrom';
import { applyToItem, templateFromItem } from './labelTemplates';
import { ArrangeBar } from './ArrangeBar';
import { BadgePicker } from './BadgePicker';
import { clearDesign, hasOverrides, layoutPayload, nudgeSpot } from './labelLayout';
import { MediaPicker } from '../MediaPicker';
import { Button } from '../ui';

/*
 * A menu item's label settings (owner, 2026-10-04): on labels or not, where
 * the ingredient line comes from ("add option to include manual ingredients if
 * recipe is not there in the item"), shelf life ("add option to add life"),
 * storage, pack size, the hand lettering and the photo, with a preview of the
 * sticker as it will print. Saved on its own, with labels.manage. A tap on a
 * part of the preview opens the boxes for that part alone and saves them
 * straight away (round 3, 2026-10-13), since the preview draws what is saved.
 */

export { nutritionWords };

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

export function ItemLabelTab({ itemId }: { itemId: number }) {
  const [product, setProduct] = useState<LabelProduct | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picker, setPicker] = useState<'title' | 'photo' | 'mark' | null>(null);
  const [saving, setSaving] = useState(false);
  // The wording lock (round 17): read the legal lines again after each save.
  const [savedTick, setSavedTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Where each part of the preview landed, the part whose sheet a tap opened, and whether that sheet is saving (round 3, 2026-10-13).
  const [spots, setSpots] = useState<LabelSpot[]>([]);
  const [quick, setQuick] = useState<LabelSpotKey | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  // The drag designer (round 8): the preview is the full sticker, so its parts move on the full design; each move is saved at once.
  const [arrange, setArrange] = useState(false);
  // The media picker opened from a tap's sheet saves the picture as soon as it is picked.
  const [pickerSaves, setPickerSaves] = useState(false);
  const [lang, setLang] = useState<'en' | 'dv'>('en');
  const [types, setTypes] = useState<LabelType[]>([]);
  // The wrap-around label's parts and marks, as the server lists them (2026-10-12).
  const [catalogue, setCatalogue] = useState<WrapCatalogue | null>(null);
  // The badges an item can carry (round 9), from the layouts.
  const [badges, setBadges] = useState<LabelBadge[]>([]);
  useEffect(() => { fetchLabelTypes().then((r) => setTypes(r.data.filter((t) => t.is_active || t.id === product?.label_type_id))).catch(() => setTypes([])); }, [product?.label_type_id]);
  // Round 15: a shelf life to suggest for the item's storage.
  const [shelfLife, setShelfLife] = useState<ShelfLifeSuggestions | null>(null);
  useEffect(() => { fetchLabelLayouts().then((r) => { setCatalogue(r.wrap ?? null); setBadges(r.badges ?? []); setShelfLife(r.shelf_life ?? null); }).catch(() => setCatalogue(null)); }, []);

  useEffect(() => {
    fetchLabelItem(itemId).then((r) => { setProduct(r.data); setDraft(toDraft(r.data)); }).catch(() => setMessage('Could not load the label settings.'));
  }, [itemId]);

  const refreshPreview = async (l: 'en' | 'dv' = lang) => {
    try {
      const r = await stickerLinks({ items: [{ id: itemId, copies: 1 }], layout: 'single-105x148', lang: l, preview: true });
      setPreview(r.one_url ?? r.url);
      setSpots(r.summary?.design === 'wrap' ? [] : (r.summary?.spots ?? []));
    } catch {
      setPreview(null);
      setSpots([]);
    }
  };
  useEffect(() => { void refreshPreview(); }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft || !product) return <p className="text-sm text-[var(--color-text-muted)] p-4">{message ?? 'Loading…'}</p>;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const r = await updateItemLabel(itemId, itemPayload(draft));
      setProduct(r.data); setDraft(toDraft(r.data));
      setMessage('Label settings saved.');
      setSavedTick((t) => t + 1);
      void refreshPreview();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  // A tap's sheet saves only its own boxes, so the rest of the form keeps
  // whatever is typed but not yet saved; the preview then redraws.
  const saveSome = async (body: Partial<ItemLabelPayload>, keys: string[]) => {
    setQuickSaving(true); setMessage(null);
    try {
      const r = await updateItemLabel(itemId, body);
      const fresh = toDraft(r.data);
      setProduct(r.data);
      setDraft((cur) => (cur ? { ...cur, ...pickKeys(fresh, keys) } : cur));
      setMessage('Saved.');
      setQuick(null);
      void refreshPreview();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setQuickSaving(false);
    }
  };
  const saveLayout = (next: LabelArrangement) => {
    set('label_layout', next);
    void saveSome({ label_layout: layoutPayload(next) }, ['label_layout']);
  };
  const quickContext = {
    kind: 'item' as const, types, badges, defaults: product.defaults, allergens: product.allergens, menuPrice: product.menu_price,
    nutritionWords: nutritionWords(product.nutrition), hasPhoto: Boolean(draft.label_photo_url),
  };
  const quickDone = () => {
    if (!quick) return;
    const keys = quickSpec(quick, quickContext).inputs.map((i) => i.key);
    if (keys.length === 0) { setQuick(null); return; }
    void saveSome(pickKeys(itemPayload(draft), keys), keys);
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
    <div className="grid gap-6 lg:grid-cols-[1fr_auto] min-w-0" data-testid="item-label-tab">
      <div className="space-y-4 min-w-0">
        <label className="flex items-center gap-3 min-h-[44px]">
          <input type="checkbox" checked={draft.label_enabled} onChange={(e) => set('label_enabled', e.target.checked)} className="w-5 h-5 accent-[var(--color-primary)]" />
          <span className="text-sm font-semibold text-[var(--color-text)]">Print pack stickers for this item</span>
        </label>

        {/* Round 7 (2026-10-13): a template's or another label's settings fill the boxes below; Save keeps them. */}
        <StartFromRow onPick={(t) => setDraft((d) => (d ? applyToItem(d, t) : d))} exclude={{ kind: 'item', id: itemId }} idPrefix="lbl-start" hint="Fills the type, storage, wording, shelf life and pack settings below. The ingredients, pictures, price and barcode stay. Save to keep it." />

        {/* v2 point 3: "frozen hedika is a type of food so that label should be easily selected". */}
        <div>
          <label className={labelClass} htmlFor="lbl-type">Label type</label>
          <select id="lbl-type" value={draft.label_type_id ?? ''} onChange={(e) => { const t = types.find((x) => x.id === Number(e.target.value)); set('label_type_id', t ? t.id : null); if (t) set('label_storage', t.storage); }} className={fieldClass}>
            <option value="">No type: the usual wording for its storage</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.brand_name && t.brand_name !== product.defaults.brand ? ` · ${t.brand_name}` : ''}</option>)}
          </select>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Brings the heading, storage, dates wording, shelf life, how-to-use and brand ({product.defaults.brand}). Anything typed below prints instead. Types are managed on Labels → Wording and logos.</p>
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
          <div><label className={labelClass} htmlFor="lbl-life">Shelf life (days)</label><input id="lbl-life" type="number" min={1} max={730} value={draft.label_shelf_life_days} onChange={(e) => set('label_shelf_life_days', e.target.value)} className={fieldClass} placeholder={product.defaults.shelf_life_days ? `${product.defaults.shelf_life_days} from the type` : 'Blank: write by hand'} />
            <ShelfLifeHint storage={draft.label_storage} value={draft.label_shelf_life_days} suggestions={shelfLife} onUse={(n) => set('label_shelf_life_days', String(n))} testId="item-shelf-life-hint" /></div>
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
          <FoldHelp>The heading, the storage line, the note and how to use. Leave a box empty to print the usual wording for {({ frozen: 'frozen', chilled: 'chilled', ambient: 'room-temperature' } as const)[draft.label_storage]} items, shown in grey; change the usual wording under Labels → Settings.</FoldHelp>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="lbl-heading">Heading (top of the sticker)</label><input id="lbl-heading" maxLength={40} value={draft.label_heading} onChange={(e) => set('label_heading', e.target.value)} className={fieldClass} placeholder={product.defaults.heading} /></div>
            <div><label className={labelClass} htmlFor="lbl-heading-dv">Heading (Dhivehi)</label><input id="lbl-heading-dv" dir="rtl" maxLength={40} value={draft.label_heading_dv} onChange={(e) => set('label_heading_dv', e.target.value)} className={fieldClass} placeholder={product.defaults.heading_dv} /></div>
            <div><label className={labelClass} htmlFor="lbl-storage-line">Storage line (the coloured line above the bottom strip)</label><input id="lbl-storage-line" maxLength={160} value={draft.label_storage_line} onChange={(e) => set('label_storage_line', e.target.value)} className={fieldClass} placeholder={product.defaults.storage_line} /></div>
            <div><label className={labelClass} htmlFor="lbl-storage-line-dv">Storage line (Dhivehi)</label><input id="lbl-storage-line-dv" dir="rtl" maxLength={160} value={draft.label_storage_line_dv} onChange={(e) => set('label_storage_line_dv', e.target.value)} className={fieldClass} placeholder={product.defaults.storage_line_dv} /></div>
            <div><label className={labelClass} htmlFor="lbl-note">Note under the ingredients</label><input id="lbl-note" maxLength={120} value={draft.label_note} onChange={(e) => set('label_note', e.target.value)} className={fieldClass} placeholder={product.defaults.note || 'Contains egg and gluten'} /></div>
            <div><label className={labelClass} htmlFor="lbl-note-dv">Note (Dhivehi)</label><input id="lbl-note-dv" dir="rtl" maxLength={120} value={draft.label_note_dv} onChange={(e) => set('label_note_dv', e.target.value)} className={fieldClass} placeholder={product.defaults.note_dv} /></div>
            <div><label className={labelClass} htmlFor="lbl-use">How to use</label><textarea id="lbl-use" rows={2} maxLength={200} value={draft.label_how_to_use} onChange={(e) => set('label_how_to_use', e.target.value)} className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm resize-y" placeholder={product.defaults.how_to_use || 'Thaw 10 min. Deep fry 4–5 min until golden.'} /></div>
            <div><label className={labelClass} htmlFor="lbl-use-dv">How to use (Dhivehi)</label><textarea id="lbl-use-dv" dir="rtl" rows={2} maxLength={200} value={draft.label_how_to_use_dv} onChange={(e) => set('label_how_to_use_dv', e.target.value)} className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm resize-y" placeholder={product.defaults.how_to_use_dv} /></div>
            <div><label className={labelClass} htmlFor="lbl-unit">Unit after the quantity</label><input id="lbl-unit" maxLength={10} value={draft.label_pack_unit} onChange={(e) => set('label_pack_unit', e.target.value)} className={fieldClass} placeholder={product.defaults.unit} /><p className="text-xs text-[var(--color-text-muted)] mt-1">PCS, SLICES, PACK, G…</p></div>
          </div>
        </fieldset>

        {/* Badges (round 9, 2026-10-13): Halal, Spicy, New… as rust pills under the name. */}
        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3" data-testid="item-label-badges">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">Badges</legend>
          <FoldHelp>Halal, Spicy, New and the like, printed as rust pills under the name on every size with the room. Tap to pick up to four.</FoldHelp>
          <BadgePicker value={draft.label_badges} onChange={(v) => set('label_badges', v)} catalogue={badges} idPrefix="lbl-badges" />
        </fieldset>

        {/* 2026-10-12: price, barcode and net weight for a pack sold at another shop's till; the allergens come from Details. */}
        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3" data-testid="item-label-shop">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">For the shop till</legend>
          <FoldHelp>A price, a barcode and a net weight for a pack sold at another shop's till, and the nutrition panel. Empty boxes print nothing.</FoldHelp>
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <input type="checkbox" checked={draft.label_show_price} onChange={(e) => set('label_show_price', e.target.checked)} className="w-5 h-5 shrink-0 accent-[var(--color-primary)]" />
            <span>
              <span className="block text-sm font-semibold text-[var(--color-text)]">Print the price</span>
              <span className="block text-xs text-[var(--color-text-muted)]">The menu price, MVR {product.menu_price.toFixed(2)}, unless one is typed below.</span>
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className={labelClass} htmlFor="lbl-price">Label price (MVR)</label><input id="lbl-price" type="number" inputMode="decimal" min={0} step="0.5" value={draft.label_price} onChange={(e) => set('label_price', e.target.value)} className={fieldClass} placeholder={product.menu_price.toFixed(2)} disabled={!draft.label_show_price} /></div>
            <div><label className={labelClass} htmlFor="lbl-barcode">Barcode (EAN-13 or EAN-8)</label><input id="lbl-barcode" inputMode="numeric" maxLength={20} value={draft.label_barcode} onChange={(e) => set('label_barcode', e.target.value)} className={fieldClass} placeholder="590123412345" /><p className="text-xs text-[var(--color-text-muted)] mt-1">12 digits: the check digit is added. Prints on the full-size sticker.</p></div>
            <div><label className={labelClass} htmlFor="lbl-weight">Net weight</label><input id="lbl-weight" maxLength={20} value={draft.label_net_weight} onChange={(e) => set('label_net_weight', e.target.value)} className={fieldClass} placeholder="250 g" /><p className="text-xs text-[var(--color-text-muted)] mt-1">Beside the quantity.</p></div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]" data-testid="item-label-allergens">
            {product.allergens.length > 0
              ? <>Allergens from the Details tab, <strong className="text-[var(--color-text-secondary)]">{product.allergens.join(', ')}</strong>, print bold in the ingredients and as “Contains {product.allergens.join(', ')}” when the note is empty.</>
              : 'No allergens on the Details tab. Tick them there and they print bold in the ingredients.'}
          </p>
          {/* Round C: the nutrition panel per 100 g, worked out from the recipe. */}
          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer" data-testid="item-label-nutrition">
            <input type="checkbox" checked={draft.label_show_nutrition} onChange={(e) => set('label_show_nutrition', e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--color-primary)]" />
            <span>
              <span className="block text-sm font-semibold text-[var(--color-text)]">Print nutrition per 100 g</span>
              <span className="block text-xs text-[var(--color-text-muted)]">{nutritionWords(product.nutrition)}</span>
            </span>
          </label>
          {/* Round 15: a serving size prints a per-serving value under each per-100 one. */}
          {draft.label_show_nutrition && (
            <div className="max-w-xs">
              <label className={labelClass} htmlFor="lbl-serving">Serving size ({draft.label_nutrition_per}), for per serving beside per 100</label>
              <input id="lbl-serving" type="number" inputMode="decimal" min={1} max={5000} step="0.5" value={draft.label_serving_g} onChange={(e) => set('label_serving_g', e.target.value)} className={fieldClass} placeholder="Blank: per 100 only" />
            </div>
          )}
        </fieldset>

        {/* The wording lock (round 17): this label's legal lines as they print, and their sign-off. */}
        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-2 min-w-0" data-testid="item-label-signoff">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">Legal wording</legend>
          <FoldHelp>What the law cares about on the sticker, as it prints now. Sign it off once checked; a change after that shows here and, with the wording locked under Settings, stops the label printing until signed off again. Save first: the lines are the saved ones.</FoldHelp>
          <WordingSignoff kind="item" id={itemId} canManage refresh={savedTick} />
          {/* A size whose lines differ (its own recipe) is signed off apart (label audit, 2026-10-16). */}
          {(product.sizes ?? []).filter((z) => z.own_recipe).map((z) => (
            <div key={z.id} className="mt-3 pt-3 border-t border-[var(--color-border-light)]" data-testid={`signoff-size-${z.id}`}>
              <p className="text-xs font-bold text-[var(--color-text-secondary)] mb-1">{z.name}: its own recipe, signed off apart</p>
              <WordingSignoff kind="item" id={itemId} size={z.id} canManage refresh={savedTick} />
            </div>
          ))}
        </fieldset>

        {/* The wrap-around label's parts (owner, 2026-10-12: a bottle label with parts side by side). */}
        <fieldset className="rounded-xl border border-[var(--color-border)] p-3 space-y-3 min-w-0" data-testid="item-label-wrap">
          <legend className="px-1 text-sm font-bold text-[var(--color-text)]">Wrap-around label (wide sizes)</legend>
          <FoldHelp>Only for a wide label such as a bottle wrap: which strips print and in what order, the band along the bottom, and the recycling marks.</FoldHelp>
          <WrapParts
            value={draft.label_wrap}
            onChange={(v) => set('label_wrap', v)}
            catalogue={catalogue}
            pictures={draft.wrap_pictures}
            onAddPicture={() => setPicker('mark')}
            nutritionPer={draft.label_nutrition_per}
            onNutritionPer={(per) => set('label_nutrition_per', per)}
            productName={product.name}
            netWeight={draft.label_net_weight}
            idPrefix="lbl-wrap"
          />
        </fieldset>

        {pictureSlot('title', 'Hand-lettered name', 'A PNG with a clear background. Without one, the name is typed in the brand font.')}
        {pictureSlot('photo', 'Food photo (labels only)', product.cutout_url ? 'Without one, the item\'s cut-out from the Photos tab prints, the same picture the menu cards use.' : 'Without one, the flame prints. Add a background-less PNG as the item\'s cut-out on the Photos tab and it is used here, on the menu cards and the POS.')}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} loading={saving} className="w-full sm:w-auto justify-center">Save label settings</Button>
          <SaveAsTemplate fields={templateFromItem(draft)} at={null} source={product.name} variant="secondary" />
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
          <>
            <SheetPreview url={preview} ratio={105 / 148.5} title="Sticker preview"
              overlay={spots.length > 0 ? <SpotOverlay spots={spots} w={105} h={148.5} onPick={setQuick} mode={arrange ? 'move' : 'tap'} onMove={(key, dx, dy) => saveLayout(nudgeSpot(draft.label_layout, 'full', key, { dx, dy }))} onScale={(key, f) => saveLayout(nudgeSpot(draft.label_layout, 'full', key, { s: f }))} /> : null} />
            {spots.length > 0 && !arrange && <p className="text-xs text-[var(--color-text-muted)] mt-2" data-testid="item-label-tap-hint">Tap a part of the label to change it; the change is saved straight away.</p>}
            {spots.length > 0 && (
              <div className="mt-2">
                <ArrangeBar on={arrange} onToggle={setArrange} canReset={hasOverrides(draft.label_layout, 'full')} onReset={() => saveLayout(clearDesign(draft.label_layout, 'full'))} />
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">The preview needs the Print labels permission.</p>
        )}
      </div>

      {quick && (
        <QuickEditSheet
          spec={quickSpec(quick, quickContext)}
          values={draft as unknown as Record<string, unknown>}
          onChange={(k, v) => setDraft((cur) => (cur ? { ...cur, [k]: v } : cur))}
          onAction={(a) => {
            if (a === 'photo') { setPickerSaves(true); setPicker('photo'); setQuick(null); }
            if (a === 'remove_photo') {
              set('label_photo_media_id', null); set('label_photo_url', null);
              void saveSome({ label_photo_media_id: null }, ['label_photo_media_id', 'label_photo_url']);
            }
          }}
          onDone={quickDone}
          saving={quickSaving}
          idPrefix="lbl-quick"
        />
      )}

      <MediaPicker
        open={picker !== null}
        onClose={() => { setPicker(null); setPickerSaves(false); }}
        mediaType="image"
        title={picker === 'title' ? 'Hand-lettered name' : picker === 'mark' ? 'Mark picture' : 'Food photo'}
        onPick={(asset) => {
          if (picker === 'title') { set('label_title_media_id', asset.id); set('label_title_url', asset.url); }
          if (picker === 'photo') {
            set('label_photo_media_id', asset.id); set('label_photo_url', asset.url);
            if (pickerSaves) void saveSome({ label_photo_media_id: asset.id }, ['label_photo_media_id', 'label_photo_url']);
          }
          if (picker === 'mark' && !draft.label_wrap.pictures.includes(asset.id)) {
            set('label_wrap', { ...draft.label_wrap, pictures: [...draft.label_wrap.pictures, asset.id] });
            set('wrap_pictures', [...draft.wrap_pictures, { id: asset.id, url: asset.url }]);
          }
          setPicker(null);
          setPickerSaves(false);
        }}
      />
    </div>
  );
}
