import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Box, Check, FileDown, Pencil, Plus, Printer, Search, Tag, UtensilsCrossed } from 'lucide-react';
import {
  downloadLabelSheet, fetchCustomLabels, fetchLabelBrands, fetchLabelFooters, fetchLabelLayouts, fetchLabelProducts, fetchLabelTypes, openLabelSheet, stickerLinks, updateCustomLabel, updateItemLabel,
  type CustomLabel, type LabelBrand, type LabelFooter, type LabelLimits, type LabelPreset, type LabelProduct, type LabelSpot, type LabelSpotKey, type LabelType, type SheetLinks, type StickerLang,
} from '../../api';
import { Button, useToast } from '../ui';
import { Modal, TabScrollRow } from '../SharedUI';
import { SheetPreview } from './SheetPreview';
import { SpotOverlay } from './SpotOverlay';
import { QuickEditSheet, quickSpec, type QuickContext, type QuickInput, type QuickSpec, type QuickValue } from './QuickEdit';
import { customDraft, customPayload, itemDraft, itemPayload, nutritionWords, pickKeys, type CustomDraft, type ItemDraft } from './labelDrafts';
import { LabelSizePicker } from './LabelSizePicker';
import { QtyStepper } from './QtyStepper';
import { CustomLabelModal, langOf } from './CustomLabels';
import { ItemLabelTab } from './ItemLabelTab';
import { DEFAULT_CHOICE, DESIGN_NAMES, designFor, rememberSize, rememberedSize, requestFor, sizeName, sizeOf, sizeProblem, stockOf, stocksFor, withPreset, type SizeChoice } from './labelSize';

/*
 * Make a label, in four steps (owner, 2026-10-13: "Still its v confusing and
 * not user friendly"). The hub's other tabs stay for people who know them;
 * this is the way in for everyone else:
 *
 *   1. What is it for: a menu item, something else (a custom label), or a
 *      box. A menu item not yet on labels is switched on the moment it is
 *      picked, so "Menu items (0)" is never the first thing anyone sees.
 *   2. Which label: picture cards with everyday names ("Jar or tub", "Bottle
 *      wrap", "Round lid"), each drawn as it prints, with "My own size" last.
 *   3. Looks right: one large live preview, with the few things that change
 *      a print (language, the dates, the quantity) and a door to the full
 *      details. A tap on a part of the preview (the name, the dates, the
 *      logo…) opens the boxes for that part alone and saves them (round 3,
 *      2026-10-13); the long form is behind All details.
 *   4. How many and print: copies, what it prints on, Print or PDF, through
 *      the same sticker request Pack stickers makes, so the print is logged
 *      and lands under Saved labels like any other.
 */

/** A call that may not exist or may fail (a mocked or refused list): its fallback instead. */
async function safe<T>(call: () => Promise<T>, fallback: T): Promise<T> {
  try { return await call(); } catch { return fallback; }
}

type Kind = 'item' | 'custom';
type Picked = { kind: Kind; id: number; name: string; name_dv: string | null; lang: StickerLang };
type Step = 1 | 2 | 3 | 4;

/** The picture cards: a preset each, in everyday words. */
export const LABEL_CARDS: { preset: string; name: string; blurb: string }[] = [
  { preset: 'r105x148', name: 'Big pack sticker', blurb: 'Everything on it: ingredients, dates, QR. Four to an A4 sheet.' },
  { preset: 'r99x70', name: 'Half-size sticker', blurb: 'The same, smaller. Eight to a sheet.' },
  { preset: 'r60x40', name: 'Jar or tub', blurb: 'Name, dates and the brand on a small pack.' },
  { preset: 'r40x30', name: 'Price tag', blurb: 'Name and price, as small as it goes.' },
  { preset: 'c60', name: 'Round lid', blurb: 'A circle for a lid or a seal.' },
  { preset: 'r180x40', name: 'Bottle wrap', blurb: 'A long strip around a bottle, in parts.' },
];

const today = () => new Date().toISOString().slice(0, 10);

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';
const chip = (on: boolean) => ['h-9 min-h-[36px] px-3 rounded-lg border text-sm font-semibold inline-flex items-center gap-1.5', on ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-on-primary)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ');

