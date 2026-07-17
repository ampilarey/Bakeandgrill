import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getSalesTrends, getRevenueForecast, getInventoryForecast, getItemForecast, getRestockPlan,
  createPurchaseFromSuggest, applySuggestedReorderPoints, applySuggestedPreferredSuppliers,
  updateInventoryItem, resolveReorderAlert,
  type ItemForecast, type RestockPlan, type RestockPlanItem,
} from '../api';
import { Btn, Card, ErrorMsg, PageHeader, Spinner, StatCard } from '../components/Layout';
import { ItemSearch, type MenuItemSelection } from '../components/ItemSearch';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { today, daysAgo } from '../utils/dateHelpers';
import { downloadCSV } from '../utils/csvExport';

type RestockFilter = 'due_soon' | 'all' | 'price_up' | 'alerts';

function priceChangeBadge(item: RestockPlanItem): { label: string; color: string; bg: string } | null {
  if (item.price_change == null || item.price_change_pct == null) return null;
  if (item.price_change === 'up') {
    return { label: `↑ ${item.price_change_pct}%`, color: '#b91c1c', bg: '#fee2e2' };
  }
  if (item.price_change === 'down') {
    return { label: `↓ ${Math.abs(item.price_change_pct)}%`, color: '#15803d', bg: '#dcfce7' };
  }
  return { label: 'same', color: '#6B5D4F', bg: '#F0EBE5' };
}

const REASON_LABEL: Record<string, string> = {
  usage_cover: 'Usage cover',
  reorder_quantity: 'Reorder qty',
  reorder_point: 'Reorder point',
};

const STATUS_COLOR: Record<string, string> = {
  ok:           '#22c55e',
  warning:      '#f59e0b',
  low:          '#f97316',
  critical:     '#ef4444',
  out_of_stock: '#dc2626',
};

const STATUS_BG: Record<string, string> = {
  ok:           '#dcfce7',
  warning:      '#fef3c7',
  low:          '#ffedd5',
  critical:     '#fee2e2',
  out_of_stock: '#fecaca',
};

