import { useEffect, useState } from 'react';
import { ImagePlus, Plus, Printer, Trash2 } from 'lucide-react';
import {
  createPouchSet, fetchLabelLayouts, openLabelSheet, printLabelJob,
  type LabelPreset, type PouchCatalogue, type PouchSetCatalogue, type PouchSetRow, type PouchSetSize,
} from '../../api';
import { Btn, Modal, ModalActions } from '../SharedUI';
import { useToast } from '../ui';
import { MediaPicker } from '../MediaPicker';
import { SheetPreview } from './SheetPreview';
import { POUCH_FALLBACK, pouchFits } from './PouchPicker';

/*
 * A pouch product in its sizes, in one go (owner, 2026-11-11: "an easy option
 * for 3 sizes with photos"): type the name, check the three rows (size word,
 * pieces, price, label size), keep the photo, and one tap makes a custom label
 * and a saved label for each size, shown with its preview and a Print button.
 * Everything else (ingredients, storage, how to use) comes from the template
 * picked and is changed afterwards on each label.
 */

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

const SET_FALLBACK: PouchSetCatalogue = {
  sizes: [
    { word: 'Small', qty: 6, price: 35, preset: 'r120x53' },
    { word: 'Medium', qty: 8, price: 45, preset: 'r140x62' },
    { word: 'Large', qty: 12, price: 65, preset: 'r160x70' },
  ],
  max_sizes: 4,
  templates: [{ id: 'momo-pouch', name: 'Frozen momo pouch (microwave)', has_photo: true }],
  photo_url: '/brand/photos/momo/momo-plate.png',
};

type Row = { word: string; qty: string; price: string; preset: string };
type Photo = { kind: 'builtin' } | { kind: 'library'; id: number; url: string } | { kind: 'none' };

const toRow = (s: PouchSetSize): Row => ({ word: s.word, qty: s.qty ? String(s.qty) : '', price: s.price ? String(s.price) : '', preset: s.preset });