/** A label drawn small, the way it prints: the shape to scale and the lines its design puts on it. */
export function LabelSchematic({ preset, w, h, shape, size = 88 }: { preset?: LabelPreset; w?: number; h?: number; shape?: 'rect' | 'circle'; size?: number }) {
  const sh = preset?.shape ?? shape ?? 'rect';
  const W = preset?.w ?? w ?? 60;
  const H = preset?.h ?? h ?? 40;
  const design = designFor(sh, W, H);
  const k = (size - 8) / Math.max(W, H);
  const bw = Math.max(14, W * k);
  const bh = Math.max(14, H * k);
  const x = (size - bw) / 2;
  const y = (size - bh) / 2;
  const ink = 'var(--color-text-muted)';
  const rust = 'var(--color-primary)';
  const lines: ReactNode[] = [];
  const line = (lx: number, ly: number, lw: number, colour = ink, t = 1.2) => lines.push(<rect key={lines.length} x={lx} y={ly} width={Math.max(2, lw)} height={t} rx={0.6} fill={colour} />);
  if (sh === 'circle') {
    const cx = size / 2; const cy = size / 2; const r = bw / 2;
    line(cx - r * 0.45, cy - r * 0.55, r * 0.9, rust, 1.4);
    line(cx - r * 0.6, cy - r * 0.2, r * 1.2, ink, 2.2);
    line(cx - r * 0.5, cy + r * 0.15, r, ink, 1);
    line(cx - r * 0.35, cy + r * 0.45, r * 0.7, rust, 1.6);
  } else if (design === 'wrap') {
    const cols = 3; const gap = 2; const cw = (bw - 6 - gap * (cols - 1)) / cols;
    for (let c = 0; c < cols; c++) {
      const cx = x + 3 + c * (cw + gap);
      line(cx, y + 4, cw * 0.8, c === 0 ? rust : ink, 1.4);
      line(cx, y + 8, cw * 0.95, ink, 1);
      line(cx, y + 11, cw * 0.7, ink, 1);
      if (c > 0) lines.push(<rect key={`d${c}`} x={cx - gap / 2 - 0.3} y={y + 3} width={0.6} height={bh - 11} fill="var(--color-border)" />);
    }
    lines.push(<rect key="band" x={x + 2} y={y + bh - 6} width={bw - 4} height={4} rx={1} fill={rust} />);
  } else if (design === 'full' || design === 'mini') {
    lines.push(<rect key="head" x={x + 2} y={y + 2} width={bw - 4} height={bh * 0.14} rx={1} fill={rust} opacity={0.9} />);
    line(x + bw * 0.2, y + bh * 0.26, bw * 0.6, ink, 2.4);
    line(x + 3, y + bh * 0.4, bw - 6, ink, 1);
    line(x + 3, y + bh * 0.46, bw - 8, ink, 1);
    line(x + 3, y + bh * 0.52, bw - 10, ink, 1);
    lines.push(<rect key="d1" x={x + 3} y={y + bh * 0.62} width={(bw - 8) / 2} height={bh * 0.1} rx={1} fill="none" stroke={ink} strokeWidth={0.8} />);
    lines.push(<rect key="d2" x={x + 3 + (bw - 8) / 2 + 2} y={y + bh * 0.62} width={(bw - 8) / 2} height={bh * 0.1} rx={1} fill="none" stroke={rust} strokeWidth={0.8} />);
    lines.push(<rect key="foot" x={x + 2} y={y + bh - 2 - bh * 0.1} width={bw - 4} height={bh * 0.1} rx={1} fill="var(--color-text)" opacity={0.85} />);
  } else {
    line(x + bw * 0.15, y + bh * 0.22, bw * 0.7, rust, 1.2);
    line(x + bw * 0.1, y + bh * 0.42, bw * 0.8, ink, 2.2);
    lines.push(<rect key="d1" x={x + 3} y={y + bh * 0.62} width={(bw - 8) / 2} height={bh * 0.18} rx={1} fill="none" stroke={ink} strokeWidth={0.8} />);
    lines.push(<rect key="d2" x={x + 3 + (bw - 8) / 2 + 2} y={y + bh * 0.62} width={(bw - 8) / 2} height={bh * 0.18} rx={1} fill="none" stroke={rust} strokeWidth={0.8} />);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      {sh === 'circle'
        ? <circle cx={size / 2} cy={size / 2} r={bw / 2} fill="var(--color-surface)" stroke="var(--color-text)" strokeWidth={1} />
        : <rect x={x} y={y} width={bw} height={bh} rx={2} fill="var(--color-surface)" stroke="var(--color-text)" strokeWidth={1} />}
      {lines}
    </svg>
  );
}

