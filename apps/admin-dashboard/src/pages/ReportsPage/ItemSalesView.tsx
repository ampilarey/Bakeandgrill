import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, LineChart } from 'lucide-react';
import { fetchItemSales, type ItemSalesSplit, type TrendGroup } from '../../api';
import { Btn, Card, ErrorMsg, Modal, Spinner, TabScrollRow } from '../../components/SharedUI';
import { TrendChart } from '../../components/dashboard/TrendChart';
import { ColumnChart } from '../../components/charts/ColumnChart';
import { HeatGrid } from '../../components/charts/HeatGrid';
import { change, defaultGroup, hourWord, iso, presetRange, rangeLabel, spanDays, type Range } from '../../components/dashboard/salesInsightsMath';

/*
 * One item, opened from Reports → Items Sold (owner, 2026-10-27: "When i select
 * an item, which time this item is bought in a graph and different forms and
 * different times, dates, months"): how many sold and for how much against the
 * period before; over time by hour, day, week or month as an area or columns;
 * by hour of the day; by day of the week; the weekday × hour grid; and its
 * sizes, order types and staff. Sold (count) or Sales (money) switches every
 * chart. The period starts as Items Sold's and changes here on its own.
 */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TYPE_WORDS: Record<string, string> = { dine_in: 'Dine in', takeaway: 'Takeaway', online_pickup: 'Pickup', delivery: 'Delivery', unknown: 'Other' };
