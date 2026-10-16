import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Printer, FileDown, Pencil, Copy, Trash2, Tag, ChevronDown, ChevronUp, Star, Clock } from 'lucide-react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';
import { MakeLabelWizard } from '../components/labels/MakeLabelWizard';
import { StickerPrintPanel } from '../components/labels/StickerPrintPanel';
import { BoxLabelPanel } from '../components/labels/BoxLabelPanel';
import { TypesAndBrands } from '../components/labels/TypesAndBrands';
import { CustomLabelsTab } from '../components/labels/CustomLabels';
import { InlineRename } from '../components/labels/InlineRename';
import { ExpiringStock } from '../components/labels/ExpiringStock';
import { IngredientGlossary } from '../components/labels/IngredientGlossary';
import { NutritionCard } from '../components/labels/NutritionCard';
import { LabelPrinterCard } from '../components/labels/LabelPrinterCard';
import { LabelsTour } from '../components/labels/LabelsTour';
import { LabelRollsCard } from '../components/labels/LabelRollsCard';
import { ShelfLifeHint } from '../components/labels/ShelfLifeHint';
import { WordingLockCard } from '../components/labels/WordingLockCard';
import { Switch } from '../components/SharedUI';
import { Button, Card, useToast } from '../components/ui';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  deleteLabelJob, downloadLabelSheet, duplicateLabelJob, fetchLabelJobs, fetchLabelLayouts, fetchLabelPrints, fetchLabelProducts, fetchLabelSettings,
  openLabelSheet, pinLabelJob, printLabelJob, renameLabelJob, saveLabelSettings, setLabelJobDates, updateItemLabel,
  type ShelfLifeSuggestions, type LabelJob, type LabelPrintRow, type LabelProduct, type LabelSettingsMap, type LabelStorage, type IngredientsSource, type StickerSummary,
} from '../api';

/*
 * Labels (owner, 2026-10-04: "I want to print labels like this … accessible
 * to all staff who have the authority"; "by default admin only, but option to
 * give permission to any staff"). Print labels and box labels print from
 * here; the settings behind them are on the last tab. docs/LABEL_HUB_PLAN.md.
 */

const KIND: Record<LabelPrintRow['kind'], string> = { sticker_en: 'Stickers', sticker_dv: 'Stickers (ދިވެހި)', sticker_both: 'Stickers (both languages)', box_label: 'Box label' };

/** A shelf life this short is easy to print with the wrong dates (2026-10-12). */
const SHORT_LIFE_DAYS = 3;
const shortLife = (days: number | null) => days !== null && days <= SHORT_LIFE_DAYS;
const ShortLifeChip = ({ days }: { days: number }) => (
  <span className="ml-2 inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-semibold align-middle" style={{ background: 'color-mix(in srgb, var(--color-warning) 18%, transparent)', color: 'var(--color-warning)', border: '1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)' }} data-testid="short-life">
    <Clock size={11} aria-hidden /> Short life · {days} {days === 1 ? 'day' : 'days'}
  </span>
);

/*
 * Saved labels (v2 point 10; owner: "created labels must be saved,
 * redownloaded, reprinted, reedited"). Every prepared print is kept with
 * its request; from here it prints again, downloads, opens back in the
 * form, is copied, renamed or removed. The print log sits beneath.
 */
function jobLine(j: LabelJob): string {
  if (!j.summary) return j.kind === 'box' ? 'Box label' : 'Stickers';
  if (j.kind === 'box') {
    const b = j.summary as { customer: string; lines: { name: string; qty: number }[] };
    return `Box label · ${b.customer || 'blank'} · ${b.lines.length} ${b.lines.length === 1 ? 'line' : 'lines'}`;
  }
  const st = j.summary as StickerSummary;
  // The automatic name already says the products and the size; a line that repeats them is noise.
  const products = st.products.map((p) => `${p.name} ×${p.copies}`).join(', ');
  const parts = [`${st.stickers} ${st.stickers === 1 ? 'sticker' : 'stickers'}`];
  if (!j.name.includes(st.label)) parts.push(st.label);
  if (!j.name.includes(products)) parts.push(products);
  return parts.join(' · ');
}

/**
 * How Print again dates a saved label's stickers (label audit, 2026-10-16):
 * made today, with the use-by worked out from the shelf life, or the typed
 * use-by kept. A label with no typed use-by has only the first.
 */
