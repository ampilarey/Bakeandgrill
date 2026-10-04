import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';
import { StickerPrintPanel } from '../components/labels/StickerPrintPanel';
import { BoxLabelPanel } from '../components/labels/BoxLabelPanel';
import { Button, Card, useToast } from '../components/ui';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  fetchLabelLayouts, fetchLabelPrints, fetchLabelProducts, fetchLabelSettings, saveLabelSettings, updateItemLabel,
  type LabelPrintRow, type LabelProduct, type LabelSettingsMap, type LabelStorage, type IngredientsSource,
} from '../api';

/*
 * Labels (owner, 2026-10-04: "I want to print labels like this … accessible
 * to all staff who have the authority"; "by default admin only, but option to
 * give permission to any staff"). Pack stickers and box labels print from
 * here; the settings behind them are on the last tab. docs/LABEL_HUB_PLAN.md.
 */

const KIND: Record<LabelPrintRow['kind'], string> = { sticker_en: 'Stickers', sticker_dv: 'Stickers (ދިވެހި)', box_label: 'Box label' };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function HistoryTab() {
  const isMobile = useIsMobile();
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

  const what = (r: LabelPrintRow) => r.item ?? r.delivery ?? (r.kind === 'box_label' ? 'Blank template' : '');
  const dates = (r: LabelPrintRow) => (r.mfg_date ? `${r.mfg_date} → ${r.exp_date ?? 'blank'}` : 'Dates handwritten');
  const empty = !loading && rows.length === 0;

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
              <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">{KIND[r.kind] ?? r.kind} · {stock[r.layout] ?? r.layout}</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {dates(r)}{r.batch_code ? ` · batch ${r.batch_code}` : ''}
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{when(r.created_at)}{r.printed_by ? ` · ${r.printed_by}` : ''}</div>
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
                <th className="px-4 py-3 font-semibold">By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border-light)]">
                  <td className="px-4 py-3 whitespace-nowrap">{when(r.created_at)}</td>
                  <td className="px-4 py-3">{KIND[r.kind] ?? r.kind}<span className="block text-xs text-[var(--color-text-muted)]">{stock[r.layout] ?? r.layout}</span></td>
                  <td className="px-4 py-3">{what(r)}</td>
                  <td className="px-4 py-3 text-right">{r.copies}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.mfg_date ? `${r.mfg_date} → ${r.exp_date ?? 'blank'}` : 'Handwritten'}</td>
                  <td className="px-4 py-3">{r.batch_code ?? ''}</td>
                  <td className="px-4 py-3">{r.printed_by ?? ''}</td>
                </tr>
              ))}
              {empty && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-muted)]">Nothing printed yet.</td></tr>
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
    title: 'Sticker heading',
    hint: 'Top of the pack sticker, by the product\'s storage. An item can print its own heading instead (Menu Items → item → Label).',
    rows: [
      { key: 'label_header_line', label: 'Frozen items' },
      { key: 'label_header_line_dv', label: 'Frozen items (Dhivehi)', dv: true },
      { key: 'label_header_line_chilled', label: 'Chilled items' },
      { key: 'label_header_line_chilled_dv', label: 'Chilled items (Dhivehi)', dv: true },
      { key: 'label_header_line_ambient', label: 'Room-temperature items' },
      { key: 'label_header_line_ambient_dv', label: 'Room-temperature items (Dhivehi)', dv: true },
    ],
  },
  {
    title: 'Sticker storage line',
    hint: 'The strip above the footer, by storage. An item can print its own line instead.',
    rows: [
      { key: 'label_storage_frozen', label: 'Frozen' },
      { key: 'label_storage_frozen_dv', label: 'Frozen (Dhivehi)', dv: true },
      { key: 'label_storage_chilled', label: 'Chilled' },
      { key: 'label_storage_chilled_dv', label: 'Chilled (Dhivehi)', dv: true },
      { key: 'label_storage_ambient', label: 'Room temperature' },
      { key: 'label_storage_ambient_dv', label: 'Room temperature (Dhivehi)', dv: true },
    ],
  },
  {
    title: 'Sticker footer',
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

  const load = () => {
    fetchLabelSettings().then((r) => setSettings(r.data)).catch(() => undefined);
    fetchLabelProducts(true).then((r) => setProducts(r.data)).catch(() => undefined);
  };
  useEffect(load, []);

  const saveItem = async (p: LabelProduct, patch: Partial<{ label_enabled: boolean; label_shelf_life_days: number | null; label_storage: LabelStorage; label_ingredients_source: IngredientsSource }>) => {
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
    <input type="number" inputMode="numeric" min={1} max={730} defaultValue={p.label_shelf_life_days ?? ''} placeholder="Blank" disabled={!canManage} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== p.label_shelf_life_days) saveItem(p, { label_shelf_life_days: v }); }} className={`${control} ${cls}`} aria-label={`${p.name} shelf life in days`} />
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
                <label className="flex items-start gap-3 cursor-pointer">
                  <span className="pt-0.5">{enabledBox(p)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-[var(--color-text)]">{p.name}{p.name_dv ? <span className="ml-2 font-normal text-[var(--color-text-muted)]" dir="rtl">{p.name_dv}</span> : null}</span>
                    <span className="block text-xs text-[var(--color-text-muted)] line-clamp-2">{p.ingredients.en || 'No ingredients yet'}</span>
                  </span>
                </label>
                {p.label_enabled && (
                  <div className="grid grid-cols-2 gap-2 mt-3 pl-8">
                    <div><span className={small}>Shelf life (days)</span>{shelfBox(p, 'w-full')}</div>
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
                    <td className="px-4 py-2">{p.name}<span className="block text-xs text-[var(--color-text-muted)] truncate max-w-[280px]">{p.ingredients.en || 'No ingredients yet'}</span></td>
                    <td className="px-4 py-2">{shelfBox(p, 'w-24')}</td>
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
        <h4 className="text-sm font-bold text-[var(--color-text)] mt-5 mb-1">Pre-cut sheet position</h4>
        <p className="text-xs text-[var(--color-text-muted)] mb-2">If stickers on ready-cut sheets print off the cut, move them here in millimetres: down and right are positive, gap is the space between labels.</p>
        <div className="grid gap-3 grid-cols-3 items-end">
          {[['label_precut_top', 'Down'], ['label_precut_left', 'Right'], ['label_precut_gutter', 'Gap']].map(([k, l]) => (
            <div key={k}><label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor={k}>{l}</label><input id={k} type="number" step="0.5" min={-20} max={20} value={settings[k] ?? '0'} disabled={!canManage} onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))} className={input} /></div>
          ))}
        </div>
        {canManage && <div className="mt-4 labels-actions"><div className="labels-actions-row flex"><Button onClick={saveWording} loading={saving}>Save wording</Button></div></div>}
      </Card>
    </div>
  );
}

