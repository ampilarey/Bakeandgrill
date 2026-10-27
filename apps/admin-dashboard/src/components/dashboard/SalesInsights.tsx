import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BarChart3, ChevronLeft, ChevronRight, Download, LineChart } from 'lucide-react';
import { fetchSalesTrend, type SalesTrend, type TrendGroup } from '../../api';
import { Btn, Card, DateInput, ErrorMsg, SectionLabel, Select, Spinner, TabScrollRow, TD, TD_NOWRAP, TH, TableCard } from '../SharedUI';
import { TrendChart } from './TrendChart';
import {
  DAYPARTS, HOUR_MAX_DAYS, METRICS, PRESETS, change, count, defaultGroup, formatMetric, hourWord, metricOf, money,
  pointLabel, presetRange, rangeLabel, shiftRange, spanDays, toCsv, valueOf, iso,
  type MetricKey, type PresetKey, type Range,
} from './salesInsightsMath';

/*
 * The dashboard's Sales section (owner, 2026-10-27, with Loyverse's sales
 * summary beside it: "no need to be exact like that. I need more advanced
 * graphics and features and animations"). One row of filters scopes
 * everything below it: the period (presets, ‹ › to step, or two dates), the
 * time of day, the staff member and the order type. Then a tile per figure
 * against the period before, the picked figure drawn over time, when in the
 * week it sells, where it came from, and the table with Export.
 */

const TYPE_WORDS: Record<string, string> = {
  dine_in: 'Dine in', takeaway: 'Takeaway', online_pickup: 'Pickup', delivery: 'Delivery',
  online_dine_in: 'Eat in (online)', pickup: 'Pickup', catering: 'Catering', unknown: 'Other',
};
const METHOD_WORDS: Record<string, string> = {
  cash: 'Cash', card: 'Card', bml: 'BML online', bank_transfer: 'Bank transfer', gift_card: 'Gift card',
  customer_deposit: 'Wallet', wallet: 'Wallet', house_account: 'Credit account', loyalty_points: 'Points',
};
const typeWord = (t: string) => TYPE_WORDS[t] ?? t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const methodWord = (m: string) => METHOD_WORDS[m] ?? m.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const GROUP_WORDS: Record<TrendGroup, string> = { hour: 'Hours', day: 'Days', week: 'Weeks', month: 'Months' };
const TABLE_ROWS = 7;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A number that runs up to its new value (skipped under reduced motion). */
function useCountUp(target: number, ms = 650): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof requestAnimationFrame === 'undefined') { setShown(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - (1 - k) ** 3;
      setShown(a + (target - a) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, ms]);
  return shown;
}

function Sparkline({ values, active }: { values: number[]; active: boolean }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(22 - (v / max) * 20).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" width="100%" height={24} aria-hidden style={{ display: 'block', marginTop: 8 }}>
      <polyline points={pts} fill="none" stroke={active ? 'var(--color-primary)' : 'var(--color-text-muted)'} strokeOpacity={active ? 1 : 0.6} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function MetricTile({ k, data, active, onPick }: { k: MetricKey; data: SalesTrend; active: boolean; onPick: () => void }) {
  const m = metricOf(k);
  const now = valueOf(data.totals, k);
  const before = valueOf(data.previous_totals, k);
  const shown = useCountUp(now);
  const c = change(now, before);
  const good = (c.diff >= 0) === m.upIsGood;
  const tone = c.diff === 0 ? 'var(--color-text-muted)' : good ? 'var(--color-success-strong)' : 'var(--color-danger-strong)';
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={`si-tile${active ? ' is-active' : ''}`}
      data-testid={`si-tile-${k}`}
      title={m.hint}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{m.label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
        {m.money && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginRight: 4 }}>MVR</span>}
        {m.money ? formatMetric(k, shown).replace(/^MVR /, '') : formatMetric(k, shown)}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: tone }}>
        {c.pct === null ? (before === 0 && now === 0 ? 'No change' : 'New this period') : `${c.diff >= 0 ? '+' : '−'}${Math.abs(c.pct).toFixed(1)}% · ${c.diff >= 0 ? '+' : '−'}${m.money ? money(Math.abs(c.diff)) : count(Math.abs(c.diff))}`}
      </span>
      <Sparkline values={data.series.map((p) => valueOf(p, k))} active={active} />
    </button>
  );
}

