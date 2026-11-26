import { DhivehiDraft } from '../ai/AiButton';
import { useEffect, useState } from 'react';
import { ImagePlus, Pencil, Printer, Upload } from 'lucide-react';
import {
  createTubSet, fetchLabelBrands, fetchLabelFooters, fetchLabelLayouts, fetchLabelTypes, openLabelSheet, printLabelJob,
  type LabelBadge, type LabelBrand, type LabelFooter, type LabelPreset, type LabelType, type TubSetCatalogue, type TubSetRow,
} from '../../api';
import { Btn, Modal, ModalActions } from '../SharedUI';
import { useToast } from '../ui';
import { MediaPicker } from '../MediaPicker';
import { SheetPreview } from './SheetPreview';
import { PhotoDrop } from './PhotoDrop';
import { CustomLabelModal } from './CustomLabels';
import { inHouseBarcode } from './labelDrafts';
import { BadgePicker } from './BadgePicker';
import { FooterPicker } from './FooterPicker';

/*
 * A tub's two labels in one go (owner, 2026-11-16: "on the top of the container
 * circular label with name and photo. At the side rectangular label with other
 * details"): type the product once, and one tap makes a round lid label (brand,
 * photo, name, what the pack holds) and a rectangular side label (ingredients,
 * dates, storage, the pack's code), each a custom label of its own in My labels.
 */

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const areaClass = 'px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

const SET_FALLBACK: TubSetCatalogue = { lid: 'c80', side: 'r100x50', templates: [] };
const LID_FALLBACK = [{ id: 'c100', name: '100 mm round' }, { id: 'c80', name: '80 mm round' }, { id: 'c70', name: '70 mm round' }, { id: 'c60', name: '60 mm round' }];
const SIDE_FALLBACK = [{ id: 'r100x50', name: '100 × 50 mm' }, { id: 'r99x70', name: '99 × 70 mm' }, { id: 'r70x50', name: '70 × 50 mm' }];

