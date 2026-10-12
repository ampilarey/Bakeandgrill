import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Printer, FileDown, AlertTriangle, Search, Bookmark, Eye, Plus, History, CalendarDays, ChevronDown, ChevronUp, Star, Clock } from 'lucide-react';
import {
  downloadLabelSheet, fetchCustomLabels, fetchLabelJob, fetchLabelJobs, fetchLabelLayouts, fetchLabelProducts, fetchLabelTypes, openLabelSheet, printLabelJob, printsViaPdf, renameLabelJob, stickerLinks,
  type CustomLabel, type LabelJob, type LabelLimits, type LabelPreset, type LabelProduct, type LabelType, type SheetLinks, type StickerLang, type StickerSummary,
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
import { DEFAULT_CHOICE, choiceFromRequest, pageOf, requestFor, sizeName, sizeOf, sizeProblem, stockOf, type SizeChoice } from './labelSize';

/*
 * Pack stickers: pick products, how many, the language, the label size and
 * what goes in the date boxes; the server checks it, says what will print,
 * and hands back a print link and a PDF link (good for 30 minutes).
 * Used by Labels → Pack stickers and by "Print stickers" on a production line.
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

type Row = { key: string; kind: 'item' | 'custom'; id: number; name: string; name_dv: string | null; shelf: number | null; ingredients: 'recipe' | 'manual' | 'none'; brand?: string };

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
const LAST_SIZE_KEY = 'labels.lastSize';
const LAST_LAYOUT_KEY = 'labels.lastLayout';

function rememberedSize(): SizeChoice | null {
  try {
    const raw = localStorage.getItem(LAST_SIZE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SizeChoice>;
    if ((v.shape === 'rect' || v.shape === 'circle') && typeof v.preset === 'string' && typeof v.on === 'string') {
      return { ...DEFAULT_CHOICE, ...v } as SizeChoice;
    }
  } catch { /* private window, or a value from an older version */ }
  return null;
}
function rememberSize(choice: SizeChoice) {
  try { localStorage.setItem(LAST_SIZE_KEY, JSON.stringify(choice)); } catch { /* private window */ }
}
function rememberedLayout(): string | null {
  try { return localStorage.getItem(LAST_LAYOUT_KEY); } catch { return null; }
}

