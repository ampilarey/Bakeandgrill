import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPurchaseLines, type PurchaseLineRow } from '../api';
import {
  Badge, Btn, EmptyState, ErrorMsg, PageHeader, PageShell, TableCard, TD, TableSkeleton, StatCard,
} from '../components/SharedUI';
import { SortFilterHead, SortFilterPanel, useSortFilter } from '../components/TableControls';
import { RecordCard, RecordCardList } from '../components/RecordCard';
import { usePageTitle } from '../hooks/usePageTitle';
import { useIsMobile } from '../hooks/useIsMobile';
import { downloadCSV } from '../utils/csvExport';
import { mvr } from '../utils/fmt';
import { tidyNumber } from '../utils/packDetails';
import { today } from '../utils/dateHelpers';

/*
 * Every line ever bought, one table.
 *
 * Owner, 2026-09-16: "where i can see all the items purchased from a
 * specific store and specific brand?" Nowhere, until this. The orders page
 * showed a shop's orders one document at a time, the supplier page one
 * item's prices, the item page one item's brands. Here each row is one
 * line — date, order, shop, item, brand, pack, quantity, price — and the
 * boxes under the headings narrow it: pick a shop, pick a brand, and the
 * total at the top is what those rows come to.
 */

const STATUS_COLOR: Record<string, string> = {
  draft: 'gray', ordered: 'blue', partial: 'yellow', received: 'green', cancelled: 'red',
};

const WINDOWS: Array<{ days: number; label: string }> = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'A year' },
  { days: 0, label: 'All time' },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** "2 Bottle 640 ml" for a packed line, or "1,280 ml" for a loose one. */
export function boughtAs(line: PurchaseLineRow): string {
  if (line.pack_name && line.pack_quantity != null) {
    return `${tidyNumber(line.pack_quantity)} × ${line.pack_name}`;
  }
  return `${tidyNumber(line.quantity)} ${line.unit}`;
}

