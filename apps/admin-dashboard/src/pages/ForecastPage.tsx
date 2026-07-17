import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getSalesTrends, getRevenueForecast, getInventoryForecast, getItemForecast, getRestockPlan,
  type ItemForecast, type RestockPlan,
} from '../api';
import { Btn, Card, ErrorMsg, PageHeader, Spinner, StatCard } from '../components/Layout';
import { ItemSearch, type MenuItemSelection } from '../components/ItemSearch';
import { usePageTitle } from '../hooks/usePageTitle';
import { today, daysAgo } from '../utils/dateHelpers';

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
  const [trends, setTrends]     = useState<{ total_revenue: number; total_orders: number; data: { period: string; revenue: number; orders: number; growth_pct: number | null }[] } | null>(null);
  const [forecast, setForecast] = useState<{ weighted_moving_avg: number; growth_rate_pct: number; forecast: { week_start: string; projected_revenue: number }[] } | null>(null);
  const [invForecast, setInv]   = useState<{ items: { id: number; name: string; unit: string; category: string; current_stock: number; daily_usage_rate: number; days_of_stock: number | null; status: string }[] } | null>(null);
  const [restock, setRestock]   = useState<RestockPlan | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [granularity, setGran]  = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [from, setFrom]         = useState(daysAgo(29));
  const [to, setTo]             = useState(today());
  const [showAllRestock, setShowAllRestock] = useState(false);

  // Per-item forecast
  const [selectedItem, setSelectedItem]   = useState<MenuItemSelection | null>(null);
  const [itemForecast, setItemForecast]   = useState<ItemForecast | null>(null);
  const [itemForecastDays, setItemForecastDays] = useState(14);
  const [itemLoading, setItemLoading]     = useState(false);
  const [itemError, setItemError]         = useState('');

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
    if (r.status === 'fulfilled') setRestock(r.value);
    else errs.push(`Restock plan: ${(r.reason as Error).message}`);
    if (errs.length) setError(errs.join(' | '));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [granularity, from, to]);

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

  return (
    <>
      <PageHeader title="Forecasts & Trends" subtitle="Revenue projections, inventory runway, and restock plan" />
      {error && <ErrorMsg message={error} />}

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
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Restock Plan</div>
                  <div style={{ fontSize: 13, color: '#6B5D4F', marginTop: 4 }}>
                    Combines usage runway, buy cadence, and reorder points. Suggested ROP is advisory only — not written to inventory.
                  </div>
                </div>
                <Link to="/purchase-orders" style={{ fontSize: 13, fontWeight: 700, color: '#D4813A', textDecoration: 'none' }}>
                  Open Purchase Orders →
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                <StatCard label="Tracked items" value={String(restock.totals.items_count)} accent="#6B5D4F" />
                <StatCard label="Due soon" value={String(restock.totals.due_soon)} accent="#f97316" />
                <StatCard label="Below ROP" value={String(restock.totals.below_rop)} accent="#ef4444" />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #F0EBE5' }}>
                      {['Item', 'Stock', 'Days left', 'Buy every', 'Next order', 'Order qty', 'Why'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#6B5D4F', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllRestock ? restock.items : restock.items.filter((i) => i.due_soon).slice(0, 40)).map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #F8F6F3', background: item.due_soon ? '#FFFBEB' : undefined }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                          <Link to={`/inventory?item=${item.id}`} style={{ color: '#1C1408', textDecoration: 'none' }}>{item.name}</Link>
                          <div style={{ fontSize: 11, color: '#9C8E7E' }}>{item.category ?? '—'}</div>
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
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#16a34a' }}>
                          {item.suggested_order_qty} {item.unit}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#6B5D4F', fontSize: 12 }}>
                          {REASON_LABEL[item.reason] ?? item.reason}
                        </td>
                      </tr>
                    ))}
                    {restock.items.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9C8E7E' }}>No usage or purchase history yet.</td></tr>
                    )}
                    {!showAllRestock && restock.items.filter((i) => i.due_soon).length === 0 && restock.items.length > 0 && (
                      <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9C8E7E' }}>Nothing due soon — show all tracked items below.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {restock.items.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Btn small variant="secondary" onClick={() => setShowAllRestock((v) => !v)}>
                    {showAllRestock ? 'Show due soon only' : `Show all ${restock.items.length} tracked items`}
                  </Btn>
                </div>
              )}
            </Card>
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
