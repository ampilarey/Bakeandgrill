import { useEffect, useMemo, useState } from 'react';
import { Printer, FileDown, AlertTriangle } from 'lucide-react';
import {
  downloadLabelSheet, fetchLabelLayouts, fetchLabelProducts, openLabelSheet, stickerLinks,
  type LabelLayout, type LabelProduct, type SheetLinks, type StickerSummary,
} from '../../api';
import { Button } from '../ui';

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
          <h3 className="text-sm font-bold text-[var(--color-text)] mb-2">Products</h3>
          {products.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No products are switched on for labels yet. Switch them on in Settings below, or on an item's Label tab in Menu Items.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border-light)] border border-[var(--color-border)] rounded-xl overflow-hidden">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2 min-h-[48px] bg-white">
                  <input type="checkbox" checked={Boolean(picked[p.id])} onChange={() => toggle(p.id)} className="w-5 h-5 accent-[var(--color-primary)]" aria-label={`Print ${p.name}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-[var(--color-text)] truncate">{p.name}{p.name_dv ? <span className="ml-2 font-normal text-[var(--color-text-muted)]" dir="rtl">{p.name_dv}</span> : null}</span>
                    <span className="block text-xs text-[var(--color-text-muted)] truncate">
                      {p.label_shelf_life_days ? `Keeps ${p.label_shelf_life_days} days` : 'No shelf life set, dates print blank'}
                      {' · '}{p.ingredients.from === 'recipe' ? 'ingredients from the recipe' : p.ingredients.from === 'manual' ? 'ingredients typed in' : 'no ingredients yet'}
                    </span>
                  </span>
                  {picked[p.id] ? (
                    <input type="number" min={1} max={400} value={picked[p.id]} onChange={(e) => setPicked((s) => ({ ...s, [p.id]: Math.max(1, Math.min(400, Number(e.target.value) || 1)) }))} className="w-20 h-10 min-h-[44px] px-2 rounded-lg border border-[var(--color-border)] text-sm text-right" aria-label={`How many ${p.name} stickers`} />
                  ) : null}
                </label>
              ))}
            </div>
          )}
        </section>
      )}

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
        <label className="flex items-center gap-3 min-h-[44px]">
          <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} className="w-5 h-5 accent-[var(--color-primary)]" />
          <span className="text-sm font-semibold text-[var(--color-text)]">Fill in the dates</span>
          <span className="text-xs text-[var(--color-text-muted)]">Off: blank boxes to write in</span>
        </label>
        {fill && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="label-mfg">Made on</label><input id="label-mfg" type="date" value={mfg} onChange={(e) => setMfg(e.target.value)} className={fieldClass} /></div>
            <div>
              <label className={labelClass} htmlFor="label-exp">Expiry (leave empty to use each product's shelf life)</label>
              <input id="label-exp" type="date" value={exp} onChange={(e) => setExp(e.target.value)} className={fieldClass} />
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelClass} htmlFor="label-batch">Batch number (optional)</label><input id="label-batch" value={batch} maxLength={30} onChange={(e) => setBatch(e.target.value)} className={fieldClass} /></div>
          <div><label className={labelClass} htmlFor="label-qty">Pieces per pack (optional)</label><input id="label-qty" type="number" min={1} max={9999} value={qty} onChange={(e) => setQty(e.target.value)} className={fieldClass} /></div>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-[var(--color-danger)] text-sm text-[var(--color-danger)] bg-white">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {result ? (
        <section className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] space-y-3" data-testid="sticker-summary">
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
          <div className="flex flex-wrap gap-2">
            <Button icon={<Printer size={16} />} onClick={() => openLabelSheet(result.url)}>Print</Button>
            <Button variant="secondary" icon={<FileDown size={16} />} onClick={() => downloadLabelSheet(result.pdf_url)}>Download PDF</Button>
            <Button variant="ghost" onClick={() => setResult(null)}>Change</Button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">Print at actual size (100%). These links work for {result.expires_in_minutes} minutes.</p>
        </section>
      ) : (
        <Button onClick={prepare} loading={busy} disabled={total === 0} icon={<Printer size={16} />} data-testid="sticker-prepare">
          {total > 0 ? `Prepare ${total} ${total === 1 ? 'sticker' : 'stickers'}` : 'Pick a product'}
        </Button>
      )}
    </div>
  );
}
