import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, FileDown, AlertTriangle, Search } from 'lucide-react';
import {
  downloadLabelSheet, fetchLabelLayouts, fetchLabelProducts, openLabelSheet, printsViaPdf, stickerLinks,
  type LabelLayout, type LabelProduct, type SheetLinks, type StickerSummary,
} from '../../api';
import { Button } from '../ui';
import { QtyStepper } from './QtyStepper';

/*
 * Pack stickers: pick products, how many, the language, the label stock and
 * what goes in the date boxes; the server checks it, says what will print,
 * and hands back a print link and a PDF link (good for 30 minutes).
 * Used by Labels → Pack stickers and by "Print stickers" on a production line.
 */

type Props = {
  /** Products fixed by the caller (a production line); hides the chooser. */
  fixedItems?: { id: number; name: string }[];
  /** A production line: its batch, expiry and quantity fill the boxes. */
  productionItemId?: number | null;
  defaults?: { batch?: string; exp?: string | null; mfg?: string | null; qty?: number | null; fill?: boolean };
};

const today = () => new Date().toISOString().slice(0, 10);
const LAST_LAYOUT_KEY = 'labels.lastLayout';

function remembered(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private window */ }
}

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

export function StickerPrintPanel({ fixedItems, productionItemId = null, defaults }: Props) {
  const [products, setProducts] = useState<LabelProduct[]>([]);
  const [layouts, setLayouts] = useState<LabelLayout[]>([]);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [lang, setLang] = useState<'en' | 'dv'>('en');
  const [layout, setLayout] = useState(() => remembered(LAST_LAYOUT_KEY, 'a4-4'));
  const [customW, setCustomW] = useState(80);
  const [customH, setCustomH] = useState(120);
  const [fill, setFill] = useState(defaults?.fill ?? Boolean(productionItemId));
  const [mfg, setMfg] = useState(defaults?.mfg ?? today());
  const [exp, setExp] = useState(defaults?.exp ?? '');
  const [batch, setBatch] = useState(defaults?.batch ?? '');
  const [qty, setQty] = useState(defaults?.qty ? String(defaults.qty) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(SheetLinks & { summary: StickerSummary }) | null>(null);
  const [query, setQuery] = useState('');
  const summaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetchLabelLayouts().then((r) => setLayouts(r.data)).catch(() => setLayouts([]));
    if (!fixedItems) fetchLabelProducts().then((r) => setProducts(r.data)).catch(() => setProducts([]));
  }, [fixedItems]);

  const current = layouts.find((l) => l.key === layout);
  const perPage = current?.per_page ?? 4;

  // A production line prints for its own item, one sheet to start with.
  useEffect(() => {
    if (fixedItems) setPicked(Object.fromEntries(fixedItems.map((i) => [i.id, perPage])));
  }, [fixedItems, perPage]);

  const items = useMemo(() => Object.entries(picked).filter(([, n]) => n > 0).map(([id, copies]) => ({ id: Number(id), copies })), [picked]);
  const total = items.reduce((s, i) => s + i.copies, 0);

  const needle = query.trim().toLowerCase();
  const shown = needle ? products.filter((p) => picked[p.id] || p.name.toLowerCase().includes(needle) || (p.name_dv ?? '').includes(query.trim())) : products;

  const toggle = (id: number) => setPicked((p) => (p[id] ? Object.fromEntries(Object.entries(p).filter(([k]) => Number(k) !== id)) : { ...p, [id]: perPage }));

  const prepare = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await stickerLinks({
        items, lang, layout,
        w: layout === 'single-custom' ? customW : null,
        h: layout === 'single-custom' ? customH : null,
        fill, mfg: fill ? mfg : null, exp: fill && exp ? exp : null,
        batch: batch || null, qty: qty ? Number(qty) : null, pi: productionItemId,
      });
      remember(LAST_LAYOUT_KEY, layout);
      setResult(r);
      // On a phone the summary lands below the fold; bring it up.
      requestAnimationFrame(() => summaryRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the stickers.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="sticker-print-panel">
      {!fixedItems && (
        <section>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold text-[var(--color-text)]">Products</h3>
            {items.length > 0 && <span className="text-xs font-semibold text-[var(--color-primary)]">{items.length} picked · {total} {total === 1 ? 'sticker' : 'stickers'}</span>}
          </div>
          {products.length > 8 && (
            <div className="relative mb-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a product" aria-label="Find a product" className={`${fieldClass} pl-9`} />
            </div>
          )}
          {products.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No products are switched on for labels yet. Switch them on in Settings, or on an item's Label tab in Menu Items.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border-light)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              {shown.map((p) => (
                <div key={p.id} className={['flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 min-h-[56px]', picked[p.id] ? 'bg-[var(--color-surface-hover)]' : 'bg-white'].join(' ')}>
                  <label className="flex items-center gap-3 flex-1 min-w-[180px] py-1 cursor-pointer">
                    <input type="checkbox" checked={Boolean(picked[p.id])} onChange={() => toggle(p.id)} className="w-5 h-5 shrink-0 accent-[var(--color-primary)]" aria-label={`Print ${p.name}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[var(--color-text)]">{p.name}{p.name_dv ? <span className="ml-2 font-normal text-[var(--color-text-muted)]" dir="rtl">{p.name_dv}</span> : null}</span>
                      <span className="block text-xs text-[var(--color-text-muted)] sm:truncate">
                        {p.label_shelf_life_days ? `Keeps ${p.label_shelf_life_days} days` : 'No shelf life set, dates print blank'}
                        {' · '}{p.ingredients.from === 'recipe' ? 'ingredients from the recipe' : p.ingredients.from === 'manual' ? 'ingredients typed in' : 'no ingredients yet'}
                      </span>
                    </span>
                  </label>
                  {picked[p.id] ? (
                    <div className="ml-auto pl-8 sm:pl-0">
                      <QtyStepper value={picked[p.id]} min={1} max={400} step={perPage} onChange={(n) => setPicked((s) => ({ ...s, [p.id]: n }))} label={`How many ${p.name} stickers`} />
                    </div>
                  ) : null}
                </div>
              ))}
              {shown.length === 0 && <p className="px-3 py-4 text-sm text-[var(--color-text-muted)] bg-white">No product matches “{query}”.</p>}
            </div>
          )}
          {items.length > 0 && <p className="text-xs text-[var(--color-text-muted)] mt-1">− and + move a whole sheet ({perPage} on {current?.label ?? 'this stock'}); type in the box for any number.</p>}
        </section>
      )}

      {fixedItems && fixedItems.map((i) => (
        <section key={i.id} className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className={labelClass}>Stickers</span>
            <span className="block text-sm font-semibold text-[var(--color-text)]">{i.name}</span>
          </div>
          <QtyStepper value={picked[i.id] ?? perPage} min={1} max={400} step={perPage} onChange={(n) => setPicked((s) => ({ ...s, [i.id]: n }))} label={`How many ${i.name} stickers`} />
        </section>
      ))}

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={labelClass}>Language</span>
          <div className="flex gap-2">
            {(['en', 'dv'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} className={['flex-1 h-10 min-h-[44px] rounded-lg border text-sm font-semibold', lang === l ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white' : 'bg-white border-[var(--color-border)] text-[var(--color-text)]'].join(' ')}>
                {l === 'en' ? 'English' : 'ދިވެހި'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="label-layout">Label stock</label>
          <select id="label-layout" value={layout} onChange={(e) => setLayout(e.target.value)} className={fieldClass}>
            {layouts.map((l) => <option key={l.key} value={l.key}>{l.label}{l.compact ? ' (compact sticker)' : ''}</option>)}
          </select>
          {current ? <p className="text-xs text-[var(--color-text-muted)] mt-1">{current.hint}</p> : null}
        </div>
        {layout === 'single-custom' && (
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            <div><label className={labelClass} htmlFor="label-w">Width (mm)</label><input id="label-w" type="number" min={50} max={210} value={customW} onChange={(e) => setCustomW(Number(e.target.value))} className={fieldClass} /></div>
            <div><label className={labelClass} htmlFor="label-h">Height (mm)</label><input id="label-h" type="number" min={45} max={297} value={customH} onChange={(e) => setCustomH(Number(e.target.value))} className={fieldClass} /></div>
          </div>
        )}
      </section>

      <section className="space-y-3">
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
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Leave empty to use each product's shelf life.</p>
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelClass} htmlFor="label-batch">Batch number (optional)</label><input id="label-batch" value={batch} maxLength={30} onChange={(e) => setBatch(e.target.value)} className={fieldClass} /></div>
          <div><label className={labelClass} htmlFor="label-qty">Pieces per pack (optional)</label><input id="label-qty" type="number" inputMode="numeric" min={1} max={9999} value={qty} onChange={(e) => setQty(e.target.value)} className={fieldClass} /></div>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-[var(--color-danger)] text-sm text-[var(--color-danger)] bg-white">
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
              <li key={p.id}>
                {p.name} × {p.copies}
                {fill ? (p.exp ? ` · EXP ${p.exp}` : ' · expiry blank (no shelf life set)') : ''}
              </li>
            ))}
          </ul>
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
            <Button onClick={prepare} loading={busy} disabled={total === 0} icon={<Printer size={16} />} data-testid="sticker-prepare">
              {total > 0 ? `Prepare ${total} ${total === 1 ? 'sticker' : 'stickers'}` : 'Pick a product'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