/** Weekday × hour: darker is busier. */
function Heatmap({ data, metric }: { data: SalesTrend; metric: 'sales' | 'orders' }) {
  const [tip, setTip] = useState<{ d: number; h: number } | null>(null);
  const cells = data.heatmap;
  const max = Math.max(1, ...cells.flat().map((c) => c[metric]));
  // Only the hours that ever trade, so a phone keeps readable cells.
  const used = Array.from({ length: 24 }, (_, h) => cells.some((row) => row[h].orders > 0));
  let first = used.indexOf(true);
  let last = used.lastIndexOf(true);
  if (first < 0) { first = 8; last = 22; }
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  let best = { d: 0, h: first, v: -1 };
  cells.forEach((row, d) => row.forEach((c, h) => { if (c[metric] > best.v) best = { d, h, v: c[metric] }; }));

  return (
    <div data-testid="si-heatmap">
      <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(${hours.length}, minmax(0, 1fr))`, gap: 2, alignItems: 'center' }}>
        <span />
        {hours.map((h) => (
          <span key={h} style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center' }}>{(h - first) % 3 === 0 ? hourWord(h).replace(' ', '') : ''}</span>
        ))}
        {cells.map((row, d) => (
          <FragmentRow key={d} label={DAYS[d]}>
            {hours.map((h) => {
              const v = row[h][metric];
              const k = v / max;
              return (
                <button
                  type="button"
                  key={h}
                  className="si-cell"
                  aria-label={`${DAYS[d]} ${hourWord(h)}: ${metric === 'sales' ? money(v) : `${v} orders`}`}
                  onPointerEnter={() => setTip({ d, h })}
                  onPointerLeave={() => setTip(null)}
                  onFocus={() => setTip({ d, h })}
                  onBlur={() => setTip(null)}
                  style={{
                    background: v > 0 ? `color-mix(in srgb, var(--color-primary) ${Math.round(12 + k * 88)}%, var(--color-surface))` : 'var(--color-border-light)',
                    animationDelay: `${(d * hours.length + (h - first)) * 4}ms`,
                    outline: tip && tip.d === d && tip.h === h ? '2px solid var(--color-text)' : undefined,
                  }}
                />
              );
            })}
          </FragmentRow>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        <span>Less</span>
        {[0.12, 0.4, 0.7, 1].map((k) => (
          <span key={k} aria-hidden style={{ width: 16, height: 10, borderRadius: 3, background: `color-mix(in srgb, var(--color-primary) ${Math.round(k * 100)}%, var(--color-surface))` }} />
        ))}
        <span>More</span>
        <span style={{ marginLeft: 'auto', fontWeight: 600 }} data-testid="si-heat-tip">
          {tip
            ? `${DAYS[tip.d]} ${hourWord(tip.h)}: ${money(cells[tip.d][tip.h].sales)} · ${cells[tip.d][tip.h].orders} order${cells[tip.d][tip.h].orders === 1 ? '' : 's'}`
            : best.v > 0 ? `Busiest: ${DAYS[best.d]} ${hourWord(best.h)}` : 'No sales yet'}
        </span>
      </div>
    </div>
  );
}

function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</span>
      {children}
    </>
  );
}

/** Horizontal bars, longest first, value at the tip, share beneath. */
function Bars({ rows, testId }: { rows: { key: string; label: string; sub?: string; value: number }[]; testId: string }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing in this period.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid={testId}>
      {rows.map((r, i) => (
        <div key={r.key} style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{r.label}{r.sub && <span style={{ color: 'var(--color-text-muted)' }}> · {r.sub}</span>}</span>
            <strong style={{ whiteSpace: 'nowrap' }}>{money(r.value)}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--color-border-light)', overflow: 'hidden' }}>
              <div className="si-bar" style={{ width: `${(r.value / max) * 100}%`, animationDelay: `${i * 60}ms` }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 38, textAlign: 'right' }}>{total > 0 ? `${Math.round((r.value / total) * 100)}%` : ''}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SalesInsights() {
  const [preset, setPreset] = useState<PresetKey>('today');
  const [range, setRange] = useState<Range>(() => presetRange('today'));
  const [group, setGroup] = useState<TrendGroup>('hour');
  const [groupTouched, setGroupTouched] = useState(false);
  const [metric, setMetric] = useState<MetricKey>('sales');
  const [kind, setKind] = useState<'area' | 'bars'>('area');
  const [compare, setCompare] = useState(true);
  const [daypart, setDaypart] = useState('all');
  const [staff, setStaff] = useState('');
  const [type, setType] = useState('');
  const [heatBy, setHeatBy] = useState<'sales' | 'orders'>('sales');
  const [allRows, setAllRows] = useState(false);

  const days = spanDays(range);
  const todayIso = iso(new Date());
  // The grouping follows the period until someone picks one; hours stop at a week.
  const effectiveGroup: TrendGroup = group === 'hour' && days > HOUR_MAX_DAYS ? 'day' : group;
  useEffect(() => { if (!groupTouched) setGroup(defaultGroup(days)); }, [days, groupTouched]);

  const part = DAYPARTS.find((d) => d.key === daypart) ?? DAYPARTS[0];
  const query = useQuery({
    queryKey: ['sales-trend', range.from, range.to, effectiveGroup, staff, type, part.key],
    queryFn: () => fetchSalesTrend({
      from: range.from, to: range.to, group: effectiveGroup,
      user_id: staff ? Number(staff) : null, type: type || null, hour_from: part.from, hour_to: part.to,
    }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: range.to === todayIso ? 60_000 : false,
  });
  const data = query.data;

  const choosePreset = (k: PresetKey) => {
    setPreset(k);
    if (k !== 'custom') setRange(presetRange(k));
  };
  const step = (dir: -1 | 1) => { setPreset('custom'); setRange((r) => shiftRange(r, dir)); };

  const typeOptions = useMemo(() => {
    const seen = new Set<string>(['dine_in', 'takeaway', 'online_pickup', 'delivery']);
    (data?.by_type ?? []).forEach((t) => seen.add(t.type));
    if (type) seen.add(type);
    return [{ value: '', label: 'All order types' }, ...[...seen].filter((t) => t !== 'unknown').map((t) => ({ value: t, label: typeWord(t) }))];
  }, [data, type]);

  const exportCsv = () => {
    if (!data) return;
    const blob = new Blob([toCsv(data.series, data.range.group)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${data.range.from}-to-${data.range.to}-by-${data.range.group}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // The same period, hours, staff and type on Reports → Items Sold.
  const itemsSoldLink = (() => {
    const qs = new URLSearchParams({ tab: 'Items Sold', from: range.from, to: range.to });
    const hh = (h: number) => String(h).padStart(2, '0');
    if (part.from !== null && part.to !== null) { qs.set('time_from', `${hh(part.from)}:00`); qs.set('time_to', `${hh(part.to)}:59`); }
    if (staff) qs.set('staff', staff);
    if (type) qs.set('type', type);
    return `/reports?${qs.toString()}`;
  })();
  // Newest first; a long period skips the empty hours and days.
  const tableRows = data ? [...data.series].reverse().filter((p) => p.orders > 0 || p.refunds > 0 || data.series.length <= 31) : [];
  const m = metricOf(metric);
  const playKey = `${metric}|${kind}|${data?.range.from}|${data?.range.to}|${data?.range.group}|${staff}|${type}|${daypart}|${compare}`;
  const busy = query.isFetching;

  return (
    <section data-testid="dash-sales" style={{ marginBottom: 24 }}>
      <SectionLabel>Sales over time</SectionLabel>

      {/* One row of filters, above everything it scopes. */}
      <Card style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Btn small variant="secondary" aria-label="Earlier" onClick={() => step(-1)}><ChevronLeft size={16} /></Btn>
          <strong data-testid="si-range" style={{ fontSize: 15, minWidth: 0, flex: '1 1 160px', textAlign: 'center' }}>{rangeLabel(range)}</strong>
          <Btn small variant="secondary" aria-label="Later" disabled={range.to >= todayIso} onClick={() => step(1)}><ChevronRight size={16} /></Btn>
        </div>
        <TabScrollRow role="group" aria-label="Period" style={{ gap: 6 }}>
          {PRESETS.map((p) => (
            <Btn key={p.key} small variant={preset === p.key ? 'primary' : 'secondary'} aria-pressed={preset === p.key} onClick={() => choosePreset(p.key)}>{p.label}</Btn>
          ))}
        </TabScrollRow>
        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <DateInput label="From" value={range.from} max={range.to} onChange={(v) => v && setRange((r) => ({ from: v, to: v > r.to ? v : r.to }))} />
            <DateInput label="To" value={range.to} max={todayIso} onChange={(v) => v && setRange((r) => ({ from: v < r.from ? v : r.from, to: v }))} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
          <Select aria-label="Time of day" value={daypart} onChange={setDaypart} options={DAYPARTS.map((d) => ({ value: d.key, label: d.label }))} />
          <Select aria-label="Staff" value={staff} onChange={setStaff} options={[{ value: '', label: 'All staff and online' }, ...(data?.staff ?? []).map((s) => ({ value: String(s.id), label: s.name }))]} />
          <Select aria-label="Order type" value={type} onChange={setType} options={typeOptions} />
        </div>
      </Card>

      {query.error && <ErrorMsg message={(query.error as Error).message} />}
      {!data && query.isLoading && <Spinner />}

      {data && (
        <div style={{ opacity: busy ? 0.6 : 1, transition: 'opacity 200ms' }} aria-busy={busy}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }} data-testid="si-compare-line">
            Each figure against {rangeLabel(data.previous)}, the {data.range.days === 1 ? 'day' : `${data.range.days} days`} before.
          </p>
          <div className="si-tiles">
            {METRICS.map((mm) => (
              <MetricTile key={mm.key} k={mm.key} data={data} active={metric === mm.key} onPick={() => setMetric(mm.key)} />
            ))}
          </div>

          <Card style={{ marginBottom: 14, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, marginRight: 'auto' }}>{m.label} by {GROUP_WORDS[data.range.group].toLowerCase().replace(/s$/, '')}</p>
              <TabScrollRow role="group" aria-label="Group by" style={{ gap: 6 }}>
                {(['hour', 'day', 'week', 'month'] as TrendGroup[]).map((g) => (
                  <Btn key={g} small variant={effectiveGroup === g ? 'primary' : 'secondary'} aria-pressed={effectiveGroup === g}
                    disabled={g === 'hour' && days > HOUR_MAX_DAYS}
                    title={g === 'hour' && days > HOUR_MAX_DAYS ? `Hours for up to ${HOUR_MAX_DAYS} days` : undefined}
                    onClick={() => { setGroup(g); setGroupTouched(true); }}>{GROUP_WORDS[g]}</Btn>
                ))}
              </TabScrollRow>
              <TabScrollRow role="group" aria-label="Chart" style={{ gap: 6 }}>
                <Btn small variant={kind === 'area' ? 'primary' : 'secondary'} aria-pressed={kind === 'area'} aria-label="Area" onClick={() => setKind('area')}><LineChart size={15} /></Btn>
                <Btn small variant={kind === 'bars' ? 'primary' : 'secondary'} aria-pressed={kind === 'bars'} aria-label="Columns" onClick={() => setKind('bars')}><BarChart3 size={15} /></Btn>
              </TabScrollRow>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden style={{ width: 12, height: 10, borderRadius: 2, background: 'var(--color-primary)' }} /> This period · {rangeLabel(data.range)}
              </span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} data-testid="si-compare" />
                <span aria-hidden style={{ width: 12, height: 2, background: 'var(--color-text-muted)', borderRadius: 1 }} />
                Before · {rangeLabel(data.previous)}
              </label>
            </div>
            <TrendChart points={data.series} previous={data.previous_series} metric={metric} group={data.range.group} kind={kind} compare={compare} playKey={playKey} />
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14, marginBottom: 14 }}>
            <Card style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, marginRight: 'auto' }}>When it sells</p>
                <TabScrollRow role="group" aria-label="Busy by" style={{ gap: 6 }}>
                  <Btn small variant={heatBy === 'sales' ? 'primary' : 'secondary'} aria-pressed={heatBy === 'sales'} onClick={() => setHeatBy('sales')}>Sales</Btn>
                  <Btn small variant={heatBy === 'orders' ? 'primary' : 'secondary'} aria-pressed={heatBy === 'orders'} onClick={() => setHeatBy('orders')}>Orders</Btn>
                </TabScrollRow>
              </div>
              <Heatmap key={playKey} data={data} metric={heatBy} />
            </Card>
            <Card style={{ minWidth: 0 }}>
              <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>By order type</p>
              <Bars key={playKey} testId="si-by-type" rows={data.by_type.map((t) => ({ key: t.type, label: typeWord(t.type), sub: `${t.orders} order${t.orders === 1 ? '' : 's'}`, value: t.sales }))} />
            </Card>
            <Card style={{ minWidth: 0 }}>
              <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>How it was paid</p>
              <Bars key={playKey} testId="si-by-payment" rows={data.by_payment.map((p) => ({ key: p.method, label: methodWord(p.method), sub: `${p.orders} order${p.orders === 1 ? '' : 's'}`, value: p.amount }))} />
            </Card>
            <Card style={{ minWidth: 0 }}>
              <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>By staff</p>
              <Bars key={playKey} testId="si-by-staff" rows={data.by_staff.map((s) => ({ key: String(s.user_id ?? 'online'), label: s.name, sub: `${s.orders} order${s.orders === 1 ? '' : 's'}`, value: s.sales }))} />
            </Card>
            <Card style={{ minWidth: 0 }}>
              <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Best sellers</p>
              <Bars key={playKey} testId="si-top-items" rows={data.top_items.map((t) => ({ key: t.key, label: t.name, sub: `${count(t.qty)} sold`, value: t.sales }))} />
              <Link to={itemsSoldLink} data-testid="si-every-item" style={{ display: 'inline-block', marginTop: 12, fontSize: 13, fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'none' }}>
                Every item sold, by category →
              </Link>
            </Card>
          </div>

          <TableCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, marginRight: 'auto' }}>Every {GROUP_WORDS[data.range.group].toLowerCase().replace(/s$/, '')}</p>
              <Btn small variant="secondary" onClick={exportCsv} data-testid="si-export"><Download size={14} /> Export</Btn>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} data-testid="si-table">
              <thead>
                <tr>
                  <th style={TH}>{GROUP_WORDS[data.range.group].replace(/s$/, '')}</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Sales</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Refunds</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Discounts</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Net sales</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Orders</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Average</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(0, allRows ? undefined : TABLE_ROWS).map((p) => (
                  <tr key={p.key}>
                    <td style={TD_NOWRAP}>{pointLabel(p, data.range.group)}</td>
                    <td style={{ ...TD_NOWRAP, textAlign: 'right', fontWeight: 700 }}>{money(p.sales)}</td>
                    <td style={{ ...TD_NOWRAP, textAlign: 'right' }}>{money(p.refunds)}</td>
                    <td style={{ ...TD_NOWRAP, textAlign: 'right' }}>{money(p.discounts)}</td>
                    <td style={{ ...TD_NOWRAP, textAlign: 'right' }}>{money(p.net)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{count(p.orders)}</td>
                    <td style={{ ...TD_NOWRAP, textAlign: 'right' }}>{money(p.avg_order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tableRows.length > TABLE_ROWS && (
              <div style={{ marginTop: 10, textAlign: 'center' }}>
                <Btn small variant="secondary" onClick={() => setAllRows((v) => !v)} data-testid="si-table-more">
                  {allRows ? 'Show fewer' : `Show all ${tableRows.length}`}
                </Btn>
              </div>
            )}
          </TableCard>
        </div>
      )}
    </section>
  );
}