export function ForecastPage() {
    usePageTitle('Forecasts');
  const { can } = useCurrentUserPermissions();
  const canManageInventory = can('inventory.manage');
  const [searchParams] = useSearchParams();
  const restockSectionRef = useRef<HTMLDivElement>(null);
  const [settingPreferredId, setSettingPreferredId] = useState<number | null>(null);
  const [trends, setTrends]     = useState<{ total_revenue: number; total_orders: number; data: { period: string; revenue: number; orders: number; growth_pct: number | null }[] } | null>(null);
  const [forecast, setForecast] = useState<{ weighted_moving_avg: number; growth_rate_pct: number; forecast: { week_start: string; projected_revenue: number }[] } | null>(null);
  const [invForecast, setInv]   = useState<{ items: { id: number; name: string; unit: string; category: string; current_stock: number; daily_usage_rate: number; days_of_stock: number | null; status: string }[] } | null>(null);
  const [restock, setRestock]   = useState<RestockPlan | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [granularity, setGran]  = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [from, setFrom]         = useState(daysAgo(29));
  const [to, setTo]             = useState(today());
  const [restockFilter, setRestockFilter] = useState<RestockFilter>('due_soon');
  const [creatingPos, setCreatingPos] = useState(false);
  const [applyingRop, setApplyingRop] = useState(false);
  const [applyingPreferred, setApplyingPreferred] = useState(false);
  const [savingLeadId, setSavingLeadId] = useState<number | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = useState<number | null>(null);
  const [leadDrafts, setLeadDrafts] = useState<Record<number, string>>({});
  const [dismissAlertsOnPo, setDismissAlertsOnPo] = useState(true);
  const [restockToast, setRestockToast] = useState('');
  const [createdPoNumbers, setCreatedPoNumbers] = useState<string[]>([]);
  const [selectedRestockIds, setSelectedRestockIds] = useState<Set<number>>(new Set());

  // Per-item forecast
  const [selectedItem, setSelectedItem]   = useState<MenuItemSelection | null>(null);
  const [itemForecast, setItemForecast]   = useState<ItemForecast | null>(null);
  const [itemForecastDays, setItemForecastDays] = useState(14);
  const [itemLoading, setItemLoading]     = useState(false);
  const [itemError, setItemError]         = useState('');

  const canDraftPo = (item: RestockPlanItem) =>
    item.due_soon
    && item.suggested_order_qty > 0
    && !!item.suggested_supplier?.id
    && (item.unit_cost ?? item.suggested_supplier?.price ?? 0) > 0;

  /** Ready for a *new* draft PO (excludes items already on an open PO). */
  const readyForNewPo = (item: RestockPlanItem) => canDraftPo(item) && !item.open_purchase;

  const canApplyRop = (item: RestockPlanItem) =>
    item.suggested_reorder_point != null
    && Math.abs(item.suggested_reorder_point - item.reorder_point) >= 0.001;

  const canSetPreferred = (item: RestockPlanItem) =>
    item.suggested_supplier?.source === 'cheapest' && !!item.suggested_supplier.id;

  const canSelectRestock = (item: RestockPlanItem) =>
    canDraftPo(item) || canApplyRop(item) || canSetPreferred(item);

  const defaultSelectDueSoon = (plan: RestockPlan) => {
    setSelectedRestockIds(new Set(plan.items.filter(readyForNewPo).map((i) => i.id)));
  };

  const load = async () => {
    setLoading(true); setError('');
    const [t, f, i, r] = await Promise.allSettled([
      getSalesTrends({ granularity, from, to }),
      getRevenueForecast(8, 4),
      getInventoryForecast(),
      getRestockPlan({ lookback_days: 30, buy_lookback_days: 90, lead_days: 3, cover_days: 14 }),
    ]);
    const errs: string[] = [];
    if (t.status === 'fulfilled') setTrends(t.value);
    else errs.push(`Sales trends: ${(t.reason as Error).message}`);
    if (f.status === 'fulfilled') setForecast((f.value as typeof f.value & { insufficient_data?: boolean }).insufficient_data ? null : f.value);
    else errs.push(`Revenue forecast: ${(f.reason as Error).message}`);
    if (i.status === 'fulfilled') setInv(i.value);
    else errs.push(`Inventory forecast: ${(i.reason as Error).message}`);
    if (r.status === 'fulfilled') {
      setRestock(r.value);
      defaultSelectDueSoon(r.value);
    } else {
      errs.push(`Restock plan: ${(r.reason as Error).message}`);
    }
    if (errs.length) setError(errs.join(' | '));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [granularity, from, to]);

  // Deep link: /forecasts?section=restock
  useEffect(() => {
    const section = (searchParams.get('section') ?? '').toLowerCase();
    if (section !== 'restock' || loading || !restock) return;
    const t = window.setTimeout(() => {
      restockSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [searchParams, loading, restock]);

  const refreshRestock = async () => {
    try {
      const plan = await getRestockPlan({ lookback_days: 30, buy_lookback_days: 90, lead_days: 3, cover_days: 14 });
      setRestock(plan);
      defaultSelectDueSoon(plan);
    } catch {
      // Keep existing plan if refresh fails
    }
  };

  const handleItemForecast = async (selection: MenuItemSelection | null) => {
    setSelectedItem(selection);
    setItemForecast(null);
    setItemError('');
    if (!selection) return;
    setItemLoading(true);
    try {
      const res = await getItemForecast({ item_id: selection.id, days: itemForecastDays });
      setItemForecast(res);
    } catch (e) { setItemError((e as Error).message); }
    finally { setItemLoading(false); }
  };

  // Re-run item forecast when days slider changes (only if an item is already selected)
  useEffect(() => {
    if (selectedItem) void handleItemForecast(selectedItem);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemForecastDays]);

  const maxRevenue = trends ? Math.max(...(trends.data ?? []).map(d => d.revenue), 1) : 1;

  const eligibleRestock = restock?.items.filter(canDraftPo) ?? [];
  const readyRestock = restock?.items.filter(readyForNewPo) ?? [];
  const selectableRestock = restock?.items.filter(canSelectRestock) ?? [];
  const selectedRestockItems = eligibleRestock.filter((i) => selectedRestockIds.has(i.id));
  const selectedWithOpenPo = selectedRestockItems.filter((i) => !!i.open_purchase);
  const selectedWithAlerts = selectedRestockItems.filter((i) => !!i.open_alert);
  const selectedRopItems = (restock?.items ?? []).filter((i) => selectedRestockIds.has(i.id) && canApplyRop(i));
  const cheapestRestock = restock?.items.filter(canSetPreferred) ?? [];
  const selectedPreferredItems = cheapestRestock.filter((i) => selectedRestockIds.has(i.id));
  const allReadySelected = readyRestock.length > 0
    && readyRestock.every((i) => selectedRestockIds.has(i.id));
  const restockBusy = creatingPos || applyingRop || applyingPreferred
    || settingPreferredId != null || savingLeadId != null || resolvingAlertId != null;

  const filteredRestockItems = (() => {
    if (!restock) return [];
    if (restockFilter === 'price_up') return restock.items.filter((i) => i.price_change === 'up');
    if (restockFilter === 'alerts') return restock.items.filter((i) => !!i.open_alert);
    if (restockFilter === 'all') return restock.items;
    return restock.items.filter((i) => i.due_soon).slice(0, 40);
  })();

  const exportRestockCsv = () => {
    if (!restock) return;
    const rows = (restockFilter === 'due_soon'
      ? restock.items.filter((i) => i.due_soon)
      : restockFilter === 'price_up'
        ? restock.items.filter((i) => i.price_change === 'up')
        : restockFilter === 'alerts'
          ? restock.items.filter((i) => !!i.open_alert)
          : restock.items
    ).map((i) => ({
      Item: i.name,
      Category: i.category ?? '',
      Stock: i.current_stock,
      Unit: i.unit,
      'Days left': i.days_of_stock ?? '',
      Status: i.status,
      'Next order': i.suggested_next_order_date ?? '',
      'Lead days': i.lead_days,
      'Lead source': i.lead_days_source,
      'Order qty': i.suggested_order_qty,
      ROP: i.reorder_point,
      'Suggested ROP': i.suggested_reorder_point ?? '',
      Supplier: i.suggested_supplier?.name ?? '',
      'Unit cost': i.unit_cost ?? '',
      'Last purchase': i.last_purchase_price ?? '',
      'Price change %': i.price_change_pct ?? '',
      'Price direction': i.price_change ?? '',
      'Open PO': i.open_purchase?.purchase_number ?? '',
      'Open alert': i.open_alert ? `#${i.open_alert.id}` : '',
      Why: REASON_LABEL[i.reason] ?? i.reason,
    }));
    downloadCSV(`restock-plan-${restockFilter}`, rows);
  };

  const dismissReorderAlert = async (item: RestockPlanItem) => {
    if (!item.open_alert) return;
    if (!canManageInventory) {
      setError('You need inventory.manage permission to dismiss reorder alerts.');
      return;
    }
    const ok = window.confirm(
      `Dismiss reorder alert for ${item.name}?\n\n`
      + 'This only acknowledges the alert — stock levels are unchanged. '
      + 'A new alert will be created again if the item stays at or below ROP.',
    );
    if (!ok) return;

    setResolvingAlertId(item.open_alert.id);
    setError('');
    setRestockToast('');
    try {
      await resolveReorderAlert(item.open_alert.id);
      setRestockToast(`Dismissed reorder alert for ${item.name}`);
      await refreshRestock();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResolvingAlertId(null);
    }
  };

  const restockPreviewBySupplier = (() => {
    const map = new Map<number, { name: string; lines: number; total: number }>();
    for (const item of selectedRestockItems) {
      const sid = item.suggested_supplier!.id;
      const cost = (item.unit_cost ?? item.suggested_supplier?.price ?? 0) * item.suggested_order_qty;
      const cur = map.get(sid) ?? { name: item.suggested_supplier!.name, lines: 0, total: 0 };
      cur.lines += 1;
      cur.total += cost;
      map.set(sid, cur);
    }
    return [...map.entries()].map(([id, v]) => ({ supplier_id: id, ...v }));
  })();
  const restockPreviewTotal = restockPreviewBySupplier.reduce((s, g) => s + g.total, 0);

  const toggleRestockSelect = (id: number, checked: boolean) => {
    setSelectedRestockIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllEligible = () => {
    if (allReadySelected) {
      setSelectedRestockIds(new Set());
    } else {
      setSelectedRestockIds(new Set(readyRestock.map((i) => i.id)));
    }
  };

  const createDraftPosFromRestock = async () => {
    if (!restock) return;
    if (selectedRestockItems.length === 0) {
      setError('Select at least one due-soon item with a supplier and unit cost.');
      return;
    }

    if (selectedWithOpenPo.length > 0) {
      const names = selectedWithOpenPo.slice(0, 5).map((i) => i.name).join(', ');
      const more = selectedWithOpenPo.length > 5 ? ` +${selectedWithOpenPo.length - 5} more` : '';
      const ok = window.confirm(
        `${selectedWithOpenPo.length} selected item${selectedWithOpenPo.length === 1 ? '' : 's'} already `
        + `have an open PO (${names}${more}).\n\nCreate additional draft PO(s) anyway?`,
      );
      if (!ok) return;
    }

    const bySupplier = new Map<number, RestockPlanItem[]>();
    for (const item of selectedRestockItems) {
      const sid = item.suggested_supplier!.id;
      const list = bySupplier.get(sid) ?? [];
      list.push(item);
      bySupplier.set(sid, list);
    }

    setCreatingPos(true);
    setError('');
    setRestockToast('');
    setCreatedPoNumbers([]);
    try {
      const created: string[] = [];
      let resolvedAlerts = 0;
      for (const [supplierId, items] of bySupplier) {
        const res = await createPurchaseFromSuggest({
          supplier_id: supplierId,
          notes: 'Auto-generated from restock plan (due soon)',
          resolve_reorder_alerts: dismissAlertsOnPo,
          items: items.map((i) => ({
            inventory_item_id: i.id,
            quantity: i.suggested_order_qty,
            unit_cost: i.unit_cost ?? i.suggested_supplier?.price ?? 0,
          })),
        });
        created.push(res.purchase.purchase_number ?? `PO #${res.purchase.id}`);
        resolvedAlerts += res.resolved_alerts ?? 0;
      }
      const createdIds = new Set(selectedRestockItems.map((i) => i.id));
      setSelectedRestockIds((prev) => new Set([...prev].filter((id) => !createdIds.has(id))));
      setCreatedPoNumbers(created);
      setRestockToast(
        `Created ${created.length} draft PO${created.length === 1 ? '' : 's'}`
        + ` · ${selectedRestockItems.length} line${selectedRestockItems.length === 1 ? '' : 's'}`
        + ` · est. MVR ${restockPreviewTotal.toFixed(2)}`
        + (resolvedAlerts > 0
          ? ` · dismissed ${resolvedAlerts} alert${resolvedAlerts === 1 ? '' : 's'}`
          : ''),
      );
      await refreshRestock();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingPos(false);
    }
  };

  const setPreferredFromSuggestion = async (item: RestockPlanItem) => {
    if (!item.suggested_supplier?.id) return;
    if (!canManageInventory) {
      setError('You need inventory.manage permission to set a preferred supplier.');
      return;
    }
    setSettingPreferredId(item.id);
    setError('');
    setRestockToast('');
    setCreatedPoNumbers([]);
    try {
      await updateInventoryItem(item.id, { preferred_supplier_id: item.suggested_supplier.id });
      setRestockToast(`Preferred supplier for ${item.name} → ${item.suggested_supplier.name}`);
      await refreshRestock();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSettingPreferredId(null);
    }
  };

  const leadDraftValue = (item: RestockPlanItem) =>
    leadDrafts[item.id] ?? String(item.lead_days ?? restock?.lead_days ?? 3);

  const saveLeadDays = async (item: RestockPlanItem) => {
    if (!canManageInventory) {
      setError('You need inventory.manage permission to set lead days.');
      return;
    }
    const raw = leadDraftValue(item).trim();
    if (raw === '') {
      setSavingLeadId(item.id);
      setError('');
      try {
        await updateInventoryItem(item.id, { lead_days: null });
        setLeadDrafts((d) => {
          const next = { ...d };
          delete next[item.id];
          return next;
        });
        setRestockToast(`${item.name}: lead days cleared (uses plan default)`);
        await refreshRestock();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSavingLeadId(null);
      }
      return;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 30) {
      setError('Lead days must be an integer from 0 to 30 (or blank for default).');
      return;
    }
    setSavingLeadId(item.id);
    setError('');
    setRestockToast('');
    try {
      await updateInventoryItem(item.id, { lead_days: n });
      setLeadDrafts((d) => {
        const next = { ...d };
        delete next[item.id];
        return next;
      });
      setRestockToast(`${item.name}: lead days → ${n}`);
      await refreshRestock();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingLeadId(null);
    }
  };

  const applyRopFromRestock = async () => {
    if (selectedRopItems.length === 0) {
      setError('Select at least one item with a suggested reorder point that differs from the current ROP.');
      return;
    }
    const ok = window.confirm(
      `Apply suggested reorder points to ${selectedRopItems.length} item${selectedRopItems.length === 1 ? '' : 's'}?\n\n`
      + 'This updates inventory reorder points. You can edit them later on the Inventory page.',
    );
    if (!ok) return;

    setApplyingRop(true);
    setError('');
    setRestockToast('');
    setCreatedPoNumbers([]);
    try {
      const res = await applySuggestedReorderPoints({
        item_ids: selectedRopItems.map((i) => i.id),
        lookback_days: 30,
        buy_lookback_days: 90,
        lead_days: 3,
        cover_days: 14,
      });
      setRestockToast(
        `Updated ROP on ${res.updated_count} item${res.updated_count === 1 ? '' : 's'}`
        + (res.skipped_count > 0 ? ` · skipped ${res.skipped_count}` : ''),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplyingRop(false);
    }
  };

  const applyPreferredFromRestock = async () => {
    const targets = selectedPreferredItems.length > 0 ? selectedPreferredItems : cheapestRestock;
    if (targets.length === 0) {
      setError('No items with a cheapest-supplier suggestion to promote.');
      return;
    }
    if (!canManageInventory) {
      setError('You need inventory.manage permission to set preferred suppliers.');
      return;
    }
    const ok = window.confirm(
      `Set preferred supplier for ${targets.length} item${targets.length === 1 ? '' : 's'} `
      + `using each row’s cheapest suggestion?\n\n`
      + 'Only rows without a preferred supplier (source: cheapest) are updated.',
    );
    if (!ok) return;

    setApplyingPreferred(true);
    setError('');
    setRestockToast('');
    setCreatedPoNumbers([]);
    try {
      const res = await applySuggestedPreferredSuppliers({
        item_ids: targets.map((i) => i.id),
        lookback_days: 30,
        buy_lookback_days: 90,
        lead_days: 3,
        cover_days: 14,
      });
      setRestockToast(
        `Set preferred on ${res.updated_count} item${res.updated_count === 1 ? '' : 's'}`
        + (res.skipped_count > 0 ? ` · skipped ${res.skipped_count}` : ''),
      );
      await refreshRestock();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplyingPreferred(false);
    }
  };

  return (
    <>
      <PageHeader title="Forecasts & Trends" subtitle="Revenue projections, inventory runway, and restock plan" />
      {error && <ErrorMsg message={error} />}
      {restockToast && (
        <div style={{
          marginBottom: 12, padding: '10px 12px', borderRadius: 8,
          background: '#ecfdf5', color: '#065f46', fontSize: 13, fontWeight: 600,
        }}>
          {restockToast}
          {createdPoNumbers.length > 0 && (
            <div style={{ marginTop: 6, fontWeight: 600 }}>
              {createdPoNumbers.map((num, i) => (
                <span key={num}>
                  {i > 0 ? ' · ' : ''}
                  <Link to={`/purchase-orders?search=${encodeURIComponent(num)}`} style={{ color: '#047857' }}>
                    {num}
                  </Link>
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 6, fontWeight: 500 }}>
            <Link to="/purchase-orders" style={{ color: '#047857' }}>All purchase orders →</Link>
            {' · '}
            <Link to="/inventory" style={{ color: '#047857' }}>Inventory →</Link>
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8E0D8', fontSize: 14 }} />
        <span style={{ color: '#9C8E7E' }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8E0D8', fontSize: 14 }} />
        <div style={{ display: 'flex', background: '#F0EBE5', borderRadius: 8, overflow: 'hidden' }}>
          {(['daily', 'weekly', 'monthly'] as const).map(g => (
            <button key={g} onClick={() => setGran(g)}
              style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: granularity === g ? '#1C1408' : 'transparent',
                color: granularity === g ? '#fff' : '#6B5D4F' }}>
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        <Btn onClick={load}>Refresh</Btn>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 20 }}>

          {/* Sales Trends chart (bar chart using divs) */}
          {trends && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Sales Trends</div>
                  <div style={{ fontSize: 13, color: '#6B5D4F', marginTop: 2 }}>
                    MVR {parseFloat(String(trends.total_revenue ?? 0)).toFixed(2)} · {trends.total_orders} orders
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, overflowX: 'auto', paddingBottom: 8 }}>
                {trends.data.map(d => (
                  <div key={d.period} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: 40 }}>
                    <div style={{ fontSize: 10, color: '#6B5D4F', marginBottom: 4 }}>
                      {d.growth_pct !== null ? (d.growth_pct >= 0 ? '+' : '') + parseFloat(String(d.growth_pct ?? 0)).toFixed(0) + '%' : ''}
                    </div>
                    <div
                      style={{
                        width: 32,
                        height: Math.max(4, (d.revenue / maxRevenue) * 100),
                        background: d.growth_pct !== null && d.growth_pct < 0 ? '#ef4444' : '#D4813A',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.4s ease',
                      }}
                      title={`${d.period}: MVR ${parseFloat(String(d.revenue ?? 0)).toFixed(2)} (${d.orders} orders)`}
                    />
                    <div style={{ fontSize: 9, color: '#9C8E7E', marginTop: 4, textAlign: 'center', lineHeight: 1.2, maxWidth: 40 }}>
                      {d.period.slice(-5)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Revenue forecast */}
          {!forecast && !loading && (
            <Card>
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#9C8E7E' }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Revenue Forecast</div>
                <div style={{ fontSize: 13 }}>Not enough sales history yet — need at least 2 weeks of completed orders.</div>
              </div>
            </Card>
          )}
          {forecast && (
            <Card>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Revenue Forecast (Next 4 Weeks)</div>
              <div style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
                Weighted Moving Avg: MVR {parseFloat(String(forecast.weighted_moving_avg ?? 0)).toFixed(2)}/wk ·
                Growth Rate: <span style={{ color: forecast.growth_rate_pct >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                  {forecast.growth_rate_pct >= 0 ? '+' : ''}{parseFloat(String(forecast.growth_rate_pct ?? 0)).toFixed(2)}%/wk
                </span>
              </div>
              <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                {(forecast.forecast ?? []).map((wk, i) => (
                  <div key={wk.week_start} style={{ background: '#F8F6F3', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#6B5D4F', marginBottom: 6 }}>Week {i + 1}</div>
                    <div style={{ fontSize: 11, color: '#9C8E7E', marginBottom: 8 }}>{wk.week_start}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#D4813A' }}>MVR {parseFloat(String(wk.projected_revenue ?? 0)).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Per-item demand forecast */}
          <Card>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Per-Item Demand Forecast</div>
            <div style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
              Search a menu item to see its projected daily demand.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
              <div style={{ flex: '1 1 280px', minWidth: 220 }}>
                <ItemSearch
                  kind="menu"
                  value={selectedItem}
                  onChange={(v) => void handleItemForecast(v)}
                  placeholder="Search menu items…"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, color: '#6B5D4F', fontWeight: 700 }}>Days:</label>
                <select
                  value={itemForecastDays}
                  onChange={(e) => setItemForecastDays(Number(e.target.value))}
                  style={{ height: 36, padding: '0 8px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}
                >
                  {[7, 14, 30].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            {itemLoading && <Spinner />}
            {itemError && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{itemError}</div>}
            {itemForecast && !itemLoading && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', marginBottom: 12 }}>
                  {itemForecast.item_name} — next {itemForecastDays} days
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, minWidth: 'min(100%, 320px)' }}>
                    {(itemForecast.forecast ?? []).map((d) => {
                      const maxQty = Math.max(...(itemForecast.forecast ?? []).map((x) => x.predicted_qty), 1);
                      const barH = Math.max(4, (d.predicted_qty / maxQty) * 84);
                      return (
                        <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 28 }}>
                          <div style={{ fontSize: 10, color: '#6B5D4F', marginBottom: 3, fontWeight: 600 }}>
                            {Math.round(d.predicted_qty)}
                          </div>
                          <div
                            style={{ width: '100%', maxWidth: 32, height: barH, background: '#D4813A', borderRadius: '3px 3px 0 0', opacity: 0.85 }}
                            title={`${d.date}: ${d.predicted_qty.toFixed(1)} units · MVR ${d.predicted_revenue.toFixed(2)}`}
                          />
                          <div style={{ fontSize: 9, color: '#9C8E7E', marginTop: 3, textAlign: 'center' }}>
                            {d.date.slice(5)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#9C8E7E', marginTop: 10, textAlign: 'right' }}>
                  Est. revenue: MVR {itemForecast.forecast.reduce((s, d) => s + d.predicted_revenue, 0).toFixed(2)} ·{' '}
                  Total units: {itemForecast.forecast.reduce((s, d) => s + d.predicted_qty, 0).toFixed(0)}
                </div>
              </div>
            )}
            {!selectedItem && !itemLoading && (
              <p style={{ color: '#9C8E7E', fontSize: 13, margin: 0 }}>Search and select a menu item above to see its demand forecast.</p>
            )}
          </Card>

          {/* Restock plan — usage + buy frequency */}
          {restock && (
            <div ref={restockSectionRef} id="restock-plan">
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Restock Plan</div>
                  <div style={{ fontSize: 13, color: '#6B5D4F', marginTop: 4 }}>
                    Combines usage runway, buy cadence, and reorder points. Suggested ROP stays advisory until you apply it.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {canManageInventory && cheapestRestock.length > 0 && (
                    <Btn
                      small
                      variant="secondary"
                      disabled={restockBusy}
                      onClick={() => void applyPreferredFromRestock()}
                    >
                      {applyingPreferred
                        ? 'Saving…'
                        : selectedPreferredItems.length > 0
                          ? `Set preferred (${selectedPreferredItems.length})`
                          : `Set preferred (${cheapestRestock.length} cheapest)`}
                    </Btn>
                  )}
                  {selectableRestock.some(canApplyRop) && (
                    <Btn
                      small
                      variant="secondary"
                      disabled={applyingRop || selectedRopItems.length === 0 || creatingPos || applyingPreferred}
                      onClick={() => void applyRopFromRestock()}
                    >
                      {applyingRop
                        ? 'Applying…'
                        : `Apply suggested ROPs (${selectedRopItems.length})`}
                    </Btn>
                  )}
                  {eligibleRestock.length > 0 && (
                    <Btn
                      small
                      disabled={restockBusy || selectedRestockItems.length === 0}
                      onClick={() => void createDraftPosFromRestock()}
                    >
                      {creatingPos
                        ? 'Creating…'
                        : `Create draft POs (${selectedRestockItems.length})`}
                    </Btn>
                  )}
                  <Link to="/purchase-orders" style={{ fontSize: 13, fontWeight: 700, color: '#D4813A', textDecoration: 'none' }}>
                    Open Purchase Orders →
                  </Link>
                </div>
              </div>
              {selectedRestockItems.length > 0 && (
                <div style={{
                  marginBottom: 12, padding: '10px 12px', borderRadius: 8,
                  background: '#FFF7ED', border: '1px solid #FED7AA', fontSize: 13, color: '#9a3412',
                }}>
                  <strong>{selectedRestockItems.length}</strong> for draft POs ·{' '}
                  <strong>{restockPreviewBySupplier.length}</strong> draft PO
                  {restockPreviewBySupplier.length === 1 ? '' : 's'} · est.{' '}
                  <strong>MVR {restockPreviewTotal.toFixed(2)}</strong>
                  {selectedWithOpenPo.length > 0 && (
                    <> · <strong style={{ color: '#b45309' }}>{selectedWithOpenPo.length} already on open PO</strong></>
                  )}
                  {selectedRopItems.length > 0 && (
                    <> · <strong>{selectedRopItems.length}</strong> with ROP change</>
                  )}
                  {selectedWithAlerts.length > 0 && (
                    <> · <strong style={{ color: '#991b1b' }}>{selectedWithAlerts.length} with open alert</strong></>
                  )}
                  {restockPreviewBySupplier.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#c2410c' }}>
                      {restockPreviewBySupplier.map((g) => (
                        <span key={g.supplier_id} style={{ marginRight: 12 }}>
                          {g.name}: {g.lines} line{g.lines === 1 ? '' : 's'} · MVR {g.total.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  )}
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
                    fontSize: 12, fontWeight: 600, color: '#9a3412', cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={dismissAlertsOnPo}
                      disabled={restockBusy}
                      onChange={(e) => setDismissAlertsOnPo(e.target.checked)}
                    />
                    Dismiss open reorder alerts for these lines
                    {selectedWithAlerts.length > 0 ? ` (${selectedWithAlerts.length})` : ''}
                  </label>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                <StatCard label="Tracked items" value={String(restock.totals.items_count)} accent="#6B5D4F" />
                <StatCard label="Due soon" value={String(restock.totals.due_soon)} accent="#f97316" />
                <StatCard label="Below ROP" value={String(restock.totals.below_rop)} accent="#ef4444" />
                <StatCard label="Ready for PO" value={String(readyRestock.length)} accent="#16a34a" />
                {(restock.totals.with_open_po ?? 0) > 0 && (
                  <StatCard label="Already on PO" value={String(restock.totals.with_open_po)} accent="#b45309" />
                )}
                {(restock.totals.price_up ?? 0) > 0 && (
                  <StatCard label="Price up vs last" value={String(restock.totals.price_up)} accent="#b91c1c" />
                )}
                {(restock.totals.open_alerts ?? 0) > 0 && (
                  <StatCard label="Open alerts" value={String(restock.totals.open_alerts)} accent="#dc2626" />
                )}
                {cheapestRestock.length > 0 && (
                  <StatCard label="No preferred yet" value={String(cheapestRestock.length)} accent="#6B5D4F" />
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                {([
                  { id: 'due_soon' as const, label: `Due soon (${restock.totals.due_soon})` },
                  { id: 'all' as const, label: `All (${restock.totals.items_count})` },
                  { id: 'price_up' as const, label: `Price up (${restock.totals.price_up ?? 0})` },
                  { id: 'alerts' as const, label: `Alerts (${restock.totals.open_alerts ?? 0})` },
                ]).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRestockFilter(f.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                      cursor: 'pointer',
                      border: restockFilter === f.id ? '1px solid #D4813A' : '1px solid #E8E0D8',
                      background: restockFilter === f.id ? '#FFF7ED' : '#F8F6F3',
                      color: restockFilter === f.id ? '#c2410c' : '#6B5D4F',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
                <Btn small variant="secondary" onClick={exportRestockCsv}>Export CSV</Btn>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #F0EBE5' }}>
                      <th style={{ padding: '8px 12px', width: 36 }}>
                        {readyRestock.length > 0 ? (
                          <input
                            type="checkbox"
                            checked={allReadySelected}
                            onChange={toggleSelectAllEligible}
                            title={allReadySelected ? 'Deselect all' : 'Select all ready for new PO'}
                            aria-label="Select all ready for new PO"
                          />
                        ) : null}
                      </th>
                      {['Item', 'Stock', 'Days left', 'Buy every', 'Next order', 'Lead', 'Order qty', 'ROP', 'Supplier', 'Why'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#6B5D4F', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRestockItems.map((item) => (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid #F8F6F3',
                          background: item.price_change === 'up' ? '#FEF2F2' : item.due_soon ? '#FFFBEB' : undefined,
                        }}
                      >
                        <td style={{ padding: '8px 12px' }}>
                          {canSelectRestock(item) ? (
                            <input
                              type="checkbox"
                              checked={selectedRestockIds.has(item.id)}
                              onChange={(e) => toggleRestockSelect(item.id, e.target.checked)}
                              aria-label={`Select ${item.name}`}
                            />
                          ) : null}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                          <Link to={`/inventory?item=${item.id}`} style={{ color: '#1C1408', textDecoration: 'none' }}>{item.name}</Link>
                          <div style={{ fontSize: 11, color: '#9C8E7E' }}>{item.category ?? '—'}</div>
                          {item.open_purchase && (
                            <div style={{ marginTop: 4 }}>
                              <Link
                                to={`/purchase-orders?search=${encodeURIComponent(item.open_purchase.purchase_number)}`}
                                style={{
                                  fontSize: 11, fontWeight: 700, color: '#b45309', textDecoration: 'none',
                                  background: '#FEF3C7', padding: '2px 6px', borderRadius: 6,
                                }}
                                title={`${item.open_purchase.status} · qty ${item.open_purchase.quantity}`}
                              >
                                On {item.open_purchase.purchase_number}
                              </Link>
                            </div>
                          )}
                          {item.open_alert && (
                            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                              <span
                                title={item.open_alert.created_at
                                  ? `Alert since ${new Date(item.open_alert.created_at).toLocaleString()}`
                                  : 'Open reorder alert'}
                                style={{
                                  fontSize: 11, fontWeight: 700, color: '#991b1b',
                                  background: '#fee2e2', padding: '2px 6px', borderRadius: 6,
                                }}
                              >
                                Reorder alert
                              </span>
                              {canManageInventory && (
                                <button
                                  type="button"
                                  disabled={restockBusy}
                                  onClick={() => void dismissReorderAlert(item)}
                                  style={{
                                    fontSize: 10, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                                    border: '1px solid #fecaca', background: '#fff', color: '#991b1b',
                                    borderRadius: 6, padding: '2px 6px',
                                  }}
                                >
                                  {resolvingAlertId === item.open_alert.id ? '…' : 'Dismiss'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>{item.current_stock.toFixed(2)} {item.unit}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700 }}>
                          {item.days_of_stock === null ? '∞' : item.days_of_stock === 0 ? 'OUT' : `${item.days_of_stock}d`}
                          <span style={{
                            marginLeft: 6, padding: '2px 6px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                            background: STATUS_BG[item.status] ?? '#F0EBE5', color: STATUS_COLOR[item.status] ?? '#6B5D4F',
                          }}>
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#6B5D4F' }}>
                          {item.buy_frequency?.avg_days_between != null
                            ? `${item.buy_frequency.avg_days_between}d`
                            : '—'}
                          {item.buy_frequency ? (
                            <div style={{ fontSize: 11, color: '#9C8E7E' }}>
                              {item.buy_frequency.purchase_count} buys · avg {item.buy_frequency.avg_buy_qty} {item.unit}
                            </div>
                          ) : null}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: item.due_soon ? 700 : 500, color: item.due_soon ? '#c2410c' : '#1C1408' }}>
                          {item.suggested_next_order_date ?? '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#6B5D4F', minWidth: 96 }}>
                          {canManageInventory ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input
                                  type="number"
                                  min={0}
                                  max={30}
                                  step={1}
                                  value={leadDraftValue(item)}
                                  disabled={restockBusy}
                                  onChange={(e) => setLeadDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                                  aria-label={`Lead days for ${item.name}`}
                                  style={{
                                    width: 52, height: 28, padding: '0 6px', borderRadius: 6,
                                    border: '1px solid #E8E0D8', fontSize: 12, fontFamily: 'inherit',
                                  }}
                                />
                                <button
                                  type="button"
                                  disabled={restockBusy}
                                  onClick={() => void saveLeadDays(item)}
                                  style={{
                                    padding: '2px 6px', borderRadius: 6, border: '1px solid #E8E0D8',
                                    background: '#F8F6F3', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                    fontFamily: 'inherit', color: '#1C1408',
                                  }}
                                >
                                  {savingLeadId === item.id ? '…' : 'Save'}
                                </button>
                              </div>
                              <div style={{ fontSize: 10, color: '#9C8E7E' }}>
                                {item.lead_days_source === 'item' ? 'item' : `default ${restock.lead_days}d`}
                              </div>
                            </div>
                          ) : (
                            <>
                              {item.lead_days}d
                              <div style={{ fontSize: 10, color: '#9C8E7E' }}>
                                {item.lead_days_source === 'item' ? 'item' : 'default'}
                              </div>
                            </>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#16a34a' }}>
                          {item.suggested_order_qty} {item.unit}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#6B5D4F' }}>
                          {item.suggested_reorder_point != null ? (
                            <>
                              <div>{item.reorder_point}</div>
                              <div style={{
                                fontWeight: 700,
                                color: canApplyRop(item) ? '#c2410c' : '#16a34a',
                              }}>
                                → {item.suggested_reorder_point}
                              </div>
                            </>
                          ) : (
                            <>{item.reorder_point || '—'}</>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#6B5D4F', fontSize: 12 }}>
                          {item.suggested_supplier ? (
                            <>
                              <div style={{ fontWeight: 600, color: '#1C1408' }}>{item.suggested_supplier.name}</div>
                              <div style={{ fontSize: 11, color: '#9C8E7E', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                <span>
                                  {item.unit_cost != null ? `MVR ${item.unit_cost.toFixed(2)}` : '—'}
                                  {item.suggested_supplier.source ? ` · ${item.suggested_supplier.source}` : ''}
                                </span>
                                {(() => {
                                  const badge = priceChangeBadge(item);
                                  if (!badge) return null;
                                  return (
                                    <span
                                      title={item.last_purchase_price != null
                                        ? `Last purchase MVR ${item.last_purchase_price.toFixed(2)}`
                                        : undefined}
                                      style={{
                                        padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 800,
                                        background: badge.bg, color: badge.color,
                                      }}
                                    >
                                      {badge.label}
                                    </span>
                                  );
                                })()}
                              </div>
                              {item.last_purchase_price != null && item.price_change && item.price_change !== 'flat' && (
                                <div style={{ fontSize: 10, color: '#9C8E7E', marginTop: 2 }}>
                                  was MVR {item.last_purchase_price.toFixed(2)}
                                </div>
                              )}
                              {canManageInventory && item.suggested_supplier.source === 'cheapest' && (
                                <button
                                  type="button"
                                  disabled={restockBusy}
                                  onClick={() => void setPreferredFromSuggestion(item)}
                                  style={{
                                    marginTop: 4, padding: '2px 8px', borderRadius: 6, border: '1px solid #E8E0D8',
                                    background: '#F8F6F3', color: '#1C1408', fontSize: 11, fontWeight: 700,
                                    cursor: settingPreferredId === item.id ? 'wait' : 'pointer', fontFamily: 'inherit',
                                  }}
                                >
                                  {settingPreferredId === item.id ? 'Saving…' : 'Set preferred'}
                                </button>
                              )}
                            </>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#6B5D4F', fontSize: 12 }}>
                          {REASON_LABEL[item.reason] ?? item.reason}
                        </td>
                      </tr>
                    ))}
                    {restock.items.length === 0 && (
                      <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: '#9C8E7E' }}>No usage or purchase history yet.</td></tr>
                    )}
                    {restockFilter === 'due_soon' && restock.totals.due_soon === 0 && restock.items.length > 0 && (
                      <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#9C8E7E' }}>Nothing due soon — switch to All tracked items.</td></tr>
                    )}
                    {restockFilter === 'price_up' && (restock.totals.price_up ?? 0) === 0 && (
                      <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#9C8E7E' }}>No items priced above last purchase (≥1%).</td></tr>
                    )}
                    {restockFilter === 'alerts' && (restock.totals.open_alerts ?? 0) === 0 && (
                      <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#9C8E7E' }}>No open reorder alerts. Scheduler creates them when stock hits ROP.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {restock.items.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {readyRestock.length > 0 && (
                    <Btn small variant="ghost" onClick={toggleSelectAllEligible}>
                      {allReadySelected ? 'Clear selection' : `Select all ${readyRestock.length} ready for new PO`}
                    </Btn>
                  )}
                  {selectableRestock.some(canApplyRop) && (
                    <Btn
                      small
                      variant="ghost"
                      onClick={() => setSelectedRestockIds(new Set(
                        restock.items.filter(canApplyRop).map((i) => i.id),
                      ))}
                    >
                      Select all with ROP change
                    </Btn>
                  )}
                  {cheapestRestock.length > 0 && (
                    <Btn
                      small
                      variant="ghost"
                      onClick={() => setSelectedRestockIds(new Set(cheapestRestock.map((i) => i.id)))}
                    >
                      Select all {cheapestRestock.length} cheapest (no preferred)
                    </Btn>
                  )}
                </div>
              )}
            </Card>
            </div>
          )}

          {/* Inventory runway */}
          {invForecast && (
            <Card>
              <div style={{ fontWeight: 700, marginBottom: 16 }}>Inventory Runway</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #F0EBE5' }}>
                      {['Item', 'Category', 'Stock', 'Daily Usage', 'Days Left', 'Status'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#6B5D4F', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invForecast.items.slice(0, 30).map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #F8F6F3' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{item.name}</td>
                        <td style={{ padding: '8px 12px', color: '#6B5D4F' }}>{item.category ?? '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{parseFloat(String(item.current_stock ?? 0)).toFixed(2)} {item.unit}</td>
                        <td style={{ padding: '8px 12px', color: '#6B5D4F' }}>{parseFloat(String(item.daily_usage_rate ?? 0)).toFixed(3)}/day</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700 }}>
                          {item.days_of_stock === null ? '∞' : item.days_of_stock === 0 ? 'OUT' : `${item.days_of_stock}d`}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: STATUS_BG[item.status] ?? '#F0EBE5',
                            color: STATUS_COLOR[item.status] ?? '#6B5D4F' }}>
                            {item.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {invForecast.items.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9C8E7E' }}>No inventory data available</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
