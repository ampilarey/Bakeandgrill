import { ArrowDown, ArrowUp, ImagePlus, RotateCcw, X } from 'lucide-react';
import type { LabelWrap, NutritionPer, WrapCatalogue, WrapPartKey, WrapPicture } from '../../api';
import { Button } from '../ui';

/*
 * The wrap-around label's parts (owner, 2026-10-12: a bottle label "with 2,
 * 3, 4, 5 different parts"), on an item's Label tab and the custom label
 * editor. The server draws them (WrapDesign) when the label is wide and
 * short: 180 × 40, 150 × 35, 200 × 50, 120 × 40 and any size at least 90 × 25
 * mm and two and a half times as wide as tall. Here: the parts in order, the
 * flavour band, the recycling marks and pictures, the free text, and
 * whether the nutrition values are per 100 g or per 100 ml.
 */

/** What the server lists; the same words when the layouts have not loaded yet. */
export const WRAP_FALLBACK: WrapCatalogue = {
  parts: [
    { key: 'brand', label: 'Brand and name', hint: 'Logo, brand line, the product name (hand-lettered or typed) and its picture' },
    { key: 'legal', label: 'Ingredients and legal text', hint: 'Ingredients with allergens bold, "Contains …", storage, how to use, the note, and who made it' },
    { key: 'nutrition', label: 'Nutrition per 100 g or ml', hint: 'The values from the recipe, or a custom label\'s typed line' },
    { key: 'dates', label: 'Dates and batch', hint: 'Made-on and expiry boxes, batch and pack number, price, quantity and net weight (the barcode too, when there is no Barcode part and the room)' },
    { key: 'barcode', label: 'Barcode', hint: 'The EAN-13 or EAN-8 bars with the digits beneath; left out when the product has no barcode' },
    { key: 'qr', label: 'QR code', hint: 'The pack\'s page (batch QR) when it is on, else the complaints QR' },
    { key: 'marks', label: 'Recycling marks and pictures', hint: 'Recycling symbols, the tidy man, and any mark pictures picked from the library' },
    { key: 'text', label: 'Free text', hint: 'A heading and lines of your own, English and Dhivehi' },
    { key: 'packed', label: 'Packed for and promotion', hint: 'The packed-for box and the promotion flash, when the sheet carries them' },
  ],
  marks: [
    { key: 'recycle', label: 'Recycling loop', caption: 'RECYCLE' },
    { key: 'dispose', label: 'Tidy man (dispose properly)', caption: 'DISPOSE PROPERLY' },
    { key: 'pet', label: 'Plastic 1 · PET', caption: 'PET 1' },
    { key: 'hdpe', label: 'Plastic 2 · HDPE', caption: 'HDPE 2' },
    { key: 'pvc', label: 'Plastic 3 · PVC', caption: 'PVC 3' },
    { key: 'ldpe', label: 'Plastic 4 · LDPE', caption: 'LDPE 4' },
    { key: 'pp', label: 'Plastic 5 · PP', caption: 'PP 5' },
    { key: 'ps', label: 'Plastic 6 · PS', caption: 'PS 6' },
    { key: 'other', label: 'Plastic 7 · other', caption: 'OTHER 7' },
    { key: 'glass', label: 'Glass', caption: 'GLASS' },
    { key: 'paper', label: 'Recycled paper', caption: 'PAPER' },
    { key: 'metal', label: 'Metal (tin, aluminium)', caption: 'METAL' },
  ],
  default_parts: ['brand', 'legal', 'nutrition', 'dates', 'barcode', 'qr', 'marks'],
  default_marks: ['recycle', 'dispose'],
  max_pictures: 4,
};

export const EMPTY_WRAP: LabelWrap = {
  parts: WRAP_FALLBACK.default_parts, band: true, band_text: '', band_text_dv: '', marks: WRAP_FALLBACK.default_marks, pictures: [],
  text_heading: '', text_heading_dv: '', text: '', text_dv: '',
};

