import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, FileDown, Printer } from 'lucide-react';
import {
  downloadLabelSheet, fetchLabelLayouts, openLabelSheet, stickerLinks,
  type LabelLimits, type LabelPreset, type LabelRoll, type SheetLinks, type StickerLang, type StickerSummary,
} from '../../api';
import { Button } from '../ui';
import { Modal, ModalActions, TabScrollRow } from '../SharedUI';
import { today as localToday } from '../../utils/dateHelpers';
import { DATE_BOX, ExpiryChips, expiryForNewMfg } from './ExpiryChips';
import { LabelSizePicker } from './LabelSizePicker';
import { DroppedNote, LinkLifeNote, UseByLine, WordingLockNotice, wordingRefused } from './PrintChecks';
import { POUCH_FALLBACK, pouchFits } from './PouchPicker';
import { QtyStepper } from './QtyStepper';
import { SheetPreview } from './SheetPreview';
import {
  DEFAULT_CHOICE, designFor, pickRoll, rememberSize, rememberSizeFor, rememberedRoll, rememberedSize, rememberedSizeFor, requestFor, rollChoice, sizeName,
  sizeOf, sizeProblem, stockOf, withPreset, type SizeChoice,
} from './labelSize';

/*
 * Print one label, in one pop-up (owner, 2026-11-14: "Still i feel saving, printing ect of labels are
 * confusing"; "It should be dated before printing"). Print on a label's row opens this: how many, the made-on
 * date and the use-by, the paper, and the sticker drawn with those dates beside them. Nothing prints until
 * Print is pressed; there is no Prepare step in between. It makes the same sticker request Print labels and
 * the wizard make, so the print is logged, counted off its roll and kept to print again like any other.
 * The rarer choices of a print (a promotion flash, pack numbering, cut marks, several products on one sheet)
 * stay on Print labels, one tap away under More.
 */

