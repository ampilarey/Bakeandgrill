import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, Download, Search } from 'lucide-react';
import { fetchItemsSold, type ItemsSoldRow } from '../../api';
import { Btn, Card, DateInput, ErrorMsg, Select, Spinner, StatCard, TabScrollRow, TD, TD_NOWRAP, TH, TableCard } from '../../components/SharedUI';
import { downloadCSV } from '../../utils/csvExport';
import { inputFont } from '../../utils/cssVars';
import { iso, presetRange, type PresetKey } from '../../components/dashboard/salesInsightsMath';
import { ItemSalesView } from './ItemSalesView';

/*
 * Reports → Sales → Items Sold (owner, 2026-10-27: "how can i see all the items
 * sold by a specific date and specific time of period, with or without
 * category"). The dates pick the days, the times the same hours on each of
 * them; a category takes its sub-categories with it; each size is its own row.
 * Grouped by category with subtotals, or one list; search, sort, Export. The
 * picks live in the address, so a link (the dashboard's Best sellers) opens it
 * already set.
 */

const QUICK_DAYS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
];

const QUICK_TIMES: { label: string; from: string; to: string }[] = [
  { label: 'Morning', from: '06:00', to: '10:59' },
  { label: 'Lunch', from: '11:00', to: '14:59' },
  { label: 'Afternoon', from: '15:00', to: '17:59' },
  { label: 'Evening', from: '18:00', to: '22:59' },
];

const TYPES = [
  { value: '', label: 'All order types' },
  { value: 'dine_in', label: 'Dine in' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'online_pickup', label: 'Pickup' },
  { value: 'delivery', label: 'Delivery' },
];

type Sort = 'sales' | 'qty' | 'name';