function SettingsTabWithPermission() {
  const { can } = useCurrentUserPermissions();
  return <SettingsTab canManage={can('labels.manage')} />;
}

export const LABELS_TABS: HubTab[] = [
  { id: 'stickers', label: 'Pack stickers', permissions: ['labels.print', 'labels.manage'], desc: 'Stickers for frozen packs, in English or Dhivehi, on any label stock', render: () => <Card padding="sm" className="labels-sticky"><StickerPrintPanel /></Card> },
  { id: 'box', label: 'Box labels', permissions: ['labels.print', 'labels.manage'], desc: 'A4 label for a delivery box, blank or from a wholesale delivery', render: () => <Card padding="sm" className="labels-sticky"><BoxLabelPanel /></Card> },
  { id: 'history', label: 'History', permissions: ['labels.print', 'labels.manage'], desc: 'Every sheet printed, by whom, with its dates and batch', render: () => <HistoryTab /> },
  { id: 'settings', label: 'Settings', permissions: ['labels.print', 'labels.manage'], desc: 'Which products print, shelf life, storage and the label wording', render: () => <SettingsTabWithPermission /> },
];

export const LABELS_HUB_PERMISSIONS = hubPermissions(LABELS_TABS);

export function LabelsHub() {
  return <HubPage base="/labels" section="Manage" title="Labels" tabs={LABELS_TABS} />;
}
