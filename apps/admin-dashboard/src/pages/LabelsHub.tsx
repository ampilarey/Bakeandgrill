import { DhivehiDraft } from '../components/ai/AiButton';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SeeAlso } from '../components/SeeAlso';
import { Search, Printer, FileDown, Pencil, Copy, Tag, Star } from 'lucide-react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';
import { MakeLabelWizard } from '../components/labels/MakeLabelWizard';
import { StickerPrintPanel } from '../components/labels/StickerPrintPanel';
import { BoxLabelPanel } from '../components/labels/BoxLabelPanel';
import { TypesAndBrands } from '../components/labels/TypesAndBrands';
import { MyLabelsTab } from '../components/labels/MyLabels';
import { BatchesTab } from '../components/labels/BatchesTab';
import { InlineRename } from '../components/labels/InlineRename';
import { IngredientGlossary } from '../components/labels/IngredientGlossary';
import { NutritionCard } from '../components/labels/NutritionCard';
import { LabelPrinterCard } from '../components/labels/LabelPrinterCard';
import { LabelsTour } from '../components/labels/LabelsTour';
import { LabelRollsCard } from '../components/labels/LabelRollsCard';
import { WordingLockCard } from '../components/labels/WordingLockCard';
import { Btn, Switch, TabScrollRow } from '../components/SharedUI';
import { Button, Card, useToast } from '../components/ui';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  deleteLabelJob, downloadLabelSheet, duplicateLabelJob, fetchLabelJobs, fetchLabelSettings,
  openLabelSheet, pinLabelJob, printLabelJob, renameLabelJob, saveLabelSettings, setLabelJobDates,
  type LabelJob, type LabelSettingsMap, type StickerSummary,
} from '../api';