export function PouchSetModal({ onClose, onMade }: { onClose: () => void; onMade?: (rows: PouchSetRow[]) => void }) {
  const { toast } = useToast();
  const [set, setSet] = useState<PouchSetCatalogue>(SET_FALLBACK);
  const [pouch, setPouch] = useState<PouchCatalogue>(POUCH_FALLBACK);
  const [presets, setPresets] = useState<LabelPreset[]>([]);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState(SET_FALLBACK.templates[0].id);
  const [look, setLook] = useState(POUCH_FALLBACK.default_look);
  const [rows, setRows] = useState<Row[]>(SET_FALLBACK.sizes.map(toRow));
  const [photo, setPhoto] = useState<Photo>({ kind: 'builtin' });
  const [on, setOn] = useState<'sheet' | 'printer'>('sheet');
  const [place, setPlace] = useState('panel');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<PouchSetRow[] | null>(null);
  const [printing, setPrinting] = useState<number | null>(null);

  useEffect(() => {
    fetchLabelLayouts().then((r) => {
      setPresets(r.presets);
      if (r.pouch) setPouch(r.pouch);
      if (r.pouch_set) { setSet(r.pouch_set); setRows(r.pouch_set.sizes.map(toRow)); setTemplate((t) => (r.pouch_set?.templates.some((x) => x.id === t) ? t : r.pouch_set?.templates[0]?.id ?? t)); }
    }).catch(() => undefined);
  }, []);

  const wide = presets.filter((p) => pouchFits(pouch, p.shape, p.w, p.h));
  const sizeChoices = wide.length > 0 ? wide.map((p) => ({ id: p.id, name: p.name })) : set.sizes.map((s) => ({ id: s.preset, name: s.preset.replace(/^r(\d+)x(\d+)$/, '$1 × $2 mm') }));
  const hasBuiltin = set.templates.find((t) => t.id === template)?.has_photo ?? false;
  const shownPhoto: Photo = photo.kind === 'builtin' && !hasBuiltin ? { kind: 'none' } : photo;
  const setRow = (i: number, patch: Partial<Row>) => setRows((list) => list.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const words = rows.map((r) => r.word.trim().toLowerCase());
  const problem = !name.trim() ? 'Type the product name.'
    : rows.some((r) => !r.word.trim()) ? 'Give every size a word, such as Small.'
    : new Set(words).size !== words.length ? 'Two sizes have the same word.'
    : null;

  const make = async () => {
    if (problem) { toast('error', problem); return; }
    setBusy(true);
    try {
      const r = await createPouchSet({
        name: name.trim(), template, look, on, pack_place: place,
        photo: shownPhoto.kind === 'builtin' ? 'builtin' : shownPhoto.kind === 'library' ? shownPhoto.id : null,
        sizes: rows.map((row) => ({ word: row.word.trim(), qty: row.qty ? Number(row.qty) : null, price: row.price !== '' ? Number(row.price) : null, preset: row.preset })),
      });
      setMade(r.data);
      onMade?.(r.data);
      toast('success', `${r.data.length} ${r.data.length === 1 ? 'label' : 'labels'} made. They are in My labels.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not make the labels.');
    } finally {
      setBusy(false);
    }
  };

  const print = async (row: PouchSetRow) => {
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
      <Modal title="Your pouch labels" onClose={onClose} maxWidth={760}>
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">Each size is a label of its own, in My labels. Print one now, or tap Edit on it there to change its wording.</p>
        <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }} data-testid="pouch-set-made">
          {made.map((row) => (
            <li key={row.job.id} className="rounded-xl border border-[var(--color-border)] p-3 min-w-0">
              <SheetPreview url={row.one_url} ratio={row.w / row.h} title={`${row.label.name} preview`} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--color-text)] truncate">{row.label.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{row.w} × {row.h} mm{row.label.label_pack_qty ? ` · ${row.label.label_pack_qty} pieces` : ''}{row.label.label_price != null ? ` · MVR ${Number(row.label.label_price).toFixed(2)}` : ''}</p>
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
      <Modal title="Pouch labels in every size" onClose={onClose} maxWidth={760}>
        <div className="space-y-4" data-testid="pouch-set-form">
          <p className="text-sm text-[var(--color-text-secondary)]">One tap makes a label for each pack size, with the photo, the pieces and the price. The ingredients, storage and how to use come from the template and can be changed on each label afterwards.</p>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
            <div>
              <label className={labelClass} htmlFor="ps-name">Product name</label>
              <input id="ps-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Chicken Momo" />
            </div>
            <div>
              <label className={labelClass} htmlFor="ps-template">What it is</label>
              <select id="ps-template" value={template} onChange={(e) => setTemplate(e.target.value)} className={fieldClass}>
                {set.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="ps-look">What the pouch looks like</label>
              <select id="ps-look" value={look} onChange={(e) => setLook(e.target.value)} className={fieldClass}>
                {pouch.looks.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="ps-place">Where the pack size goes</label>
              <select id="ps-place" value={place} onChange={(e) => setPlace(e.target.value)} className={fieldClass}>
                {(pouch.pack_places ?? POUCH_FALLBACK.pack_places ?? []).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="ps-on">Printed on</label>
              <select id="ps-on" value={on} onChange={(e) => setOn(e.target.value as 'sheet' | 'printer')} className={fieldClass}>
                <option value="sheet">A4 sticker paper, as many as fit</option>
                <option value="printer">A label printer, one per label</option>
              </select>
            </div>
          </div>

          <div>
            <span className={labelClass}>Photo</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-16 h-16 rounded-full overflow-hidden border-2 border-[var(--color-primary)] bg-[var(--color-bg)] inline-flex items-center justify-center shrink-0">
                {shownPhoto.kind === 'none'
                  ? <ImagePlus size={20} className="text-[var(--color-text-muted)]" aria-hidden />
                  : <img src={shownPhoto.kind === 'builtin' ? set.photo_url : shownPhoto.url} alt="" className="w-full h-full object-cover" />}
              </span>
              <div className="flex flex-wrap gap-2">
                {hasBuiltin && <Btn small variant={shownPhoto.kind === 'builtin' ? 'primary' : 'secondary'} onClick={() => setPhoto({ kind: 'builtin' })}>The momo photo</Btn>}
                <Btn small variant={shownPhoto.kind === 'library' ? 'primary' : 'secondary'} onClick={() => setPicking(true)}>Pick from Library</Btn>
                <Btn small variant={shownPhoto.kind === 'none' ? 'primary' : 'secondary'} onClick={() => setPhoto({ kind: 'none' })}>No photo</Btn>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">The same photo goes on every size, in a circle. The size word prints as "Small Pack", so nobody reads it as small momo.</p>
          </div>

          <div>
            <span className={labelClass}>Sizes</span>
            <ul className="space-y-2">
              {rows.map((row, i) => (
                <li key={i} className="rounded-xl border border-[var(--color-border)] p-2.5 grid gap-2 items-end" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))' }} data-testid={`pouch-set-row-${i}`}>
                  <div>
                    <label className={labelClass} htmlFor={`ps-word-${i}`}>Size word</label>
                    <input id={`ps-word-${i}`} value={row.word} maxLength={14} onChange={(e) => setRow(i, { word: e.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`ps-qty-${i}`}>Pieces</label>
                    <input id={`ps-qty-${i}`} type="number" inputMode="numeric" min={1} value={row.qty} onChange={(e) => setRow(i, { qty: e.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`ps-price-${i}`}>Price (MVR)</label>
                    <input id={`ps-price-${i}`} type="number" inputMode="decimal" min={0} step="0.5" value={row.price} onChange={(e) => setRow(i, { price: e.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`ps-size-${i}`}>Label size</label>
                    <select id={`ps-size-${i}`} value={row.preset} onChange={(e) => setRow(i, { preset: e.target.value })} className={fieldClass}>
                      {sizeChoices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {rows.length > 1 && (
                    <div>
                      <Btn small variant="danger-outline" onClick={() => setRows((list) => list.filter((_, n) => n !== i))} aria-label={`Remove ${row.word || 'this size'}`}><Trash2 size={14} aria-hidden /> Remove</Btn>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {rows.length < set.max_sizes && (
              <div className="mt-2">
                <Btn small variant="secondary" onClick={() => setRows((list) => [...list, { word: '', qty: '', price: '', preset: sizeChoices[sizeChoices.length - 1]?.id ?? 'r160x70' }])}><Plus size={14} aria-hidden /> Add a size</Btn>
              </div>
            )}
          </div>
        </div>
        <ModalActions>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
          <Btn onClick={() => void make()} disabled={busy} data-testid="pouch-set-make">{busy ? 'Making…' : `Make the ${rows.length} ${rows.length === 1 ? 'label' : 'labels'}`}</Btn>
        </ModalActions>
      </Modal>
      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        mediaType="image"
        title="Photo for the pouch labels"
        onPick={(asset) => { setPhoto({ kind: 'library', id: asset.id, url: asset.original_url ?? asset.url }); setPicking(false); }}
      />
    </>
  );
}