export default function PurchaseLinesPage({ embedded = false }: { embedded?: boolean } = {}) {
  usePageTitle(embedded ? 'Purchasing · Purchase lines' : 'Purchase lines');
  const isMobile = useIsMobile();

  /*
   * The window. A preset sets both dates; either date typed by hand makes
   * the window its own (owner, 2026-09-16: "how about adding a date
   * selection option in looking back"). "All time" reaches back to when
   * the first order was keyed in.
   */
  const [range, setRange] = useState({ from: daysAgo(90), to: today() });
  const preset = WINDOWS.find((w) => range.to === today() && range.from === (w.days > 0 ? daysAgo(w.days) : '2000-01-01'))?.days ?? null;
  const usePreset = (d: number) => setRange({ from: d > 0 ? daysAgo(d) : '2000-01-01', to: today() });
  const [lines, setLines] = useState<PurchaseLineRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    // A half-cleared date box is not a window yet.
    if (!range.from || !range.to) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getPurchaseLines({ from: range.from, to: range.to })
      .then((res) => {
        if (cancelled) return;
        setLines(res.lines ?? []);
        setTruncated(res.truncated);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const ctl = useSortFilter(lines, [
    { key: 'date', label: 'Date', get: (l) => l.purchase_date },
    { key: 'order', label: 'Order', get: (l) => l.purchase_number },
    { key: 'shop', label: 'Shop', kind: 'select', get: (l) => l.supplier ?? '' },
    { key: 'item', label: 'Item', get: (l) => l.item },
    { key: 'brand', label: 'Brand', kind: 'select', get: (l) => l.brand ?? '' },
    { key: 'bought', label: 'Bought as', get: (l) => boughtAs(l) },
    { key: 'pack_cost', label: 'Per pack', kind: 'number', get: (l) => l.pack_cost },
    { key: 'unit_cost', label: `Per unit`, kind: 'number', get: (l) => l.unit_cost },
    { key: 'total', label: 'Total', kind: 'number', get: (l) => l.line_total },
    { key: 'status', label: 'Status', kind: 'select', get: (l) => l.status },
  ], 'purchase-lines', { defaultSort: { key: 'date', dir: 'desc' } });

  const shown = ctl.rows;
  const summary = useMemo(() => ({
    total: shown.reduce((s, l) => s + l.line_total, 0),
    orders: new Set(shown.map((l) => l.purchase_id)).size,
    shops: new Set(shown.map((l) => l.supplier ?? '')).size,
  }), [shown]);

  const exportCsv = () => downloadCSV('purchase-lines', shown.map((l) => ({
    Date: l.purchase_date,
    Order: l.purchase_number,
    Shop: l.supplier ?? '',
    Item: l.item,
    Brand: l.brand ?? '',
    'Bought as': boughtAs(l),
    'Quantity (base unit)': l.quantity,
    Unit: l.unit,
    'Per pack (MVR)': l.pack_cost ?? '',
    'Per unit (MVR)': l.unit_cost,
    'Total (MVR)': l.line_total.toFixed(2),
    Status: l.status,
  })));

  const Shell = embedded ? Fragment : PageShell;

  return (
    <Shell>
      {/* Inside the Purchasing hub the hub drew the title; only the buttons survive. */}
      {!embedded && (
        <PageHeader
          section="Manage"
          title="Purchase lines"
          subtitle="Every line bought — narrow it by shop, brand or item"
        />
      )}
      {error && <ErrorMsg message={error} />}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>Looking back</span>
        {WINDOWS.map((w) => (
          <Btn key={w.days} small variant={preset === w.days ? 'primary' : 'secondary'} aria-pressed={preset === w.days} disabled={loading} onClick={() => usePreset(w.days)} data-testid={`purchase-lines-window-${w.days}`}>
            {w.label}
          </Btn>
        ))}
        {/* Or any two dates. One unit, so "to" never lands on a line of its own on a phone. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="date" aria-label="From date" data-testid="purchase-lines-from"
            value={range.from === '2000-01-01' ? '' : range.from} max={range.to || today()}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            style={{ height: 36, padding: '0 8px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)', minWidth: 0, width: 140 }}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>to</span>
          <input
            type="date" aria-label="To date" data-testid="purchase-lines-to"
            value={range.to} min={range.from === '2000-01-01' ? undefined : range.from} max={today()}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            style={{ height: 36, padding: '0 8px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)', minWidth: 0, width: 140 }}
          />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Btn small variant="secondary" onClick={exportCsv} disabled={shown.length === 0}>Export CSV</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }} data-testid="purchase-lines-summary">
        <StatCard label={ctl.activeCount > 0 ? 'Total of what is shown' : 'Total bought'} value={mvr(summary.total)} accent="var(--color-primary)" />
        <StatCard label="Lines" value={String(shown.length)} />
        <StatCard label="Orders" value={String(summary.orders)} />
        <StatCard label="Shops" value={String(summary.shops)} />
      </div>

      {truncated && (
        <p style={{ fontSize: 12, color: 'var(--color-warning-strong, #b45309)', margin: '0 0 12px' }}>
          This window holds more lines than the table carries. Only the newest 3,000 are here — pick a shorter window.
        </p>
      )}

      {loading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : lines.length === 0 ? (
        <EmptyState message="Nothing bought in this window." />
      ) : isMobile ? (
        <>
          <SortFilterPanel controls={ctl} allRows={lines} open={filtersOpen} onToggle={() => setFiltersOpen((v) => !v)} />
          {shown.length === 0 ? <EmptyState message="Nothing matches these filters." /> : (
            <RecordCardList testId="purchase-line-cards">
              {shown.map((l) => (
                <RecordCard
                  key={l.id}
                  testId={`purchase-line-card-${l.id}`}
                  title={l.item}
                  subtitle={`${l.purchase_date} · ${l.supplier ?? 'No shop'} · ${l.purchase_number}`}
                  badge={<Badge color={STATUS_COLOR[l.status] ?? 'gray'}>{l.status}</Badge>}
                  fields={[
                    { label: 'Brand', value: l.brand ?? '—' },
                    { label: 'Bought as', value: boughtAs(l) },
                    { label: 'Per pack', value: l.pack_cost != null ? mvr(l.pack_cost) : '—' },
                    { label: `Per ${l.unit}`, value: mvr(l.unit_cost) },
                    { label: 'Total', value: mvr(l.line_total) },
                  ]}
                />
              ))}
            </RecordCardList>
          )}
        </>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <SortFilterHead controls={ctl} allRows={lines} />
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={10}><EmptyState message="Nothing matches these filters." /></td></tr>
              )}
              {shown.map((l) => (
                <tr key={l.id} data-testid={`purchase-line-${l.id}`}>
                  <td style={{ ...TD, whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>{l.purchase_date}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    <Link to={`/purchasing/orders?search=${encodeURIComponent(l.purchase_number)}`} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>
                      {l.purchase_number}
                    </Link>
                  </td>
                  <td style={TD}>{l.supplier ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                  <td style={{ ...TD, fontWeight: 600 }}>{l.item}</td>
                  <td style={TD}>{l.brand ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    {boughtAs(l)}
                    {l.pack_name && (
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)' }}>= {tidyNumber(l.quantity)} {l.unit}</span>
                    )}
                  </td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{l.pack_cost != null ? mvr(l.pack_cost) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    {mvr(l.unit_cost)}<span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}> / {l.unit}</span>
                  </td>
                  <td style={{ ...TD, fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{mvr(l.line_total)}</td>
                  <td style={TD}><Badge color={STATUS_COLOR[l.status] ?? 'gray'}>{l.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </Shell>
  );
}