/*
 * Labels (owner, 2026-10-04: "I want to print labels like this … accessible
 * to all staff who have the authority"; "by default admin only, but option to
 * give permission to any staff"). Print labels and box labels print from
 * here; the settings behind them are on the last tab. docs/LABEL_HUB_PLAN.md.
 */

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
                {/* Words beside the icons (label audit, 2026-11-11: "how to save/del": a finger gets no tooltip). */}
                <Button size="sm" variant="ghost" icon={<FileDown size={14} />} onClick={() => print(j, true)} aria-label={`Download PDF of ${j.name}`}>PDF</Button>
                <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => edit(j)} aria-label={`Edit ${j.name}`}>Change</Button>
                <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => copy(j)} aria-label={`Copy ${j.name}`}>Copy</Button>
                <Button size="sm" variant="ghost" icon={<Star size={14} className={j.pinned ? 'fill-current text-[var(--color-warning)]' : ''} />} onClick={() => pin(j)} aria-label={`${j.pinned ? 'Unpin' : 'Pin'} ${j.name}`} aria-pressed={j.pinned}>{j.pinned ? 'Unpin' : 'Pin'}</Button>
                <Btn variant="danger-outline" small onClick={() => remove(j)} aria-label={`Remove ${j.name}`}>Remove</Btn>
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
      {/* Every print, one by one, is the Batches tab (label audit, 2026-11-25: the print log here was the same list). */}
      <p className="text-sm text-[var(--color-text-secondary)]" data-testid="saved-to-batches">
        Looking for one print, its pack code or who printed it? <button type="button" className="underline font-semibold text-[var(--color-text)]" onClick={() => navigate('/labels/batches')}>Open Batches</button>.
      </p>
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

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
  const navigate = useNavigate();
  const [settings, setSettings] = useState<LabelSettingsMap>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetchLabelSettings().then((r) => setSettings(r.data)).catch(() => undefined); }, []);

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

  return (
    <div className="space-y-5">
      {/* Which menu items print, and each one's shelf life, storage and ingredients, are on My labels (label audit, 2026-11-25: the list here was a second place for the same boxes). */}
      <p className="text-sm text-[var(--color-text-secondary)]" data-testid="settings-to-mine">
        Which menu items print labels, and each one's shelf life, storage and ingredients, are on <button type="button" className="underline font-semibold text-[var(--color-text)]" onClick={() => navigate('/labels/mine')}>My labels</button>: Choose which items get labels, then Edit on an item.
      </p>

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
                    {w.dv && canManage && w.key.endsWith('_dv') && (
                      <div className="mt-1"><DhivehiDraft from={settings[w.key.slice(0, -3)] ?? ''} current={settings[w.key] ?? ''} kind="label" onDraft={(v) => setSettings((st) => ({ ...st, [w.key]: v }))} /></div>
                    )}
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
            {/* Owner, 2026-11-25: Faruma, picked from the three side by side ("Need to use nice dhivehi font"). */}
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor="label_dhivehi_font">Dhivehi font on stickers</label>
            <select id="label_dhivehi_font" value={settings.label_dhivehi_font ?? 'faruma'} disabled={!canManage} onChange={(e) => setSettings((s) => ({ ...s, label_dhivehi_font: e.target.value }))} className={input}>
              <option value="faruma">Faruma · the classic face</option>
              <option value="noto">Noto Sans Thaana · upright, with a real bold</option>
              <option value="site">The font uploaded for the website</option>
            </select>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">The website font prints on the PDF only when it was uploaded as TTF or OTF; otherwise the PDF falls back to Faruma.</p>
          </div>
        </div>
        {/* 2026-10-12: the batch QR (BatchLink) and the allergen pictograms (AllergenIcons), each with a switch. */}
        <h4 className="text-sm font-bold text-[var(--color-text)] mt-5 mb-1">On the sticker</h4>
        <div className="max-w-2xl" data-testid="label-sticker-switches">
          {([
            ['label_batch_qr', 'Pack code (QR) on labels', 'Every print gets a code; its QR opens the pack\'s page with its dates, batch, ingredients and allergens. On every label with room for a QR that scans, and on box labels (the box\'s contents). Batches lists them all.'],
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

/** My labels: every label, each with Print and Edit; the sheets printed before fold beneath (owner, 2026-11-14). */
function MyLabelsWithPermission({ openPrinted = false }: { openPrinted?: boolean }) {
  const { can } = useCurrentUserPermissions();
  return <MyLabelsTab canManage={can('labels.manage')} printedBefore={<SavedLabelsTab />} openPrinted={openPrinted} />;
}

/** The full Print labels form: several products on one sheet, with every option. It has no tab of its own any more. */
function PrintSeveral() {
  const navigate = useNavigate();
  return (
    <>
      <p className="text-sm text-[var(--color-text-secondary)] mb-3" data-testid="print-several-note">
        <strong className="text-[var(--color-text)]">Print labels.</strong> Several products on one sheet, with every option. For one label, <button type="button" className="underline font-semibold text-[var(--color-text)]" onClick={() => navigate('/labels/mine')}>go back to My labels</button> and tap Print on its row.
      </p>
      <Card padding="sm" className="labels-sticky"><StickerPrintPanel /></Card>
    </>
  );
}

/**
 * Setup (owner, 2026-11-14: seven tabs to four): Wording and logos and Settings on one tab, as two parts. Each
 * part keeps its old address, so a link to /labels/types or /labels/settings opens it.
 */
function SetupTab({ part }: { part: 'types' | 'settings' }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { can } = useCurrentUserPermissions();
  const canManage = can('labels.manage');
  const chip = (on: boolean) => ['h-8 px-3 rounded-full border text-sm font-semibold whitespace-nowrap', on ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ');
  return (
    <div className="space-y-4" data-testid="labels-setup">
      <TabScrollRow role="group" aria-label="Setup" style={{ gap: 8 }}>
        <button type="button" aria-pressed={part === 'types'} className={chip(part === 'types')} onClick={() => navigate(`/labels/types${search}`)} data-testid="setup-types">Wording and logos</button>
        <button type="button" aria-pressed={part === 'settings'} className={chip(part === 'settings')} onClick={() => navigate(`/labels/settings${search}`)} data-testid="setup-settings">Settings: rolls, printer and rules</button>
      </TabScrollRow>
      {part === 'types' ? <TypesAndBrands canManage={canManage} /> : <SettingsTab canManage={canManage} />}
    </div>
  );
}

function MakeTabWithPermission() {
  const { can } = useCurrentUserPermissions();
  return (
    <>
      {can('posters.make') && (
        <SeeAlso to="/posters" label="Posters" testId="labels-posters-link">Making a poster (A5 to A2, with the menu's prices, ready for the print shop)?</SeeAlso>
      )}
      <MakeLabelWizard canManage={can('labels.manage')} />
    </>
  );
}

const LP = ['labels.print', 'labels.manage'] as const;

/*
 * Five tabs (owner, 2026-11-14: "saving, printing ect of labels are confusing"; seven tabs until then). My
 * labels is every label with Print and Edit; New label is the wizard; Setup is the wording, the logos and the
 * settings. The screens that lost their tab keep their address (`under` names the tab shown as picked), so every
 * old link and bookmark still opens what it did.
 */
export const LABELS_TABS: HubTab[] = [
  { id: 'mine', label: 'My labels', permissions: LP, desc: 'Every label you have: tap Print for how many and the dates, Edit to change it', render: () => <MyLabelsWithPermission /> },
  // Owner, 2026-10-13 ("Still its v confusing and not user friendly"): three steps to a new label (four until 2026-11-26).
  { id: 'make', label: 'New label', permissions: LP, desc: 'Four steps: what it is for, which label, a look at it, how many to print', render: () => <MakeTabWithPermission /> },
  // Owner, 2026-11-14 ("add a page to view all"): every lot printed and every box label, with the code on its QR.
  { id: 'batches', label: 'Batches', permissions: LP, desc: 'Every lot of stickers and every box label printed, with its code, dates and batch number', render: () => <BatchesTab /> },
  { id: 'box', label: 'Box labels', permissions: LP, desc: 'A4 label for a delivery box, blank or from a wholesale delivery', render: () => <Card padding="sm" className="labels-sticky"><BoxLabelPanel /></Card> },
  { id: 'setup', label: 'Setup', permissions: LP, desc: 'The wording and logos, the bottom strips and templates, your rolls and printer, and the rules for what prints', render: () => <SetupTab part="types" /> },
  // No tab of their own; each opens on its old address.
  { id: 'stickers', label: 'Print labels', under: 'mine', permissions: LP, desc: 'Several products on one sheet, in English or Dhivehi, on any size, with every option', render: () => <PrintSeveral /> },
  { id: 'custom', label: 'My labels', under: 'mine', permissions: LP, desc: 'Every label you have: tap Print for how many and the dates, Edit to change it', render: () => <MyLabelsWithPermission /> },
  { id: 'saved', label: 'Sheets printed before', under: 'mine', permissions: LP, desc: 'Every sheet printed, to print again, download, change, copy or rename; the print log beneath', render: () => <MyLabelsWithPermission openPrinted /> },
  { id: 'types', label: 'Wording and logos', under: 'setup', permissions: LP, desc: 'The wording each kind of food gets, the brands and logos on the header, the bottom strip, and the templates a new label starts from', render: () => <SetupTab part="types" /> },
  { id: 'settings', label: 'Settings', under: 'setup', permissions: LP, desc: 'Which products print, shelf life, storage, the label wording, the ingredient glossary, nutrition and the label printer', render: () => <SetupTab part="settings" /> },
];

export const LABELS_HUB_PERMISSIONS = hubPermissions(LABELS_TABS);

// The print log's old address opens Batches, which is the same list.
const LABELS_ALIASES = { history: 'batches' };

/** Every address the hub answers on, one per tab: a tab left out here would open the dashboard instead. */
export const LABELS_HUB_PATHS = ['labels', ...[...LABELS_TABS.map((t) => t.id), ...Object.keys(LABELS_ALIASES)].map((id) => `labels/${id}`)];

export function LabelsHub() {
  return (
    <>
      <HubPage base="/labels" section="Manage" title="Labels" tabs={LABELS_TABS} aliases={LABELS_ALIASES} />
      {/* Four cards on the first visit in this browser, and from How it works on New label (round 5). */}
      <LabelsTour />
    </>
  );
}