const money = (v: number) => `MVR ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const TIME_RE = /^\d{2}:\d{2}$/;

function time12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function ShareBar({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--color-border-light)', overflow: 'hidden' }}>
        <div className="si-bar" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 40, textAlign: 'right' }}>{value.toFixed(1)}%</span>
    </div>
  );
}

/** A phone's row: name and counts on the left, the money on the right, the share beneath. */
function ItemsList({ rows, showCategory, onOpen }: { rows: ItemsSoldRow[]; showCategory: boolean; onOpen: (r: ItemsSoldRow) => void }) {
  return (
    <div className="is-list" data-testid="items-sold-list">
      {rows.map((r) => (
        <div key={r.key} style={{ padding: '10px 4px', borderBottom: '1px solid var(--color-border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <ItemName row={r} onOpen={onOpen} style={{ fontSize: 14, fontWeight: 600 }} />
            <strong style={{ whiteSpace: 'nowrap', fontSize: 14 }}>{money(r.sales)}</strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 6px' }}>
            {qty(r.qty)} sold · {money(r.avg_price)} each · {r.orders} order{r.orders === 1 ? '' : 's'}{showCategory ? ` · ${r.category}` : ''}
          </div>
          <ShareBar value={r.share} />
        </div>
      ))}
    </div>
  );
}

/** The item's name; one still on the menu opens its own page of charts. */
function ItemName({ row, onOpen, style }: { row: ItemsSoldRow; onOpen: (r: ItemsSoldRow) => void; style?: React.CSSProperties }) {
  if (row.item_id === null) return <span style={{ minWidth: 0, overflowWrap: 'anywhere', ...style }}>{row.name}</span>;
  return (
    <button type="button" onClick={() => onOpen(row)} data-testid={`items-sold-open-${row.key}`}
      title="See when it sells"
      style={{ minWidth: 0, overflowWrap: 'anywhere', textAlign: 'left', padding: 0, border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-primary)', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'var(--color-tone-rust-border)', ...style }}>
      {row.name}
    </button>
  );
}

function ItemsTable({ rows, showCategory, onOpen }: { rows: ItemsSoldRow[]; showCategory: boolean; onOpen: (r: ItemsSoldRow) => void }) {
  return (
    <>
    <ItemsList rows={rows} showCategory={showCategory} onOpen={onOpen} />
    <table className="is-table" data-table-scroll="keep" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
      {/* The same widths in every group, so the columns line up down the page. */}
      <colgroup>
        <col style={{ width: showCategory ? '28%' : '36%' }} />
        {showCategory && <col style={{ width: '16%' }} />}
        <col style={{ width: '10%' }} />
        <col style={{ width: '14%' }} />
        <col style={{ width: '16%' }} />
        <col style={{ width: showCategory ? '16%' : '24%' }} />
      </colgroup>
      <thead>
        <tr>
          <th style={TH}>Item</th>
          {showCategory && <th style={TH}>Category</th>}
          <th style={{ ...TH, textAlign: 'right' }}>Sold</th>
          <th style={{ ...TH, textAlign: 'right' }}>Average price</th>
          <th style={{ ...TH, textAlign: 'right' }}>Sales</th>
          <th style={TH}>Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td style={TD}><ItemName row={r} onOpen={onOpen} /><div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{r.orders} order{r.orders === 1 ? '' : 's'}</div></td>
            {showCategory && <td style={{ ...TD, color: 'var(--color-text-secondary)' }}>{r.category}</td>}
            <td style={{ ...TD_NOWRAP, textAlign: 'right', fontWeight: 600 }}>{qty(r.qty)}</td>
            <td style={{ ...TD_NOWRAP, textAlign: 'right' }}>{money(r.avg_price)}</td>
            <td style={{ ...TD_NOWRAP, textAlign: 'right', fontWeight: 700 }}>{money(r.sales)}</td>
            <td style={TD}><ShareBar value={r.share} /></td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
}

export function ItemsSoldReport() {
  const [params, setParams] = useSearchParams();
  const todayIso = iso(new Date());
  const from = params.get('from') ?? todayIso;
  const to = params.get('to') ?? from;
  const tf = params.get('time_from') ?? '';
  const tt = params.get('time_to') ?? '';
  const timed = TIME_RE.test(tf) && TIME_RE.test(tt);
  const category = params.get('category') ?? '';
  const staff = params.get('staff') ?? '';
  const type = params.get('type') ?? '';
  const [view, setView] = useState<'grouped' | 'list'>('grouped');
  const [sort, setSort] = useState<Sort>('sales');
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const query = useQuery({
    queryKey: ['items-sold', from, to, timed ? tf : '', timed ? tt : '', category, staff, type],
    queryFn: () => fetchItemsSold({
      from, to, time_from: timed ? tf : null, time_to: timed ? tt : null,
      category_id: category ? Number(category) : null, user_id: staff ? Number(staff) : null, type: type || null,
    }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = (data?.items ?? []).filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.category.toLowerCase().includes(needle));
    const by = { sales: (a: ItemsSoldRow, b: ItemsSoldRow) => b.sales - a.sales, qty: (a: ItemsSoldRow, b: ItemsSoldRow) => b.qty - a.qty, name: (a: ItemsSoldRow, b: ItemsSoldRow) => a.name.localeCompare(b.name) }[sort];
    return [...list].sort(by);
  }, [data, search, sort]);

  const groups = useMemo(() => {
    const map = new Map<string, ItemsSoldRow[]>();
    for (const r of rows) map.set(r.category, [...(map.get(r.category) ?? []), r]);
    const order = (data?.categories ?? []).map((c) => c.category);
    return [...map.entries()].sort((a, b) => (sort === 'name' ? a[0].localeCompare(b[0]) : order.indexOf(a[0]) - order.indexOf(b[0])));
  }, [rows, data, sort]);

  const exportCsv = () => {
    if (!data) return;
    const when = `${data.range.from}${data.range.to !== data.range.from ? ` to ${data.range.to}` : ''}${data.range.time_from ? ` ${data.range.time_from}-${data.range.time_to}` : ''}`;
    downloadCSV(`items-sold-${data.range.from}-to-${data.range.to}`, rows.map((r) => ({
      Period: when, Category: r.category, Item: r.name, Sold: r.qty, 'Average price': r.avg_price.toFixed(2),
      Sales: r.sales.toFixed(2), 'Share %': r.share.toFixed(1), Orders: r.orders,
    })));
  };

  // The item opened in its own page, kept in the address too (item, size).
  const openId = Number(params.get('item') ?? '') || null;
  const openSize = params.get('size');
  const openRow = data?.items.find((r) => r.item_id === openId && String(r.variant_id ?? 0) === (openSize ?? ''))
    ?? data?.items.find((r) => r.item_id === openId);
  const openItem = (r: ItemsSoldRow) => set({ item: String(r.item_id), size: String(r.variant_id ?? 0) });

  const pickedPreset = QUICK_DAYS.find((p) => { const r = presetRange(p.key); return r.from === from && r.to === to; })?.key;
  const categoryName = (data?.category_choices ?? []).find((c) => String(c.id) === category)?.name;

  return (
    <div data-testid="items-sold">
      <Card style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TabScrollRow role="group" aria-label="Days" style={{ gap: 6 }}>
          {QUICK_DAYS.map((p) => (
            <Btn key={p.key} small variant={pickedPreset === p.key ? 'primary' : 'secondary'} aria-pressed={pickedPreset === p.key}
              onClick={() => { const r = presetRange(p.key); set({ from: r.from, to: r.to }); }}>{p.label}</Btn>
          ))}
        </TabScrollRow>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <DateInput label="From" value={from} max={todayIso} onChange={(v) => v && set({ from: v, to: v > to ? v : to })} />
          <DateInput label="To" value={to} max={todayIso} onChange={(v) => v && set({ to: v, from: v < from ? v : from })} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <TabScrollRow role="group" aria-label="Hours" style={{ gap: 6 }}>
            <Btn small variant={!timed ? 'primary' : 'secondary'} aria-pressed={!timed} onClick={() => set({ time_from: null, time_to: null })}>Whole day</Btn>
            {QUICK_TIMES.map((t) => {
              const on = timed && tf === t.from && tt === t.to;
              return <Btn key={t.label} small variant={on ? 'primary' : 'secondary'} aria-pressed={on} onClick={() => set({ time_from: t.from, time_to: t.to })}>{t.label}</Btn>;
            })}
            <Btn small variant={timed && !QUICK_TIMES.some((t) => t.from === tf && t.to === tt) ? 'primary' : 'secondary'}
              onClick={() => set({ time_from: timed ? tf : '12:00', time_to: timed ? tt : '15:00' })}>Pick times</Btn>
          </TabScrollRow>
          {timed && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {([['From', 'time_from', tf], ['To', 'time_to', tt]] as const).map(([label, key, value]) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {label} time
                  <input type="time" value={value} aria-label={`${label} time`} data-testid={`items-sold-${key}`}
                    onChange={(e) => TIME_RE.test(e.target.value) && set({ [key]: e.target.value })}
                    style={inputFont({ height: 36, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' })} />
                </label>
              ))}
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', paddingBottom: 8 }}>
                {time12(tf)} to {time12(tt)} on each day{tf > tt ? ', past midnight' : ''}.
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
          <Select aria-label="Category" value={category} onChange={(v) => set({ category: v })}
            options={[{ value: '', label: 'All categories' }, ...(data?.category_choices ?? []).map((c) => ({ value: String(c.id), label: c.name }))]} />
          <Select aria-label="Staff" value={staff} onChange={(v) => set({ staff: v })}
            options={[{ value: '', label: 'All staff and online' }, ...(data?.staff_choices ?? []).map((s) => ({ value: String(s.id), label: s.name }))]} />
          <Select aria-label="Order type" value={type} onChange={(v) => set({ type: v })} options={TYPES} />
        </div>
      </Card>

      {query.error && <ErrorMsg message={(query.error as Error).message} />}
      {!data && query.isLoading && <Spinner />}

      {data && (
        <div style={{ opacity: query.isFetching ? 0.6 : 1, transition: 'opacity 200ms' }}>
          <div className="stat-grid" data-responsive-grid style={{ display: 'grid', '--cols': 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))', gap: 12, marginBottom: 14 } as React.CSSProperties} data-testid="items-sold-totals">
            <StatCard label="Sales" value={money(data.totals.sales)} accent="var(--color-primary)" sub={categoryName ? `In ${categoryName}` : 'Every item'} />
            <StatCard label="Items sold" value={qty(data.totals.qty)} accent="var(--color-primary)" sub={`${data.totals.items} different item${data.totals.items === 1 ? '' : 's'}`} />
            <StatCard label="Orders" value={String(data.totals.orders)} accent="var(--color-tone-brown-text)" sub={timed ? `${time12(tf)} – ${time12(tt)}` : 'Whole day'} />
            <StatCard label="Categories" value={String(data.categories.length)} accent="var(--color-tone-brown-text)" sub="With a sale" />
          </div>

          <TableCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <TabScrollRow role="group" aria-label="View" style={{ gap: 6 }}>
                <Btn small variant={view === 'grouped' ? 'primary' : 'secondary'} aria-pressed={view === 'grouped'} onClick={() => setView('grouped')}>By category</Btn>
                <Btn small variant={view === 'list' ? 'primary' : 'secondary'} aria-pressed={view === 'list'} onClick={() => setView('list')}>One list</Btn>
              </TabScrollRow>
              <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a dish" aria-label="Find a dish"
                  style={inputFont({ width: '100%', height: 36, padding: '0 10px 0 30px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' })} />
              </div>
              <Select aria-label="Sort" value={sort} onChange={(v) => setSort(v as Sort)} options={[{ value: 'sales', label: 'Most sales first' }, { value: 'qty', label: 'Most sold first' }, { value: 'name', label: 'A to Z' }]} style={{ height: 36, minHeight: 36 }} />
              <Btn small variant="secondary" onClick={exportCsv} disabled={rows.length === 0} data-testid="items-sold-export"><Download size={14} /> Export</Btn>
            </div>

            {rows.length === 0 ? (
              <p style={{ margin: '16px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                {search ? 'No dish matches that.' : 'Nothing was sold in this period.'}
              </p>
            ) : view === 'list' ? (
              <ItemsTable rows={rows} showCategory onOpen={openItem} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="items-sold-groups">
                {groups.map(([name, list]) => {
                  const sum = list.reduce((s, r) => s + r.sales, 0);
                  const count = list.reduce((s, r) => s + r.qty, 0);
                  const share = data.totals.sales > 0 ? (sum / data.totals.sales) * 100 : 0;
                  const open = !closed.has(name);
                  return (
                    <div key={name} style={{ border: '1px solid var(--color-border-light)', borderRadius: 12, overflow: 'hidden' }}>
                      <button type="button" aria-expanded={open}
                        onClick={() => setClosed((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; })}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--color-bg)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--color-text)' }}>
                        <ChevronDown size={16} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms' }} />
                        <strong style={{ fontSize: 14 }}>{name}</strong>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{list.length} item{list.length === 1 ? '' : 's'} · {qty(count)} sold</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <strong style={{ whiteSpace: 'nowrap' }}>{money(sum)}</strong>
                          <ShareBar value={share} />
                        </span>
                      </button>
                      {open && <div style={{ padding: '0 8px 6px' }}><ItemsTable rows={list} showCategory={false} onOpen={openItem} /></div>}
                    </div>
                  );
                })}
              </div>
            )}
          </TableCard>
        </div>
      )}

      {openId !== null && (
        <ItemSalesView
          key={`${openId}-${openSize}`}
          itemId={openId}
          variantId={openSize === null || openSize === '' ? null : Number(openSize)}
          title={openRow?.name ?? 'Item'}
          initial={{ from, to, time_from: timed ? tf : null, time_to: timed ? tt : null, user_id: staff ? Number(staff) : null, type: type || null }}
          onClose={() => set({ item: null, size: null })}
        />
      )}
    </div>
  );
}