function JobDates({ job, onChange }: { job: LabelJob; onChange: (mode: 'shelf' | 'keep') => void }) {
  const kept = job.typed_exp ? new Date(`${job.typed_exp}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const chip = (on: boolean) => ['h-8 min-h-[32px] px-3 rounded-full text-xs font-semibold border', on
    ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]'
    : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-secondary)]'].join(' ');
  if (!kept) {
    return <div className="text-xs text-[var(--color-text-muted)] mt-1" data-testid={`job-dates-${job.id}`}>Print again: made today, use-by from its shelf life.</div>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 mt-1" role="group" aria-label="How Print again dates the stickers" data-testid={`job-dates-${job.id}`}>
      <span className="text-xs text-[var(--color-text-muted)]">Print again:</span>
      <button type="button" className={chip(job.dates === 'shelf')} aria-pressed={job.dates === 'shelf'} onClick={() => onChange('shelf')}>Shelf life from today</button>
      <button type="button" className={chip(job.dates === 'keep')} aria-pressed={job.dates === 'keep'} onClick={() => onChange('keep')}>Keep use-by {kept}</button>
    </div>
  );
}

function SavedLabelsTab() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<LabelJob[]>([]);
  const [page, setPage] = useState(1);
  const [last, setLast] = useState(1);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const load = () => fetchLabelJobs({ page, q: q.trim() || undefined }).then((r) => { setRows(r.data); setLast(r.last_page); }).catch(() => setRows([]));
  useEffect(() => { void load(); }, [page, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const print = async (j: LabelJob, pdf: boolean) => {
    setBusy(j.id);
    try {
      const r = await printLabelJob(j.id);
      if (pdf) downloadLabelSheet(r.pdf_url); else openLabelSheet(r.url, r.pdf_url);
      void load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not print it.');
    } finally {
      setBusy(null);
    }
  };
  const edit = (j: LabelJob) => navigate(`/labels/${j.kind === 'box' ? 'box' : 'stickers'}?job=${j.id}`);
  const copy = async (j: LabelJob) => {
    try { const r = await duplicateLabelJob(j.id); edit(r.data); } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not copy it.'); }
  };
  const rename = async (j: LabelJob, name: string) => {
    try { await renameLabelJob(j.id, name); void load(); } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not rename it.'); }
  };
  const remove = async (j: LabelJob) => {
    if (!window.confirm(`Remove the saved label "${j.name}"? Prints already made are kept in the log.`)) return;
    try { await deleteLabelJob(j.id); void load(); } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not remove it.'); }
  };
  // A pinned (favourite) label leads the list and Print again (2026-10-12).
  const pin = async (j: LabelJob) => {
    try { await pinLabelJob(j.id, !j.pinned); void load(); } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not pin it.'); }
  };
  // How Print again dates the stickers (label audit, 2026-10-16).
  const dates = async (j: LabelJob, mode: 'shelf' | 'keep') => {
    try { await setLabelJobDates(j.id, mode); void load(); } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not change it.'); }
  };
  const btn = 'w-9 h-9 inline-flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] disabled:opacity-40';

  return (
    <div className="space-y-5">
      <Card padding="none" header={<div className="flex flex-wrap items-center gap-3"><div className="flex-1 min-w-[160px]"><h3 className="font-bold text-[var(--color-text)]">Saved labels</h3><p className="text-xs text-[var(--color-text-muted)] mt-1">Every label you prepare is kept here. Print it again (made today; each label says how its use-by is set), download the PDF, open it to change, copy, rename or remove.</p></div>
        <div className="relative w-full sm:w-64"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" /><input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Find a saved label" aria-label="Find a saved label" className="h-10 min-h-[44px] pl-9 pr-3 rounded-lg border border-[var(--color-border)] bg-white text-sm w-full" /></div></div>}>
        <ul className="divide-y divide-[var(--color-border-light)]" data-testid="saved-labels">
          {rows.map((j) => (
            <li key={j.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                {j.pinned ? <Star size={16} className="mt-1 shrink-0 text-[var(--color-warning)] fill-current" aria-label="Pinned" /> : <Tag size={16} className="mt-1 shrink-0 text-[var(--color-primary)]" />}
                <div className="flex-1 min-w-0">
                  <InlineRename name={j.name} onSave={(n) => rename(j, n)} buttonClassName="text-sm font-semibold text-[var(--color-text)]" />
                  <div className="text-xs text-[var(--color-text-secondary)]">{jobLine(j)}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{j.print_count ? `Printed ${j.print_count} ${j.print_count === 1 ? 'time' : 'times'}${j.last_printed_at ? `, last ${when(j.last_printed_at)}` : ''}` : 'Not printed yet'}{j.created_by ? ` · ${j.created_by}` : ''}</div>
                  {j.dates && <JobDates job={j} onChange={(mode) => dates(j, mode)} />}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-1 pl-7">
                <Button size="sm" icon={<Printer size={14} />} loading={busy === j.id} onClick={() => print(j, false)} aria-label={`Print ${j.name}`}>Print</Button>
                <button type="button" className={btn} onClick={() => print(j, true)} aria-label={`Download PDF of ${j.name}`}><FileDown size={16} /></button>
                <button type="button" className={btn} onClick={() => edit(j)} aria-label={`Edit ${j.name}`}><Pencil size={16} /></button>
                <button type="button" className={btn} onClick={() => copy(j)} aria-label={`Copy ${j.name}`}><Copy size={16} /></button>
                <button type="button" className={btn} onClick={() => pin(j)} aria-label={`${j.pinned ? 'Unpin' : 'Pin'} ${j.name}`} aria-pressed={j.pinned} title={j.pinned ? 'Unpin' : 'Pin: keep it at the top and in Print again'}><Star size={16} className={j.pinned ? 'text-[var(--color-warning)] fill-current' : ''} /></button>
                <button type="button" className={btn} onClick={() => remove(j)} aria-label={`Remove ${j.name}`}><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]" data-testid="saved-zero-state">
              {q ? 'No saved label matches.' : (
                <span className="inline-flex flex-wrap items-center justify-center gap-2">
                  <span>Nothing saved yet: every label you prepare lands here.</span>
                  <Button size="sm" onClick={() => navigate('/labels/make')}>Make a label</Button>
                </span>
              )}
            </li>
          )}
        </ul>
        {last > 1 && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--color-border-light)]">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
            <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {last}</span>
            <Button variant="secondary" disabled={page >= last} onClick={() => setPage((p) => p + 1)}>Older</Button>
          </div>
        )}
      </Card>
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-text-secondary)] py-2">Print log: every sheet printed, by whom, with its dates and batch</summary>
        <div className="mt-2"><HistoryTab /></div>
      </details>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function HistoryTab() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [rows, setRows] = useState<LabelPrintRow[]>([]);
  const [page, setPage] = useState(1);
  const [last, setLast] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<Record<string, string>>({ 'a4-box': 'A4 box label' });
  useEffect(() => {
    setLoading(true);
    fetchLabelPrints({ page }).then((r) => { setRows(r.data); setLast(r.last_page); }).catch(() => setRows([])).finally(() => setLoading(false));
  }, [page]);
  // The log stores the stock's key; show its name.
  useEffect(() => {
    fetchLabelLayouts().then((r) => setStock((s) => ({ ...s, ...Object.fromEntries(r.data.map((l) => [l.key, l.label])) }))).catch(() => undefined);
  }, []);

  const what = (r: LabelPrintRow) => (r.item ? `${r.item}${r.custom ? ' (custom)' : ''}` : null) ?? r.delivery ?? (r.kind === 'box_label' ? 'Blank template' : '');
  const stockName = (r: LabelPrintRow) => r.stock ?? stock[r.layout] ?? r.layout;
  const dates = (r: LabelPrintRow) => (r.mfg_date ? `${r.mfg_date} → ${r.exp_date ?? 'blank'}` : 'Dates handwritten');
  const empty = !loading && rows.length === 0;
  // Scan to reprint (round 11): a sticker print opens Print labels on the very label that made it.
  const reprint = (r: LabelPrintRow) => (r.reprintable && r.code ? (
    <button type="button" onClick={() => navigate(`/labels/stickers?code=${r.code}`)} className="inline-flex items-center gap-1 h-8 min-h-[32px] px-2 rounded-lg border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]" aria-label={`Print the sticker of pack ${r.code} again`} title="Opens Print labels on this very label, with the same details">
      <Printer size={14} aria-hidden /> Print again
    </button>
  ) : null);
  const reprintOf = (r: LabelPrintRow) => (r.reprint_of ? <span className="block text-xs text-[var(--color-text-muted)]">Reprint of {r.reprint_of}</span> : null);

  return (
    <Card padding="none">
      {isMobile ? (
        <ul className="divide-y divide-[var(--color-border-light)]" data-testid="label-history-cards">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--color-text)] min-w-0">{what(r)}</span>
                <span className="text-sm font-semibold text-[var(--color-text)] shrink-0">× {r.copies}</span>
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">{KIND[r.kind] ?? r.kind} · {stockName(r)}</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {dates(r)}{r.batch_code ? ` · batch ${r.batch_code}` : ''}
                {r.code && r.batch_url && <> · <a href={r.batch_url} target="_blank" rel="noreferrer" className="font-mono text-[var(--color-primary)]" aria-label={`Open the pack page ${r.code}`}>{r.code}</a></>}
                {r.reprint_of ? ` · reprint of ${r.reprint_of}` : ''}
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{when(r.created_at)}{r.printed_by ? ` · ${r.printed_by}` : ''}</span>
                {reprint(r)}
              </div>
            </li>
          ))}
          {empty && <li className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">Nothing printed yet.</li>}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-secondary)] border-b border-[var(--color-border)]">
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">What</th>
                <th className="px-4 py-3 font-semibold">Product or delivery</th>
                <th className="px-4 py-3 font-semibold text-right">Copies</th>
                <th className="px-4 py-3 font-semibold">Dates</th>
                <th className="px-4 py-3 font-semibold">Batch</th>
                <th className="px-4 py-3 font-semibold">Pack code</th>
                <th className="px-4 py-3 font-semibold">By</th>
                <th className="px-4 py-3 font-semibold"><span className="sr-only">Print again</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border-light)]">
                  <td className="px-4 py-3 whitespace-nowrap">{when(r.created_at)}</td>
                  <td className="px-4 py-3">{KIND[r.kind] ?? r.kind}<span className="block text-xs text-[var(--color-text-muted)]">{stockName(r)}</span></td>
                  <td className="px-4 py-3">{what(r)}</td>
                  <td className="px-4 py-3 text-right">{r.copies}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.mfg_date ? `${r.mfg_date} → ${r.exp_date ?? 'blank'}` : 'Handwritten'}</td>
                  <td className="px-4 py-3">{r.batch_code ?? ''}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.code && r.batch_url ? <a href={r.batch_url} target="_blank" rel="noreferrer" className="font-mono text-[var(--color-primary)]" title="The QR on every sticker of this print opens this page" aria-label={`Open the pack page ${r.code}`}>{r.code}</a> : ''}{reprintOf(r)}</td>
                  <td className="px-4 py-3">{r.printed_by ?? ''}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{reprint(r)}</td>
                </tr>
              ))}
              {empty && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-[var(--color-text-muted)]">Nothing printed yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {last > 1 && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--color-border-light)]">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
          <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {last}</span>
          <Button variant="secondary" disabled={page >= last} onClick={() => setPage((p) => p + 1)}>Older</Button>
        </div>
      )}
    </Card>
  );
}

type Wording = { key: string; label: string; dv?: boolean };

/** Settings → Wording, in groups. The frozen keys kept their original names. */
const WORDING_GROUPS: { title: string; hint?: string; rows: Wording[] }[] = [
  {
    title: 'Sticker bottom strip',
    rows: [
      { key: 'label_brand_line_dv', label: 'Brand line above the heading (Dhivehi)', dv: true },
      { key: 'label_contact_ways', label: 'Ways to reach you' },
      { key: 'label_contact_ways_dv', label: 'Ways to reach you (Dhivehi)', dv: true },
      { key: 'label_address_dv', label: 'Address (Dhivehi)', dv: true },
      { key: 'label_landmark_dv', label: 'Landmark (Dhivehi)', dv: true },
    ],
  },
  {
    title: 'Box label',
    hint: 'By the "Keep it" choice on the box label. A shop\'s saved label can carry its own heading and strip.',
    rows: [
      { key: 'label_box_heading', label: 'Heading under the name: frozen' },
      { key: 'label_box_heading_chilled', label: 'Heading: chilled' },
      { key: 'label_box_heading_ambient', label: 'Heading: room temperature' },
      { key: 'label_box_badge_frozen', label: 'Badge, small line: frozen' },
      { key: 'label_box_badge_frozen_2', label: 'Badge, big line: frozen' },
      { key: 'label_box_badge_chilled', label: 'Badge, small line: chilled' },
      { key: 'label_box_badge_chilled_2', label: 'Badge, big line: chilled' },
      { key: 'label_box_badge_ambient', label: 'Badge, small line: room temperature' },
      { key: 'label_box_badge_ambient_2', label: 'Badge, big line: room temperature' },
      { key: 'label_box_strip', label: 'Handling strip: frozen' },
      { key: 'label_box_strip_chilled', label: 'Handling strip: chilled' },
      { key: 'label_box_strip_ambient', label: 'Handling strip: room temperature' },
    ],
  },
];

function SettingsTab({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [onlyOn, setOnlyOn] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [settings, setSettings] = useState<LabelSettingsMap>({});
  const [products, setProducts] = useState<LabelProduct[]>([]);
  const [saving, setSaving] = useState(false);
  // On a phone an open product is a form of four boxes; only the one tapped is open.
  const [openId, setOpenId] = useState<number | null>(null);

  // Round 15: a shelf life to suggest for each storage.
  const [shelfLife, setShelfLife] = useState<ShelfLifeSuggestions | null>(null);
  const load = () => {
    fetchLabelLayouts().then((r) => setShelfLife(r.shelf_life ?? null)).catch(() => setShelfLife(null));
    fetchLabelSettings().then((r) => setSettings(r.data)).catch(() => undefined);
    fetchLabelProducts(true).then((r) => setProducts(r.data)).catch(() => undefined);
  };
  useEffect(load, []);

  const saveItem = async (p: LabelProduct, patch: Partial<{ label_enabled: boolean; label_shelf_life_days: number | null; label_storage: LabelStorage; label_ingredients_source: IngredientsSource; label_ingredients: string | null }>) => {
    try {
      const r = await updateItemLabel(p.id, patch);
      setProducts((s) => s.map((x) => (x.id === p.id ? r.data : x)));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const saveWording = async () => {
    setSaving(true);
    try {
      const r = await saveLabelSettings(settings);
      setSettings(r.data);
      toast('success', 'Label wording saved.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const input = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm w-full';
  const control = 'h-10 min-h-[44px] px-2 rounded-lg border border-[var(--color-border)] bg-white text-sm';

  // Every menu item is listed, so a phone was a very long scroll. Start on the
  // products already on labels (when there are any) and let a search find the rest.
  const onCount = products.filter((p) => p.label_enabled).length;
  const showOnly = onlyOn ?? onCount > 0;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (!showOnly || p.label_enabled) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, showOnly, query]);

  const enabledBox = (p: LabelProduct) => (
    <input type="checkbox" checked={p.label_enabled} disabled={!canManage} onChange={(e) => saveItem(p, { label_enabled: e.target.checked })} className="w-5 h-5 shrink-0 accent-[var(--color-primary)]" aria-label={`${p.name} on labels`} />
  );
  const shelfBox = (p: LabelProduct, cls: string) => (
    <input key={`life-${p.id}-${p.label_shelf_life_days ?? ''}`} type="number" inputMode="numeric" min={1} max={730} defaultValue={p.label_shelf_life_days ?? ''} placeholder="Blank" disabled={!canManage} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== p.label_shelf_life_days) saveItem(p, { label_shelf_life_days: v }); }} className={`${control} ${cls}`} aria-label={`${p.name} shelf life in days`} />
  );
  const storageSelect = (p: LabelProduct, cls = '') => (
    <select value={p.label_storage} disabled={!canManage} onChange={(e) => saveItem(p, { label_storage: e.target.value as LabelStorage })} className={`${control} ${cls}`} aria-label={`${p.name} storage`}>
      <option value="frozen">Frozen</option><option value="chilled">Chilled</option><option value="ambient">Room temperature</option>
    </select>
  );
  const sourceSelect = (p: LabelProduct, cls = '') => (
    <select value={p.label_ingredients_source} disabled={!canManage} onChange={(e) => saveItem(p, { label_ingredients_source: e.target.value as IngredientsSource })} className={`${control} ${cls}`} aria-label={`${p.name} ingredients source`}>
      <option value="auto">Recipe, else typed{p.has_recipe ? '' : ' (no recipe)'}</option><option value="recipe">Recipe</option><option value="manual">Typed in</option>
    </select>
  );
  const small = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';
  // Owner, 2026-10-04: "how to manually enter ingredients". Typed here as well
  // as on the item's Label tab, so a product can be finished without leaving
  // this page. Saved when the box loses focus.
  const ingredientsBox = (p: LabelProduct) => (
    <textarea
      rows={2}
      maxLength={500}
      defaultValue={p.label_ingredients ?? ''}
      disabled={!canManage}
      placeholder={p.ingredients.from === 'recipe' ? 'Printing from the recipe; type here to use instead' : 'Flour, salt, oil, onion, smoked tuna'}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (p.label_ingredients ?? '')) saveItem(p, { label_ingredients: v || null }); }}
      className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm resize-y"
      aria-label={`${p.name} ingredients`}
    />
  );

  return (
    <div className="space-y-5">
      <Card header={<div><h3 className="font-bold text-[var(--color-text)]">Products on labels</h3><p className="text-xs text-[var(--color-text-muted)] mt-1">Switch a product on to print it. Ingredients, pictures and the Dhivehi lines are on each item's Label tab in Menu Items.</p></div>} padding="none">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--color-border-light)]">
          <div className="flex rounded-lg bg-[var(--color-bg)] p-1" role="group" aria-label="Which products">
            {([[true, `On labels (${onCount})`], [false, `All items (${products.length})`]] as const).map(([v, l]) => (
              <button key={String(v)} type="button" aria-pressed={showOnly === v} onClick={() => setOnlyOn(v)} className={['h-9 px-3 rounded-md text-sm font-semibold whitespace-nowrap', showOnly === v ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm' : 'text-[var(--color-text-secondary)]'].join(' ')}>{l}</button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an item" aria-label="Find an item" className={`${input} pl-9`} />
          </div>
        </div>
        {isMobile ? (
          <ul className="divide-y divide-[var(--color-border-light)]" data-testid="label-products-cards">
            {shown.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                    <span className="pt-0.5">{enabledBox(p)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[var(--color-text)]">{p.name}{p.name_dv ? <span className="ml-2 font-normal text-[var(--color-text-muted)]" dir="rtl">{p.name_dv}</span> : null}{p.label_enabled && shortLife(p.label_shelf_life_days) && <ShortLifeChip days={p.label_shelf_life_days as number} />}</span>
                      <span className="block text-xs text-[var(--color-text-muted)] line-clamp-2">
                        {p.label_enabled ? `${p.label_shelf_life_days ? `Keeps ${p.label_shelf_life_days} days` : 'No shelf life'} · ${({ frozen: 'frozen', chilled: 'chilled', ambient: 'room temperature' } as const)[p.label_storage]} · ` : ''}
                        {p.ingredients.from === 'recipe' ? `From the recipe: ${p.ingredients.en}` : (p.ingredients.en || 'No ingredients yet: the sticker leaves them off')}
                      </span>
                    </span>
                  </label>
                  {p.label_enabled && (
                    <button type="button" onClick={() => setOpenId((o) => (o === p.id ? null : p.id))} aria-expanded={openId === p.id} className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]" aria-label={`${openId === p.id ? 'Hide' : 'Show'} ${p.name} label settings`}>
                      {openId === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                </div>
                {p.label_enabled && openId === p.id && (
                  <div className="grid grid-cols-2 gap-2 mt-3 pl-8">
                    <div className="col-span-2"><span className={small}>Ingredients (typed)</span>{ingredientsBox(p)}</div>
                    <div><span className={small}>Shelf life (days)</span>{shelfBox(p, 'w-full')}<ShelfLifeHint storage={p.label_storage} value={p.label_shelf_life_days} suggestions={shelfLife} disabled={!canManage} onUse={(n) => saveItem(p, { label_shelf_life_days: n })} testId={`shelf-life-hint-${p.id}`} /></div>
                    <div><span className={small}>Storage</span>{storageSelect(p, 'w-full')}</div>
                    <div className="col-span-2"><span className={small}>Ingredients from</span>{sourceSelect(p, 'w-full')}</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-secondary)] border-b border-[var(--color-border)]">
                  <th className="px-4 py-3 font-semibold">On labels</th>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Shelf life (days)</th>
                  <th className="px-4 py-3 font-semibold">Storage</th>
                  <th className="px-4 py-3 font-semibold">Ingredients from</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--color-border-light)]">
                    <td className="px-4 py-2">{enabledBox(p)}</td>
                    <td className="px-4 py-2 min-w-[280px]">{p.name}{p.label_enabled && shortLife(p.label_shelf_life_days) && <ShortLifeChip days={p.label_shelf_life_days as number} />}{p.ingredients.from === 'recipe' && <span className="block text-xs text-[var(--color-text-muted)] truncate max-w-[280px]">From the recipe: {p.ingredients.en}</span>}{p.label_enabled && <div className="mt-1">{ingredientsBox(p)}</div>}</td>
                    <td className="px-4 py-2 max-w-[220px]">{shelfBox(p, 'w-24')}{p.label_enabled && <ShelfLifeHint storage={p.label_storage} value={p.label_shelf_life_days} suggestions={shelfLife} disabled={!canManage} onUse={(n) => saveItem(p, { label_shelf_life_days: n })} testId={`shelf-life-hint-${p.id}`} />}</td>
                    <td className="px-4 py-2">{storageSelect(p)}</td>
                    <td className="px-4 py-2">{sourceSelect(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {shown.length === 0 && products.length > 0 && (
          <p className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">{query ? `No item matches “${query}”.` : 'No products are on labels yet. Pick All items to switch some on.'}</p>
        )}
      </Card>

      {/* The rolls and sheets the business owns (round 6, 2026-10-13): every size picker shows them first. */}
      <LabelRollsCard canManage={canManage} />

      <Card className="labels-sticky" padding="sm" header={<div><h3 className="font-bold text-[var(--color-text)]">Wording</h3><p className="text-xs text-[var(--color-text-muted)] mt-1">Phone, website, address and tagline come from Business Details. Empty a box to go back to the original wording.</p></div>}>
        <div className="space-y-5">
          {WORDING_GROUPS.map((g) => (
            <div key={g.title}>
              <h4 className="text-sm font-bold text-[var(--color-text)]">{g.title}</h4>
              {g.hint && <p className="text-xs text-[var(--color-text-muted)] mb-2">{g.hint}</p>}
              <div className="grid gap-3 sm:grid-cols-2 mt-2">
                {g.rows.map((w) => (
                  <div key={w.key}>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor={w.key}>{w.label}</label>
                    <textarea id={w.key} rows={w.key.includes('badge') ? 1 : 2} dir={w.dv ? 'rtl' : undefined} value={settings[w.key] ?? ''} disabled={!canManage} onChange={(e) => setSettings((s) => ({ ...s, [w.key]: e.target.value }))} className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm resize-y" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <h4 className="text-sm font-bold text-[var(--color-text)] mt-5 mb-1">Dates and fonts</h4>
        <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor="label_date_style">How dates print</label>
            <select id="label_date_style" value={settings.label_date_style ?? 'dmy'} disabled={!canManage} onChange={(e) => setSettings((s) => ({ ...s, label_date_style: e.target.value }))} className={input}>
              <option value="dmy">04 / 10 / 2026</option>
              <option value="text">4 Oct 2026</option>
            </select>
          </div>
          <div>
            {/* Owner, 2026-10-12: "dhivehi font is not nice". */}
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor="label_dhivehi_font">Dhivehi font on stickers</label>
            <select id="label_dhivehi_font" value={settings.label_dhivehi_font ?? 'noto'} disabled={!canManage} onChange={(e) => setSettings((s) => ({ ...s, label_dhivehi_font: e.target.value }))} className={input}>
              <option value="noto">Noto Sans Thaana · clean, with a real bold</option>
              <option value="faruma">Faruma · the classic face</option>
              <option value="site">The font uploaded for the website</option>
            </select>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">The website font prints on the PDF only when it was uploaded as TTF or OTF; otherwise the PDF falls back to Faruma.</p>
          </div>
        </div>
        {/* 2026-10-12: the batch QR (BatchLink) and the allergen pictograms (AllergenIcons), each with a switch. */}
        <h4 className="text-sm font-bold text-[var(--color-text)] mt-5 mb-1">On the sticker</h4>
        <div className="max-w-2xl" data-testid="label-sticker-switches">
          {([
            ['label_batch_qr', 'Batch QR in the header', 'Every print gets a code; the QR opens the pack\'s page with its dates, batch, ingredients and allergens. On the full sticker and the 99 mm compact one.'],
            ['label_allergen_icons', 'Allergen pictograms', 'Symbols with the word beneath, above the note on the full sticker; a chilli for a spicy item. The "Contains …" note stays either way.'],
          ] as const).map(([k, l, h]) => (
            <div key={k} className="flex items-start justify-between gap-3 py-2.5 border-b border-[var(--color-border-light)]">
              <div className="min-w-0"><div className="text-sm font-semibold text-[var(--color-text)]">{l}</div><div className="text-xs text-[var(--color-text-muted)]">{h}</div></div>
              <Switch checked={(settings[k] ?? '1') !== '0'} disabled={!canManage} onChange={(v) => setSettings((s) => ({ ...s, [k]: v ? '1' : '0' }))} aria-label={l} />
            </div>
          ))}
        </div>
        <h4 className="text-sm font-bold text-[var(--color-text)] mt-5 mb-1">Pre-cut sheet position</h4>
        <p className="text-xs text-[var(--color-text-muted)] mb-2">If stickers on ready-cut sheets print off the cut, move them here in millimetres: down and right are positive, gap is the space between labels.</p>
        <div className="grid gap-3 grid-cols-3 items-end">
          {[['label_precut_top', 'Down'], ['label_precut_left', 'Right'], ['label_precut_gutter', 'Gap']].map(([k, l]) => (
            <div key={k}><label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor={k}>{l}</label><input id={k} type="number" step="0.5" min={-20} max={20} value={settings[k] ?? '0'} disabled={!canManage} onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))} className={input} /></div>
          ))}
        </div>
        {canManage && <div className="mt-4 labels-actions"><div className="labels-actions-row flex"><Button onClick={saveWording} loading={saving}>Save wording</Button></div></div>}
      </Card>

      {/* The wording lock (round 17): sign off each label's legal lines; locked, only signed-off wording prints. */}
      <WordingLockCard canManage={canManage} />
      {/* The ingredient glossary (2026-10-12): English → Dhivehi for recipe names and typed lists. */}
      <IngredientGlossary canManage={canManage} />
      {/* Round C: nutrition per 100 g of each ingredient, and the label printer on this computer. */}
      <NutritionCard canManage={canManage} />
      <LabelPrinterCard />
    </div>
  );
}

function SettingsTabWithPermission() {
  const { can } = useCurrentUserPermissions();
  return <SettingsTab canManage={can('labels.manage')} />;
}

function CustomTabWithPermission() {
  const { can } = useCurrentUserPermissions();
  return <CustomLabelsTab canManage={can('labels.manage')} />;
}

function TypesTabWithPermission() {
  const { can } = useCurrentUserPermissions();
  return <TypesAndBrands canManage={can('labels.manage')} />;
}

function MakeTabWithPermission() {
  const { can } = useCurrentUserPermissions();
  return <MakeLabelWizard canManage={can('labels.manage')} />;
}

export const LABELS_TABS: HubTab[] = [
  // Owner, 2026-10-13 ("Still its v confusing and not user friendly"): the way in
  // for everyone, four steps; the other tabs stay for those who know them.
  { id: 'make', label: 'Make a label', permissions: ['labels.print', 'labels.manage'], desc: 'Four steps: what it is for, which label, a look at it, how many to print', render: () => <MakeTabWithPermission /> },
  // Round 4 (owner, 2026-10-13: plain words everywhere): Print labels was Pack stickers, Wording and logos was Types & brands; the paths stay.
  { id: 'stickers', label: 'Print labels', permissions: ['labels.print', 'labels.manage'], desc: 'Print stickers for packs, in English or Dhivehi, on any size: A4 sheets, label printers, round', render: () => <><ExpiringStock /><Card padding="sm" className="labels-sticky"><StickerPrintPanel /></Card></> },
  // Owner, 2026-10-11: "Add option to add custom labels using different brands logos and other details. Not only from the menu list".
  { id: 'custom', label: 'Custom labels', permissions: ['labels.print', 'labels.manage'], desc: 'Stickers for things that are not on the menu, with any brand, logo and details', render: () => <CustomTabWithPermission /> },
  { id: 'box', label: 'Box labels', permissions: ['labels.print', 'labels.manage'], desc: 'A4 label for a delivery box, blank or from a wholesale delivery', render: () => <Card padding="sm" className="labels-sticky"><BoxLabelPanel /></Card> },
  { id: 'types', label: 'Wording and logos', permissions: ['labels.print', 'labels.manage'], desc: 'The wording each kind of food gets, the brands and logos on the header, the bottom strip, and the templates a new label starts from', render: () => <TypesTabWithPermission /> },
  { id: 'saved', label: 'Saved labels', permissions: ['labels.print', 'labels.manage'], desc: 'Every label prepared, to print again, download, change, copy or rename; the print log beneath', render: () => <SavedLabelsTab /> },
  { id: 'settings', label: 'Settings', permissions: ['labels.print', 'labels.manage'], desc: 'Which products print, shelf life, storage, the label wording, the ingredient glossary, nutrition and the label printer', render: () => <SettingsTabWithPermission /> },
];

export const LABELS_HUB_PERMISSIONS = hubPermissions(LABELS_TABS);

const LABELS_ALIASES = { history: 'saved' };

/** Every address the hub answers on, one per tab: a tab left out here would open the dashboard instead. */
export const LABELS_HUB_PATHS = ['labels', ...[...LABELS_TABS.map((t) => t.id), ...Object.keys(LABELS_ALIASES)].map((id) => `labels/${id}`)];

export function LabelsHub() {
  return (
    <>
      <HubPage base="/labels" section="Manage" title="Labels" tabs={LABELS_TABS} aliases={LABELS_ALIASES} />
      {/* Four cards on the first visit in this browser, and from How it works on Make a label (round 5). */}
      <LabelsTour />
    </>
  );
}
