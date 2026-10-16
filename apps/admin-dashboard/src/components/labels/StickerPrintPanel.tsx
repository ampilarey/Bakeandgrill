import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Printer, FileDown, AlertTriangle, Search, Bookmark, Eye, Plus, History, CalendarDays, ChevronDown, ChevronUp, Star, Clock, Send, Image as ImageIcon, ListPlus, RotateCcw } from 'lucide-react';
import {
  downloadLabelSheet, fetchCateringStickers, fetchCustomLabels, fetchDeliveryStickers, fetchLabelFooters, fetchLabelJob, fetchLabelJobs, fetchLabelLayouts, fetchLabelPrint, fetchLabelProducts, fetchLabelTypes, openLabelSheet, printLabelJob, printsViaPdf, readPrinterSetup, renameLabelJob, sendToLabelPrinter, stickerLinks,
  MOCK_SURFACE_NAMES, type CustomLabel, type MockSurface, type LabelFooter, type LabelJob, type LabelLimits, type LabelPreset, type LabelPrintLookup, type LabelProduct, type LabelRoll, type LabelType, type PromoKind, type SheetLinks, type StickerLang, type StickerRun, type StickerSummary,
} from '../../api';
import { useCurrentUserPermissions } from '../../hooks/usePermissions';
import { useIsBelowDesktop } from '../../hooks/useIsMobile';
import { Button } from '../ui';
import { TabScrollRow } from '../SharedUI';
import { QtyStepper } from './QtyStepper';
import { SheetPreview } from './SheetPreview';
import { PhonePreviewBar } from './PhonePreviewBar';
import { InlineRename } from './InlineRename';
import { LabelSizePicker } from './LabelSizePicker';
import { CustomLabelModal } from './CustomLabels';
import { FooterPicker } from './FooterPicker';
import { FoldHelp } from './FoldHelp';
import { ChooseItemsModal } from './ChooseItemsModal';
import { ReprintScan } from './ReprintScan';
import { pairedPrinter, printOverBluetooth } from './bluetoothPrinter';
import { DEFAULT_CHOICE, choiceFromRequest, pageOf, rememberSize, rememberedSize, requestFor, rollMatches, rollName, rollStock, rollStockWords, sizeName, sizeOf, sizeProblem, stockOf, type SizeChoice } from './labelSize';

/*
 * Print labels: pick products, how many, the language, the label size and
 * what goes in the date boxes; the server checks it, says what will print,
 * and hands back a print link and a PDF link (good for 30 minutes).
 * Used by Labels → Print labels and by "Print stickers" on a production line.
 * A product is a menu item or a custom label (owner, 2026-10-11: "Not only
 * from the menu list"), keyed "i12" and "c5" so the two never mix up.
 */

type Props = {
  /** Products fixed by the caller (a production line); hides the chooser. */
  fixedItems?: { id: number; name: string }[];
  /** A production line: its batch, expiry and quantity fill the boxes. */
  productionItemId?: number | null;
  defaults?: { batch?: string; exp?: string | null; mfg?: string | null; qty?: number | null; fill?: boolean };
};

type Row = { key: string; kind: 'item' | 'custom'; id: number; name: string; name_dv: string | null; shelf: number | null; ingredients: 'recipe' | 'manual' | 'none'; brand?: string; sizes?: { id: number; name: string; price: number }[] };

