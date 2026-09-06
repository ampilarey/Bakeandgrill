import { useCallback, useEffect, useState } from 'react';
import { getMonthlySheet, type MonthlySheet, type MonthlySheetMonth } from '../api';
import { Btn, Card, ErrorMsg, PageHeader, PageShell, Spinner } from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';

/*
 * The owner's accounting model, on one screen.
 *
 * "item purchased, salary, rent ect.. comes under each month cost, and income
 * is from the sales, profit and loss should be calculated based on this."
 *
 * Pick a month. Income at the top, what it cost below it, profit at the
 * bottom, last month alongside for the only comparison that matters. Built
 * phone-first, because that is where this gets read.
 */

const mvr = (v: number | null | undefined) =>
  `MVR ${Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** One row of the sheet: label left, money right, previous month faint below. */
function Row({ label, value, prev, strong, muted, negative }: {
  label: string;
  value: number;
  prev?: number;
  strong?: boolean;
  muted?: boolean;
  negative?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
      padding: '10px 0', borderBottom: '1px solid var(--color-border-light)',
      opacity: muted ? 0.7 : 1,
    }}>
      <span style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 700 : 500, color: strong ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span style={{ textAlign: 'right' }}>
        <span style={{
          display: 'block', fontSize: strong ? 18 : 14, fontWeight: 700,
          color: negative ? 'var(--color-danger-strong)' : strong ? 'var(--color-text)' : 'var(--color-text)',
        }}>
          {negative && value > 0 ? '−' : ''}{mvr(Math.abs(value))}
        </span>
        {prev !== undefined && (
          <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)' }}>
            last month {mvr(Math.abs(prev))}
          </span>
        )}
      </span>
    </div>
  );
}

export function MonthlySheetPage() {
  usePageTitle('Monthly Sheet');
  const [month, setMonth] = useState(currentMonth());
  const [sheet, setSheet] = useState<MonthlySheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError('');
    try {
      setSheet(await getMonthlySheet(m));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(month); }, [month, load]);

  const cur: MonthlySheetMonth | null = sheet;
  const prev = sheet?.previous;
  const profitUp = cur && prev ? cur.profit >= prev.profit : null;

  return (
    <PageShell>
      <PageHeader title="Monthly Sheet" subtitle="Money in, money out, and what was left — one month at a time" />

      {/* Month picker: arrows for thumbs, native input for jumps. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Btn small variant="secondary" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">←</Btn>
        <input
          type="month"
          value={month}
          max={currentMonth()}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          aria-label="Month"
          style={{
            minHeight: 44, padding: '0 12px', fontSize: 14, fontFamily: 'inherit',
            border: '1.5px solid var(--color-border)', borderRadius: 10,
            background: 'var(--color-surface)', color: 'var(--color-text)',
          }}
        />
        <Btn
          small
          variant="secondary"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= currentMonth()}
          aria-label="Next month"
        >
          →
        </Btn>
        {cur?.is_current && (
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Month in progress — live figures
          </span>
        )}
      </div>

      {error && <ErrorMsg message={error} />}
      {loading ? <Spinner /> : cur && (
        <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
          {/* ── The sheet itself ── */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{cur.label}</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
              {cur.income.orders} orders
            </p>

            <Row label="Takings (incl. GST)" value={cur.income.takings_incl_gst} prev={prev?.income.takings_incl_gst} />
            <Row label="GST set aside for MIRA" value={cur.income.gst_for_mira} prev={prev?.income.gst_for_mira} negative muted />
            {cur.income.refunds > 0 && <Row label="Refunds" value={cur.income.refunds} negative muted />}
            {cur.income.wholesale_net !== 0 && (
              <Row label="Wholesale (ex GST)" value={cur.income.wholesale_net} prev={prev?.income.wholesale_net} />
            )}
            <Row label="Income" value={cur.income.total} prev={prev?.income.total} strong />

            <div style={{ height: 10 }} />

            <Row label="Ingredients bought" value={cur.ingredients} prev={prev?.ingredients} negative />
            <Row label="Expenses (salary, rent…)" value={cur.expenses.total} prev={prev?.expenses.total} negative />

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '14px 0 4px',
            }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>Profit</span>
              <span style={{
                fontSize: 22, fontWeight: 800,
                color: cur.profit >= 0 ? 'var(--color-success-strong)' : 'var(--color-danger-strong)',
              }}>
                {mvr(cur.profit)}
              </span>
            </div>
            {prev && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, textAlign: 'right' }}>
                last month {mvr(prev.profit)}
                {profitUp !== null && (profitUp ? ' — up' : ' — down')}
              </p>
            )}
          </Card>

          {/* ── Expenses, itemised ── */}
          {cur.expenses.by_category.length > 0 && (
            <Card>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 10px' }}>Expenses by category</p>
              {cur.expenses.by_category.map((c) => (
                <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{c.icon} {c.category}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{mvr(c.total)}</span>
                </div>
              ))}
            </Card>
          )}

          {/* ── The two honest footnotes ── */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 10px' }}>Worth knowing</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 10px', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--color-text)' }}>Waste:</strong> {mvr(cur.waste_info)} of bought
              ingredients were logged as wasted. That money is already inside “Ingredients bought” —
              it is shown to be watched, not subtracted twice.
            </p>
            {cur.stock_change && cur.profit_by_usage !== null && (
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--color-text)' }}>Shelves:</strong> stock on hand
                {cur.stock_change.change >= 0 ? ' grew ' : ' shrank '}
                by about {mvr(Math.abs(cur.stock_change.change))} this month (estimated at current prices).
                Counting only what was actually used, profit would be about{' '}
                <strong style={{ color: 'var(--color-text)' }}>{mvr(cur.profit_by_usage)}</strong> — a big
                month-end shopping trip lands in next month’s cooking, not this month’s loss.
              </p>
            )}
          </Card>
        </div>
      )}
    </PageShell>
  );
}
