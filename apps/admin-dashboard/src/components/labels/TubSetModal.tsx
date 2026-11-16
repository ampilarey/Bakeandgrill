import { useEffect, useState } from 'react';
import { ImagePlus, Printer, Upload } from 'lucide-react';
import {
  createTubSet, fetchLabelLayouts, openLabelSheet, printLabelJob,
  type LabelPreset, type TubSetCatalogue, type TubSetRow,
} from '../../api';
import { Btn, Modal, ModalActions } from '../SharedUI';
import { useToast } from '../ui';
import { MediaPicker } from '../MediaPicker';
import { SheetPreview } from './SheetPreview';
import { PhotoDrop } from './PhotoDrop';

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
      if (r.tub_set) { setSet(r.tub_set); setLid(r.tub_set.lid); setSide(r.tub_set.side); }
    }).catch(() => undefined);
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
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">Two labels, each in My labels. Print there to set the dates on the side label; the lid has none. Edit changes the wording of either.</p>
        <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }} data-testid="tub-set-made">
          {made.map((row) => (
            <li key={row.job.id} className="rounded-xl border border-[var(--color-border)] p-3 min-w-0">
              <SheetPreview url={row.one_url} ratio={row.w / row.h} title={`${row.label.name} preview`} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--color-text)] truncate">{row.label.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{row.part === 'lid' ? `Round, ${row.w} mm · name and photo` : `${row.w} × ${row.h} mm · the details`}</p>
                </div>
                <Btn small onClick={() => void print(row)} disabled={printing !== null}><Printer size={14} aria-hidden /> {printing === row.job.id ? 'Opening…' : 'Print'}</Btn>
              </div>
            </li>
          ))}
        </ul>
        <ModalActions>
          <Btn variant="secondary" onClick={() => setMade(null)}>Make another</Btn>
          <Btn onClick={onClose}>Done</Btn>
        </ModalActions>
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
              <label className={labelClass} htmlFor="ts-weight">Net weight</label>
              <input id="ts-weight" value={weight} maxLength={20} onChange={(e) => setWeight(e.target.value)} className={fieldClass} placeholder="300 g" />
            </div>
            <div>
              <label className={labelClass} htmlFor="ts-price">Price (MVR)</label>
              <input id="ts-price" type="number" inputMode="decimal" min={0} step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} className={fieldClass} />
            </div>
          </div>

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
          <p className="text-xs text-[var(--color-text-muted)]">Measure the lid and the flat part of the side first. Storage, how to use and the rest are changed afterwards with Edit on each label.</p>
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
