import { useEffect, useState } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';
import { StickerPrintPanel } from '../components/labels/StickerPrintPanel';
import { BoxLabelPanel } from '../components/labels/BoxLabelPanel';
import { Button, Card, useToast } from '../components/ui';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  fetchLabelPrints, fetchLabelProducts, fetchLabelSettings, saveLabelSettings, updateItemLabel,
  type LabelPrintRow, type LabelProduct, type LabelSettingsMap, type LabelStorage, type IngredientsSource,
} from '../api';

/*
 * Labels (owner, 2026-10-04: "I want to print labels like this … accessible
 * to all staff who have the authority"; "by default admin only, but option to
 * give permission to any staff"). Pack stickers and box labels print from
 * here; the settings behind them are on the last tab. docs/LABEL_HUB_PLAN.md.
 */

const KIND: Record<LabelPrintRow['kind'], string> = { sticker_en: 'Stickers', sticker_dv: 'Stickers (ދިވެހި)', box_label: 'Box label' };

function HistoryTab() {
  const [rows, setRows] = useState<LabelPrintRow[]>([]);
  const [page, setPage] = useState(1);
  const [last, setLast] = useState(1);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetchLabelPrints({ page }).then((r) => { setRows(r.data); setLast(r.last_page); }).catch(() => setRows([])).finally(() => setLoading(false));
  }, [page]);

  return (
    <Card padding="none">
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
                <td className="px-4 py-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">{KIND[r.kind] ?? r.kind}<span className="block text-xs text-[var(--color-text-muted)]">{r.layout}</span></td>
                <td className="px-4 py-3">{r.item ?? r.delivery ?? (r.kind === 'box_label' ? 'Blank template' : '')}</td>
                <td className="px-4 py-3 text-right">{r.copies}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.mfg_date ? `${r.mfg_date} → ${r.exp_date ?? 'blank'}` : 'Handwritten'}</td>
                <td className="px-4 py-3">{r.batch_code ?? ''}</td>
                <td className="px-4 py-3">{r.printed_by ?? ''}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-muted)]">Nothing printed yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {last > 1 && (
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
          <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {last}</span>
          <Button variant="secondary" size="sm" disabled={page >= last} onClick={() => setPage((p) => p + 1)}>Older</Button>
        </div>
      )}
    </Card>
  );
}

const WORDING: { key: string; label: string; dv?: boolean }[] = [
  { key: 'label_header_line', label: 'Sticker heading' },
  { key: 'label_header_line_dv', label: 'Sticker heading (Dhivehi)', dv: true },
  { key: 'label_storage_frozen', label: 'Storage line: frozen' },
  { key: 'label_storage_frozen_dv', label: 'Storage line: frozen (Dhivehi)', dv: true },
  { key: 'label_storage_chilled', label: 'Storage line: chilled' },
  { key: 'label_storage_chilled_dv', label: 'Storage line: chilled (Dhivehi)', dv: true },
  { key: 'label_storage_ambient', label: 'Storage line: room temperature' },
  { key: 'label_storage_ambient_dv', label: 'Storage line: room temperature (Dhivehi)', dv: true },
  { key: 'label_contact_ways', label: 'Footer: ways to reach you' },
  { key: 'label_contact_ways_dv', label: 'Footer: ways to reach you (Dhivehi)', dv: true },
  { key: 'label_address_dv', label: 'Footer address (Dhivehi)', dv: true },
  { key: 'label_landmark_dv', label: 'Footer landmark (Dhivehi)', dv: true },
  { key: 'label_box_heading', label: 'Box label: heading under the name' },
  { key: 'label_box_strip', label: 'Box label: handling strip' },
];

