import { useEffect, useMemo, useState } from 'react';
import { getProcurementReport, type ProcurementReport } from '../api/finance';
import { PageHeader, PageShell, Btn, StatCard } from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';
import { downloadCSV } from '../utils/csvExport';
import { today, daysAgo, monthStart } from '../utils/dateHelpers';

function mvr(laar: number): string {
  return (laar / 100).toFixed(2);
}

function BarRow({ label, value, max, suffix }: { label: string; value: number; max: number; suffix: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <div style={{ width: 140, fontSize: 13, color: 'var(--color-text)', fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
        {label}
      </div>
      <div style={{ flex: 1, height: 10, background: 'var(--color-border-light)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-primary)', borderRadius: 4 }} />
      </div>
      <div style={{ width: 110, textAlign: 'right', fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{suffix}</div>
    </div>
  );
}

function PriceTrendChart({ points }: { points: ProcurementReport['price_trend'] }) {
  const byItem = useMemo(() => {
    const map = new Map<string, typeof points>();
    for (const p of points) {
      const key = p.item_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).slice(0, 4);
  }, [points]);

  if (byItem.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>No price history in this range.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {byItem.map(([name, rows]) => {
        const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
        const prices = sorted.map((r) => r.avg_unit_price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const span = Math.max(0.01, max - min);
        const w = 280;
        const h = 64;
        const path = sorted.map((r, i) => {
          const x = sorted.length === 1 ? w / 2 : (i / (sorted.length - 1)) * w;
          const y = h - ((r.avg_unit_price - min) / span) * (h - 8) - 4;
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');

        return (
          <div key={name}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 6 }}>{name}</div>
            <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ maxWidth: 360, height: 72, background: '#FAFAF8', borderRadius: 8, border: '1px solid var(--color-border)' }}>
              <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2" />
            </svg>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {sorted[0]?.date} → {sorted[sorted.length - 1]?.date} · MVR {min.toFixed(2)}–{max.toFixed(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ProcurementReportPage() {
  usePageTitle('Procurement');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<ProcurementReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getProcurementReport({ from, to }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const maxCat = Math.max(1, ...(data?.spend_by_category.map((r) => r.amount_laar) ?? [1]));
  const maxSup = Math.max(1, ...(data?.spend_by_supplier.map((r) => r.expense_laar) ?? [1]));
  const maxBuyer = Math.max(1, ...(data?.spend_by_buyer.map((r) => r.bought_laar) ?? [1]));

  const exportCsv = () => {
    if (!data) return;
    downloadCSV('procurement-spend-category', data.spend_by_category.map((r) => ({
      Category: r.category,
      'Amount MVR': mvr(r.amount_laar),
      Count: r.count,
    })));
    downloadCSV('procurement-spend-supplier', data.spend_by_supplier.map((r) => ({
      Supplier: r.supplier,
      'Expense MVR': mvr(r.expense_laar),
      'History sum MVR': r.history_spend_mvr,
      Count: r.expense_count,
    })));
    downloadCSV('procurement-spend-buyer', data.spend_by_buyer.map((r) => ({
      Buyer: r.buyer,
      Requests: r.request_count,
      'Bought MVR': mvr(r.bought_laar),
    })));
    downloadCSV('procurement-price-trend', data.price_trend.map((r) => ({
      Item: r.item_name,
      Date: r.date,
      Avg: r.avg_unit_price,
      Min: r.min_unit_price,
      Max: r.max_unit_price,
      Samples: r.samples,
    })));
    downloadCSV('procurement-savings', data.savings.lines.map((r) => ({
      Item: r.item_name,
      'Paid MVR': mvr(r.unit_price_laar),
      'Savings MVR': mvr(r.savings_laar),
      Qty: r.actual_qty ?? '',
      Selected: r.selected_at,
    })));
  };

  return (
    <PageShell>
    <div>
      <PageHeader section="Analyze"
        title="Procurement"
        subtitle="Spend by category / supplier / buyer · price trends · cheapest-pick savings"
        action={<Btn variant="secondary" onClick={exportCsv} disabled={!data}>Export CSV</Btn>}
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ height: 40, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontFamily: 'inherit' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ height: 40, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px', fontFamily: 'inherit' }} />
        </label>
        {[7, 30, 90].map((d) => (
          <Btn key={d} small variant="secondary" onClick={() => { setFrom(daysAgo(d)); setTo(today()); }}>{d}d</Btn>
        ))}
      </div>

      {error ? <p style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
      {loading ? <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p> : null}

      {!loading && data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <StatCard label="Savings (cheapest-pick)" value={`MVR ${mvr(data.savings.total_savings_laar)}`} sub={`${data.savings.quote_picks} quote picks`} />
            <StatCard label="Categories" value={String(data.spend_by_category.length)} />
            <StatCard label="Suppliers" value={String(data.spend_by_supplier.length)} />
            <StatCard label="Buyers" value={String(data.spend_by_buyer.length)} />
          </div>

          <div className="form-grid-2" data-responsive-grid style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <section style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Spend by category</h3>
              {data.spend_by_category.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No expenses.</p> : null}
              {data.spend_by_category.map((r) => (
                <BarRow key={r.category} label={r.category} value={r.amount_laar} max={maxCat} suffix={`MVR ${mvr(r.amount_laar)}`} />
              ))}
            </section>
            <section style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Spend by supplier</h3>
              {data.spend_by_supplier.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No supplier spend.</p> : null}
              {data.spend_by_supplier.map((r) => (
                <BarRow key={`${r.supplier_id}-${r.supplier}`} label={r.supplier} value={r.expense_laar} max={maxSup} suffix={`MVR ${mvr(r.expense_laar)}`} />
              ))}
            </section>
            <section style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Spend by buyer</h3>
              {data.spend_by_buyer.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No buyer totals.</p> : null}
              {data.spend_by_buyer.map((r) => (
                <BarRow key={`${r.buyer_id}`} label={r.buyer} value={r.bought_laar} max={maxBuyer} suffix={`MVR ${mvr(r.bought_laar)} · ${r.request_count} PR`} />
              ))}
            </section>
            <section style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Item price trend</h3>
              <PriceTrendChart points={data.price_trend} />
            </section>
          </div>
        </div>
      ) : null}
    </div>

    </PageShell>
  );
}