export type PrintTarget = {
  kind: 'item' | 'custom';
  id: number;
  name: string;
  /** The language the label prints in. */
  lang: StickerLang;
  /** A pouch label, or a bottle with flat sides: it opens at the size made for it. */
  pouch?: boolean;
  faces?: number;
  /** A sized menu item: the sticker is for one size. */
  sizes?: { id: number; name: string; price: number }[];
  /** The label's own quantity per pack, shown as the box's hint. */
  ownQty?: number | null;
};

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';
const chip = (on: boolean) => ['h-8 px-3 rounded-full border text-sm font-semibold whitespace-nowrap', on ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ');

/** The size a label opens at: the one it last printed at, else the one made for it, else the last size printed. */
function startingSize(target: PrintTarget, presets: LabelPreset[], rolls: LabelRoll[], at?: SizeChoice): { choice: SizeChoice; roll: string | null } {
  if (at) return { choice: at, roll: null };
  const own = rememberedSizeFor(`${target.kind === 'custom' ? 'c' : 'i'}${target.id}`);
  if (own) return own;
  let choice = rememberedSize() ?? (rolls.length > 0 ? rollChoice(rolls[0]) : DEFAULT_CHOICE);
  let roll = rememberedSize() ? rememberedRoll() : rolls[0]?.id ?? null;
  const { w, h } = sizeOf(choice, presets);
  if (target.pouch && !pouchFits(POUCH_FALLBACK, choice.shape, w, h)) { choice = { ...withPreset(choice, 'r140x62', presets), on: 'sheet' }; roll = null; }
  else if ((target.faces ?? 0) > 0 && designFor(choice.shape, w, h) !== 'wrap') { choice = { ...withPreset(choice, 'r215x40', presets), on: 'sheet' }; roll = null; }
  return { choice, roll };
}

export function PrintLabelModal({ target, canManage = false, at, onClose, onPrinted }: {
  target: PrintTarget;
  /** Manage label settings: may sign off wording the lock refuses. */
  canManage?: boolean;
  /** A size to open at, when the caller knows it (the editor's own). */
  at?: SizeChoice;
  onClose: () => void;
  onPrinted?: (links: SheetLinks) => void;
}) {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<LabelPreset[]>([]);
  const [limits, setLimits] = useState<LabelLimits | null>(null);
  const [rolls, setRolls] = useState<LabelRoll[]>([]);
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<SizeChoice>(DEFAULT_CHOICE);
  const [rollId, setRollId] = useState<string | null>(null);
  const [rounded, setRounded] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);
  const [lang, setLang] = useState<StickerLang>(target.lang);
  const [copies, setCopies] = useState(1);
  const [fill, setFill] = useState(true);
  const [mfg, setMfg] = useState(() => localToday());
  const [exp, setExp] = useState('');
  const [sizeId, setSizeId] = useState<number | null>(null);
  const [qty, setQty] = useState('');
  const [batch, setBatch] = useState('');
  const [packedFor, setPackedFor] = useState('');
  const [packedFor2, setPackedFor2] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checked, setChecked] = useState<StickerSummary | null>(null);
  const [redraw, setRedraw] = useState(0);
  const [printing, setPrinting] = useState<'print' | 'pdf' | null>(null);
  const [result, setResult] = useState<SheetLinks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const copiesTouched = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchLabelLayouts().then((r) => {
      if (!alive) return;
      const owned = r.rolls ?? [];
      const start = startingSize(target, r.presets, owned, at);
      setPresets(r.presets); setLimits(r.limits); setRolls(owned);
      setChoice(start.choice); setRollId(start.roll);
      setReady(true);
    }).catch(() => { if (alive) { setPresets([]); setLimits(null); setReady(true); } });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sized = presets.length > 0 ? requestFor(choice, presets) : { layout: 'a4-4', w: null as number | null, h: null as number | null };
  const { w: stickerW, h: stickerH } = sizeOf(choice, presets);
  const sizeIssue = sizeProblem(choice, limits);
  const stock = presets.length > 0 ? stockOf(choice, presets) : null;
  const round = choice.shape === 'circle';
  const picked = pickRoll(rolls, choice, presets, rollId);
  const perPage = stock && stock.on !== 'printer' ? Math.max(1, stock.perPage) : 1;

  // As many as fill a sheet to start with (one on a label printer), until the count is typed.
  useEffect(() => {
    if (ready && !copiesTouched.current) setCopies(perPage);
  }, [ready, perPage]);

  const request = (copiesWanted: number, forPreview: boolean) => ({
    items: [{ id: target.id, copies: copiesWanted, kind: target.kind, ...(target.kind === 'item' && sizeId ? { size: sizeId } : {}) }],
    lang, layout: sized.layout, w: sized.w, h: sized.h,
    rounded: choice.shape === 'rect' && rounded,
    fill, mfg: fill ? mfg : null, exp: fill && exp ? exp : null,
    qty: qty !== '' ? Number(qty) : null,
    batch: batch.trim() || null,
    for: packedFor.trim() || null,
    for2: packedFor2.trim() || null,
    roll: picked.roll?.id ?? null,
    preview: forPreview || undefined,
  });

  const previewKey = useMemo(() => JSON.stringify([ready ? request(1, true) : null, redraw]), [ready, redraw, lang, sized.layout, sized.w, sized.h, choice.shape, rounded, fill, mfg, exp, qty, batch, packedFor, packedFor2, sizeId, picked.roll?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready || presets.length === 0) return;
    if (sizeIssue) { ++seq.current; setPreview(null); setChecked(null); setPreviewError(sizeIssue); setPreviewBusy(false); return; }
    const mine = ++seq.current;
    setPreviewBusy(true);
    const timer = setTimeout(async () => {
      try {
        const r = await stickerLinks(request(1, true));
        if (mine !== seq.current) return;
        setPreview(r.one_url ?? r.url);
        setChecked(r.summary ?? null);
        setPreviewError(null);
      } catch (e) {
        if (mine !== seq.current) return;
        setPreview(null); setChecked(null);
        setPreviewError(e instanceof Error ? e.message : 'Could not draw the label.');
      } finally {
        if (mine === seq.current) setPreviewBusy(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [previewKey, sizeIssue]); // eslint-disable-line react-hooks/exhaustive-deps

  // A change after a print means the next press is a new print.
  useEffect(() => { setResult(null); }, [previewKey, copies]);

  const print = async (how: 'print' | 'pdf') => {
    setPrinting(how); setError(null);
    try {
      const r = await stickerLinks(request(copies, false));
      rememberSize(choice, picked.roll?.id ?? null);
      rememberSizeFor(`${target.kind === 'custom' ? 'c' : 'i'}${target.id}`, choice, picked.roll?.id ?? null);
      setResult(r);
      onPrinted?.(r);
      if (how === 'print') openLabelSheet(r.url, r.pdf_url);
      else downloadLabelSheet(r.pdf_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not print the labels.');
    } finally {
      setPrinting(null);
    }
  };

  const design = checked?.design ?? designFor(choice.shape, stickerW, stickerH);
  const paperLine = [
    sizeName(choice.shape, stickerW, stickerH),
    picked.roll ? picked.roll.name : stock ? stock.label : '',
    stock && stock.on !== 'printer' && stock.perPage > 0 ? `${stock.perPage} on a sheet` : '',
  ].filter(Boolean).join(' · ');
  const expPast = fill && exp !== '' && exp < localToday();
  const blocked = !ready || printing !== null || Boolean(sizeIssue) || wordingRefused(checked) || expPast || previewError !== null;
  const allOptions = () => navigate(target.kind === 'custom' ? `/labels/stickers?custom=${target.id}&lang=${lang}` : `/labels/stickers?item=${target.id}`);

  return (
    <Modal title={`Print ${target.name}`} onClose={onClose} maxWidth={860}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]" data-testid="print-label">
        <div className="min-w-0">
          <div className={round ? 'max-w-[280px] mx-auto' : design === 'wrap' ? 'w-full' : 'max-w-[400px] mx-auto'}>
            <SheetPreview url={preview} ratio={(checked?.w ?? stickerW) / (checked?.h ?? stickerH)} busy={previewBusy} round={round} title="The label, as it will print" empty={previewError ?? 'Drawing…'} />
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-2 text-center">Check the dates on the label, then press Print.</p>
          {!previewError && <div className="mt-1 flex justify-center"><DroppedNote dropped={checked?.dropped} /></div>}
        </div>

        <div className="space-y-4 min-w-0">
          <div>
            <span className={labelClass}>How many labels</span>
            <QtyStepper value={copies} onChange={(n) => { copiesTouched.current = true; setCopies(n); }} min={1} max={500} step={perPage} label="How many labels" />
            {stock && stock.on !== 'printer' && stock.perPage > 0 && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{Math.ceil(copies / stock.perPage)} {Math.ceil(copies / stock.perPage) === 1 ? 'sheet' : 'sheets'} of {stock.perPage}.</p>
            )}
          </div>

          {fill && (
            <div>
              <label className={labelClass} htmlFor="print-mfg">Made on</label>
              <input id="print-mfg" type="date" value={mfg} onChange={(e) => { setExp((x) => expiryForNewMfg(mfg, e.target.value, x)); setMfg(e.target.value); }} className={`${fieldClass} ${DATE_BOX}`} data-testid="print-mfg" />
              <label className={`${labelClass} mt-3`} htmlFor="print-exp">Use by</label>
              <input id="print-exp" type="date" value={exp} min={mfg} onChange={(e) => setExp(e.target.value)} className={`${fieldClass} ${DATE_BOX}`} data-testid="print-exp" />
              <ExpiryChips mfg={mfg} value={exp} onChange={setExp} idPrefix="print-exp" />
              {expPast && <p role="alert" className="text-xs text-[var(--color-danger-strong)] mt-1">That use-by date has already passed.</p>}
            </div>
          )}
          {checked && <UseByLine exp={checked.products[0]?.exp} shelf={checked.products[0]?.shelf_life_days} fill={fill} />}

          <div>
            <span className={labelClass}>Paper</span>
            <button type="button" onClick={() => setPaperOpen((o) => !o)} aria-expanded={paperOpen} className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-left text-sm text-[var(--color-text)] flex items-center justify-between gap-2" data-testid="print-paper">
              <span className="min-w-0">{paperLine || 'Choose the paper'}</span>
              <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">{paperOpen ? 'Done' : 'Change'}<ChevronDown size={14} className={paperOpen ? 'rotate-180' : ''} aria-hidden /></span>
            </button>
            {paperOpen && (
              <div className="mt-3">
                <LabelSizePicker presets={presets} limits={limits} choice={choice} onChange={setChoice} rounded={rounded} onRounded={setRounded} rolls={rolls} rollId={rollId} onRoll={setRollId} designWord={design === 'pouch' ? 'pouch label' : undefined} />
              </div>
            )}
            {picked.roll === null && picked.matches.length > 1 && (
              <div className="mt-2">
                <label className={labelClass} htmlFor="print-roll">Which roll is it on?</label>
                <select id="print-roll" value={rollId ?? ''} onChange={(e) => setRollId(e.target.value || null)} className={fieldClass}>
                  <option value="">Not said: nothing is counted off</option>
                  {picked.matches.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <span className={labelClass}>Language</span>
            <TabScrollRow role="group" aria-label="Language" style={{ gap: 6 }}>
              {(['en', 'dv', 'both'] as const).map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={chip(lang === l)}>{l === 'en' ? 'English' : l === 'dv' ? 'Dhivehi' : 'Both'}</button>
              ))}
            </TabScrollRow>
          </div>

          <details className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]" data-testid="print-more">
            <summary className="min-h-[44px] px-3 flex items-center text-sm font-semibold text-[var(--color-text)] cursor-pointer">More</summary>
            <div className="px-3 pb-3 space-y-3">
              {(target.sizes?.length ?? 0) > 0 && (
                <div>
                  <label className={labelClass} htmlFor="print-size">Which size is this sticker for?</label>
                  <select id="print-size" value={sizeId ?? ''} onChange={(e) => setSizeId(Number(e.target.value) || null)} className={fieldClass}>
                    <option value="">Not one size: prints the "From" price</option>
                    {target.sizes!.map((z) => <option key={z.id} value={z.id}>{z.name} · MVR {z.price.toFixed(2)}</option>)}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-[var(--color-text)] min-h-[44px]">
                <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} data-testid="print-fill" />
                <span>Fill in the dates<span className="block text-xs text-[var(--color-text-muted)]">Off: blank boxes to write in by hand.</span></span>
              </label>
              <div>
                <label className={labelClass} htmlFor="print-qty">Quantity per pack</label>
                <input id="print-qty" type="number" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder={target.ownQty ? `${target.ownQty}, the label's own` : 'Blank: the label\'s own'} className={fieldClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="print-batch">Batch number</label>
                <input id="print-batch" value={batch} maxLength={30} onChange={(e) => setBatch(e.target.value)} placeholder="Blank: written by hand" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="print-for">Packed for</label>
                <input id="print-for" value={packedFor} maxLength={60} onChange={(e) => setPackedFor(e.target.value)} placeholder="NH Kuda Rah" className={fieldClass} />
                <input aria-label="Packed for, second line" value={packedFor2} maxLength={60} onChange={(e) => setPackedFor2(e.target.value)} placeholder="The delivery, the date" className={`${fieldClass} mt-2`} />
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                A promotion flash, pack numbers, cut marks, a mock-up or several products on one sheet:{' '}
                <button type="button" className="underline font-semibold text-[var(--color-text)]" onClick={allOptions} data-testid="print-all-options">open every option</button>.
              </p>
            </div>
          </details>

          {!result && <WordingLockNotice wording={checked?.wording} canManage={canManage} onSigned={() => setRedraw((n) => n + 1)} />}
          {error && <p role="alert" className="text-sm text-[var(--color-danger-strong)]">{error}</p>}
          {result && (
            <div className="rounded-xl border border-[var(--color-tone-rust-border)] bg-[var(--color-tone-rust-bg)] p-3 space-y-2" data-testid="print-done">
              <p className="text-sm font-semibold text-[var(--color-text)]"><Check size={14} className="inline mr-1" aria-hidden />{copies} {copies === 1 ? 'label' : 'labels'} sent to print. It is in the print log to print again.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<Printer size={14} />} onClick={() => openLabelSheet(result.url, result.pdf_url)}>Open it again</Button>
                <Button size="sm" variant="secondary" icon={<FileDown size={14} />} onClick={() => downloadLabelSheet(result.pdf_url)}>Download PDF</Button>
              </div>
              <LinkLifeNote />
            </div>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">On a phone, use PDF.</p>
        </div>
      </div>
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>{result ? 'Done' : 'Close'}</Button>
        <Button variant="secondary" icon={<FileDown size={16} />} loading={printing === 'pdf'} disabled={blocked} onClick={() => void print('pdf')} data-testid="print-pdf">PDF</Button>
        <Button icon={<Printer size={16} />} loading={printing === 'print'} disabled={blocked} onClick={() => void print('print')} data-testid="print-go">Print {copies}</Button>
      </ModalActions>
    </Modal>
  );
}