function StepHeader({ step, onJump }: { step: Step; onJump: (s: Step) => void }) {
  const names: Record<Step, string> = { 1: 'What is it for', 2: 'Which label', 3: 'Looks right', 4: 'How many' };
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Steps" data-testid="make-steps">
      {([1, 2, 3, 4] as Step[]).map((s) => (
        <li key={s}>
          <button type="button" onClick={() => s < step && onJump(s)} disabled={s > step} aria-current={s === step ? 'step' : undefined}
            className={['h-8 px-2.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border', s === step ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-on-primary)]' : s < step ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)]'].join(' ')}>
            <span className="w-4 h-4 rounded-full bg-white/40 inline-flex items-center justify-center text-[10px]">{s < step ? <Check size={10} /> : s}</span>
            {names[s]}
          </button>
        </li>
      ))}
    </ol>
  );
}

export function MakeLabelWizard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [kind, setKind] = useState<Kind | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [products, setProducts] = useState<LabelProduct[] | null>(null);
  const [customs, setCustoms] = useState<CustomLabel[] | null>(null);
  const [presets, setPresets] = useState<LabelPreset[]>([]);
  const [limits, setLimits] = useState<LabelLimits | null>(null);
  const [query, setQuery] = useState('');
  const [switching, setSwitching] = useState<number | null>(null);
  const [newCustom, setNewCustom] = useState(false);
  const [details, setDetails] = useState(false);
  const [choice, setChoice] = useState<SizeChoice>(DEFAULT_CHOICE);
  const [ownSize, setOwnSize] = useState(false);
  const [rounded, setRounded] = useState(false);
  const [lang, setLang] = useState<StickerLang>('en');
  const [fill, setFill] = useState(true);
  const [mfg, setMfg] = useState(today());
  const [qty, setQty] = useState('');
  // Typed from a tap on the preview (round 3): the batch number and who the packs are for.
  const [batch, setBatch] = useState('');
  const [packedFor, setPackedFor] = useState('');
  const [packedFor2, setPackedFor2] = useState('');
  const [copies, setCopies] = useState(1);
  const [preview, setPreview] = useState<string | null>(null);
  // Where each part of the preview landed, the part whose sheet a tap opened, the draft that sheet edits, and the lists its selects need.
  const [spots, setSpots] = useState<LabelSpot[]>([]);
  const [spotBox, setSpotBox] = useState<{ w: number; h: number } | null>(null);
  const [quick, setQuick] = useState<LabelSpotKey | null>(null);
  const [quickDraft, setQuickDraft] = useState<Record<string, unknown> | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [lists, setLists] = useState<{ types: LabelType[]; brands: LabelBrand[]; footers: LabelFooter[] } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<'print' | 'pdf' | null>(null);
  const [result, setResult] = useState<SheetLinks | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the details were edited behind the preview, so it redraws with nothing else changed.
  const [redraw, setRedraw] = useState(0);
  const previewSeq = useRef(0);

  useEffect(() => {
    fetchLabelLayouts().then((r) => { setPresets(r.presets); setLimits(r.limits); }).catch(() => { setPresets([]); setLimits(null); });
  }, []);
  useEffect(() => {
    if (kind === 'item' && products === null) fetchLabelProducts(true).then((r) => setProducts(r.data)).catch(() => setProducts([]));
    if (kind === 'custom' && customs === null) fetchCustomLabels().then((r) => setCustoms(r.data)).catch(() => setCustoms([]));
  }, [kind, products, customs]);
  // The types, brands and footers a tap's sheet picks from, read once the first sheet opens.
  useEffect(() => {
    if (quick === null || lists !== null) return;
    void (async () => {
      const [types, brands, footers] = await Promise.all([
        safe(() => fetchLabelTypes().then((r) => r.data.filter((t) => t.is_active)), [] as LabelType[]),
        safe(() => fetchLabelBrands().then((r) => r.data), [] as LabelBrand[]),
        safe(() => fetchLabelFooters().then((r) => r.data), [] as LabelFooter[]),
      ]);
      setLists({ types, brands, footers });
    })();
  }, [quick, lists]);

  const needle = query.trim().toLowerCase();
  const itemRows = (products ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.name_dv ?? '').includes(query.trim()));
  const customRows = (customs ?? []).filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.name_dv ?? '').includes(query.trim()));

  const pickItem = async (p: LabelProduct) => {
    let on = p.label_enabled;
    if (!on) {
      setSwitching(p.id);
      try {
        await updateItemLabel(p.id, { label_enabled: true });
        on = true;
        setProducts((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, label_enabled: true } : x)));
        toast('success', `${p.name} is now on labels.`);
      } catch {
        toast('error', `Could not switch ${p.name} on for labels.`);
      } finally {
        setSwitching(null);
      }
      if (!on) return;
    }
    setPicked({ kind: 'item', id: p.id, name: p.name, name_dv: p.name_dv, lang: p.name_dv ? 'both' : 'en' });
    setLang(p.name_dv ? 'both' : 'en');
    setStep(2);
  };
  const pickCustom = (c: CustomLabel) => {
    setPicked({ kind: 'custom', id: c.id, name: c.name, name_dv: c.name_dv, lang: langOf(c) });
    setLang(langOf(c));
    setStep(2);
  };

  // Step 2: the card picked, or a size of your own.
  const presetOf = (id: string) => presets.find((p) => p.id === id) ?? null;
  const remembered = useMemo(() => rememberedSize(), []);
  const cardPicked = !ownSize && choice.preset !== 'custom' ? choice.preset : null;
  const pickCard = (id: string) => {
    setOwnSize(false);
    setChoice((c) => withPreset(c, id, presets));
  };

  const sized = presets.length > 0 ? requestFor(choice, presets) : { layout: 'a4-4', w: null as number | null, h: null as number | null };
  const { w: stickerW, h: stickerH } = sizeOf(choice, presets);
  const sizeIssue = sizeProblem(choice, limits);
  const stock = presets.length > 0 ? stockOf(choice, presets) : null;
  const design = designFor(choice.shape, stickerW, stickerH);
  const round = choice.shape === 'circle';

  const request = (copiesWanted: number, forPreview: boolean) => ({
    items: [{ id: picked?.id ?? 0, copies: copiesWanted, kind: picked?.kind ?? 'item' }],
    lang, layout: sized.layout, w: sized.w, h: sized.h,
    rounded: choice.shape === 'rect' && rounded,
    fill, mfg: fill ? mfg : null, exp: null,
    qty: qty !== '' ? Number(qty) : null,
    batch: batch.trim() || null,
    for: packedFor.trim() || null,
    for2: packedFor2.trim() || null,
    preview: forPreview || undefined,
  });

  // Step 3: redraw the preview a little after the last change.
  const previewKey = JSON.stringify([step >= 3 ? request(1, true) : null, presets.length, redraw]);
  useEffect(() => {
    if (step < 3 || !picked || presets.length === 0) { setPreview(null); setPreviewBusy(false); return; }
    if (sizeIssue) { setPreviewError(sizeIssue); setPreviewBusy(false); return; }
    const seq = ++previewSeq.current;
    setPreviewBusy(true);
    const timer = setTimeout(async () => {
      try {
        const r = await stickerLinks(request(1, true));
        if (seq !== previewSeq.current) return;
        setPreview(r.one_url ?? r.url);
        setPreviewError(null);
        // A wrap label is touched by its strips in the editors; here the other designs' parts are the touch zones.
        setSpots(r.summary?.design === 'wrap' ? [] : (r.summary?.spots ?? []));
        setSpotBox(r.summary?.w && r.summary?.h ? { w: r.summary.w, h: r.summary.h } : null);
      } catch (e) {
        if (seq !== previewSeq.current) return;
        setPreviewError(e instanceof Error ? e.message : 'Could not draw the preview.');
      } finally {
        if (seq === previewSeq.current) setPreviewBusy(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [previewKey, sizeIssue, step, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 4: as many as fit a sheet to start with, one on a label printer.
  useEffect(() => {
    if (step === 4 && stock) setCopies(stock.on === 'printer' ? 1 : Math.max(1, stock.perPage));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const print = async (how: 'print' | 'pdf') => {
    if (!picked) return;
    setPrinting(how); setError(null);
    try {
      const r = await stickerLinks(request(copies, false));
      rememberSize(choice);
      setResult(r);
      if (how === 'print') openLabelSheet(r.url, r.pdf_url);
      else downloadLabelSheet(r.pdf_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the labels.');
    } finally {
      setPrinting(null);
    }
  };

  const startAgain = () => {
    setStep(1); setKind(null); setPicked(null); setResult(null); setError(null); setPreview(null); setOwnSize(false); setQuery('');
    setSpots([]); setQuick(null); setQuickDraft(null); setBatch(''); setPackedFor(''); setPackedFor2('');
  };

  const jump = (s: Step) => { setResult(null); setStep(s); };

  // Tap to edit (round 3, 2026-10-13): the sheet for the part tapped edits a
  // fresh draft of the product; Done saves only that sheet's boxes and the
  // preview redraws. The print's own values (the dates, the quantity, the
  // batch, who it is for) sit at the top of their sheets and save nothing.
  const pickedCustom = picked?.kind === 'custom' ? customs?.find((c) => c.id === picked.id) ?? null : null;
  const pickedItem = picked?.kind === 'item' ? products?.find((p) => p.id === picked.id) ?? null : null;
  const openQuick = (key: LabelSpotKey) => {
    if (!picked) return;
    const draft = pickedCustom ? customDraft(pickedCustom) : pickedItem ? itemDraft(pickedItem) : null;
    if (!draft) return;
    setQuickDraft(draft as unknown as Record<string, unknown>);
    setQuick(key);
  };
  const quickContext: QuickContext = {
    kind: picked?.kind === 'custom' ? 'custom' : 'item',
    types: lists?.types ?? [], brands: lists?.brands ?? [], footers: lists?.footers ?? [],
    mainBrand: lists?.brands.find((b) => b.is_default)?.name,
    defaults: pickedCustom?.defaults ?? pickedItem?.defaults,
    allergens: pickedItem?.allergens,
    menuPrice: pickedItem?.menu_price,
    nutritionWords: pickedItem?.nutrition ? nutritionWords(pickedItem.nutrition) : undefined,
    hasPhoto: Boolean(pickedCustom?.label_photo_url ?? pickedItem?.label_photo_url),
  };
  const wizardSpec = (key: LabelSpotKey): QuickSpec => {
    const spec = quickSpec(key, quickContext);
    const own: QuickInput[] = key === 'dates'
      ? [{ key: '_fill', label: 'Fill in the dates', kind: 'switch', hint: 'Off: blank boxes to write in by hand.' }, ...(fill ? [{ key: '_mfg', label: 'Made on', kind: 'date' as const }] : [])]
      : key === 'qty'
        ? [{ key: '_qty', label: 'Quantity on this print', kind: 'number', min: 1, inputMode: 'numeric', placeholder: 'Blank: the pack size below, else written by hand' }]
        : key === 'batch'
          ? [{ key: '_batch', label: 'Batch number', kind: 'text', maxLength: 30, placeholder: 'Blank: written by hand' }]
          : key === 'packed'
            ? [{ key: '_for', label: 'Packed for', kind: 'text', maxLength: 60, placeholder: 'NH Kuda Rah' }, { key: '_for2', label: 'Second line', kind: 'text', maxLength: 60, placeholder: 'The delivery, the date' }]
            : [];
    if (own.length === 0) return spec;
    const notes: Partial<Record<LabelSpotKey, string>> = { dates: 'The expiry follows from the shelf life.', batch: 'Printed on every label of this print.', packed: 'Who the packs are for, printed under the name of every label of this print.' };
    return { ...spec, note: notes[key] ?? spec.note, inputs: [...own, ...spec.inputs], link: key === 'batch' || key === 'packed' ? undefined : spec.link };
  };
  const quickValues: Record<string, unknown> = { ...(quickDraft ?? {}), _fill: fill, _mfg: mfg, _qty: qty, _batch: batch, _for: packedFor, _for2: packedFor2 };
  const quickChange = (k: string, v: QuickValue) => {
    const s = v == null ? '' : String(v);
    switch (k) {
      case '_fill': setFill(Boolean(v)); return;
      case '_mfg': setMfg(s); return;
      case '_qty': setQty(s); return;
      case '_batch': setBatch(s); return;
      case '_for': setPackedFor(s); return;
      case '_for2': setPackedFor2(s); return;
      default: setQuickDraft((d) => ({ ...(d ?? {}), [k]: v }));
    }
  };
  const saveQuick = async (body: Record<string, unknown>) => {
    if (!picked) return;
    setQuickSaving(true);
    try {
      if (picked.kind === 'custom') {
        const r = await updateCustomLabel(picked.id, body);
        setCustoms((list) => (list ?? []).map((x) => (x.id === r.data.id ? r.data : x)));
        setPicked({ kind: 'custom', id: r.data.id, name: r.data.name, name_dv: r.data.name_dv, lang: langOf(r.data) });
      } else {
        const r = await updateItemLabel(picked.id, body);
        setProducts((list) => (list ?? []).map((x) => (x.id === r.data.id ? r.data : x)));
      }
      setRedraw((n) => n + 1);
      setQuick(null);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setQuickSaving(false);
    }
  };
  const quickDone = () => {
    if (!quick) return;
    const keys = wizardSpec(quick).inputs.map((i) => i.key).filter((k) => !k.startsWith('_'));
    if (keys.length === 0 || !quickDraft) { setQuick(null); return; }
    const payload = picked?.kind === 'custom' ? customPayload(quickDraft as unknown as CustomDraft) : itemPayload(quickDraft as unknown as ItemDraft);
    void saveQuick(pickKeys(payload as Record<string, unknown>, keys));
  };
  const quickAction = (a: string) => {
    if (a === 'photo') { setQuick(null); setDetails(true); }
    if (a === 'remove_photo') void saveQuick({ label_photo_media_id: null });
  };

  const sizeLine = `${sizeName(choice.shape, stickerW, stickerH)} · ${DESIGN_NAMES[design]}${stock ? ` · ${stock.on === 'printer' ? 'one per label on a label printer' : `${stock.perPage} on ${stock.label}`}` : ''}`;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4 max-w-[760px]" data-testid="make-label">
      <StepHeader step={step} onJump={jump} />

      {step === 1 && (
        <div className="space-y-4" data-testid="make-step-1">
          <h2 className="text-lg font-bold text-[var(--color-text)]">What is the label for?</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ['item', 'A menu item', 'Anything on the menu: its name, ingredients and dates come along.', <UtensilsCrossed key="i" size={22} />],
              ['custom', 'Something else', 'A sauce, a gift pack, another brand: a label of its own.', <Tag key="c" size={22} />],
              ['box', 'A delivery box', 'The A4 label for a box, blank or from a wholesale delivery.', <Box key="b" size={22} />],
            ] as const).map(([k, name, blurb, icon]) => (
              <button key={k} type="button" onClick={() => (k === 'box' ? navigate('/labels/box') : setKind(k))} aria-pressed={kind === k}
                className={['text-left rounded-xl border p-3 min-h-[44px] space-y-1', kind === k ? 'border-[var(--color-primary)] bg-[var(--color-tone-rust-bg)]' : 'border-[var(--color-border)] bg-[var(--color-bg)]'].join(' ')}>
                <span className="inline-flex items-center gap-2 font-bold text-[var(--color-text)]"><span className="text-[var(--color-primary)]">{icon}</span>{name}</span>
                <span className="block text-xs text-[var(--color-text-muted)]">{blurb}</span>
              </button>
            ))}
          </div>

          {kind && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={kind === 'item' ? 'Find a menu item' : 'Find a custom label'} aria-label={kind === 'item' ? 'Find a menu item' : 'Find a custom label'} className={`${fieldClass} pl-9`} />
                </div>
                {kind === 'custom' && <Button size="sm" icon={<Plus size={16} />} onClick={() => setNewCustom(true)} data-testid="make-new-custom">New custom label</Button>}
              </div>
              <ul className="divide-y divide-[var(--color-border-light)] rounded-xl border border-[var(--color-border)] max-h-[360px] overflow-y-auto" data-testid="make-products">
                {kind === 'item' && products === null && <li className="px-3 py-3 text-sm text-[var(--color-text-muted)]">Loading…</li>}
                {kind === 'custom' && customs === null && <li className="px-3 py-3 text-sm text-[var(--color-text-muted)]">Loading…</li>}
                {kind === 'item' && products !== null && itemRows.length === 0 && <li className="px-3 py-3 text-sm text-[var(--color-text-muted)]">No menu item matches.</li>}
                {kind === 'custom' && customs !== null && customRows.length === 0 && <li className="px-3 py-3 text-sm text-[var(--color-text-muted)]">No custom labels yet. Press New custom label to make one.</li>}
                {kind === 'item' && itemRows.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => void pickItem(p)} disabled={switching !== null} className="w-full text-left px-3 py-2 min-h-[44px] flex items-center gap-3 hover:bg-[var(--color-bg)]">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[var(--color-text)]">{p.name}{p.name_dv ? <span dir="rtl" className="ml-2 font-normal text-[var(--color-text-muted)]">{p.name_dv}</span> : null}</span>
                        <span className="block text-xs text-[var(--color-text-muted)]">{p.label_enabled ? 'On labels' : switching === p.id ? 'Switching on…' : 'Not on labels yet: picking it switches it on'}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {kind === 'custom' && customRows.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pickCustom(c)} className="w-full text-left px-3 py-2 min-h-[44px] flex items-center gap-3 hover:bg-[var(--color-bg)]">
                      {c.brand_logo_url && <img src={c.brand_logo_url} alt="" className="w-8 h-8 object-contain rounded" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[var(--color-text)]">{c.name}{c.name_dv ? <span dir="rtl" className="ml-2 font-normal text-[var(--color-text-muted)]">{c.name_dv}</span> : null}</span>
                        <span className="block text-xs text-[var(--color-text-muted)]">{c.brand_name}{c.label_type_name ? ` · ${c.label_type_name}` : ''}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {step === 2 && picked && (
        <div className="space-y-4" data-testid="make-step-2">
          <h2 className="text-lg font-bold text-[var(--color-text)]">Which label for {picked.name}?</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3" role="group" aria-label="Which label">
            {LABEL_CARDS.map((card) => {
              const p = presetOf(card.preset);
              const on = cardPicked === card.preset;
              const was = remembered?.preset === card.preset;
              return (
                <button key={card.preset} type="button" onClick={() => pickCard(card.preset)} aria-pressed={on} disabled={!p}
                  className={['text-left rounded-xl border p-3 flex flex-col items-center gap-2', on ? 'border-[var(--color-primary)] bg-[var(--color-tone-rust-bg)]' : 'border-[var(--color-border)] bg-[var(--color-bg)]'].join(' ')}>
                  {p ? <LabelSchematic preset={p} /> : <LabelSchematic shape={card.preset.startsWith('c') ? 'circle' : 'rect'} />}
                  <span className="block w-full">
                    <span className="block text-sm font-bold text-[var(--color-text)]">{card.name}{was ? <span className="ml-1 text-[10px] font-semibold text-[var(--color-tone-rust-text)]">last used</span> : null}</span>
                    <span className="block text-xs text-[var(--color-text-muted)]">{card.blurb}</span>
                    {p && <span className="block text-[11px] text-[var(--color-text-muted)] mt-1">{p.shape === 'circle' ? `Ø ${p.w} mm` : `${p.w} × ${p.h} mm`}</span>}
                  </span>
                </button>
              );
            })}
            <button type="button" onClick={() => { setOwnSize(true); setChoice((c) => (c.preset === 'custom' ? c : { ...c, preset: 'custom' })); }} aria-pressed={ownSize}
              className={['text-left rounded-xl border p-3 flex flex-col items-center gap-2', ownSize ? 'border-[var(--color-primary)] bg-[var(--color-tone-rust-bg)]' : 'border-dashed border-[var(--color-border)] bg-[var(--color-bg)]'].join(' ')}>
              <span className="w-[88px] h-[88px] inline-flex items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]"><Pencil size={22} /></span>
              <span className="block w-full">
                <span className="block text-sm font-bold text-[var(--color-text)]">My own size</span>
                <span className="block text-xs text-[var(--color-text-muted)]">Any shape and size, typed in.</span>
              </span>
            </button>
          </div>
          {ownSize && (
            <div className="rounded-xl border border-[var(--color-border)] p-3" data-testid="make-own-size">
              <LabelSizePicker presets={presets} limits={limits} choice={choice} onChange={setChoice} rounded={rounded} onRounded={setRounded} />
            </div>
          )}
          <p className="text-xs text-[var(--color-text-muted)]" data-testid="make-size-line">{sizeLine}.</p>
          <div className="flex flex-wrap gap-2 justify-between">
            <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => jump(1)}>Back</Button>
            <Button onClick={() => setStep(3)} disabled={Boolean(sizeIssue) || (!cardPicked && !ownSize)} data-testid="make-next-2">Next: see it</Button>
          </div>
        </div>
      )}

      {step === 3 && picked && (
        <div className="space-y-4" data-testid="make-step-3">
          <h2 className="text-lg font-bold text-[var(--color-text)]">Does it look right?</h2>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
              <div className={round ? 'max-w-[360px] mx-auto' : design === 'wrap' ? 'w-full' : 'max-w-[420px] mx-auto'}>
                <SheetPreview url={preview} ratio={stickerW / stickerH} busy={previewBusy} round={round} title="The label" empty={previewError ?? 'Drawing…'}
                  overlay={spots.length > 0 ? <SpotOverlay spots={spots} w={spotBox?.w ?? stickerW} h={spotBox?.h ?? stickerH} onPick={openQuick} /> : null} />
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-2 text-center" data-testid="make-preview-line">{spots.length > 0 ? 'Tap a part of the label to change it. ' : ''}{sizeName(choice.shape, stickerW, stickerH)} · {DESIGN_NAMES[design]}. <button type="button" className="underline" onClick={() => jump(2)}>Change the label</button></p>
            </div>
            <div className="space-y-3">
              <div>
                <span className={labelClass}>Language</span>
                <TabScrollRow role="group" aria-label="Language" style={{ gap: 8 }}>
                  {(['en', 'dv', 'both'] as const).map((l) => (
                    <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={chip(lang === l)}>{l === 'en' ? 'English' : l === 'dv' ? 'Dhivehi' : 'Both'}</button>
                  ))}
                </TabScrollRow>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--color-text)] min-h-[44px]">
                <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} data-testid="make-fill-dates" />
                <span>Fill in the dates<span className="block text-xs text-[var(--color-text-muted)]">Off: blank boxes to write in by hand.</span></span>
              </label>
              {fill && (
                <div>
                  <label className={labelClass} htmlFor="make-mfg">Made on</label>
                  <input id="make-mfg" type="date" value={mfg} onChange={(e) => setMfg(e.target.value)} className={fieldClass} />
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">The expiry follows from its shelf life.</p>
                </div>
              )}
              <div>
                <label className={labelClass} htmlFor="make-qty">Quantity per pack</label>
                <input id="make-qty" type="number" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Blank: write by hand" className={fieldClass} />
              </div>
              <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setDetails(true)} data-testid="make-details">All details</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-between">
            <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => jump(2)}>Back</Button>
            <Button onClick={() => setStep(4)} data-testid="make-next-3">Next: how many</Button>
          </div>
        </div>
      )}

      {step === 4 && picked && (
        <div className="space-y-4" data-testid="make-step-4">
          <h2 className="text-lg font-bold text-[var(--color-text)]">How many, and print</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={labelClass}>Print on</span>
              <TabScrollRow role="group" aria-label="Print on" style={{ gap: 8 }}>
                {stocksFor(choice, presets).map((s) => (
                  <button key={s.on} type="button" onClick={() => { setChoice((c) => ({ ...c, on: s.on })); setCopies(s.on === 'printer' ? 1 : Math.max(1, s.perPage)); }} aria-pressed={stock?.on === s.on} className={chip(stock?.on === s.on)}>
                    {s.label}{s.on !== 'printer' && s.perPage > 0 ? <span className="font-normal opacity-80">· {s.perPage}</span> : null}
                  </button>
                ))}
              </TabScrollRow>
            </div>
            <div>
              <span className={labelClass}>Labels</span>
              <QtyStepper value={copies} onChange={setCopies} min={1} max={500} label="Labels" />
              {stock && stock.on !== 'printer' && stock.perPage > 0 && <p className="text-xs text-[var(--color-text-muted)] mt-1">{Math.ceil(copies / stock.perPage)} {Math.ceil(copies / stock.perPage) === 1 ? 'sheet' : 'sheets'} of {stock.perPage}.</p>}
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{picked.name} · {sizeLine}.</p>
          {error && <p role="alert" className="text-sm text-[var(--color-danger-strong)]">{error}</p>}
          {result ? (
            <div className="rounded-xl border border-[var(--color-tone-rust-border)] bg-[var(--color-tone-rust-bg)] p-3 space-y-2" data-testid="make-done">
              <p className="text-sm font-semibold text-[var(--color-text)]"><Check size={14} className="inline mr-1" />{result.job ? `Saved as "${result.job.name}" under Saved labels.` : 'Ready.'} {copies} {copies === 1 ? 'label' : 'labels'} prepared.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={<Printer size={14} />} onClick={() => openLabelSheet(result.url, result.pdf_url)}>Print again</Button>
                <Button size="sm" variant="secondary" icon={<FileDown size={14} />} onClick={() => downloadLabelSheet(result.pdf_url)}>Download PDF</Button>
                <Button size="sm" variant="ghost" onClick={startAgain} data-testid="make-again">Make another label</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 justify-between">
              <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => jump(3)}>Back</Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={<FileDown size={16} />} loading={printing === 'pdf'} disabled={printing !== null} onClick={() => void print('pdf')} data-testid="make-pdf">PDF</Button>
                <Button icon={<Printer size={16} />} loading={printing === 'print'} disabled={printing !== null} onClick={() => void print('print')} data-testid="make-print">Print</Button>
              </div>
            </div>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">On a phone, print the PDF. Every print is kept under Saved labels to print again.</p>
        </div>
      )}

      {quick && (
        <QuickEditSheet
          spec={wizardSpec(quick)}
          values={quickValues}
          onChange={quickChange}
          onAction={quickAction}
          onDone={quickDone}
          onAll={() => { setQuick(null); setDetails(true); }}
          saving={quickSaving}
          idPrefix="make-quick"
        />
      )}
      {newCustom && (
        <CustomLabelModal label={null} onClose={() => setNewCustom(false)} onSaved={(c) => { setNewCustom(false); setCustoms((list) => [c, ...(list ?? []).filter((x) => x.id !== c.id)]); pickCustom(c); }} />
      )}
      {details && picked?.kind === 'custom' && customs && (
        <CustomLabelModal label={customs.find((c) => c.id === picked.id) ?? null} onClose={() => { setDetails(false); setRedraw((n) => n + 1); }} onSaved={(c) => { setCustoms((list) => (list ?? []).map((x) => (x.id === c.id ? c : x))); setPicked({ kind: 'custom', id: c.id, name: c.name, name_dv: c.name_dv, lang: langOf(c) }); }} />
      )}
      {details && picked?.kind === 'item' && (
        <Modal title={`${picked.name}: label details`} onClose={() => { setDetails(false); setRedraw((n) => n + 1); }} maxWidth={900}>
          <ItemLabelTab itemId={picked.id} />
        </Modal>
      )}
    </div>
  );
}