type Photo = { kind: 'builtin' } | { kind: 'library'; id: number; url: string } | { kind: 'none' };
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export function TubSetModal({ onClose, onMade }: { onClose: () => void; onMade?: (rows: TubSetRow[]) => void }) {
  const { toast } = useToast();
  const [set, setSet] = useState<TubSetCatalogue>(SET_FALLBACK);
  const [presets, setPresets] = useState<LabelPreset[]>([]);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [allergens, setAllergens] = useState('');
  const [days, setDays] = useState('');
  const [qty, setQty] = useState('');
  const [weight, setWeight] = useState('');
  const [price, setPrice] = useState('');
  // The rest of a label's own boxes (owner, 2026-11-16: the form had "very few"), behind More details.
  const [barcode, setBarcode] = useState('');
  const [nameDv, setNameDv] = useState('');
  const [heading, setHeading] = useState('');
  const [storage, setStorage] = useState('');
  const [howTo, setHowTo] = useState('');
  const [note, setNote] = useState('');
  const [ingredientsDv, setIngredientsDv] = useState('');
  const [lang, setLang] = useState('');
  const [brandId, setBrandId] = useState('');
  const [brands, setBrands] = useState<LabelBrand[]>([]);
  // What the custom label editor has and this form lacked (owner, 2026-11-16: "compare the features… add missing components").
  const [typeId, setTypeId] = useState('');
  const [types, setTypes] = useState<LabelType[]>([]);
  const [unit, setUnit] = useState('');
  const [nutrition, setNutrition] = useState('');
  const [badges, setBadges] = useState<string[]>([]);
  const [badgeList, setBadgeList] = useState<LabelBadge[]>([]);
  const [headingDv, setHeadingDv] = useState('');
  const [line, setLine] = useState('');
  const [lineDv, setLineDv] = useState('');
  const [noteDv, setNoteDv] = useState('');
  const [howToDv, setHowToDv] = useState('');
  const [footerId, setFooterId] = useState<number | null>(null);
  const [footers, setFooters] = useState<LabelFooter[]>([]);
  const [showQr, setShowQr] = useState<'' | 'on' | 'off'>('');
  const [editing, setEditing] = useState<TubSetRow | null>(null);
  const [rev, setRev] = useState(0);
  const [lid, setLid] = useState(SET_FALLBACK.lid);
  const [side, setSide] = useState(SET_FALLBACK.side);
  const [photo, setPhoto] = useState<Photo>({ kind: 'none' });
  const [on, setOn] = useState<'sheet' | 'printer'>('sheet');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<TubSetRow[] | null>(null);
  const [printing, setPrinting] = useState<number | null>(null);

  useEffect(() => {
    fetchLabelLayouts().then((r) => {
      setPresets(r.presets);
      setBadgeList(r.badges ?? []);
      if (r.tub_set) { setSet(r.tub_set); setLid(r.tub_set.lid); setSide(r.tub_set.side); }
    }).catch(() => undefined);
    fetchLabelBrands().then((r) => setBrands(r.data)).catch(() => undefined);
    fetchLabelTypes().then((r) => setTypes(r.data.filter((t) => t.is_active))).catch(() => undefined);
    fetchLabelFooters().then((r) => setFooters(r.data)).catch(() => undefined);
  }, []);

  const picked = set.templates.find((t) => t.id === template);
  /** Start from a ready-made product: its words fill the boxes, to be changed before making. */
  const startFrom = (id: string) => {
    setTemplate(id);
    const t = set.templates.find((x) => x.id === id);
    if (!t) { setPhoto((p) => (p.kind === 'builtin' ? { kind: 'none' } : p)); return; }
    setName(t.product);
    setIngredients(text(t.fields.label_ingredients));
    setAllergens(text(t.fields.label_allergens));
    setDays(text(t.fields.label_shelf_life_days));
    setQty(text(t.fields.label_pack_qty));
    setWeight(text(t.fields.label_net_weight));
    setHeading(text(t.fields.label_heading));
    setStorage(text(t.fields.label_storage));
    setHowTo(text(t.fields.label_how_to_use));
    setNote(text(t.fields.label_note));
    if (t.has_photo) setPhoto({ kind: 'builtin' });
  };

  const rounds = presets.filter((p) => p.shape === 'circle' && p.w >= 50);
  // The side of a tub: a rectangle that is not a wrap-around strip or a tall sticker.
  const rects = presets.filter((p) => p.shape === 'rect' && p.w >= p.h && p.w <= 120 && p.h >= 40 && p.h <= 80);
  const lidChoices = rounds.length > 0 ? rounds.map((p) => ({ id: p.id, name: p.name })) : LID_FALLBACK;
  const sideChoices = rects.length > 0 ? rects.map((p) => ({ id: p.id, name: p.name })) : SIDE_FALLBACK;
  const shownPhoto: Photo = photo.kind === 'builtin' && !picked?.has_photo ? { kind: 'none' } : photo;
  const problem = !name.trim() ? 'Type the product name.' : null;

  const make = async () => {
    if (problem) { toast('error', problem); return; }
    setBusy(true);
    try {
      const r = await createTubSet({
        name: name.trim(), template: template || null, on, lid, side,
        photo: shownPhoto.kind === 'builtin' ? 'builtin' : shownPhoto.kind === 'library' ? shownPhoto.id : null,
        label_ingredients: ingredients.trim() || null, label_allergens: allergens.trim() || null,
        label_shelf_life_days: days ? Number(days) : null, label_pack_qty: qty ? Number(qty) : null,
        label_net_weight: weight.trim() || null, label_price: price !== '' ? Number(price) : null,
        label_barcode: barcode.trim() || null, name_dv: nameDv.trim() || null, label_heading: heading.trim() || null,
        label_storage: storage || null, label_how_to_use: howTo.trim() || null, label_note: note.trim() || null,
        label_ingredients_dv: ingredientsDv.trim() || null, label_lang: lang || null, brand_id: brandId ? Number(brandId) : null,
        label_type_id: typeId ? Number(typeId) : null, label_pack_unit: unit.trim() || null, label_nutrition: nutrition.trim() || null,
        label_badges: badges, label_heading_dv: headingDv.trim() || null, label_storage_line: line.trim() || null,
        label_storage_line_dv: lineDv.trim() || null, label_note_dv: noteDv.trim() || null, label_how_to_use_dv: howToDv.trim() || null,
        footer_id: footerId, label_show_qr: showQr === '' ? null : showQr === 'on',
      });
      setMade(r.data);
      onMade?.(r.data);
      toast('success', 'The lid label and the side label are made. They are in My labels.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not make the labels.');
    } finally {
      setBusy(false);
    }
  };

  const print = async (row: TubSetRow) => {
    setPrinting(row.job.id);
    // Opened in the tap itself, so a tablet does not block the window.
    const tab = window.open('', '_blank');
    try {
      const links = await printLabelJob(row.job.id);
      if (tab) { tab.location.href = `${window.location.origin}${links.pdf_url}`; } else { openLabelSheet(links.url, links.pdf_url); }
    } catch (e) {
      tab?.close();
      toast('error', e instanceof Error ? e.message : 'Could not print.');
    } finally {
      setPrinting(null);
    }
  };

  if (made) {
    return (
      <Modal title="Your lid and side labels" onClose={onClose} maxWidth={760}>
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">Two labels, each in My labels. Edit opens every option of that label: brand, bottom strip, badges, Dhivehi wording and the rest. Print from My labels to set the dates on the side label; the lid has none.</p>
        <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }} data-testid="tub-set-made">
          {made.map((row) => (
            <li key={row.job.id} className="rounded-xl border border-[var(--color-border)] p-3 min-w-0">
              <SheetPreview key={`${row.job.id}-${rev}`} url={row.one_url} ratio={row.w / row.h} title={`${row.label.name} preview`} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--color-text)] truncate">{row.label.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{row.part === 'lid' ? `Round, ${row.w} mm · name and photo` : `${row.w} × ${row.h} mm · the details`}</p>
                </div>
                <Btn small variant="secondary" onClick={() => setEditing(row)} data-testid={`tub-set-edit-${row.part}`}><Pencil size={14} aria-hidden /> Edit</Btn>
                <Btn small onClick={() => void print(row)} disabled={printing !== null}><Printer size={14} aria-hidden /> {printing === row.job.id ? 'Opening…' : 'Print'}</Btn>
              </div>
            </li>
          ))}
        </ul>
        <ModalActions>
          <Btn variant="secondary" onClick={() => setMade(null)}>Make another</Btn>
          <Btn onClick={onClose}>Done</Btn>
        </ModalActions>
        {editing && (
          <CustomLabelModal
            label={editing.label}
            onClose={() => setEditing(null)}
            onSaved={(c) => { setMade((list) => (list ?? []).map((x) => (x.label.id === c.id ? { ...x, label: c } : x))); setRev((n) => n + 1); }}
          />
        )}
      </Modal>
    );
  }

  return (
    <>
      <Modal title="Lid and side labels" onClose={onClose} maxWidth={760}>
        <div className="space-y-4" data-testid="tub-set-form">
          <p className="text-sm text-[var(--color-text-secondary)]">For a tub or a box with a lid: a round label on top with the name and the photo, and a rectangular label on the side with the ingredients, the dates and the rest. Type the product once and both are made.</p>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
            {set.templates.length > 0 && (
              <div>
                <label className={labelClass} htmlFor="ts-template">Start from</label>
                <select id="ts-template" value={template} onChange={(e) => startFrom(e.target.value)} className={fieldClass}>
                  <option value="">A blank label</option>
                  {set.templates.map((t) => <option key={t.id} value={t.id}>{t.product}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass} htmlFor="ts-name">Product name</label>
              <input id="ts-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Frozen Jhol Momo" />
            </div>
          </div>

          <div>
            <span className={labelClass}>Photo (on the lid)</span>
            <PhotoDrop testId="tub-set-drop" onUploaded={(p) => setPhoto({ kind: 'library', id: p.id, url: p.url })}>
              {(pick, uploading) => (
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-16 h-16 rounded-full overflow-hidden border-2 border-[var(--color-primary)] bg-[var(--color-bg)] inline-flex items-center justify-center shrink-0">
                {shownPhoto.kind === 'none'
                  ? <ImagePlus size={20} className="text-[var(--color-text-muted)]" aria-hidden />
                  : <img src={shownPhoto.kind === 'builtin' ? picked?.photo_url ?? '' : shownPhoto.url} alt="" className="w-full h-full object-cover" />}
              </span>
              <div className="flex flex-wrap gap-2">
                {picked?.has_photo && <Btn small variant={shownPhoto.kind === 'builtin' ? 'primary' : 'secondary'} onClick={() => setPhoto({ kind: 'builtin' })}>The photo that comes with it</Btn>}
                <Btn small variant="secondary" onClick={pick} disabled={uploading} data-testid="tub-set-upload"><Upload size={14} aria-hidden /> {uploading ? 'Adding…' : 'Upload a photo'}</Btn>
                <Btn small variant={shownPhoto.kind === 'library' ? 'primary' : 'secondary'} onClick={() => setPicking(true)}>Pick from Library</Btn>
                <Btn small variant={shownPhoto.kind === 'none' ? 'primary' : 'secondary'} onClick={() => setPhoto({ kind: 'none' })}>No photo</Btn>
              </div>
            </div>
              )}
            </PhotoDrop>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Drop a picture on the box, or tap Upload a photo to take it from this phone or computer. With no photo the lid shows the logo.</p>
          </div>

          <div>
            <label className={labelClass} htmlFor="ts-ingredients">Ingredients (on the side)</label>
            <textarea id="ts-ingredients" rows={3} maxLength={500} value={ingredients} onChange={(e) => setIngredients(e.target.value)} className={areaClass} placeholder="Wheat flour, chicken, onion…" />
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
            <div>
              <label className={labelClass} htmlFor="ts-allergens">Allergens</label>
              <input id="ts-allergens" value={allergens} maxLength={200} onChange={(e) => setAllergens(e.target.value)} className={fieldClass} placeholder="Wheat, Sesame" />
            </div>
            <div>
              <label className={labelClass} htmlFor="ts-days">Shelf life (days)</label>
              <input id="ts-days" type="number" inputMode="numeric" min={1} value={days} onChange={(e) => setDays(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ts-qty">Pieces</label>
              <input id="ts-qty" type="number" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ts-unit">Unit after the pieces</label>
              <input id="ts-unit" value={unit} maxLength={10} onChange={(e) => setUnit(e.target.value.toUpperCase())} className={fieldClass} placeholder="PCS" />
            </div>
            <div>
              <label className={labelClass} htmlFor="ts-weight">Net weight</label>
              <input id="ts-weight" value={weight} maxLength={20} onChange={(e) => setWeight(e.target.value)} className={fieldClass} placeholder="300 g" />
            </div>
            <div>
              <label className={labelClass} htmlFor="ts-price">Price (MVR)</label>
              <input id="ts-price" type="number" inputMode="decimal" min={0} step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} className={fieldClass} />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="ts-barcode">Barcode (on the lid, for the shop's till)</label>
            <div className="flex flex-wrap gap-2">
              <input id="ts-barcode" value={barcode} maxLength={20} inputMode="numeric" onChange={(e) => setBarcode(e.target.value)} className={`${fieldClass} flex-1 min-w-[160px]`} placeholder="12 or 13 digits, or 8" data-testid="tub-set-barcode" />
              <Btn small variant="secondary" onClick={() => setBarcode(inHouseBarcode())} data-testid="tub-set-make-barcode">Make one</Btn>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">The lid prints the price and this barcode under the name. The side label keeps the ingredients, the dates and the QR codes. A lid under 70 mm is too small for a barcode that scans.</p>
          </div>

          <details className="rounded-xl border border-[var(--color-border)] p-3" data-testid="tub-set-more">
            <summary className="text-sm font-semibold text-[var(--color-text)] cursor-pointer">More details</summary>
            <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
              <div>
                <label className={labelClass} htmlFor="ts-name-dv">Name in Dhivehi</label>
                <input id="ts-name-dv" dir="rtl" value={nameDv} maxLength={80} onChange={(e) => setNameDv(e.target.value)} className={fieldClass} /><div className="mt-1"><DhivehiDraft from={name} current={nameDv} kind="name" onDraft={(v) => setNameDv(v.slice(0, 80))} /></div>
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-heading">Heading (the line under the name on the lid)</label>
                <input id="ts-heading" value={heading} maxLength={40} onChange={(e) => setHeading(e.target.value.toUpperCase())} className={fieldClass} placeholder="MOMO IN SPICY JHOL" />
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-storage">Storage</label>
                <select id="ts-storage" value={storage} onChange={(e) => setStorage(e.target.value)} className={fieldClass}>
                  <option value="">None: no storage line</option>
                  <option value="frozen">Frozen</option>
                  <option value="chilled">Chilled</option>
                  <option value="ambient">Room temperature</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-lang">Language</label>
                <select id="ts-lang" value={lang} onChange={(e) => setLang(e.target.value)} className={fieldClass}>
                  <option value="">English</option>
                  <option value="dv">Dhivehi</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-heading-dv">Heading in Dhivehi</label>
                <input id="ts-heading-dv" dir="rtl" value={headingDv} maxLength={40} onChange={(e) => setHeadingDv(e.target.value)} className={fieldClass} /><div className="mt-1"><DhivehiDraft from={heading} current={headingDv} kind="label" onDraft={(v) => setHeadingDv(v.slice(0, 40))} /></div>
              </div>
              {types.length > 0 && (
                <div>
                  <label className={labelClass} htmlFor="ts-type">Label type</label>
                  <select id="ts-type" value={typeId} onChange={(e) => setTypeId(e.target.value)} className={fieldClass} data-testid="tub-set-type">
                    <option value="">No type (usual wording)</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">Brings the heading, storage, dates wording and shelf life. Anything typed here prints instead.</p>
                </div>
              )}
              {brands.length > 0 && (
                <div>
                  <label className={labelClass} htmlFor="ts-brand">Brand</label>
                  <select id="ts-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} className={fieldClass}>
                    <option value="">The usual brand</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="grid gap-3 mt-3">
              <div>
                <label className={labelClass} htmlFor="ts-how">How to use (on the side)</label>
                <textarea id="ts-how" rows={2} maxLength={200} value={howTo} onChange={(e) => setHowTo(e.target.value)} className={areaClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-note">Note (on the side)</label>
                <input id="ts-note" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className={fieldClass} placeholder="Contains wheat and sesame." />
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-ing-dv">Ingredients in Dhivehi</label>
                <textarea id="ts-ing-dv" dir="rtl" rows={2} maxLength={500} value={ingredientsDv} onChange={(e) => setIngredientsDv(e.target.value)} className={areaClass} /><div className="mt-1"><DhivehiDraft from={ingredients} current={ingredientsDv} kind="label" onDraft={(v) => setIngredientsDv(v.slice(0, 500))} /></div>
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-how-dv">How to use in Dhivehi</label>
                <textarea id="ts-how-dv" dir="rtl" rows={2} maxLength={200} value={howToDv} onChange={(e) => setHowToDv(e.target.value)} className={areaClass} /><div className="mt-1"><DhivehiDraft from={howTo} current={howToDv} kind="label" onDraft={(v) => setHowToDv(v.slice(0, 200))} /></div>
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-note-dv">Note in Dhivehi</label>
                <input id="ts-note-dv" dir="rtl" value={noteDv} maxLength={120} onChange={(e) => setNoteDv(e.target.value)} className={fieldClass} /><div className="mt-1"><DhivehiDraft from={note} current={noteDv} kind="label" onDraft={(v) => setNoteDv(v.slice(0, 120))} /></div>
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-line">Storage line (the coloured line above the bottom strip)</label>
                <input id="ts-line" value={line} maxLength={160} onChange={(e) => setLine(e.target.value)} className={fieldClass} placeholder="Keep frozen at -18°C or below" />
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-line-dv">Storage line in Dhivehi</label>
                <input id="ts-line-dv" dir="rtl" value={lineDv} maxLength={160} onChange={(e) => setLineDv(e.target.value)} className={fieldClass} /><div className="mt-1"><DhivehiDraft from={line} current={lineDv} kind="label" onDraft={(v) => setLineDv(v.slice(0, 160))} /></div>
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-nutrition">Nutrition per 100 g</label>
                <input id="ts-nutrition" value={nutrition} maxLength={200} onChange={(e) => setNutrition(e.target.value)} className={fieldClass} placeholder="Energy 210 kcal, protein 9 g, fat 8 g, carbohydrate 25 g" />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">One line. It prints on a full-size side label; a small one has no room for it.</p>
              </div>
              <div data-testid="tub-set-badges">
                <span className={labelClass}>Badges (on the side label)</span>
                <BadgePicker value={badges} onChange={setBadges} catalogue={badgeList} idPrefix="ts-badges" />
              </div>
            </div>
            <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
              <div>
                <label className={labelClass} htmlFor="ts-footer">Bottom strip</label>
                <FooterPicker id="ts-footer" footers={footers} value={footerId} onChange={setFooterId} onFootersChange={setFooters} noneLabel={footers.find((f) => f.is_default)?.name ?? 'Standard'} fallback={footers.find((f) => f.is_default) ?? null} canManage />
              </div>
              <div>
                <label className={labelClass} htmlFor="ts-qr">Complaints QR (on the side label)</label>
                <select id="ts-qr" value={showQr} onChange={(e) => setShowQr(e.target.value as '' | 'on' | 'off')} className={fieldClass} data-testid="tub-set-qr">
                  <option value="">As the bottom strip</option>
                  <option value="on">Print it</option>
                  <option value="off">Leave it off</option>
                </select>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">A side label 86 mm wide or more prints two codes: FEEDBACK for complaints and PACK INFO for this pack's dates and batch. A narrower one has room for the pack's code only.</p>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">What is left (the hand-lettered name, moving parts by hand, the legal sign-off) is under Edit on each label once the two are made.</p>
          </details>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
            <div>
              <label className={labelClass} htmlFor="ts-lid">Lid label (round)</label>
              <select id="ts-lid" value={lid} onChange={(e) => setLid(e.target.value)} className={fieldClass}>
                {lidChoices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="ts-side">Side label</label>
              <select id="ts-side" value={side} onChange={(e) => setSide(e.target.value)} className={fieldClass}>
                {sideChoices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="ts-on">Printed on</label>
              <select id="ts-on" value={on} onChange={(e) => setOn(e.target.value as 'sheet' | 'printer')} className={fieldClass}>
                <option value="sheet">A4 sticker paper, as many as fit</option>
                <option value="printer">A label printer, one per label</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">Measure the lid and the flat part of the side first.</p>
        </div>
        <ModalActions>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
          <Btn onClick={() => void make()} disabled={busy} data-testid="tub-set-make">{busy ? 'Making…' : 'Make the 2 labels'}</Btn>
        </ModalActions>
      </Modal>
      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        mediaType="image"
        title="Photo for the lid"
        onPick={(asset) => { setPhoto({ kind: 'library', id: asset.id, url: asset.original_url ?? asset.url }); setPicking(false); }}
      />
    </>
  );
}