const keyOf = (kind: 'item' | 'custom', id: number) => `${kind === 'custom' ? 'c' : 'i'}${id}`;
/** A shelf life this short is easy to print with the wrong dates (2026-10-12): the list marks it. */
const SHORT_LIFE_DAYS = 3;
const LANG_NAMES: Record<StickerLang, string> = { en: 'English', dv: 'ދިވެހި', both: 'Both' };
const parseKey = (key: string): { kind: 'item' | 'custom'; id: number } => ({ kind: key.startsWith('c') ? 'custom' : 'item', id: Number(key.slice(1)) });

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
  const [fixedPages, setFixedPages] = useState<Record<string, { w: number; h: number }>>({});
  const [types, setTypes] = useState<LabelType[]>([]);
  const [asType, setAsType] = useState<number | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
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
  const [previewMode, setPreviewMode] = useState<'one' | 'sheet'>('one');
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ one: string | null; sheet: string; summary: StickerSummary } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);
  // v2 point 10: ?job=ID opens a saved label back in this form; ?custom=ID picks a custom label.
  const [params] = useSearchParams();
  const jobParam = fixedItems ? null : params.get('job');
  const customParam = fixedItems ? null : params.get('custom');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [savedSize, setSavedSize] = useState<{ layout: string; w: number | null; h: number | null } | null>(null);
  // Print again: the last few saved sticker labels, one tap each (a cook
  // prints the same sheet most days). Not on a production line's pop-up.
  const [recent, setRecent] = useState<LabelJob[]>([]);
  const [recentBusy, setRecentBusy] = useState<number | null>(null);
  // Print as, batch and quantity fold away until wanted: the form was a long scroll on a phone.
  const [moreOpen, setMoreOpen] = useState(() => Boolean(defaults?.batch || defaults?.qty));
  // The fixed items by id: a caller passing a new array on each render must not refetch or reset the counts.
  const fixedKey = fixedItems ? fixedItems.map((i) => i.id).join(',') : null;

  useEffect(() => {
    fetchLabelLayouts().then((r) => {
      setPresets(r.presets ?? []);
      setLimits(r.limits ?? null);
      setFixedPages(Object.fromEntries((r.data ?? []).map((l) => [l.key, { w: l.page_w, h: l.page_h }])));
    }).catch(() => setPresets([]));
    fetchLabelTypes().then((r) => setTypes(r.data.filter((t) => t.is_active))).catch(() => setTypes([]));
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

  useEffect(() => {
    if (!jobParam) return;
    fetchLabelJob(Number(jobParam)).then((r) => {
      const q = r.data.request as Record<string, unknown>;
      const items = Array.isArray(q.items) ? (q.items as { id: number; copies: number; kind?: string }[]) : [];
      setPicked(Object.fromEntries(items.map((i) => [keyOf(i.kind === 'custom' ? 'custom' : 'item', Number(i.id)), Number(i.copies)])));
      if (q.lang === 'dv' || q.lang === 'en' || q.lang === 'both') setLang(q.lang);
      setSavedSize({ layout: typeof q.layout === 'string' ? q.layout : 'a4-4', w: q.w != null ? Number(q.w) : null, h: q.h != null ? Number(q.h) : null });
      setFill(Boolean(q.fill));
      if (typeof q.mfg === 'string' && q.mfg) setMfg(q.mfg);
      setExp(typeof q.exp === 'string' ? q.exp : '');
      setBatch(typeof q.batch === 'string' ? q.batch : '');
      setQty(q.qty != null && q.qty !== '' ? String(q.qty) : '');
      setAsType(q.type ? Number(q.type) : null);
      setRounded(Boolean(q.rounded));
      if (q.type || q.batch || q.qty) setMoreOpen(true);
      setEditing({ id: r.data.id, name: r.data.name });
    }).catch(() => setError('That saved label could not be opened.'));
  }, [jobParam]);

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

  const rows: Row[] = useMemo(() => [
    ...products.map((p): Row => ({ key: keyOf('item', p.id), kind: 'item', id: p.id, name: p.name, name_dv: p.name_dv, shelf: p.label_shelf_life_days, ingredients: p.ingredients.from })),
    ...customs.map((c): Row => ({ key: keyOf('custom', c.id), kind: 'custom', id: c.id, name: c.name, name_dv: c.name_dv, shelf: c.label_shelf_life_days ?? c.defaults.shelf_life_days, ingredients: c.ingredients.from, brand: c.brand_name })),
  ], [products, customs]);
  const items = useMemo(() => Object.entries(picked).filter(([, n]) => n > 0).map(([key, copies]) => ({ key, ...parseKey(key), copies })), [picked]);
  const total = items.reduce((s, i) => s + i.copies, 0);

  const needle = query.trim().toLowerCase();
  const shown = rows.filter((r) => (show === 'all' || r.kind === show) && (!needle || picked[r.key] || r.name.toLowerCase().includes(needle) || (r.name_dv ?? '').includes(query.trim())));

  const toggle = (key: string) => setPicked((p) => (p[key] ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== key)) : { ...p, [key]: perPage }));

  const request = (first: string | null = null) => {
    const ordered = first != null && items.some((i) => i.key === first) ? [...items.filter((i) => i.key === first), ...items.filter((i) => i.key !== first)] : items;
    return {
      items: ordered.map((i) => ({ id: i.id, copies: i.copies, kind: i.kind })), lang, layout: sized.layout,
      w: sized.w, h: sized.h,
      rounded: choice.shape === 'rect' && rounded,
      fill, mfg: fill ? mfg : null, exp: fill && exp ? exp : null,
      batch: batch || null, qty: qty ? Number(qty) : null, pi: productionItemId, type: asType,
    };
  };

  // Redraw the preview half a second after the last change; a reply that
  // arrives after a newer request is ignored.
  const previewRequestKey = JSON.stringify([request(previewKey), previewKey, presets.length]);
  useEffect(() => {
    if (items.length === 0 || presets.length === 0) { setPreview(null); setPreviewError(null); setPreviewBusy(false); return; }
    if (sizeIssue) { setPreviewError(sizeIssue); setPreviewBusy(false); return; }
    const seq = ++previewSeq.current;
    setPreviewBusy(true);
    const timer = setTimeout(async () => {
      try {
        const r = await stickerLinks({ ...request(previewKey), preview: true });
        if (seq !== previewSeq.current) return;
        setPreview({ one: r.one_url ?? null, sheet: r.url, summary: r.summary });
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
  const previewRatio = previewMode === 'one' ? stickerW / stickerH : page.w / page.h;
  const previewUrl = preview ? (previewMode === 'one' ? preview.one : preview.sheet) : null;

  const prepare = async () => {
    setBusy(true); setError(null); setResult(null);
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
      {(['one', 'sheet'] as const).map((m) => (
        <button key={m} type="button" onClick={() => setPreviewMode(m)} aria-pressed={previewMode === m} className={['px-3 h-8 min-w-[64px] text-xs font-semibold', previewMode === m ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]' : 'bg-[var(--color-surface)] text-[var(--color-text)]'].join(' ')}>
          {m === 'one' ? 'Sticker' : 'Sheet'}
        </button>
      ))}
    </div>
  );
  const productSelect = items.length > 1 ? (
    <select value={previewed ?? ''} onChange={(e) => setPreviewKey(e.target.value)} className={`${fieldClass} !h-9 !min-h-0`} aria-label="Product to preview">
      {items.map((i) => <option key={i.key} value={i.key}>{nameOf(i.key)}</option>)}
    </select>
  ) : null;
  const previewCaption = preview ? (
    <>
      {previewMode === 'one' ? `${nameOf(previewed)} · ${lang === 'dv' ? 'Dhivehi' : lang === 'both' ? 'English and Dhivehi' : 'English'}` : `Page 1 of ${preview.summary.pages} · ${preview.summary.stickers} ${preview.summary.stickers === 1 ? 'sticker' : 'stickers'}`}
      {' · '}{preview.summary.label.startsWith(sizeName(choice.shape, stickerW, stickerH)) ? preview.summary.label : `${sizeName(choice.shape, stickerW, stickerH)} · ${preview.summary.label}`}. Updates as you change things; the print is the same.
    </>
  ) : null;
  const previewTitle = previewMode === 'one' ? 'Sticker preview' : 'Sheet preview';
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
      controls={<div className="flex flex-wrap items-center gap-2">{modeToggle}{productSelect && <div className="flex-1 min-w-[120px]">{productSelect}</div>}</div>}
    />
  ) : (
    <aside className="space-y-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-4 self-start min-w-0" data-testid="sticker-preview-pane">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-[var(--color-text)] inline-flex items-center gap-1.5"><Eye size={16} className="text-[var(--color-primary)]" /> Preview</h3>
        <div className="ml-auto">{modeToggle}</div>
      </div>
      {productSelect}
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
          {rows.length > 8 && (
            <div className="relative mb-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a product" aria-label="Find a product" className={`${fieldClass} pl-9`} />
            </div>
          )}
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No products are switched on for labels yet. Switch them on in Settings or on an item's Label tab in Menu Items, or make a custom label for something that is not on the menu.</p>
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
                          ? (exp || expiryFrom(mfg, r.shelf)
                            ? <span className="font-semibold text-[var(--color-text-secondary)]" data-testid="row-expiry">EXP {exp || expiryFrom(mfg, r.shelf)}</span>
                            : 'Expiry blank: no shelf life set')
                          : (r.shelf ? `Keeps ${r.shelf} days` : 'No shelf life set, dates print blank')}
                        {' · '}{r.ingredients === 'recipe' ? 'ingredients from the recipe' : r.ingredients === 'manual' ? 'ingredients typed in' : 'no ingredients yet'}
                      </span>
                    </span>
                  </label>
                  {picked[r.key] ? (
                    <div className="ml-auto pl-8 sm:pl-0">
                      <QtyStepper value={picked[r.key]} min={1} max={400} step={perPage} onChange={(n) => setPicked((s) => ({ ...s, [r.key]: n }))} label={`How many ${r.name} stickers`} />
                    </div>
                  ) : null}
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
          <LabelSizePicker presets={presets} limits={limits} choice={choice} onChange={setChoice} rounded={rounded} onRounded={setRounded} />
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">Loading the sizes…</p>
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
          {lang === 'both' && <p className="text-xs text-[var(--color-text-muted)] mt-1">English with the Dhivehi name, ingredients and storage line beneath, on the full and compact sizes; small and round stickers print English.</p>}
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
            {!moreOpen && (asType || batch || qty) && <span className="block text-xs font-semibold text-[var(--color-primary)]">{[asType ? 'print as a type' : null, batch ? `batch ${batch}` : null, qty ? `${qty} per pack` : null].filter(Boolean).join(' · ')}</span>}
            {!moreOpen && !(asType || batch || qty) && <span className="block text-xs font-normal text-[var(--color-text-muted)]">Print as a type, batch number, quantity per pack</span>}
          </span>
        </button>
        {moreOpen && (
          <div id="label-more-options" className="grid gap-3 sm:grid-cols-2 mt-2">
            {types.length > 0 && (
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="label-as-type">Print as</label>
                <select id="label-as-type" value={asType ?? ''} onChange={(e) => setAsType(e.target.value ? Number(e.target.value) : null)} className={fieldClass}>
                  <option value="">Each product's own label type</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">One type for the whole sheet: its heading, dates wording, how-to-use and brand. A product's own typed wording, and a custom label's own brand, still print.</p>
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
                {p.name} × {p.copies}
                {fill ? (p.exp ? ` · EXP ${p.exp}` : ' · expiry blank (no shelf life set)') : ''}
              </li>
            ))}
          </ul>
          {result.job && (
            <div className="text-xs text-[var(--color-text-secondary)] flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Saved as</span>
              <InlineRename name={result.job.name} onSave={(n) => rename(result.job!, n)} buttonClassName="font-bold text-[var(--color-text)]" className="flex-1 min-w-[200px]" />
              <span>on the Saved labels tab, to print again or change later.</span>
            </div>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">{printsViaPdf() ? 'Print opens the PDF: use Share → Print, and keep the scale at 100%, not "fit".' : 'Print at actual size (100%).'} These links work for {result.expires_in_minutes} minutes.</p>
          <div className="labels-actions">
            <div className="labels-actions-row flex flex-wrap gap-2">
              <Button icon={<Printer size={16} />} onClick={() => openLabelSheet(result.url, result.pdf_url)}>Print</Button>
              <Button variant="secondary" icon={<FileDown size={16} />} onClick={() => downloadLabelSheet(result.pdf_url)} aria-label="Download PDF"><span className="sm:hidden">PDF</span><span className="hidden sm:inline">Download PDF</span></Button>
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