function SettingsTab({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
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

  return (
    <div className="space-y-5">
      <Card header={<div><h3 className="font-bold text-[var(--color-text)]">Products on labels</h3><p className="text-xs text-[var(--color-text-muted)] mt-1">Switch a product on to print it. Ingredients, pictures and the Dhivehi lines are on each item's Label tab in Menu Items.</p></div>} padding="none">
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
              {products.map((p) => (
                <tr key={p.id} className="border-b border-[var(--color-border-light)]">
                  <td className="px-4 py-2"><input type="checkbox" checked={p.label_enabled} disabled={!canManage} onChange={(e) => saveItem(p, { label_enabled: e.target.checked })} className="w-5 h-5 accent-[var(--color-primary)]" aria-label={`${p.name} on labels`} /></td>
                  <td className="px-4 py-2">{p.name}<span className="block text-xs text-[var(--color-text-muted)] truncate max-w-[280px]">{p.ingredients.en || 'No ingredients yet'}</span></td>
                  <td className="px-4 py-2"><input type="number" min={1} max={730} defaultValue={p.label_shelf_life_days ?? ''} disabled={!canManage} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== p.label_shelf_life_days) saveItem(p, { label_shelf_life_days: v }); }} className="w-24 h-10 min-h-[44px] px-2 rounded-lg border border-[var(--color-border)] text-sm" aria-label={`${p.name} shelf life in days`} /></td>
                  <td className="px-4 py-2">
                    <select value={p.label_storage} disabled={!canManage} onChange={(e) => saveItem(p, { label_storage: e.target.value as LabelStorage })} className="h-10 min-h-[44px] px-2 rounded-lg border border-[var(--color-border)] text-sm" aria-label={`${p.name} storage`}>
                      <option value="frozen">Frozen</option><option value="chilled">Chilled</option><option value="ambient">Room temperature</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select value={p.label_ingredients_source} disabled={!canManage} onChange={(e) => saveItem(p, { label_ingredients_source: e.target.value as IngredientsSource })} className="h-10 min-h-[44px] px-2 rounded-lg border border-[var(--color-border)] text-sm" aria-label={`${p.name} ingredients source`}>
                      <option value="auto">Recipe, else typed{p.has_recipe ? '' : ' (no recipe)'}</option><option value="recipe">Recipe</option><option value="manual">Typed in</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card header={<div><h3 className="font-bold text-[var(--color-text)]">Wording</h3><p className="text-xs text-[var(--color-text-muted)] mt-1">Phone, website, address and tagline come from Business Details. Empty a box to go back to the original wording.</p></div>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {WORDING.map((w) => (
            <div key={w.key}>
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor={w.key}>{w.label}</label>
              <input id={w.key} dir={w.dv ? 'rtl' : undefined} value={settings[w.key] ?? ''} disabled={!canManage} onChange={(e) => setSettings((s) => ({ ...s, [w.key]: e.target.value }))} className={input} />
            </div>
          ))}
        </div>
        <h4 className="text-sm font-bold text-[var(--color-text)] mt-5 mb-1">Pre-cut sheet position</h4>
        <p className="text-xs text-[var(--color-text-muted)] mb-2">If stickers on ready-cut sheets print off the cut, move them here (millimetres; down and right are positive).</p>
        <div className="grid gap-3 grid-cols-3">
          {[['label_precut_top', 'Down'], ['label_precut_left', 'Right'], ['label_precut_gutter', 'Gap between labels']].map(([k, l]) => (
            <div key={k}><label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor={k}>{l}</label><input id={k} type="number" step="0.5" min={-20} max={20} value={settings[k] ?? '0'} disabled={!canManage} onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))} className={input} /></div>
          ))}
        </div>
        {canManage && <div className="mt-4"><Button onClick={saveWording} loading={saving}>Save wording</Button></div>}
      </Card>
    </div>
  );
}

function SettingsTabWithPermission() {
  const { can } = useCurrentUserPermissions();
  return <SettingsTab canManage={can('labels.manage')} />;
}

export const LABELS_TABS: HubTab[] = [
  { id: 'stickers', label: 'Pack stickers', permissions: ['labels.print', 'labels.manage'], desc: 'Stickers for frozen packs, in English or Dhivehi, on any label stock', render: () => <Card><StickerPrintPanel /></Card> },
  { id: 'box', label: 'Box labels', permissions: ['labels.print', 'labels.manage'], desc: 'A4 label for a delivery box, blank or from a wholesale delivery', render: () => <Card><BoxLabelPanel /></Card> },
  { id: 'history', label: 'History', permissions: ['labels.print', 'labels.manage'], desc: 'Every sheet printed, by whom, with its dates and batch', render: () => <HistoryTab /> },
  { id: 'settings', label: 'Settings', permissions: ['labels.print', 'labels.manage'], desc: 'Which products print, shelf life, storage and the label wording', render: () => <SettingsTabWithPermission /> },
];

export const LABELS_HUB_PERMISSIONS = hubPermissions(LABELS_TABS);

export function LabelsHub() {
  return <HubPage base="/labels" section="Manage" title="Labels" tabs={LABELS_TABS} />;
}