const today = () => new Date().toISOString().slice(0, 10);
/** A batch code from today's date, 261011 for 11 Oct 2026: one tap instead of typing. */
const todayCode = () => today().slice(2).replace(/-/g, '');
/** Made-on date + shelf life, as the server prints it (YYYY-MM-DD). */
function expiryFrom(mfg: string, days: number | null): string | null {
  if (!days || !/^\d{4}-\d{2}-\d{2}$/.test(mfg)) return null;
  const d = new Date(`${mfg}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const LAST_LAYOUT_KEY = 'labels.lastLayout';
function rememberedLayout(): string | null {
  try { return localStorage.getItem(LAST_LAYOUT_KEY); } catch { return null; }
}

const keyOf = (kind: 'item' | 'custom', id: number) => `${kind === 'custom' ? 'c' : 'i'}${id}`;
/** The promotion flashes offered as one pick (2026-10-12); the words are what prints, "custom" takes typed words. */
export const PROMO_PRESETS: [string, string][] = [
  ['', 'No flash'], ['was_now', 'Was → Now prices'], ['2 FOR 1', '2 for 1'], ['BUY 2 GET 1 FREE', 'Buy 2 get 1 free'],
  ['SPECIAL OFFER', 'Special offer'], ['HALF PRICE', 'Half price'], ['NEW', 'New'], ['FRESH TODAY', 'Fresh today'], ['custom', 'Other words…'],
];
/** A shelf life this short is easy to print with the wrong dates (2026-10-12): the list marks it. */
const SHORT_LIFE_DAYS = 3;
const LANG_NAMES: Record<StickerLang, string> = { en: 'English', dv: 'ދިވެހި', both: 'Both' };
const parseKey = (key: string): { kind: 'item' | 'custom'; id: number } => ({ kind: key.startsWith('c') ? 'custom' : 'item', id: Number(key.slice(1)) });

/*
 * A variable run (round 10, 2026-10-13: "one label per line of a catering
 * order or wholesale delivery, each with its own name, date and batch,
 * printed in one go"): a picked row may carry its own batch, quantity,
 * made-on and expiry dates and packed-for lines, printed on that product's
 * stickers instead of the sheet's; an empty box falls back to the sheet's.
 */
type RowRun = { batch: string; qty: string; mfg: string; exp: string; for: string; for2: string };
const RUN_KEYS = ['batch', 'qty', 'mfg', 'exp', 'for', 'for2'] as const;
const EMPTY_RUN: RowRun = { batch: '', qty: '', mfg: '', exp: '', for: '', for2: '' };
const hasRun = (run: RowRun | undefined): boolean => Boolean(run) && RUN_KEYS.some((k) => run![k].trim() !== '');
const runFrom = (row: StickerRun): RowRun => ({ batch: row.batch ?? '', qty: row.qty != null ? String(row.qty) : '', mfg: row.mfg ?? '', exp: row.exp ?? '', for: row.for ?? '', for2: row.for2 ?? '' });
/** What a row sends: only the boxes with something in them; the dates only when they are filled in. */
function runPayload(run: RowRun | undefined, fill: boolean): StickerRun {
  if (!run) return {};
  const out: StickerRun = {};
  if (run.batch.trim()) out.batch = run.batch.trim();
  if (run.qty.trim()) out.qty = Number(run.qty);
  if (fill && run.mfg) out.mfg = run.mfg;
  if (fill && run.exp) out.exp = run.exp;
  if (run.for.trim()) out.for = run.for.trim();
  if (run.for2.trim()) out.for2 = run.for2.trim();
  return out;
}

/*
 * Scan to reprint (round 11, 2026-10-13): ?code=CODE, from the QR on a pack's
 * sticker, opens the form on the very label that printed it, with the pack's
 * details named above the form; the new print is logged as a reprint of it.
 */
const whenPrinted = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
/** "Bajiya · 2 stickers · 40 × 60 mm, 21 on A4 · batch A1 · 6 per pack · made 2026-10-10 · use by 2027-01-08 · for NH Kuda Rah". */
export function reprintLine(r: LabelPrintLookup): string {
  return [
    r.product?.name ?? 'a product no longer on the list',
    `${r.copies} ${r.copies === 1 ? 'sticker' : 'stickers'}`,
    r.stock,
    r.batch_code ? `batch ${r.batch_code}` : null,
    r.pack_qty ? `${r.pack_qty} per pack` : null,
    r.mfg_date ? `made ${r.mfg_date}` : null,
    r.exp_date ? `use by ${r.exp_date}` : null,
    r.for ? `for ${r.for}` : null,
  ].filter(Boolean).join(' · ');
}

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

function chipClass(on: boolean) {
  return [
    'h-8 px-3 rounded-full border text-sm font-semibold whitespace-nowrap',
    on ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]',
  ].join(' ');
}

export function StickerPrintPanel({ fixedItems, productionItemId = null, defaults }: Props) {
  const { can } = useCurrentUserPermissions();
  const navigate = useNavigate();
  // Below the desktop band the preview is a bar pinned under the header, not a column.
  const stacked = useIsBelowDesktop();
  const [products, setProducts] = useState<LabelProduct[]>([]);
  const [customs, setCustoms] = useState<CustomLabel[]>([]);
  const [presets, setPresets] = useState<LabelPreset[]>([]);
  const [limits, setLimits] = useState<LabelLimits | null>(null);
  // The rolls and sheets the business owns (round 6): the size picker shows them first.
  const [rolls, setRolls] = useState<LabelRoll[]>([]);
  const [fixedPages, setFixedPages] = useState<Record<string, { w: number; h: number }>>({});
  const [types, setTypes] = useState<LabelType[]>([]);
  const [asType, setAsType] = useState<number | null>(null);
  // One footer for the whole sheet (owner, 2026-10-12: "No easy option to
  // select and edit branding footer"); empty means each product's own.
  const [footers, setFooters] = useState<LabelFooter[]>([]);
  const [footer, setFooter] = useState<number | null>(null);
  // A footer changed from the pencil prints differently without the request changing: counted into the preview key.
  const [footersTick, setFootersTick] = useState(0);
  // Packed for and a promotion flash (2026-10-12), behind More options.
  const [packedFor, setPackedFor] = useState('');
  const [packedFor2, setPackedFor2] = useState('');
  const [promoPreset, setPromoPreset] = useState('');
  const [promoWas, setPromoWas] = useState('');
  const [promoNow, setPromoNow] = useState('');
  const [promoText, setPromoText] = useState('');
  const promoKind: PromoKind = promoPreset === '' ? '' : promoPreset === 'was_now' ? 'was_now' : 'text';
  const promoWords = promoPreset === 'custom' ? promoText : promoPreset;
  // Round C: "Pack 3 of 40" on each copy, and a print-ready sheet (crop marks, a bleed) for a print shop.
  const [numbered, setNumbered] = useState(false);
  const [marks, setMarks] = useState(false);
  const [bleed, setBleed] = useState('0');
  // Straight to a label printer through the print agent on this computer (Labels → Settings → Label printer).
  const printer = readPrinterSetup();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  // A variable run (round 10, 2026-10-13): a row's own batch, quantity, dates and packed-for, printed instead of the sheet's.
  const [runs, setRuns] = useState<Record<string, RowRun>>({});
  // The size a sized item's stickers are for (label audit, 2026-10-16): its price and recipe follow it.
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [lang, setLang] = useState<StickerLang>('en');
  const [choice, setChoice] = useState<SizeChoice>(() => rememberedSize() ?? DEFAULT_CHOICE);
  const [rounded, setRounded] = useState(false);
  const [fill, setFill] = useState(defaults?.fill ?? Boolean(productionItemId));
  const [mfg, setMfg] = useState(defaults?.mfg ?? today());
  const [exp, setExp] = useState(defaults?.exp ?? '');
  const [batch, setBatch] = useState(defaults?.batch ?? '');
  const [qty, setQty] = useState(defaults?.qty ? String(defaults.qty) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(SheetLinks & { summary: StickerSummary }) | null>(null);
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<'all' | 'item' | 'custom'>('all');
  const [newCustom, setNewCustom] = useState(false);
  const summaryRef = useRef<HTMLElement>(null);
  // The live preview (owner, 2026-10-05: "There is no preview in labels"):
  // one sticker or the first page, redrawn as the form changes.
  const [previewMode, setPreviewMode] = useState<'one' | 'sheet' | 'mock'>('one');
  // The mock-up preview (round 14): the sticker on a jar, bottle, box or lid; null takes the likeliest.
  const [mockSurface, setMockSurface] = useState<MockSurface | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ one: string | null; sheet: string; mocks: Partial<Record<MockSurface, string>>; summary: StickerSummary } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);
  // v2 point 10: ?job=ID opens a saved label back in this form; ?custom=ID picks a custom label.
  const [params] = useSearchParams();
  const jobParam = fixedItems ? null : params.get('job');
  const customParam = fixedItems ? null : params.get('custom');
  // Expiring printed stock's Reprint (2026-10-12): ?item=ID picks that menu item.
  const itemParam = fixedItems ? null : params.get('item');
  // Packed-for stickers (2026-10-12): ?delivery=ID or ?catering=ID fills the
  // products, how many of each, and who the packs are for.
  const deliveryParam = fixedItems ? null : params.get('delivery');
  const cateringParam = fixedItems ? null : params.get('catering');
  // Scan to reprint (round 11): ?code=CODE opens the label that printed that pack.
  const codeParam = fixedItems ? null : params.get('code');
  const [reprint, setReprint] = useState<LabelPrintLookup | null>(null);
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [savedSize, setSavedSize] = useState<{ layout: string; w: number | null; h: number | null } | null>(null);
  // Print again: the last few saved sticker labels, one tap each (a cook
  // prints the same sheet most days). Not on a production line's pop-up.
  const [recent, setRecent] = useState<LabelJob[]>([]);
  const [recentBusy, setRecentBusy] = useState<number | null>(null);
  // Print as, batch and quantity fold away until wanted: the form was a long scroll on a phone.
  const [moreOpen, setMoreOpen] = useState(() => Boolean(defaults?.batch || defaults?.qty));
  // Choose which items get labels, from the empty list (round 5, 2026-10-13).
  const [choosing, setChoosing] = useState(false);
  const reloadProducts = () => fetchLabelProducts().then((r) => setProducts(r.data)).catch(() => setProducts([]));
  // The fixed items by id: a caller passing a new array on each render must not refetch or reset the counts.
  const fixedKey = fixedItems ? fixedItems.map((i) => i.id).join(',') : null;

  useEffect(() => {
    fetchLabelLayouts().then((r) => {
      setPresets(r.presets ?? []);
      setLimits(r.limits ?? null);
      setRolls(r.rolls ?? []);
      setFixedPages(Object.fromEntries((r.data ?? []).map((l) => [l.key, { w: l.page_w, h: l.page_h }])));
    }).catch(() => setPresets([]));
    fetchLabelTypes().then((r) => setTypes(r.data.filter((t) => t.is_active))).catch(() => setTypes([]));
    fetchLabelFooters().then((r) => setFooters(r.data)).catch(() => setFooters([]));
    if (fixedKey === null) {
      fetchLabelProducts().then((r) => setProducts(r.data)).catch(() => setProducts([]));
      fetchCustomLabels().then((r) => setCustoms(r.data)).catch(() => setCustoms([]));
      // Pinned labels lead (the server puts them first), then the last printed.
      fetchLabelJobs({ page: 1, kind: 'stickers' }).then((r) => setRecent(r.data.filter((j) => j.pinned || j.print_count > 0).slice(0, 4))).catch(() => setRecent([]));
    }
  }, [fixedKey]);

  const printAgain = async (j: LabelJob) => {
    setRecentBusy(j.id);
    try {
      const r = await printLabelJob(j.id);
      openLabelSheet(r.url, r.pdf_url);
      setRecent((s) => s.map((x) => (x.id === j.id ? { ...x, print_count: x.print_count + 1 } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not print it.');
    } finally {
      setRecentBusy(null);
    }
  };

  // An older remembered stock (a layout key) maps onto the picker once the presets are in.
  useEffect(() => {
    if (presets.length === 0 || rememberedSize()) return;
    const legacy = rememberedLayout();
    const mapped = legacy ? choiceFromRequest(legacy, null, null, presets) : null;
    if (mapped) setChoice(mapped);
  }, [presets]);

  /** Fill the form from a request as it was sent: a saved label's (?job=) or a scanned pack's (?code=). */
  const applyRequest = (q: Record<string, unknown>) => {
    const items = Array.isArray(q.items) ? (q.items as ({ id: number; copies: number; kind?: string } & StickerRun)[]) : [];
    setPicked(Object.fromEntries(items.map((i) => [keyOf(i.kind === 'custom' ? 'custom' : 'item', Number(i.id)), Number(i.copies)])));
    setRuns(Object.fromEntries(items.filter((i) => RUN_KEYS.some((k) => i[k] != null && i[k] !== '')).map((i) => [keyOf(i.kind === 'custom' ? 'custom' : 'item', Number(i.id)), runFrom(i)])));
    setSizes(Object.fromEntries(items.filter((i) => i.size).map((i) => [keyOf('item', Number(i.id)), Number(i.size)])));
    if (q.lang === 'dv' || q.lang === 'en' || q.lang === 'both') setLang(q.lang);
    setSavedSize({ layout: typeof q.layout === 'string' ? q.layout : 'a4-4', w: q.w != null ? Number(q.w) : null, h: q.h != null ? Number(q.h) : null });
    setFill(Boolean(q.fill));
    if (typeof q.mfg === 'string' && q.mfg) setMfg(q.mfg);
    setExp(typeof q.exp === 'string' ? q.exp : '');
    setBatch(typeof q.batch === 'string' ? q.batch : '');
    setQty(q.qty != null && q.qty !== '' ? String(q.qty) : '');
    setAsType(q.type ? Number(q.type) : null);
    setFooter(q.footer ? Number(q.footer) : null);
    setRounded(Boolean(q.rounded));
    setPackedFor(typeof q.for === 'string' ? q.for : '');
    setPackedFor2(typeof q.for2 === 'string' ? q.for2 : '');
    if (q.promo === 'was_now') {
      setPromoPreset('was_now');
      setPromoWas(q.promo_was != null && q.promo_was !== '' ? String(q.promo_was) : '');
      setPromoNow(q.promo_now != null && q.promo_now !== '' ? String(q.promo_now) : '');
    } else if (q.promo === 'text' && typeof q.promo_text === 'string') {
      const words = q.promo_text.toUpperCase();
      setPromoPreset(PROMO_PRESETS.some(([v]) => v === words) ? words : 'custom');
      setPromoText(q.promo_text);
    } else {
      setPromoPreset('');
    }
    setNumbered(Boolean(q.number));
    setMarks(Boolean(q.marks));
    setBleed(q.bleed != null && q.bleed !== '' && Number(q.bleed) > 0 ? String(q.bleed) : '0');
    if (q.type || q.footer || q.batch || q.qty || q.for || q.promo || q.number || q.marks) setMoreOpen(true);
  };

  useEffect(() => {
    if (!jobParam) return;
    fetchLabelJob(Number(jobParam)).then((r) => {
      applyRequest(r.data.request as Record<string, unknown>);
      setEditing({ id: r.data.id, name: r.data.name });
    }).catch(() => setError('That saved label could not be opened.'));
  }, [jobParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scan to reprint (round 11): the pack's print, with the request that made it.
  useEffect(() => {
    if (!codeParam) return;
    fetchLabelPrint(codeParam).then((r) => {
      if (!r.data.request) {
        setReprint(null);
        setError(`Pack ${r.data.code} is of a product that is no longer on the list, so its sticker cannot be printed again.`);
        return;
      }
      applyRequest(r.data.request);
      setReprint(r.data);
      setError(null);
    }).catch((e) => setError(e instanceof Error && e.message ? e.message : `No pack has the code ${codeParam.toUpperCase()}.`));
  }, [codeParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // A saved label's size, once the presets are known.
  useEffect(() => {
    if (!savedSize || presets.length === 0) return;
    const mapped = choiceFromRequest(savedSize.layout, savedSize.w, savedSize.h, presets);
    if (mapped) setChoice(mapped);
    setSavedSize(null);
  }, [savedSize, presets]);

  const rename = async (job: { id: number; name: string }, name: string) => {
    try {
      const r = await renameLabelJob(job.id, name);
      setEditing((e) => (e && e.id === job.id ? { ...e, name: r.data.name } : e));
      setResult((s) => (s && s.job?.id === job.id ? { ...s, job: { id: job.id, name: r.data.name } } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename it.');
    }
  };

  const stock = stockOf(choice, presets);
  // How many go on a page (what − and + step by); nothing is counted before the sizes load.
  const perPage = presets.length > 0 ? Math.max(1, stock.perPage || 1) : 1;
  const sized = presets.length > 0 ? requestFor(choice, presets) : { layout: 'a4-4', w: null, h: null };
  const sizeIssue = sizeProblem(choice, limits);

  // A production line prints for its own item, one sheet to start with (and a sheet again when the size changes).
  useEffect(() => {
    if (fixedKey !== null && presets.length > 0) setPicked(Object.fromEntries((fixedKey ? fixedKey.split(',') : []).map((id) => [keyOf('item', Number(id)), perPage])));
  }, [fixedKey, perPage, presets.length]);

  // ?custom=ID from Labels → Custom labels: that label, one sheet.
  useEffect(() => {
    if (!customParam || customs.length === 0 || presets.length === 0) return;
    const key = keyOf('custom', Number(customParam));
    if (customs.some((c) => keyOf('custom', c.id) === key)) setPicked((p) => (p[key] ? p : { ...p, [key]: perPage }));
  }, [customParam, customs, presets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!itemParam || products.length === 0 || presets.length === 0) return;
    const key = keyOf('item', Number(itemParam));
    if (products.some((p) => keyOf('item', p.id) === key)) setPicked((p) => (p[key] ? p : { ...p, [key]: perPage }));
  }, [itemParam, products, presets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if ((!deliveryParam && !cateringParam) || products.length === 0 || presets.length === 0) return;
    const load = deliveryParam ? fetchDeliveryStickers(Number(deliveryParam)) : fetchCateringStickers(Number(cateringParam));
    load.then((r) => {
      const known = r.data.items.filter((i) => i.label_enabled && products.some((p) => p.id === i.id));
      setPicked(Object.fromEntries(known.map((i) => [keyOf('item', i.id), Math.max(1, i.copies)])));
      setPackedFor(r.data.for);
      setPackedFor2(r.data.for2);
      setMoreOpen(true);
      const left = r.data.items.filter((i) => !known.some((k) => k.id === i.id)).map((i) => i.name);
      setError(left.length ? `${left.join(', ')} ${left.length === 1 ? 'is' : 'are'} not on labels yet: switch ${left.length === 1 ? 'it' : 'them'} on under Settings to print stickers for ${left.length === 1 ? 'it' : 'them'}.` : null);
    }).catch(() => setError('That delivery or event could not be opened.'));
  }, [deliveryParam, cateringParam, products, presets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // The custom label editor's Print… carries the size and language it was
  // previewed at (owner, 2026-10-12), so this form opens on the same sticker.
  const sizeParam = customParam ? params.get('layout') : null;
  useEffect(() => {
    if (!customParam) return;
    const l = params.get('lang');
    if (l === 'en' || l === 'dv' || l === 'both') setLang(l);
    if (params.get('rounded') === '1') setRounded(true);
    if (sizeParam) setSavedSize({ layout: sizeParam, w: params.get('w') ? Number(params.get('w')) : null, h: params.get('h') ? Number(params.get('h')) : null });
  }, [customParam, sizeParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows: Row[] = useMemo(() => [
    ...products.map((p): Row => ({ key: keyOf('item', p.id), kind: 'item', id: p.id, name: p.name, name_dv: p.name_dv, shelf: p.label_shelf_life_days, ingredients: p.ingredients.from, sizes: p.sizes ?? [] })),
    ...customs.map((c): Row => ({ key: keyOf('custom', c.id), kind: 'custom', id: c.id, name: c.name, name_dv: c.name_dv, shelf: c.label_shelf_life_days ?? c.defaults.shelf_life_days, ingredients: c.ingredients.from, brand: c.brand_name })),
  ], [products, customs]);
  const items = useMemo(() => Object.entries(picked).filter(([, n]) => n > 0).map(([key, copies]) => ({ key, ...parseKey(key), copies })), [picked]);
  const total = items.reduce((s, i) => s + i.copies, 0);
  // Label stock (round 13): the roll this size is, what it has left, and what this print takes off it (labels, or sheets of a sheet stock).
  const onRoll = presets.length > 0 ? rolls.find((r) => rollMatches(r, choice, presets)) ?? null : null;
  const onRollStock = onRoll ? rollStock(onRoll) : null;
  const rollTakes = onRollStock ? (onRollStock.unit === 'labels' ? total : Math.ceil(total / Math.max(1, perPage))) : 0;

  const needle = query.trim().toLowerCase();
  const shown = rows.filter((r) => (show === 'all' || r.kind === show) && (!needle || picked[r.key] || r.name.toLowerCase().includes(needle) || (r.name_dv ?? '').includes(query.trim())));

  const toggle = (key: string) => setPicked((p) => (p[key] ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== key)) : { ...p, [key]: perPage }));
  const setRun = (key: string, k: keyof RowRun, v: string) => setRuns((s) => ({ ...s, [key]: { ...(s[key] ?? EMPTY_RUN), [k]: v } }));
  /** A row's expiry as it will print: its own dates first, then the sheet's. */
  const rowExpiry = (r: Row): string | null => (runs[r.key]?.exp || exp) || expiryFrom(runs[r.key]?.mfg || mfg, r.shelf);

  const request = (first: string | null = null) => {
    const ordered = first != null && items.some((i) => i.key === first) ? [...items.filter((i) => i.key === first), ...items.filter((i) => i.key !== first)] : items;
    return {
      items: ordered.map((i) => ({ id: i.id, copies: i.copies, kind: i.kind, ...runPayload(runs[i.key], fill), ...(sizes[i.key] ? { size: sizes[i.key] } : {}) })), lang, layout: sized.layout,
      w: sized.w, h: sized.h,
      rounded: choice.shape === 'rect' && rounded,
      fill, mfg: fill ? mfg : null, exp: fill && exp ? exp : null,
      batch: batch || null, qty: qty ? Number(qty) : null, pi: productionItemId, type: asType, footer,
      for: packedFor.trim() || null, for2: packedFor2.trim() || null,
      promo: promoKind || null,
      promo_was: promoKind === 'was_now' && promoWas !== '' ? Number(promoWas) : null,
      promo_now: promoKind === 'was_now' && promoNow !== '' ? Number(promoNow) : null,
      promo_text: promoKind === 'text' ? promoWords.trim() || null : null,
      number: numbered,
      marks,
      bleed: marks && Number(bleed) > 0 ? Number(bleed) : null,
      dpi: printer.dpi,
      reprint: reprint?.code ?? null,
      roll: onRoll?.id ?? null,
    };
  };

  // Redraw the preview half a second after the last change; a reply that
  // arrives after a newer request is ignored.
  const previewRequestKey = JSON.stringify([request(previewKey), previewKey, presets.length, footersTick]);
  useEffect(() => {
    if (items.length === 0 || presets.length === 0) { setPreview(null); setPreviewError(null); setPreviewBusy(false); return; }
    if (sizeIssue) { setPreviewError(sizeIssue); setPreviewBusy(false); return; }
    const seq = ++previewSeq.current;
    setPreviewBusy(true);
    const timer = setTimeout(async () => {
      try {
        const r = await stickerLinks({ ...request(previewKey), preview: true });
        if (seq !== previewSeq.current) return;
        setPreview({ one: r.one_url ?? null, sheet: r.url, mocks: r.mock_urls ?? {}, summary: r.summary });
        setPreviewError(null);
      } catch (e) {
        if (seq !== previewSeq.current) return;
        setPreviewError(e instanceof Error ? e.message : 'Could not draw the preview.');
      } finally {
        if (seq === previewSeq.current) setPreviewBusy(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [previewRequestKey, sizeIssue]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewed = items.find((i) => i.key === previewKey) ? previewKey : (items[0]?.key ?? null);
  const nameOf = (key: string | null) => {
    if (key == null) return '';
    const { kind, id } = parseKey(key);
    if (kind === 'item') return fixedItems?.find((i) => i.id === id)?.name ?? products.find((p) => p.id === id)?.name ?? '';
    return customs.find((c) => c.id === id)?.name ?? '';
  };
  const { w: stickerW, h: stickerH } = sizeOf(choice, presets.length ? presets : []);
  const page = pageOf(choice, presets, fixedPages);
  const round = choice.shape === 'circle';
  const mockOffered = preview ? (Object.keys(preview.mocks) as MockSurface[]) : [];
  const mockPicked: MockSurface | null = mockSurface && mockOffered.includes(mockSurface) ? mockSurface : (mockOffered[0] ?? null);
  // A mock-up scene is 4 : 3 (StickerMockup::frame).
  const previewRatio = previewMode === 'one' ? stickerW / stickerH : previewMode === 'mock' ? 4 / 3 : page.w / page.h;
  const previewUrl = preview ? (previewMode === 'one' ? preview.one : previewMode === 'mock' ? (mockPicked ? preview.mocks[mockPicked] ?? null : preview.one) : preview.sheet) : null;

  const sendToPrinter = async () => {
    if (!result?.zpl_url || !result.tspl_url) return;
    setSending(true); setSent(null); setError(null);
    try {
      const url = printer.language === 'zpl' ? result.zpl_url : result.tspl_url;
      // Round 16: Bluetooth from this phone or tablet, else the print agent on this computer.
      if (printer.via === 'bluetooth') {
        const r = await printOverBluetooth(url);
        setSent(`Sent ${result.summary.stickers} ${result.summary.stickers === 1 ? 'sticker' : 'stickers'} to ${pairedPrinter()?.name ?? 'the printer'} over Bluetooth (${Math.max(1, Math.round(r.bytes / 1024))} KB).`);
      } else {
        const r = await sendToLabelPrinter(url, printer);
        setSent(`Sent ${result.summary.stickers} ${result.summary.stickers === 1 ? 'sticker' : 'stickers'} to the printer at ${printer.host} (${Math.max(1, Math.round(r.bytes / 1024))} KB).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send to the printer.');
    } finally {
      setSending(false);
    }
  };

  const prepare = async () => {
    setBusy(true); setError(null); setResult(null); setSent(null);
    try {
      const r = await stickerLinks(request());
      rememberSize(choice);
      setResult(r);
      // On a phone the summary lands below the fold; bring it up.
      requestAnimationFrame(() => summaryRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the stickers.');
    } finally {
      setBusy(false);
    }
  };

  const modeToggle = (
    <div className="inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden" role="group" aria-label="What to preview">
      {(['one', 'sheet', 'mock'] as const).map((m) => (
        <button key={m} type="button" onClick={() => setPreviewMode(m)} aria-pressed={previewMode === m} className={['px-3 h-8 min-w-[64px] text-xs font-semibold', previewMode === m ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]' : 'bg-[var(--color-surface)] text-[var(--color-text)]'].join(' ')}>
          {m === 'one' ? 'Sticker' : m === 'sheet' ? 'Sheet' : 'Mock-up'}
        </button>
      ))}
    </div>
  );
  // The mock-up's surfaces (round 14), offered for the label's shape, the likeliest first.
  const surfaceRow = previewMode === 'mock' && mockOffered.length > 0 ? (
    <TabScrollRow role="group" aria-label="Show it on" style={{ gap: 6 }}>
      {mockOffered.map((m) => (
        <button key={m} type="button" aria-pressed={mockPicked === m} onClick={() => setMockSurface(m)} className={chipClass(mockPicked === m)} data-testid={`mock-surface-${m}`}>{MOCK_SURFACE_NAMES[m]}</button>
      ))}
    </TabScrollRow>
  ) : null;
  const productSelect = items.length > 1 ? (
    <select value={previewed ?? ''} onChange={(e) => setPreviewKey(e.target.value)} className={`${fieldClass} !h-9 !min-h-0`} aria-label="Product to preview">
      {items.map((i) => <option key={i.key} value={i.key}>{nameOf(i.key)}</option>)}
    </select>
  ) : null;
  const previewCaption = preview ? (
    <>
      {previewMode === 'mock' ? `${nameOf(previewed)} on a ${mockPicked ? MOCK_SURFACE_NAMES[mockPicked].toLowerCase() : 'jar'}, to judge how it reads on the pack; the print is the flat sticker` : previewMode === 'one' ? `${nameOf(previewed)} · ${lang === 'dv' ? 'Dhivehi' : lang === 'both' ? 'English and Dhivehi' : 'English'}` : `Page 1 of ${preview.summary.pages} · ${preview.summary.stickers} ${preview.summary.stickers === 1 ? 'sticker' : 'stickers'}`}
      {' · '}{preview.summary.label.startsWith(sizeName(choice.shape, stickerW, stickerH)) ? preview.summary.label : `${sizeName(choice.shape, stickerW, stickerH)} · ${preview.summary.label}`}. Updates as you change things; the print is the same.
    </>
  ) : null;
  const previewTitle = previewMode === 'one' ? 'Sticker preview' : previewMode === 'mock' ? 'Mock-up preview' : 'Sheet preview';
  const previewEmpty = items.length === 0 ? 'Pick a product to see its sticker here.' : 'Drawing…';

  const previewPane = stacked ? (
    <PhonePreviewBar
      url={previewUrl}
      ratio={previewRatio}
      busy={previewBusy}
      round={previewMode === 'one' && round}
      title={previewTitle}
      empty={previewEmpty}
      error={previewError}
      caption={previewCaption ?? (items.length === 0 ? 'Pick a product to see its sticker here.' : null)}
      controls={<div className="flex flex-wrap items-center gap-2">{modeToggle}{productSelect && <div className="flex-1 min-w-[120px]">{productSelect}</div>}{surfaceRow && <div className="w-full">{surfaceRow}</div>}</div>}
    />
  ) : (
    <aside className="space-y-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-4 self-start min-w-0" data-testid="sticker-preview-pane">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-[var(--color-text)] inline-flex items-center gap-1.5"><Eye size={16} className="text-[var(--color-primary)]" /> Preview</h3>
        <div className="ml-auto">{modeToggle}</div>
      </div>
      {productSelect}
      {surfaceRow}
      <div className={previewMode === 'one' && round ? 'max-w-[280px] mx-auto lg:mx-0' : 'max-w-[320px] mx-auto lg:mx-0'}>
        <SheetPreview url={previewUrl} ratio={previewRatio} busy={previewBusy} round={previewMode === 'one' && round} title={previewTitle} empty={previewEmpty} />
      </div>
      {previewError ? (
        <p role="alert" className="text-xs text-[var(--color-danger)] flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {previewError}</p>
      ) : previewCaption ? (
        <p className="text-xs text-[var(--color-text-muted)]">{previewCaption}</p>
      ) : null}
    </aside>
  );

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_auto] lg:gap-x-6 lg:gap-y-5" data-testid="sticker-print-panel">
    {stacked && previewPane}
    <div className="space-y-5 min-w-0 lg:col-start-1 lg:row-start-1">
      {!fixedItems && !editing && recent.length > 0 && (
        <section data-testid="sticker-recent">
          <h3 className="text-sm font-bold text-[var(--color-text)] inline-flex items-center gap-1.5 mb-2"><History size={15} className="text-[var(--color-primary)]" /> Print again</h3>
          <TabScrollRow style={{ gap: 8 }}>
            {recent.map((j) => (
              <span key={j.id} className="inline-flex items-stretch rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden max-w-full">
                <button type="button" onClick={() => navigate(`/labels/stickers?job=${j.id}`)} className="px-3 min-h-[38px] inline-flex items-center gap-1.5 text-left text-xs font-semibold text-[var(--color-text)] max-w-[260px] hover:bg-[var(--color-bg)]" title={`Open ${j.name} to change it`}>
                  {j.pinned && <Star size={12} className="shrink-0 text-[var(--color-warning)] fill-current" aria-label="Pinned" />}
                  <span className="truncate">{j.name}</span>
                </button>
                <button type="button" onClick={() => void printAgain(j)} disabled={recentBusy === j.id} className="px-3 min-h-[38px] inline-flex items-center gap-1 border-l border-[var(--color-border)] text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-bg)] disabled:opacity-50" aria-label={`Print ${j.name} again`}><Printer size={14} aria-hidden /> Print</button>
              </span>
            ))}
          </TabScrollRow>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Pinned labels, then the last sheets printed, with today's dates. Tap the name to change one first.</p>
        </section>
      )}
      {/* Scan to reprint (round 11): the QR on a pack, or its code, opens the label that printed it. */}
      {!fixedItems && !editing && !reprint && <ReprintScan />}
      {/* Label stock (round 13): the rolls at or under their warning level, so nobody starts a sheet that will not finish. */}
      {!fixedItems && rolls.some((r) => rollStock(r).lowNow) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs p-2.5 rounded-lg border" style={{ borderColor: 'color-mix(in srgb, var(--color-warning) 45%, transparent)', color: 'var(--color-warning)' }} data-testid="sticker-low-rolls">
          <AlertTriangle size={14} className="shrink-0" aria-hidden />
          <span className="font-semibold">Running low:</span>{' '}
          <span>{rolls.filter((r) => rollStock(r).lowNow).map((r) => `${rollName(r)} (${rollStockWords(r)})`).join(', ')}.</span>{' '}
          <button type="button" className="underline font-semibold" onClick={() => navigate('/labels/settings')}>Count in new ones</button>
        </p>
      )}
      {reprint && (
        <div className="flex flex-wrap items-start gap-2 text-sm text-[var(--color-text-secondary)] p-3 rounded-lg bg-[var(--color-bg)]" data-testid="sticker-reprint">
          <RotateCcw size={16} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden />
          <span className="flex-1 min-w-[200px]">
            Printing again the sticker of pack <strong className="font-mono text-[var(--color-text)]">{reprint.code}</strong>: {reprintLine(reprint)}.
            {reprint.printed_at ? ` Printed ${whenPrinted(reprint.printed_at)}${reprint.printed_by ? ` by ${reprint.printed_by}` : ''}.` : ''}
            {' '}The same details are filled in below: change anything, then Prepare. The new print gets a code of its own and the log says which pack it stood in for.
            {reprint.status === 'expired' && (
              <span className="block mt-1 font-semibold text-[var(--color-danger)]" data-testid="sticker-reprint-expired">This pack is past its date{reprint.days_left != null ? ` by ${-reprint.days_left} ${-reprint.days_left === 1 ? 'day' : 'days'}` : ''}: it will not print until the dates are changed.</span>
            )}
            {(reprint.status === 'today' || reprint.status === 'soon') && (
              <span className="block mt-1 font-semibold text-[var(--color-warning)]">{reprint.status === 'today' ? 'This pack expires today.' : `This pack expires in ${reprint.days_left} ${reprint.days_left === 1 ? 'day' : 'days'}.`}</span>
            )}
          </span>
          {reprint.batch_url && <a href={reprint.batch_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--color-primary)] underline">Pack page</a>}
        </div>
      )}
      {editing && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)] p-3 rounded-lg bg-[var(--color-bg)]" data-testid="sticker-editing">
          <Bookmark size={16} className="shrink-0 text-[var(--color-primary)]" />
          <span>Opened from saved label <strong className="text-[var(--color-text)]">{editing.name}</strong>. Change anything and press Prepare; the same settings go back to the same saved label, different ones make a new one.</span>
        </p>
      )}
      {!fixedItems && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold text-[var(--color-text)]">Products</h3>
            {items.length > 0 && <span className="text-xs font-semibold text-[var(--color-primary)]">{items.length} picked · {total} {total === 1 ? 'sticker' : 'stickers'}</span>}
          </div>
          {(customs.length > 0 || can('labels.manage')) && (
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {customs.length > 0 && (
                <TabScrollRow role="group" aria-label="Which products" style={{ gap: 8 }}>
                  {([['all', `All (${rows.length})`], ['item', `Menu items (${products.length})`], ['custom', `Custom labels (${customs.length})`]] as const).map(([v, l]) => (
                    <button key={v} type="button" aria-pressed={show === v} onClick={() => setShow(v)} className={chipClass(show === v)}>{l}</button>
                  ))}
                </TabScrollRow>
              )}
              {can('labels.manage') && (
                <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setNewCustom(true)} className="ml-auto" data-testid="sticker-new-custom">New custom label</Button>
              )}
            </div>
          )}
          {products.length === 0 && rows.length > 0 && (
            <p className="text-xs text-[var(--color-text-muted)] mb-2" data-testid="sticker-no-items">
              No menu items are on labels yet.{' '}
              {can('labels.manage')
                ? <button type="button" className="underline font-semibold text-[var(--color-tone-rust-text)]" onClick={() => setChoosing(true)} data-testid="sticker-choose-items">Choose which items get labels</button>
                : 'Someone with Manage label settings can choose which items get labels.'}
            </p>
          )}
          {choosing && <ChooseItemsModal onClose={() => setChoosing(false)} onChanged={() => void reloadProducts()} />}
          {rows.length > 8 && (
            <div className="relative mb-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a product" aria-label="Find a product" className={`${fieldClass} pl-9`} />
            </div>
          )}
          {rows.length === 0 ? (
            // Zero state (round 5, 2026-10-13): say so, and offer the way on right here.
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-center space-y-2" data-testid="sticker-zero-state">
              <p className="text-sm font-semibold text-[var(--color-text)]">Nothing is on labels yet.</p>
              <p className="text-xs text-[var(--color-text-muted)]">Choose which menu items get labels, or make a label for something that is not on the menu.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {can('labels.manage')
                  ? <Button size="sm" onClick={() => setChoosing(true)} data-testid="sticker-choose-items">Choose which items get labels</Button>
                  : <span className="text-xs text-[var(--color-text-muted)]">Someone with Manage label settings can choose which items get labels.</span>}
                <Button size="sm" variant="secondary" onClick={() => navigate('/labels/make')} data-testid="sticker-zero-make">Make a label</Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-light)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              {shown.map((r) => (
                <div key={r.key} className={['flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 min-h-[56px]', picked[r.key] ? 'bg-[var(--color-surface-hover)]' : 'bg-[var(--color-surface)]'].join(' ')}>
                  <label className="flex items-center gap-3 flex-1 min-w-[180px] py-1 cursor-pointer">
                    <input type="checkbox" checked={Boolean(picked[r.key])} onChange={() => toggle(r.key)} className="w-5 h-5 shrink-0 accent-[var(--color-primary)]" aria-label={`Print ${r.name}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[var(--color-text)]">
                        {r.name}{r.name_dv ? <span className="ml-2 font-normal text-[var(--color-text-muted)]" dir="rtl">{r.name_dv}</span> : null}
                        {r.kind === 'custom' && <span className="ml-2 inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold bg-[var(--color-tone-brown-bg)] text-[var(--color-tone-brown-text)] border border-[var(--color-tone-brown-border)] align-middle">Custom</span>}
                        {r.shelf !== null && r.shelf <= SHORT_LIFE_DAYS && (
                          <span className="ml-2 inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-semibold align-middle" style={{ background: 'color-mix(in srgb, var(--color-warning) 18%, transparent)', color: 'var(--color-warning)', border: '1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)' }} data-testid="short-life">
                            <Clock size={11} aria-hidden /> Short life · {r.shelf} {r.shelf === 1 ? 'day' : 'days'}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-[var(--color-text-muted)] sm:truncate">
                        {r.kind === 'custom' && r.brand ? `${r.brand} · ` : ''}
                        {picked[r.key] && fill
                          ? (rowExpiry(r)
                            ? <span className="font-semibold text-[var(--color-text-secondary)]" data-testid="row-expiry">EXP {rowExpiry(r)}</span>
                            : 'Expiry blank: no shelf life set')
                          : (r.shelf ? `Keeps ${r.shelf} days` : 'No shelf life set, dates print blank')}
                        {' · '}{r.ingredients === 'recipe' ? 'ingredients from the recipe' : r.ingredients === 'manual' ? 'ingredients typed in' : 'no ingredients yet'}
                      </span>
                    </span>
                  </label>
                  {picked[r.key] ? (
                    <div className="ml-auto pl-8 sm:pl-0 flex items-center gap-2">
                      {(r.sizes?.length ?? 0) > 0 && (
                        <select value={sizes[r.key] ?? ''} onChange={(e) => setSizes((s) => ({ ...s, [r.key]: Number(e.target.value) }))} aria-label={`${r.name}: which size`} data-testid={`sticker-row-size-${r.key}`}
                          className="h-8 min-h-[32px] px-2 rounded-lg border text-xs font-semibold bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]">
                          <option value="" disabled>Which size?</option>
                          {r.sizes!.map((z) => <option key={z.id} value={z.id}>{z.name} · MVR {z.price.toFixed(2)}</option>)}
                        </select>
                      )}
                      <QtyStepper value={picked[r.key]} min={1} max={400} step={perPage} onChange={(n) => setPicked((s) => ({ ...s, [r.key]: n }))} label={`How many ${r.name} stickers`} />
                      <button type="button" onClick={() => setOpenRun((o) => (o === r.key ? null : r.key))} aria-expanded={openRun === r.key || hasRun(runs[r.key])} aria-label={`Own details for ${r.name}`} title="Its own batch, quantity, dates and packed-for" data-testid={`sticker-row-details-${r.key}`}
                        className={['h-8 min-h-[32px] px-2 rounded-lg border text-xs font-semibold inline-flex items-center gap-1', hasRun(runs[r.key]) ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-secondary)]'].join(' ')}>
                        <ListPlus size={14} aria-hidden /> {hasRun(runs[r.key]) ? 'Own details' : 'Details'}
                      </button>
                    </div>
                  ) : null}
                  {picked[r.key] && (openRun === r.key || hasRun(runs[r.key])) && (
                    <div className="w-full pl-8 sm:pl-0 grid gap-2 sm:grid-cols-3" data-testid={`sticker-row-run-${r.key}`}>
                      <p className="sm:col-span-3 text-xs text-[var(--color-text-muted)]">Printed on {r.name}'s stickers instead of the sheet's batch, quantity, dates and packed-for. Leave a box empty to use the sheet's.</p>
                      <input value={runs[r.key]?.batch ?? ''} maxLength={30} onChange={(e) => setRun(r.key, 'batch', e.target.value)} placeholder="Batch" aria-label={`${r.name}: batch`} className={fieldClass} />
                      <input type="number" inputMode="numeric" min={1} max={9999} value={runs[r.key]?.qty ?? ''} onChange={(e) => setRun(r.key, 'qty', e.target.value)} placeholder="Quantity per pack" aria-label={`${r.name}: quantity per pack`} className={fieldClass} />
                      <input value={runs[r.key]?.for ?? ''} maxLength={60} onChange={(e) => setRun(r.key, 'for', e.target.value)} placeholder="Packed for" aria-label={`${r.name}: packed for`} className={fieldClass} />
                      {fill && <input type="date" value={runs[r.key]?.mfg ?? ''} onChange={(e) => setRun(r.key, 'mfg', e.target.value)} aria-label={`${r.name}: made on`} className={fieldClass} />}
                      {fill && <input type="date" value={runs[r.key]?.exp ?? ''} onChange={(e) => setRun(r.key, 'exp', e.target.value)} aria-label={`${r.name}: expiry`} className={fieldClass} />}
                      <input value={runs[r.key]?.for2 ?? ''} maxLength={60} onChange={(e) => setRun(r.key, 'for2', e.target.value)} placeholder="Second line (the delivery, the date)" aria-label={`${r.name}: packed for, second line`} className={fieldClass} />
                      {hasRun(runs[r.key]) && <button type="button" onClick={() => { setRuns((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== r.key))); setOpenRun(null); }} className="text-xs underline text-[var(--color-tone-rust-text)] text-left sm:col-span-3" data-testid={`sticker-row-run-clear-${r.key}`}>Use the sheet's details</button>}
                    </div>
                  )}
                </div>
              ))}
              {shown.length === 0 && <p className="px-3 py-4 text-sm text-[var(--color-text-muted)] bg-[var(--color-surface)]">{needle ? `No product matches “${query}”.` : 'Nothing here yet.'}</p>}
            </div>
          )}
          {items.length > 0 && <p className="text-xs text-[var(--color-text-muted)] mt-1">The number is how many stickers of that product. {stock?.on === 'printer' ? 'A label printer prints one per label; − and + add or take away one.' : `${perPage} fit on one sheet; − and + add or take away a whole sheet, or type any number.`}</p>}
        </section>
      )}

      {fixedItems && fixedItems.map((i) => (
        <section key={i.id} className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className={labelClass}>Stickers</span>
            <span className="block text-sm font-semibold text-[var(--color-text)]">{i.name}</span>
          </div>
          <QtyStepper value={picked[keyOf('item', i.id)] ?? perPage} min={1} max={400} step={perPage} onChange={(n) => setPicked((s) => ({ ...s, [keyOf('item', i.id)]: n }))} label={`How many ${i.name} stickers`} />
        </section>
      ))}

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--color-text)]">Label size</h3>
        {presets.length > 0 ? (
          <LabelSizePicker presets={presets} limits={limits} choice={choice} onChange={setChoice} rounded={rounded} onRounded={setRounded} rolls={rolls} />
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">Loading the sizes…</p>
        )}
        {onRoll && onRollStock && onRollStock.left !== null && (
          <p className={['text-xs', rollTakes > onRollStock.left ? 'text-[var(--color-danger)] font-semibold' : onRollStock.lowNow ? 'text-[var(--color-warning)] font-semibold' : 'text-[var(--color-text-muted)]'].join(' ')} data-testid="sticker-roll-stock">
            {rollName(onRoll)}: {rollStockWords(onRoll)}{total > 0 ? `; this print takes ${rollTakes} ${rollTakes === 1 ? onRollStock.unit.slice(0, -1) : onRollStock.unit}` : ''}{rollTakes > onRollStock.left ? ', more than is left' : onRollStock.lowNow ? ' (running low)' : ''}.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <span className={labelClass}>Language</span>
          <div className="flex gap-2 max-w-md" role="group" aria-label="Language">
            {(['en', 'dv', 'both'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={['flex-1 h-9 min-h-[36px] rounded-lg border text-sm font-semibold', lang === l ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-on-primary)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ')}>
                {LANG_NAMES[l]}
              </button>
            ))}
          </div>
          {lang === 'both' && <p className="text-xs text-[var(--color-text-muted)] mt-1">Every line in English with the Dhivehi beneath or beside it: heading, name, ingredients, how to use, note, date labels, use-within and storage. Small and round stickers add the Dhivehi name, list and storage line where there is room.</p>}
        </div>
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} className="w-5 h-5 shrink-0 accent-[var(--color-primary)]" />
          <span>
            <span className="block text-sm font-semibold text-[var(--color-text)]">Fill in the dates</span>
            <span className="block text-xs text-[var(--color-text-muted)]">Off: blank boxes to write in by hand</span>
          </span>
        </label>
        {fill && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="label-mfg">Made on</label><input id="label-mfg" type="date" value={mfg} onChange={(e) => setMfg(e.target.value)} className={fieldClass} /></div>
            <div>
              <label className={labelClass} htmlFor="label-exp">Expiry</label>
              <input id="label-exp" type="date" value={exp} onChange={(e) => setExp(e.target.value)} className={fieldClass} />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Leave empty to use each product's shelf life{fixedItems ? '' : '; each picked product shows its expiry above'}.</p>
            </div>
          </div>
        )}
      </section>

      <section>
        <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} aria-controls="label-more-options" className="flex items-start gap-1.5 min-h-[38px] text-left text-sm font-bold text-[var(--color-text)] w-full" data-testid="sticker-more-toggle">
          {moreOpen ? <ChevronUp size={16} aria-hidden className="mt-0.5 shrink-0" /> : <ChevronDown size={16} aria-hidden className="mt-0.5 shrink-0" />}
          <span className="min-w-0">
            <span className="block">More options</span>
            {!moreOpen && (asType || footer || batch || qty || packedFor || promoKind || numbered || marks) && <span className="block text-xs font-semibold text-[var(--color-primary)]">{[asType ? `wording of ${types.find((t) => t.id === asType)?.name ?? 'a type'}` : null, footer ? `bottom strip: ${footers.find((f) => f.id === footer)?.name ?? 'picked'}` : null, batch ? `batch ${batch}` : null, qty ? `${qty} per pack` : null, packedFor ? `for ${packedFor}` : null, promoKind === 'was_now' ? 'was → now flash' : promoKind ? `flash: ${promoWords}` : null, numbered ? 'numbered packs' : null, marks ? `crop marks${Number(bleed) > 0 ? `, ${bleed} mm bleed` : ''}` : null].filter(Boolean).join(' · ')}</span>}
            {!moreOpen && !(asType || footer || batch || qty || packedFor || promoKind || numbered || marks) && <span className="block text-xs font-normal text-[var(--color-text-muted)]">Another type's wording, one bottom strip for the sheet, batch number, quantity per pack, packed for, promotion flash, pack numbering, crop marks</span>}
          </span>
        </button>
        {moreOpen && (
          <div id="label-more-options" className="grid gap-3 sm:grid-cols-2 mt-2">
            <FoldHelp className="sm:col-span-2">Things that change this print only: the wording of another type, one bottom strip for the whole sheet, the batch number, how many per pack, who it is for, a promotion flash, pack numbering and crop marks.</FoldHelp>
            {types.length > 0 && (
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="label-as-type">Use the wording of</label>
                <select id="label-as-type" value={asType ?? ''} onChange={(e) => setAsType(e.target.value ? Number(e.target.value) : null)} className={fieldClass}>
                  <option value="">Each product's own type</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">One type for the whole sheet: its heading, dates wording, how-to-use and brand. A product's own typed wording, and a custom label's own brand, still print.</p>
              </div>
            )}
            {footers.length > 0 && (
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="label-footer">Bottom strip</label>
                <FooterPicker id="label-footer" footers={footers} value={footer} onChange={setFooter} onFootersChange={(f) => { setFooters(f); setFootersTick((t) => t + 1); }} noneLabel="Each product's own bottom strip" canManage={can('labels.manage')} />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">One bottom strip for every sticker on the sheet, always Bake &amp; Grill's branding: tagline, phone, website and whether the complaints QR prints. Empty keeps each product's own, from its label or its type, else the standard one.</p>
              </div>
            )}
            <div>
              <label className={labelClass} htmlFor="label-batch">Batch number (optional)</label>
              <div className="flex flex-wrap gap-2">
                <input id="label-batch" value={batch} maxLength={30} onChange={(e) => setBatch(e.target.value)} className={`${fieldClass} !w-auto flex-1 min-w-[140px]`} />
                <button type="button" onClick={() => setBatch(todayCode())} className="h-10 min-h-[44px] px-3 shrink-0 inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-text)]" title="Today's date as a code" data-testid="sticker-batch-today"><CalendarDays size={14} aria-hidden /> Today</button>
              </div>
            </div>
            <div><label className={labelClass} htmlFor="label-qty">Quantity per pack (optional)</label><input id="label-qty" type="number" inputMode="numeric" min={1} max={9999} value={qty} onChange={(e) => setQty(e.target.value)} className={fieldClass} /></div>
            {/* Packed for (2026-10-12): a wholesale shop or an event; a delivery or event page fills it in. */}
            <div>
              <label className={labelClass} htmlFor="label-for">Packed for (optional)</label>
              <input id="label-for" value={packedFor} maxLength={60} onChange={(e) => setPackedFor(e.target.value)} placeholder="A shop, a customer, an event" className={fieldClass} />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Prints "PACKED FOR" under the name. Wholesale → a delivery → Print labels fills it with the shop; an event's page with the customer.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="label-for2">Packed for, second line (optional)</label>
              <input id="label-for2" value={packedFor2} maxLength={60} onChange={(e) => setPackedFor2(e.target.value)} placeholder="Delivery TD-0042 · Tue, 14 Oct" disabled={!packedFor.trim()} className={fieldClass} />
            </div>
            {/* A promotion flash (2026-10-12): was → now prices or a short line, on the full and compact stickers. */}
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="label-promo">Promotion flash</label>
              <div className="grid gap-2 sm:grid-cols-2">
                <select id="label-promo" value={promoPreset} onChange={(e) => setPromoPreset(e.target.value)} className={fieldClass}>
                  {PROMO_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {promoKind === 'was_now' && (
                  <div className="flex gap-2">
                    <input type="number" inputMode="decimal" min={0} step="0.5" value={promoWas} onChange={(e) => setPromoWas(e.target.value)} placeholder="Was, MVR" aria-label="Was, MVR" className={fieldClass} />
                    <input type="number" inputMode="decimal" min={0} step="0.5" value={promoNow} onChange={(e) => setPromoNow(e.target.value)} placeholder="Now, MVR" aria-label="Now, MVR" className={fieldClass} />
                  </div>
                )}
                {promoPreset === 'custom' && (
                  <input value={promoText} maxLength={24} onChange={(e) => setPromoText(e.target.value)} placeholder="Up to 24 letters" aria-label="Flash words" className={fieldClass} />
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">A rust badge beside the name on the full sticker and in the compact sticker's band (where it takes the batch QR's place). Was → Now also prints the new price on the quantity line. Small and round stickers have no room for it.</p>
            </div>
            {/* Round C: pack numbering, and a print-ready sheet for a print shop. */}
            <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={numbered} onChange={(e) => setNumbered(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--color-primary)]" data-testid="sticker-number" />
              <span>
                <span className="block text-sm font-semibold text-[var(--color-text)]">Number the packs</span>
                <span className="block text-xs text-[var(--color-text-muted)]">"Pack 3 of 40" on each sticker of a product's run: under the header on the full sticker, on the batch line of the compact and small ones.</span>
              </span>
            </label>
            <div>
              <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
                <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--color-primary)]" data-testid="sticker-marks" />
                <span>
                  <span className="block text-sm font-semibold text-[var(--color-text)]">Crop marks for a print shop</span>
                  <span className="block text-xs text-[var(--color-text-muted)]">Hairline ticks at every corner in place of the dashed cut lines.</span>
                </span>
              </label>
              {marks && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)]" htmlFor="label-bleed">Bleed</label>
                  <select id="label-bleed" value={bleed} onChange={(e) => setBleed(e.target.value)} className={`${fieldClass} !w-auto`}>
                    {['0', '1', '2', '3', '5'].map((b) => <option key={b} value={b}>{b === '0' ? 'None' : `${b} mm`}</option>)}
                  </select>
                  <span className="text-xs text-[var(--color-text-muted)]">Around a single label, so the page grows by it on every side. A sheet of several keeps its page.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>

    {!stacked && previewPane}

    <div className="space-y-5 min-w-0 lg:col-start-1 lg:row-start-2">
      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-[var(--color-danger)] text-sm text-[var(--color-danger)] bg-[var(--color-surface)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {result ? (
        <section ref={summaryRef} className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] space-y-3" data-testid="sticker-summary">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {result.summary.stickers} {result.summary.stickers === 1 ? 'sticker' : 'stickers'} on {result.summary.pages} {result.summary.pages === 1 ? 'page' : 'pages'} · {result.summary.label}
          </p>
          <ul className="text-sm text-[var(--color-text-secondary)] space-y-1">
            {result.summary.products.map((p) => (
              <li key={p.key ?? p.id}>
                {p.name}{p.size ? ` (${p.size.name})` : ''} × {p.copies}
                {fill ? (p.exp ? ` · EXP ${p.exp}` : ' · expiry blank (no shelf life set)') : ''}
                {p.size_recipe === 'shared' ? ` · ingredients from the item's shared recipe; ${p.size?.name ?? 'this size'} has none of its own` : ''}
                {p.varied ? [p.batch ? `batch ${p.batch}` : null, p.qty ? `${p.qty} per pack` : null, p.for ? `for ${p.for}` : null].filter(Boolean).map((t) => ` · ${t}`).join('') : ''}
                {p.code && <span className="ml-2 font-mono text-xs text-[var(--color-text-muted)]" title="On every sticker of this product as a QR, which opens the pack's page" data-testid="print-code">code {p.code}</span>}
              </li>
            ))}
          </ul>
          {result.summary.roll && (
            <p className={['text-xs', result.summary.roll.low_now ? 'font-semibold text-[var(--color-warning)]' : 'text-[var(--color-text-secondary)]'].join(' ')} data-testid="sticker-roll-after">
              Counted off <strong className="text-[var(--color-text)]">{rollName(result.summary.roll)}</strong>: {rollStockWords(result.summary.roll) ?? 'not counted'}{result.summary.roll.out ? '. Count in a new roll under Settings.' : result.summary.roll.low_now ? ' (running low: order more).' : '.'}
            </p>
          )}
          {result.job && (
            <div className="text-xs text-[var(--color-text-secondary)] flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Saved as</span>
              <InlineRename name={result.job.name} onSave={(n) => rename(result.job!, n)} buttonClassName="font-bold text-[var(--color-text)]" className="flex-1 min-w-[200px]" />
              <span>on the Saved labels tab, to print again or change later.</span>
            </div>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">{printsViaPdf() ? 'Print opens the PDF: use Share → Print, and keep the scale at 100%, not "fit".' : 'Print at actual size (100%).'} These links work for {result.expires_in_minutes} minutes.</p>
          {sent && <p className="text-sm font-semibold text-[var(--color-success)]" role="status" data-testid="sticker-sent">{sent}</p>}
          <div className="labels-actions">
            <div className="labels-actions-row flex flex-wrap gap-2">
              <Button icon={<Printer size={16} />} onClick={() => openLabelSheet(result.url, result.pdf_url)}>Print</Button>
              <Button variant="secondary" icon={<FileDown size={16} />} onClick={() => downloadLabelSheet(result.pdf_url)} aria-label="Download PDF"><span className="sm:hidden">PDF</span><span className="hidden sm:inline">Download PDF</span></Button>
              {/* Round C: a label-printer stock goes straight to the printer as ZPL or TSPL, through the print agent on this computer. */}
              {result.zpl_url && result.tspl_url && (
                <>
                  <Button variant="secondary" icon={<Send size={16} />} loading={sending} onClick={() => void sendToPrinter()} data-testid="sticker-send-printer">{printer.via === 'bluetooth' ? 'Print over Bluetooth' : 'Send to label printer'}</Button>
                  <Button variant="ghost" icon={<FileDown size={16} />} onClick={() => downloadLabelSheet(printer.language === 'zpl' ? result.zpl_url! : result.tspl_url!)} data-testid="sticker-printer-file" title={`The stickers as ${printer.language.toUpperCase()} at ${printer.dpi} dpi, to send to the printer yourself`}>{printer.language.toUpperCase()} file</Button>
                  {result.raster_url && <Button variant="ghost" icon={<ImageIcon size={16} />} onClick={() => window.open(`${window.location.origin}${result.raster_url}`, '_blank', 'noopener')} data-testid="sticker-printer-bitmap">Check the bitmap</Button>}
                </>
              )}
              <Button variant="ghost" className="labels-actions-wide" onClick={() => setResult(null)}>Change</Button>
            </div>
          </div>
        </section>
      ) : (
        <div className="labels-actions">
          <div className="labels-actions-row flex">
            <Button onClick={prepare} loading={busy} disabled={total === 0 || Boolean(sizeIssue) || presets.length === 0} icon={<Printer size={16} />} data-testid="sticker-prepare">
              {total > 0 ? `Prepare ${total} ${total === 1 ? 'sticker' : 'stickers'}` : 'Pick a product'}
            </Button>
          </div>
        </div>
      )}
    </div>
    {newCustom && (
      <CustomLabelModal
        label={null}
        onClose={() => setNewCustom(false)}
        onSaved={(c) => {
          setCustoms((s) => [...s.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name)));
          setPicked((p) => (p[keyOf('custom', c.id)] ? p : { ...p, [keyOf('custom', c.id)]: perPage }));
        }}
      />
    )}
    </div>
  );
}