type Props = {
  value: LabelWrap;
  onChange: (next: LabelWrap) => void;
  catalogue?: WrapCatalogue | null;
  /** The picked pictures with their urls, for the thumbnails. */
  pictures: WrapPicture[];
  /** Opens the media picker; the parent appends the picked id. */
  onAddPicture: () => void;
  nutritionPer: NutritionPer;
  onNutritionPer: (per: NutritionPer) => void;
  /** What the band prints when its words are empty. */
  productName: string;
  netWeight: string;
  idPrefix?: string;
};

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

export function WrapParts({ value, onChange, catalogue, pictures, onAddPicture, nutritionPer, onNutritionPer, productName, netWeight, idPrefix = 'wrap' }: Props) {
  const cat = catalogue ?? WRAP_FALLBACK;
  const wordsOf = (key: WrapPartKey) => cat.parts.find((p) => p.key === key) ?? { key, label: key, hint: '' };
  const set = <K extends keyof LabelWrap>(key: K, v: LabelWrap[K]) => onChange({ ...value, [key]: v });
  const move = (i: number, dir: -1 | 1) => {
    const parts = [...value.parts];
    const j = i + dir;
    if (j < 0 || j >= parts.length) return;
    [parts[i], parts[j]] = [parts[j], parts[i]];
    set('parts', parts);
  };
  const left = cat.parts.filter((p) => !value.parts.includes(p.key));
  const maxPictures = cat.max_pictures ?? 4;

  return (
    <div className="space-y-4" data-testid="wrap-parts">
      <p className="text-xs text-[var(--color-text-muted)]">Prints when the label is wide and short: 180 × 40, 150 × 35, 200 × 50, 120 × 40 mm on the size picker, or any size at least 90 × 25 mm and two and a half times as wide as tall. The parts sit side by side in this order; a part with nothing to print is left out, and on a narrow label the last parts give way. Other sizes keep their usual sticker.</p>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={labelClass}>Parts, in order</span>
          <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => onChange({ ...value, parts: cat.default_parts, marks: cat.default_marks })}>Usual set</Button>
        </div>
        <ol className="divide-y divide-[var(--color-border-light)] border border-[var(--color-border)] rounded-xl overflow-hidden" data-testid="wrap-part-list">
          {value.parts.map((key, i) => {
            const w = wordsOf(key);
            return (
              <li key={key} className="flex items-center gap-2 px-2 py-1.5 bg-[var(--color-surface)]">
                <span className="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-full text-[11px] font-bold bg-[var(--color-tone-brown-bg)] text-[var(--color-tone-brown-text)] border border-[var(--color-tone-brown-border)]">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--color-text)]">{w.label}</span>
                  {w.hint && <span className="block text-[11px] text-[var(--color-text-muted)] truncate">{w.hint}</span>}
                </span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] disabled:opacity-40" aria-label={`Move ${w.label} up`}><ArrowUp size={14} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === value.parts.length - 1} className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] disabled:opacity-40" aria-label={`Move ${w.label} down`}><ArrowDown size={14} /></button>
                <button type="button" onClick={() => set('parts', value.parts.filter((p) => p !== key))} disabled={value.parts.length === 1} className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-danger)] disabled:opacity-40" aria-label={`Remove ${w.label}`}><X size={14} /></button>
              </li>
            );
          })}
        </ol>
        {left.length > 0 && (
          <select aria-label="Add a part" value="" onChange={(e) => { const k = e.target.value as WrapPartKey; if (k) set('parts', [...value.parts, k]); }} className={`${fieldClass} mt-2`}>
            <option value="">Add a part…</option>
            {left.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        )}
      </div>

      <div className="rounded-xl border border-[var(--color-border)] p-3 space-y-2">
        <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
          <input type="checkbox" checked={value.band} onChange={(e) => set('band', e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--color-primary)]" data-testid="wrap-band" />
          <span>
            <span className="block text-sm font-semibold text-[var(--color-text)]">Flavour band along the bottom</span>
            <span className="block text-xs text-[var(--color-text-muted)]">A rust band across the label with the flavour or name{netWeight ? ` and the net content (${netWeight})` : ' and the net content, when one is typed'} at the end.</span>
          </span>
        </label>
        {value.band && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-band`}>Band words</label>
              <input id={`${idPrefix}-band`} maxLength={60} value={value.band_text} onChange={(e) => set('band_text', e.target.value)} className={fieldClass} placeholder={productName || 'The product name'} />
            </div>
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-band-dv`}>Band words in Dhivehi</label>
              <input id={`${idPrefix}-band-dv`} dir="rtl" maxLength={60} value={value.band_text_dv} onChange={(e) => set('band_text_dv', e.target.value)} className={fieldClass} placeholder="ދިވެހި ނަން" />
            </div>
          </div>
        )}
      </div>

      <div>
        <span className={labelClass}>Recycling marks</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Recycling marks">
          {cat.marks.map((m) => {
            const on = value.marks.includes(m.key);
            return (
              <button key={m.key} type="button" aria-pressed={on} onClick={() => set('marks', on ? value.marks.filter((k) => k !== m.key) : [...value.marks, m.key])} className={['h-8 px-3 rounded-full border text-xs font-semibold', on ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ')}>{m.label}</button>
            );
          })}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">Each prints as a symbol with its word beneath, in the marks part.</p>
      </div>

      <div>
        <span className={labelClass}>Mark pictures</span>
        <div className="flex flex-wrap items-center gap-2" data-testid="wrap-pictures">
          {value.pictures.map((id) => {
            const url = pictures.find((p) => p.id === id)?.url ?? null;
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
                <span className="w-12 h-12 inline-flex items-center justify-center overflow-hidden">{url ? <img src={url} alt={`Mark ${id}`} className="max-w-full max-h-full object-contain" /> : <ImagePlus size={16} className="text-[var(--color-text-muted)]" />}</span>
                <button type="button" onClick={() => set('pictures', value.pictures.filter((p) => p !== id))} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--color-danger)]" aria-label={`Remove picture ${id}`}><X size={14} /></button>
              </span>
            );
          })}
          <Button variant="secondary" size="sm" icon={<ImagePlus size={14} />} onClick={onAddPicture} disabled={value.pictures.length >= maxPictures} data-testid="wrap-add-picture">Add a picture</Button>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">A certification mark you hold the rights to (halal, organic…) from the media library, up to {maxPictures}, in the same row as the recycling marks.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className={labelClass} htmlFor={`${idPrefix}-th`}>Free text heading</label><input id={`${idPrefix}-th`} maxLength={40} value={value.text_heading} onChange={(e) => set('text_heading', e.target.value)} className={fieldClass} placeholder="Fruit content 29%" /></div>
        <div><label className={labelClass} htmlFor={`${idPrefix}-th-dv`}>Heading in Dhivehi</label><input id={`${idPrefix}-th-dv`} dir="rtl" maxLength={40} value={value.text_heading_dv} onChange={(e) => set('text_heading_dv', e.target.value)} className={fieldClass} /></div>
        <div><label className={labelClass} htmlFor={`${idPrefix}-tx`}>Free text</label><textarea id={`${idPrefix}-tx`} rows={2} maxLength={400} value={value.text} onChange={(e) => set('text', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm" placeholder="Shake well before serving. Once opened, keep refrigerated and drink within 3 days." /></div>
        <div><label className={labelClass} htmlFor={`${idPrefix}-tx-dv`}>Free text in Dhivehi</label><textarea id={`${idPrefix}-tx-dv`} dir="rtl" rows={2} maxLength={400} value={value.text_dv} onChange={(e) => set('text_dv', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm" /></div>
      </div>
      <p className="text-xs text-[var(--color-text-muted)] -mt-2">Prints in the free-text part, when that part is in the list.</p>

      <div className="sm:max-w-xs">
        <label className={labelClass} htmlFor={`${idPrefix}-per`}>Nutrition values are</label>
        <select id={`${idPrefix}-per`} value={nutritionPer} onChange={(e) => onNutritionPer(e.target.value === 'ml' ? 'ml' : 'g')} className={fieldClass}>
          <option value="g">per 100 g</option>
          <option value="ml">per 100 ml (a drink)</option>
        </select>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">How the nutrition heading reads on every sticker of this product.</p>
      </div>
    </div>
  );
}
