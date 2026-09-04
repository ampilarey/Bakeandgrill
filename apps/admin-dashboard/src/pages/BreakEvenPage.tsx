import { useEffect, useMemo, useState } from 'react';
import { getBreakEvenSeed, type BreakEvenSeed } from '../api';
import {
  Btn, Card, DateInput, ErrorMsg, PageHeader, PageShell, Spinner, StatCard,
} from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';
import { mvr } from '../utils/fmt';
import { today, daysAgo } from '../utils/dateHelpers';
import { breakEvenRevenue } from './breakEven';

/**
 * Estimated break-even.
 *
 * Seeds fixed cost and contribution margin from the last 90 days of real,
 * GST-exclusive figures (see AUDIT_FINANCE_2026-08-26.md), then lets the owner
 * override either and watch the target move. It is a planning what-if, not a
 * ledger — labelled as an estimate throughout — so the arithmetic runs live in
 * the browser via ./breakEven, which mirrors the server's calculator.
 */
export function BreakEvenPage() {
  usePageTitle('Break-even');

  const [seed, setSeed] = useState<BreakEvenSeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(today());

  // Editable fixed-cost lines (rent, salaries, …) and the margin. Both start
  // from the seed on each load; the owner then tunes, adds and removes lines,
  // and the target recomputes live. `edited` tracks whether they have diverged
  // from the seeded actuals so "Reset" only shows when it does something.
  type Line = { key: string; label: string; monthly: number };
  const [lines, setLines] = useState<Line[]>([]);
  const [marginOverride, setMarginOverride] = useState<number | null>(null);
  const [edited, setEdited] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getBreakEvenSeed(from, to);
      setSeed(res);
      setLines(res.fixed_cost_lines.map((l) => ({ ...l })));
      setMarginOverride(null);
      setEdited(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [from, to]);

  const resetToActuals = () => {
    if (!seed) return;
    setLines(seed.fixed_cost_lines.map((l) => ({ ...l })));
    setMarginOverride(null);
    setEdited(false);
  };

  const setLineAmount = (i: number, monthly: number) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, monthly } : l)));
    setEdited(true);
  };
  const setLineLabel = (i: number, label: string) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, label } : l)));
    setEdited(true);
  };
  const removeLine = (i: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
    setEdited(true);
  };
  const addLine = () => {
    setLines((prev) => [...prev, { key: `custom:${Date.now()}`, label: '', monthly: 0 }]);
    setEdited(true);
  };

  // Effective assumptions.
  const fixedMonthly = lines.reduce((sum, l) => sum + (Number(l.monthly) || 0), 0);
  const marginPct = marginOverride ?? Math.round((seed?.contribution_margin_ratio ?? 0) * 1000) / 10;

  const result = useMemo(() => {
    const monthly = breakEvenRevenue(fixedMonthly, marginPct / 100);
    return {
      monthly,
      daily: monthly === null ? null : Math.round((monthly / 30) * 100) / 100,
    };
  }, [fixedMonthly, marginPct]);

  const avgDaily = seed?.avg_daily_revenue_ex_gst ?? 0;
  const covers = result.daily === null ? null : avgDaily >= result.daily;

  return (
    <PageShell>
      <PageHeader
        section="Analyze"
        title="Break-even (estimate)"
        subtitle="How much you need to sell to cover your costs — seeded from recent trading, yours to adjust"
      />
      {error && <ErrorMsg message={error} />}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <DateInput label="Seed from" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />
        {edited && (
          <Btn variant="secondary" small onClick={resetToActuals}>
            Reset to actuals
          </Btn>
        )}
      </div>

      {loading || !seed ? (
        <Spinner />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard
              label="Break-even — per month"
              value={result.monthly === null ? '—' : mvr(result.monthly)}
              accent="var(--color-primary)"
              sub={result.monthly === null ? 'not reachable at this margin' : 'sales needed to cover fixed costs'}
            />
            <StatCard
              label="Break-even — per day"
              value={result.daily === null ? '—' : mvr(result.daily)}
              accent="var(--color-primary)"
              sub="over a 30-day month"
            />
            <StatCard
              label="Your recent daily sales"
              value={mvr(avgDaily)}
              accent={covers === null ? 'var(--color-text-muted)' : covers ? 'var(--color-success)' : 'var(--color-danger)'}
              sub={
                covers === null
                  ? 'ex-GST, last ' + seed.days_in_window + ' days'
                  : covers
                    ? 'above break-even — clearing costs'
                    : 'below break-even — not yet covering costs'
              }
            />
          </div>

          {result.monthly === null && (
            <Card style={{ marginBottom: 20, borderColor: 'var(--color-danger)' }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-danger-strong)', lineHeight: 1.5 }}>
                At this contribution margin every sale loses money before any fixed cost is paid, so
                no level of sales breaks even. Raise prices or cut the cost of stock until the margin
                is positive.
              </p>
            </Card>
          )}

          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
                Fixed costs — per month
                {edited && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: 12 }}> (edited — not saved)</span>}
              </p>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{mvr(fixedMonthly)}</span>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
              Costs that do not move with a sale — rent, salaries, utilities. Seeded per expense category
              from the window; edit an amount, rename a line, remove one, or add your own.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lines.map((line, i) => (
                <div key={line.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={line.label}
                    placeholder="Cost name"
                    onChange={(e) => setLineLabel(i, e.target.value)}
                    style={{ ...S.input, flex: 1, minWidth: 0 }}
                  />
                  <div style={{ position: 'relative', width: 140 }}>
                    <span style={{ position: 'absolute', left: 10, top: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>MVR</span>
                    <input
                      type="number"
                      min={0}
                      step="100"
                      value={Math.round(line.monthly)}
                      onChange={(e) => setLineAmount(i, parseFloat(e.target.value) || 0)}
                      style={{ ...S.input, paddingLeft: 44, textAlign: 'right' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    aria-label={`Remove ${line.label || 'line'}`}
                    style={{ border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 6px' }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {lines.length === 0 && (
                <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  No fixed costs yet — add your monthly rent, wages and utilities.
                </p>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <Btn variant="secondary" small onClick={addLine}>+ Add a fixed cost</Btn>
            </div>

            <label style={{ display: 'block', marginTop: 24, maxWidth: 280 }}>
              <span style={S.label}>Contribution margin (%)</span>
              <input
                type="number"
                min={-100}
                max={100}
                step="0.5"
                value={marginPct}
                onChange={(e) => { setMarginOverride(parseFloat(e.target.value) || 0); setEdited(true); }}
                style={S.input}
              />
              <span style={S.hint}>
                Share of each rufiyaa of sales left after the cost of stock. Seeded at{' '}
                {Math.round(seed.contribution_margin_ratio * 1000) / 10}% from recent sales vs purchases.
              </span>
            </label>
          </Card>

          <Card>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
              What the seed was built from ({seed.days_in_window} days, GST-excluded)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 13 }}>
              <SeedRow label="Sales (ex-GST)" value={mvr(seed.revenue_ex_gst)} />
              <SeedRow label="Cost of stock" value={mvr(seed.variable_cost)} />
              <SeedRow label="Fixed costs (seeded)" value={mvr(seed.fixed_cost)} />
              <SeedRow label="of which waste" value={mvr(seed.components.waste)} />
            </div>
            <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              An estimate for planning. Sales exclude the GST you remit; stock cost excludes reclaimable
              input GST. Purchases are lumpy, so a longer window gives a steadier margin than a single month.
            </p>
          </Card>
        </>
      )}
    </PageShell>
  );
}

function SeedRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: 'var(--color-text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{value}</div>
    </div>
  );
}

const S = {
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 } as const,
  input: { display: 'block', width: '100%', padding: '10px 12px', fontSize: 15, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg)', color: 'var(--color-text)' } as const,
  hint: { display: 'block', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.4 } as const,
};