const money = (v: number) => `MVR ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

const PERIODS: { key: string; label: string; range: () => Range }[] = [
  { key: 'today', label: 'Today', range: () => presetRange('today') },
  { key: 'last_7', label: 'Last 7 days', range: () => presetRange('last_7') },
  { key: 'last_30', label: 'Last 30 days', range: () => presetRange('last_30') },
  { key: 'this_month', label: 'This month', range: () => presetRange('this_month') },
  { key: 'last_90', label: 'Last 3 months', range: () => { const t = new Date(); const f = new Date(t); f.setDate(f.getDate() - 89); return { from: iso(f), to: iso(t) }; } },
  { key: 'last_365', label: 'Last 12 months', range: () => { const t = new Date(); const f = new Date(t); f.setDate(f.getDate() - 364); return { from: iso(f), to: iso(t) }; } },
];

type Props = {
  itemId: number;
  /** The size to open on: a size id, 0 for "no size", null for every size. */
  variantId: number | null;
  title: string;
  initial: { from: string; to: string; time_from: string | null; time_to: string | null; user_id: number | null; type: string | null };
  onClose: () => void;
};

function Tile({ label, value, before, money: isMoney, testId }: { label: string; value: number; before: number; money?: boolean; testId?: string }) {
  const c = change(value, before);
  const tone = c.diff === 0 ? 'var(--color-text-muted)' : c.diff > 0 ? 'var(--color-success-strong)' : 'var(--color-danger-strong)';
  return (
    <div className="si-tile" style={{ cursor: 'default' }} data-testid={testId}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap' }}>{isMoney ? money(value) : num(value)}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: tone }}>
        {c.pct === null ? (value === 0 ? 'None before either' : 'New this period') : `${c.diff >= 0 ? '+' : '−'}${Math.abs(c.pct).toFixed(1)}% on before`}
      </span>
    </div>
  );
}

function SplitBars({ rows, by, word }: { rows: ItemSalesSplit[]; by: 'qty' | 'sales'; word: (s: ItemSalesSplit) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[by]));
  const total = rows.reduce((s, r) => s + r[by], 0);
  if (rows.length === 0) return <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing in this period.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => (
        <div key={r.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{word(r)}<span style={{ color: 'var(--color-text-muted)' }}> · {r.orders} order{r.orders === 1 ? '' : 's'}</span></span>
            <strong style={{ whiteSpace: 'nowrap' }}>{by === 'sales' ? money(r.sales) : `${num(r.qty)} sold`}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--color-border-light)', overflow: 'hidden' }}>
              <div className="si-bar" style={{ width: `${(r[by] / max) * 100}%`, animationDelay: `${i * 60}ms` }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 38, textAlign: 'right' }}>{total > 0 ? `${Math.round((r[by] / total) * 100)}%` : ''}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ItemSalesView({ itemId, variantId, title, initial, onClose }: Props) {
  const [range, setRange] = useState<Range>({ from: initial.from, to: initial.to });
  const [period, setPeriod] = useState<string>('');
  const [variant, setVariant] = useState<number | null>(variantId);
  const [by, setBy] = useState<'qty' | 'sales'>('qty');
  const [kind, setKind] = useState<'area' | 'bars'>('bars');
  const [compare, setCompare] = useState(true);
  const days = spanDays(range);
  const [group, setGroup] = useState<TrendGroup>(defaultGroup(days));
  useEffect(() => { setGroup(defaultGroup(days)); }, [days]);
  const effectiveGroup: TrendGroup = group === 'hour' && days > 7 ? 'day' : group;

  const query = useQuery({
    queryKey: ['item-sales', itemId, variant, range.from, range.to, effectiveGroup, initial.time_from, initial.time_to, initial.user_id, initial.type],
    queryFn: () => fetchItemSales(itemId, {
      from: range.from, to: range.to, group: effectiveGroup, variant_id: variant,
      time_from: initial.time_from, time_to: initial.time_to, user_id: initial.user_id, type: initial.type,
    }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const fmt = (v: number) => (by === 'sales' ? money(v) : `${num(v)} sold`);
  const playKey = `${by}|${kind}|${variant}|${range.from}|${range.to}|${effectiveGroup}|${compare}`;

  const hourBars = useMemo(() => (data?.by_hour ?? []).map((c, h) => ({ key: String(h), label: hourWord(h), value: c[by], sub: `${c.orders} order${c.orders === 1 ? '' : 's'}` })), [data, by]);
  const dayBars = useMemo(() => (data?.by_weekday ?? []).map((c, d) => ({ key: String(d), label: DAYS[d], short: DAYS[d].slice(0, 3), value: c[by], sub: `${c.orders} order${c.orders === 1 ? '' : 's'}` })), [data, by]);
  const pickedSize = variant && variant > 0 ? data?.item.sizes.find((s) => s.id === variant)?.name : undefined;
  const heading = data ? `${data.item.name}${pickedSize ? ` (${pickedSize})` : variant === null && data.item.sizes.length > 0 ? ' (every size)' : ''}` : title;
  const sizeName = variant === null ? 'Every size' : variant === 0 ? 'No size' : data?.item.sizes.find((s) => s.id === variant)?.name;

  return (
    <Modal title={heading} onClose={onClose} maxWidth={1100}>
      <div data-testid="item-sales" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <TabScrollRow role="group" aria-label="Period" style={{ gap: 6 }}>
            {PERIODS.map((p) => (
              <Btn key={p.key} small variant={period === p.key ? 'primary' : 'secondary'} aria-pressed={period === p.key}
                onClick={() => { setPeriod(p.key); setRange(p.range()); }}>{p.label}</Btn>
            ))}
          </TabScrollRow>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }} data-testid="item-sales-range">
            {rangeLabel(range)}
            {initial.time_from && initial.time_to ? `, ${initial.time_from} to ${initial.time_to} each day` : ''}
            {data ? `. Against ${rangeLabel(data.previous)}.` : ''}
          </p>
          {data && data.item.sizes.length > 0 && (
            <TabScrollRow role="group" aria-label="Size" style={{ gap: 6 }}>
              <Btn small variant={variant === null ? 'primary' : 'secondary'} aria-pressed={variant === null} onClick={() => setVariant(null)}>Every size</Btn>
              {data.item.sizes.map((s) => (
                <Btn key={s.id} small variant={variant === s.id ? 'primary' : 'secondary'} aria-pressed={variant === s.id} onClick={() => setVariant(s.id)}>{s.name}</Btn>
              ))}
            </TabScrollRow>
          )}
          <TabScrollRow role="group" aria-label="Count" style={{ gap: 6 }}>
            <Btn small variant={by === 'qty' ? 'primary' : 'secondary'} aria-pressed={by === 'qty'} onClick={() => setBy('qty')}>How many sold</Btn>
            <Btn small variant={by === 'sales' ? 'primary' : 'secondary'} aria-pressed={by === 'sales'} onClick={() => setBy('sales')}>Sales (MVR)</Btn>
          </TabScrollRow>
        </div>

        {query.error && <ErrorMsg message={(query.error as Error).message} />}
        {!data && query.isLoading && <Spinner />}

        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: query.isFetching ? 0.6 : 1, transition: 'opacity 200ms' }}>
            <div className="si-tiles" style={{ marginBottom: 0 }}>
              <Tile label="Sold" value={data.totals.qty} before={data.previous_totals.qty} testId="item-sales-sold" />
              <Tile label="Sales" value={data.totals.sales} before={data.previous_totals.sales} money />
              <Tile label="Orders" value={data.totals.orders} before={data.previous_totals.orders} />
              <Tile label="A day, on average" value={data.totals.per_day} before={data.previous_totals.per_day} />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
              {sizeName}{data.item.category ? ` · ${data.item.category}` : ''} · average price {money(data.totals.avg_price)} · {num(data.totals.per_order)} on each order that has it.
            </p>

            <Card style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, marginRight: 'auto' }}>Over time</p>
                <TabScrollRow role="group" aria-label="Group by" style={{ gap: 6 }}>
                  {(['hour', 'day', 'week', 'month'] as TrendGroup[]).map((g) => (
                    <Btn key={g} small variant={effectiveGroup === g ? 'primary' : 'secondary'} aria-pressed={effectiveGroup === g} disabled={g === 'hour' && days > 7} onClick={() => setGroup(g)}>
                      {{ hour: 'Hours', day: 'Days', week: 'Weeks', month: 'Months' }[g]}
                    </Btn>
                  ))}
                </TabScrollRow>
                <TabScrollRow role="group" aria-label="Chart" style={{ gap: 6 }}>
                  <Btn small variant={kind === 'bars' ? 'primary' : 'secondary'} aria-pressed={kind === 'bars'} aria-label="Columns" onClick={() => setKind('bars')}><BarChart3 size={15} /></Btn>
                  <Btn small variant={kind === 'area' ? 'primary' : 'secondary'} aria-pressed={kind === 'area'} aria-label="Area" onClick={() => setKind('area')}><LineChart size={15} /></Btn>
                </TabScrollRow>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
                <span aria-hidden style={{ width: 12, height: 2, background: 'var(--color-text-muted)', borderRadius: 1 }} />
                Before · {rangeLabel(data.previous)}
              </label>
              <TrendChart points={data.series} previous={data.previous_series} metric={by === 'sales' ? 'sales' : 'items'} group={data.range.group} kind={kind} compare={compare} playKey={playKey} />
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14 }}>
              <Card style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700 }}>By hour of the day</p>
                <ColumnChart key={playKey} bars={hourBars} format={fmt} labelEvery={3} testId="item-sales-hours" />
              </Card>
              <Card style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700 }}>By day of the week</p>
                <ColumnChart key={playKey} bars={dayBars} format={fmt} testId="item-sales-weekdays" />
              </Card>
              <Card style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>Day and hour together</p>
                <HeatGrid key={playKey} cells={data.heatmap} value={(c) => c[by]} format={(c) => `${num(c.qty)} sold · ${money(c.sales)}`} testId="item-sales-heat" />
              </Card>
              {data.by_size.length > 1 && (
                <Card style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>By size</p>
                  <SplitBars key={playKey} rows={data.by_size} by={by} word={(r) => r.label} />
                </Card>
              )}
              <Card style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>By order type</p>
                <SplitBars key={playKey} rows={data.by_type} by={by} word={(r) => TYPE_WORDS[r.label] ?? r.label.replace(/_/g, ' ')} />
              </Card>
              <Card style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>By staff</p>
                <SplitBars key={playKey} rows={data.by_staff} by={by} word={(r) => r.label} />
              </Card>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
