import { Link } from 'react-router-dom';
import { Card, StatCard } from '../../components/Layout';
import { paymentMethodLabel } from '../../lib/paymentMethods';
import {
  BarCell, DISCOUNT_TYPE_LABELS, mvr, ORDER_TYPE_LABELS, PaymentCommissionBlock,
  pct, S, today, type ReportData, type Tab,
} from './reportsShared';

function auditTargetPath(modelType: string, modelId: number | null | undefined): string | null {
  if (!modelId) return null;
  switch (modelType) {
    case 'Order': return `/orders?order=${modelId}`;
    case 'Invoice': return `/invoices?invoice=${modelId}`;
    case 'Expense': return `/expenses?expense=${modelId}`;
    case 'Purchase': return `/purchase-orders?search=${modelId}`;
    case 'Customer': return `/customers?customer=${modelId}`;
    default: return null;
  }
}

type ReportsTabPanelsProps = {
  tab: Tab;
  loading: boolean;
  reportData: ReportData | undefined;
};

export function ReportsTabPanels({ tab, loading, reportData }: ReportsTabPanelsProps) {
  const summary = reportData?.summary ?? null;
  const breakdown = reportData?.breakdown ?? null;
  const xReport = reportData?.xReport ?? null;
  const zReport = reportData?.zReport ?? null;
  const taxReport = reportData?.taxReport ?? null;
  const inventory = reportData?.inventory ?? null;
  const spendByItem = reportData?.spendByItem ?? null;
  const spendHub = reportData?.spendHub ?? null;
  const ap = reportData?.ap ?? null;
  const ar = reportData?.ar ?? null;
  const promoReport = reportData?.promoReport ?? null;
  const loyaltyReport = reportData?.loyaltyReport ?? null;
  const deliveryZones = reportData?.deliveryZones ?? null;
  const discountsReport = reportData?.discountsReport ?? null;
  const voidsReport = reportData?.voidsReport ?? null;
  const voidsByReason = reportData?.voidsByReason ?? null;
  const refundsReport = reportData?.refundsReport ?? null;
  const creditExposure = reportData?.creditExposure ?? null;
  const depositExposure = reportData?.depositExposure ?? null;
  const depositActivity = reportData?.depositActivity ?? null;
  const overridesReport = reportData?.overridesReport ?? null;
  const velocityReport = reportData?.velocityReport ?? null;
  const shiftVariances = reportData?.shiftVariances ?? null;
  const customerLtv = reportData?.customerLtv ?? null;
  const customerCohorts = reportData?.customerCohorts ?? null;
  const cashierPerf = reportData?.cashierPerf ?? null;
  const productMargins = reportData?.productMargins ?? null;
  const stockDiscrepancy = reportData?.stockDiscrepancy ?? null;
  const hourlySales = reportData?.hourlySales ?? null;
  const stationPerf = reportData?.stationPerf ?? null;

  return (
    <>
      {/* ── Summary ── */}
      {!loading && tab === 'Summary' && summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard label="Completed Revenue" value={mvr(summary.total_revenue)} sub="Finished orders only" accent="#22c55e" />
            <StatCard label="Completed Orders" value={summary.order_count.toLocaleString()} accent="#D4813A" />
            <StatCard label="Avg Order Value"  value={mvr(summary.average_order_value ?? 0)} accent="#8b5cf6" />
            {(summary.service_charge_total ?? 0) > 0 && (
              <StatCard label="Service Charge" value={mvr(summary.service_charge_total ?? 0)} sub="Collected on completed orders" accent="#0ea5e9" />
            )}
            {(summary.payment_commission?.totals.gross_commissionable ?? 0) > 0 && (
              <>
                <StatCard label="Card/Gateway Gross" value={mvr(summary.payment_commission!.totals.gross_commissionable)} accent="#6366f1" />
                <StatCard label="BML Commission" value={mvr(summary.payment_commission!.totals.commission_total)} sub="Processing fees" accent="#dc2626" />
                <StatCard label="Net Settlement" value={mvr(summary.payment_commission!.totals.net_settlement)} sub="After fees" accent="#16a34a" />
              </>
            )}
          </div>
          <Card>
            <p style={{ fontSize: 13, color: '#6B5D4F', margin: '0 0 12px' }}>
              Period: <strong style={{ color: '#1C1408' }}>{summary.period}</strong>
              {' · '}Counts only orders marked <strong>completed</strong> in this date range.
            </p>
            {summary.payments && Object.keys(summary.payments).length > 0 && (
              <>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#1C1408', margin: '0 0 8px' }}>Payments by method</p>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Method</th>
                      <th style={{ ...S.th, textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary.payments).map(([method, amount]) => {
                      const isCredit = method === 'house_account';
                      return (
                        <tr key={method} style={isCredit ? { color: '#9C8E7E', fontStyle: 'italic' } : undefined}>
                          <td style={S.td}>
                            {paymentMethodLabel(method)}
                            {isCredit && <span style={{ marginLeft: 6, fontSize: 11 }}>(receivable)</span>}
                          </td>
                          <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{mvr(Number(amount))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(summary.collected != null || summary.on_credit != null) && (
                  <div style={{ marginTop: 8, padding: 8, background: '#FAF7F4', borderRadius: 6, fontSize: 12, color: '#6B5D4F' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Collected</span>
                      <strong style={{ color: '#1C1408' }}>{mvr(summary.collected ?? 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9C8E7E', fontStyle: 'italic' }}>
                      <span>On credit (receivable)</span>
                      <span>{mvr(summary.on_credit ?? 0)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
            <PaymentCommissionBlock commission={summary.payment_commission} />
          </Card>
        </>
      )}

      {/* ── Breakdown ── */}
      {!loading && tab === 'Breakdown' && breakdown && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>

          {/* Top Items */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Top Items</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Item</th>
                <th style={S.th}>Qty</th>
                <th style={{ ...S.th, minWidth: 160 }}>Revenue</th>
              </tr></thead>
              <tbody>
                {(breakdown.top_items ?? []).slice(0, 10).map(item => {
                  const max = (breakdown.top_items ?? [])[0]?.revenue ?? 1;
                  return (
                    <tr key={item.id}>
                      <td style={S.td}>{item.name}</td>
                      <td style={{ ...S.td, color: '#9C8E7E' }}>{item.qty}</td>
                      <td style={S.td}><BarCell value={item.revenue} max={max} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* By Category */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Revenue by Category</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Category</th>
                <th style={S.th}>Orders</th>
                <th style={{ ...S.th, minWidth: 160 }}>Revenue</th>
              </tr></thead>
              <tbody>
                {(breakdown.by_category ?? []).map(cat => {
                  const max = (breakdown.by_category ?? [])[0]?.revenue ?? 1;
                  return (
                    <tr key={cat.category}>
                      <td style={S.td}>{cat.category}</td>
                      <td style={{ ...S.td, color: '#9C8E7E' }}>{cat.orders}</td>
                      <td style={S.td}><BarCell value={cat.revenue} max={max} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* By Order Type */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Revenue by Order Type</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Type</th>
                <th style={S.th}>Orders</th>
                <th style={{ ...S.th, minWidth: 160 }}>Revenue</th>
              </tr></thead>
              <tbody>
                {(breakdown.by_type ?? []).map(t => {
                  const max = (breakdown.by_type ?? []).length ? Math.max(...(breakdown.by_type ?? []).map(x => x.revenue)) : 0;
                  return (
                    <tr key={t.type}>
                      <td style={S.td}>{ORDER_TYPE_LABELS[t.type] ?? t.type}</td>
                      <td style={{ ...S.td, color: '#9C8E7E' }}>{t.orders}</td>
                      <td style={S.td}><BarCell value={t.revenue} max={max} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* By Hour */}
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Revenue by Hour</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Hour</th>
                <th style={S.th}>Orders</th>
                <th style={{ ...S.th, minWidth: 160 }}>Revenue</th>
              </tr></thead>
              <tbody>
                {(breakdown.by_hour ?? []).filter(h => h.orders > 0).map(h => {
                  const max = (breakdown.by_hour ?? []).length ? Math.max(...(breakdown.by_hour ?? []).map(x => x.revenue)) : 0;
                  const label = `${String(h.hour).padStart(2, '0')}:00`;
                  return (
                    <tr key={h.hour}>
                      <td style={{ ...S.td, fontFamily: 'monospace' }}>{label}</td>
                      <td style={{ ...S.td, color: '#9C8E7E' }}>{h.orders}</td>
                      <td style={S.td}><BarCell value={h.revenue} max={max} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ── Delivery Zones ── */}
      {!loading && tab === 'Delivery Zones' && deliveryZones && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard label="Delivery Orders" value={String(deliveryZones.totals.orders_count)} accent="#0ea5e9" />
            <StatCard label="Order Revenue" value={mvr(deliveryZones.totals.order_total)} accent="#D4813A" />
            <StatCard label="Delivery Fees" value={mvr(deliveryZones.totals.fees_total)} accent="#22c55e" />
          </div>
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>
              Performance by zone ({deliveryZones.from} – {deliveryZones.to})
            </p>
            {(deliveryZones.zones ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: '#9C8E7E' }}>No completed delivery orders in this period.</p>
            ) : (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Zone</th>
                    <th style={S.th}>Orders</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Revenue</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Fees</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Avg Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryZones.zones.map((row) => (
                    <tr key={row.zone}>
                      <td style={S.td}>{row.zone}</td>
                      <td style={{ ...S.td, color: '#9C8E7E' }}>{row.orders_count}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{mvr(row.order_total)}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{mvr(row.fees_total)}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{mvr(row.avg_fee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {/* ── Spend Hub ── */}
      {!loading && tab === 'Spend Hub' && spendHub && (
        <>
          <p style={{ fontSize: 13, color: '#6B5D4F', margin: '0 0 16px', lineHeight: 1.45 }}>{spendHub.note}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Purchases (COGS)" value={mvr(spendHub.totals.purchases)} accent="#D4813A" />
            <StatCard label="Expenses approved" value={mvr(spendHub.totals.expenses_approved)} accent="#ef4444" />
            <StatCard label="Expenses pending" value={mvr(spendHub.totals.expenses_pending)} accent="#f59e0b" />
            <StatCard label="Waste (shrinkage)" value={mvr(spendHub.totals.waste_cost ?? 0)} accent="#b45309" />
            <StatCard label="Combined outflow" value={mvr(spendHub.totals.combined_outflow)} accent="#1C1408" />
            <StatCard label="With waste" value={mvr(spendHub.totals.total_with_waste ?? spendHub.totals.combined_outflow)} accent="#7c2d12" />
            <StatCard label="POs received" value={String(spendHub.totals.po_count)} accent="#6B5D4F" />
            <StatCard label="Waste logs" value={String(spendHub.totals.waste_count ?? 0)} accent="#9C8E7E" />
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <Link to="/purchase-orders" style={{ fontSize: 13, fontWeight: 700, color: '#D4813A', textDecoration: 'none' }}>Purchase Orders →</Link>
            <Link to="/expenses" style={{ fontSize: 13, fontWeight: 700, color: '#D4813A', textDecoration: 'none' }}>Expenses →</Link>
            <Link to="/waste-logs" style={{ fontSize: 13, fontWeight: 700, color: '#D4813A', textDecoration: 'none' }}>Waste Tracking →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
            <Card>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Purchases by supplier</p>
              {spendHub.purchases.by_supplier.length === 0 ? (
                <p style={{ margin: 0, color: '#9C8E7E', fontSize: 13 }}>No received purchases in range.</p>
              ) : (
                <table style={S.table}>
                  <thead><tr><th style={S.th}>Supplier</th><th style={S.th}>POs</th><th style={S.th}>Spend</th></tr></thead>
                  <tbody>
                    {spendHub.purchases.by_supplier.map((row) => (
                      <tr key={row.supplier_id ?? row.supplier_name}>
                        <td style={S.td}>{row.supplier_name}</td>
                        <td style={S.td}>{row.po_count}</td>
                        <td style={{ ...S.td, fontWeight: 600 }}>{mvr(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Expenses by category</p>
              {spendHub.expenses.by_category.length === 0 ? (
                <p style={{ margin: 0, color: '#9C8E7E', fontSize: 13 }}>No approved expenses in range.</p>
              ) : (
                <table style={S.table}>
                  <thead><tr><th style={S.th}>Category</th><th style={S.th}>Count</th><th style={S.th}>Total</th></tr></thead>
                  <tbody>
                    {spendHub.expenses.by_category.map((row) => (
                      <tr key={row.category}>
                        <td style={S.td}>{row.icon ? `${row.icon} ` : ''}{row.category}</td>
                        <td style={S.td}>{row.count}</td>
                        <td style={{ ...S.td, fontWeight: 600 }}>{mvr(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Waste by reason</p>
              {(spendHub.waste?.by_reason ?? []).length === 0 ? (
                <p style={{ margin: 0, color: '#9C8E7E', fontSize: 13 }}>No waste logged in range.</p>
              ) : (
                <table style={S.table}>
                  <thead><tr><th style={S.th}>Reason</th><th style={S.th}>Logs</th><th style={S.th}>Cost</th></tr></thead>
                  <tbody>
                    {spendHub.waste.by_reason.map((row) => (
                      <tr key={row.reason}>
                        <td style={S.td}>{row.reason.replace(/_/g, ' ')}</td>
                        <td style={S.td}>{row.count}</td>
                        <td style={{ ...S.td, fontWeight: 600 }}>{mvr(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
          <Card style={{ marginBottom: 20 }}>
            <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 8px' }}>Top purchase items</p>
            <p style={{ fontSize: 12, color: '#9C8E7E', margin: '0 0 12px' }}>
              For full cheapest/last cost detail see Inventory → Spend by Item.
            </p>
            {spendHub.purchases.top_items.length === 0 ? (
              <p style={{ margin: 0, color: '#9C8E7E', fontSize: 13 }}>No received line items.</p>
            ) : (
              <table style={S.table}>
                <thead><tr><th style={S.th}>Item</th><th style={S.th}>Qty</th><th style={S.th}>Spend</th></tr></thead>
                <tbody>
                  {spendHub.purchases.top_items.map((row) => (
                    <tr key={row.inventory_item_id ?? row.item_name}>
                      <td style={S.td}>
                        {row.inventory_item_id ? (
                          <Link to={`/inventory?item=${row.inventory_item_id}`} style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}>{row.item_name}</Link>
                        ) : row.item_name}
                      </td>
                      <td style={S.td}>{row.qty} {row.unit}</td>
                      <td style={{ ...S.td, fontWeight: 600 }}>{mvr(row.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Daily outflow + waste</p>
            {spendHub.daily.every((d) => (d.total_with_waste ?? d.total) === 0) ? (
              <p style={{ margin: 0, color: '#9C8E7E', fontSize: 13 }}>No outflow or waste in this range.</p>
            ) : (
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Date</th>
                      <th style={S.th}>Purchases</th>
                      <th style={S.th}>Expenses</th>
                      <th style={S.th}>Waste</th>
                      <th style={S.th}>Cash total</th>
                      <th style={S.th}>With waste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spendHub.daily.filter((d) => (d.total_with_waste ?? d.total) > 0).map((d) => (
                      <tr key={d.date}>
                        <td style={S.td}>{d.date}</td>
                        <td style={S.td}>{mvr(d.purchases)}</td>
                        <td style={S.td}>{mvr(d.expenses)}</td>
                        <td style={S.td}>{mvr(d.waste ?? 0)}</td>
                        <td style={{ ...S.td, fontWeight: 600 }}>{mvr(d.total)}</td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{mvr(d.total_with_waste ?? d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── X / Z Reports ── */}
      {!loading && tab === 'X / Z Report' && (
        <>
          {!xReport && !zReport && (
            <Card><p style={{ margin: 0, color: '#6B5D4F' }}>No shift or report data available for this period.</p></Card>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
            {[
              { label: 'X-Report (current shift)', data: xReport, empty: 'No active shift — open a shift to generate an X-Report.' },
              { label: 'Z-Report (date range)', data: zReport, empty: 'No Z-Report data for the selected period.' },
            ].map(({ label, data, empty }) => (
              <Card key={label}>
                <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 4px' }}>{label}</p>
                {!data ? (
                  <p style={{ fontSize: 13, color: '#9C8E7E', margin: 0 }}>{empty}</p>
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: '#9C8E7E', margin: '0 0 16px' }}>
                      {data.from} → {data.to}
                    </p>
                    <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      {[
                        { l: 'Orders', v: String(data.totals.orders_count ?? 0) },
                        { l: 'Revenue', v: mvr(data.totals.total ?? 0) },
                        { l: 'Tax', v: mvr(data.totals.tax_amount ?? 0) },
                        { l: 'Discounts', v: mvr(data.totals.discount_amount ?? 0) },
                      ].map(({ l, v }) => (
                        <div key={l} style={{ background: '#FAF7F4', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, color: '#9C8E7E', marginBottom: 4 }}>{l}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1408' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {Object.keys(data.payments ?? {}).length > 0 && (
                      <>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', margin: '0 0 8px' }}>By Payment Method</p>
                        <table style={S.table}>
                          <thead><tr><th style={S.th}>Method</th><th style={S.th}>Total</th></tr></thead>
                          <tbody>
                            {Object.entries(data.payments ?? {}).map(([method, total]) => {
                              const isCredit = method === 'house_account';
                              return (
                                <tr key={method} style={isCredit ? { color: '#9C8E7E', fontStyle: 'italic' } : undefined}>
                                  <td style={S.td}>
                                    {paymentMethodLabel(method)}
                                    {isCredit && <span style={{ marginLeft: 6, fontSize: 11 }}>(receivable)</span>}
                                  </td>
                                  <td style={S.td}>{mvr(total as number)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {(data.collected != null || data.on_credit != null) && (
                          <div style={{ marginTop: 8, padding: 8, background: '#FAF7F4', borderRadius: 6, fontSize: 12, color: '#6B5D4F' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Collected</span>
                              <strong style={{ color: '#1C1408' }}>{mvr(data.collected ?? 0)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9C8E7E', fontStyle: 'italic' }}>
                              <span>On credit (receivable)</span>
                              <span>{mvr(data.on_credit ?? 0)}</span>
                            </div>
                          </div>
                        )}
                        {data.credit_repayments_cash != null && data.credit_repayments_cash > 0 && (
                          <div style={{ marginTop: 6, fontSize: 11, color: '#059669' }}>
                            + MVR {(data.credit_repayments_cash).toFixed(2)} cash received as credit repayments this period
                          </div>
                        )}
                      </>
                    )}
                    <PaymentCommissionBlock commission={data.payment_commission} />
                  </>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ── Tax Report ── */}
      {!loading && tab === 'Tax' && taxReport && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Tax Collected" value={mvr(taxReport.total_tax_collected)} accent="#D4813A" />
            <StatCard label="Period" value={`${taxReport.from} → ${taxReport.to}`} accent="#6B5D4F" />
          </div>
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 16px' }}>Tax by Rate</p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Rate</th>
                <th style={S.th}>Net Sales</th>
                <th style={S.th}>Tax Amount</th>
                <th style={S.th}>% of Total</th>
              </tr></thead>
              <tbody>
                {(taxReport.by_rate ?? []).map(r => (
                  <tr key={r.rate_bp}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{r.rate_pct}%</td>
                    <td style={S.td}>{mvr(r.net_sales)}</td>
                    <td style={S.td}>{mvr(r.tax_amount)}</td>
                    <td style={{ ...S.td, color: '#9C8E7E' }}>{pct(r.tax_amount, taxReport.total_tax_collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* ── Inventory Valuation ── */}
      {!loading && tab === 'Inventory' && inventory && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Inventory Value" value={mvr(inventory.total_value)} accent="#22c55e" />
            <StatCard label="Total Units On Hand" value={inventory.total_quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} accent="#6B5D4F" />
            {inventory.negative_stock_count > 0 && (
              <StatCard
                label="Negative stock SKUs"
                value={String(inventory.negative_stock_count)}
                accent="#ef4444"
              />
            )}
          </div>
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 8px' }}>How this is calculated</p>
            <p style={{ fontSize: 13, color: '#6B5D4F', margin: '0 0 12px' }}>
              Positive on-hand only: <code>SUM(current_stock × unit_cost)</code>. Negative stock is excluded from totals and listed below.
            </p>
            {(inventory.items?.length ?? 0) === 0 ? (
              <p style={{ fontSize: 13, color: '#9C8E7E', margin: 0 }}>No active inventory items.</p>
            ) : (
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Item</th>
                      <th style={S.th}>Qty</th>
                      <th style={S.th}>Unit cost</th>
                      <th style={S.th}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.items.slice(0, 100).map((row) => (
                      <tr key={row.id}>
                        <td style={S.td}>{row.name}</td>
                        <td style={{ ...S.td, color: row.quantity < 0 ? '#ef4444' : undefined }}>
                          {row.quantity} {row.unit}
                        </td>
                        <td style={S.td}>{mvr(row.cost_per_unit)}</td>
                        <td style={{ ...S.td, fontWeight: 600, color: row.total_value < 0 ? '#ef4444' : undefined }}>
                          {mvr(row.total_value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── Spend by Item ── */}
      {!loading && tab === 'Spend by Item' && spendByItem && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Items purchased" value={String(spendByItem.totals.items_count)} accent="#D4813A" />
            <StatCard label="Qty received" value={spendByItem.totals.qty_received.toLocaleString(undefined, { maximumFractionDigits: 2 })} accent="#6B5D4F" />
            <StatCard label="Total spend" value={mvr(spendByItem.totals.total_spend)} accent="#ef4444" />
          </div>
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 8px' }}>Purchase spend by inventory item</p>
            <p style={{ fontSize: 13, color: '#6B5D4F', margin: '0 0 12px' }}>
              From received / partially received purchase orders in the selected dates. Compare last vs cheapest unit cost to shop smarter.
            </p>
            {spendByItem.rows.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9C8E7E', margin: 0 }}>No received purchase lines in this range.</p>
            ) : (
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Item</th>
                      <th style={S.th}>Qty</th>
                      <th style={S.th}>Spend</th>
                      <th style={S.th}>Avg cost</th>
                      <th style={S.th}>Last</th>
                      <th style={S.th}>Cheapest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spendByItem.rows.map((row) => (
                      <tr key={row.inventory_item_id}>
                        <td style={S.td}>
                          <Link to={`/inventory?item=${row.inventory_item_id}`} style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}>
                            {row.item_name}
                          </Link>
                        </td>
                        <td style={S.td}>{row.qty_received} {row.unit ?? ''}</td>
                        <td style={{ ...S.td, fontWeight: 600 }}>{mvr(row.total_spend)}</td>
                        <td style={S.td}>{mvr(row.avg_unit_cost)}</td>
                        <td style={S.td}>
                          {mvr(row.last_unit_cost)}
                          {row.last_supplier ? <span style={{ display: 'block', fontSize: 11, color: '#9C8E7E' }}>{row.last_supplier}</span> : null}
                        </td>
                        <td style={S.td}>
                          {row.cheapest_unit_cost != null ? mvr(row.cheapest_unit_cost) : '—'}
                          {row.cheapest_supplier ? <span style={{ display: 'block', fontSize: 11, color: '#9C8E7E' }}>{row.cheapest_supplier}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── Accounts Payable ── */}
      {!loading && tab === 'Accounts Payable' && ap && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Suppliers Owed"      value={String(ap.length)}                                                                accent="#f97316" />
            <StatCard label="Total Outstanding"   value={mvr(ap.reduce((s, x) => s + x.outstanding_amount, 0))}                           accent="#ef4444" />
            <StatCard label="Open Invoices"       value={String(ap.reduce((s, x) => s + x.invoices.length, 0))}                           accent="#6366f1" />
          </div>
          {ap.length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No outstanding payables.</p></Card>
          ) : ap.map(supplier => (
            <Card key={supplier.supplier_id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#1C1408' }}>{supplier.supplier_name}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#ef4444' }}>{mvr(supplier.outstanding_amount)}</span>
              </div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Invoice #</th>
                  <th style={S.th}>Amount</th>
                  <th style={S.th}>Due Date</th>
                </tr></thead>
                <tbody>
                  {supplier.invoices.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>
                        <Link to={`/invoices?search=${encodeURIComponent(inv.invoice_number)}`} style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}>
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td style={S.td}>{mvr(inv.amount)}</td>
                      <td style={{ ...S.td, color: inv.due_date && inv.due_date < today() ? '#ef4444' : '#6B5D4F' }}>
                        {inv.due_date ?? '—'}
                        {inv.due_date && inv.due_date < today() && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#ef4444' }}>OVERDUE</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </>
      )}

      {/* ── Accounts Receivable ── */}
      {!loading && tab === 'Accounts Receivable' && ar && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Customers with Balance" value={String(ar.length)}                                                             accent="#8b5cf6" />
            <StatCard label="Total Outstanding"      value={mvr(ar.reduce((s, x) => s + x.outstanding_amount, 0))}                        accent="#D4813A" />
            <StatCard label="Open Invoices"          value={String(ar.reduce((s, x) => s + x.invoices.length, 0))}                        accent="#f59e0b" />
          </div>
          {ar.length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No outstanding receivables.</p></Card>
          ) : ar.map((customer, i) => (
            <Card key={customer.customer_id ?? i} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                {customer.customer_id ? (
                  <Link to={`/customers?customer=${customer.customer_id}`} style={{ fontWeight: 700, fontSize: 14, color: '#D4813A', textDecoration: 'none' }}>
                    {customer.customer_name ?? 'Unknown Customer'}
                  </Link>
                ) : (
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1C1408' }}>{customer.customer_name ?? 'Unknown Customer'}</span>
                )}
                <span style={{ fontWeight: 700, fontSize: 14, color: '#D4813A' }}>{mvr(customer.outstanding_amount)}</span>
              </div>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Invoice #</th>
                  <th style={S.th}>Amount</th>
                  <th style={S.th}>Due Date</th>
                </tr></thead>
                <tbody>
                  {customer.invoices.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>
                        <Link to={`/invoices?search=${encodeURIComponent(inv.invoice_number)}`} style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}>
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td style={S.td}>{mvr(inv.amount)}</td>
                      <td style={{ ...S.td, color: inv.due_date && inv.due_date < today() ? '#ef4444' : '#6B5D4F' }}>
                        {inv.due_date ?? '—'}
                        {inv.due_date && inv.due_date < today() && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#ef4444' }}>OVERDUE</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </>
      )}

      {/* ── Promotions Analytics ── */}
      {!loading && tab === 'Promotions' && promoReport && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Promotions"  value={String(promoReport.length)}                                                            accent="#D4813A" />
            <StatCard label="Total Redemptions" value={String(promoReport.reduce((s, p) => s + p.redemptions_count, 0))}                      accent="#8b5cf6" />
            <StatCard label="Total Discounts"   value={mvr(promoReport.reduce((s, p) => s + (p.total_discount_laar ?? 0), 0) / 100)}          accent="#ef4444" />
          </div>
          {promoReport.length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No promotion data.</p></Card>
          ) : (
            <Card>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Promotion</th>
                  <th style={S.th}>Code</th>
                  <th style={S.th}>Redemptions</th>
                  <th style={S.th}>Total Discount</th>
                  <th style={S.th}>Avg Discount</th>
                </tr></thead>
                <tbody>
                  {promoReport.map((p) => (
                    <tr key={p.id}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{p.name}</td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{p.code}</td>
                      <td style={S.td}>{p.redemptions_count.toLocaleString()}</td>
                      <td style={S.td}>{mvr((p.total_discount_laar ?? 0) / 100)}</td>
                      <td style={S.td}>{p.redemptions_count > 0 ? mvr((p.total_discount_laar ?? 0) / 100 / p.redemptions_count) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* ── Loyalty Analytics ── */}
      {!loading && tab === 'Loyalty' && loyaltyReport && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Members"         value={loyaltyReport.total_accounts.toLocaleString()}           accent="#D4813A" />
            <StatCard label="Outstanding Points"    value={loyaltyReport.total_outstanding_points.toLocaleString()} accent="#ef4444" />
            <StatCard label="Lifetime Points Issued" value={loyaltyReport.total_earned_lifetime.toLocaleString()}   accent="#8b5cf6" />
          </div>
          <Card>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: '0 0 16px' }}>Members by Tier</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              {[
                { tier: 'Bronze',   count: loyaltyReport.bronze_count,   color: '#B45309', bg: '#FEF3E2' },
                { tier: 'Silver',   count: loyaltyReport.silver_count,   color: '#6B5D4F', bg: '#F0EBE5' },
                { tier: 'Gold',     count: loyaltyReport.gold_count,     color: '#92400E', bg: '#FFFBEB' },
                { tier: 'Platinum', count: loyaltyReport.platinum_count, color: '#1D4ED8', bg: '#EFF6FF' },
              ].map(({ tier, count, color, bg }) => (
                <div key={tier} style={{ background: bg, borderRadius: 10, padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{count}</p>
                  <p style={{ fontSize: 12, color, opacity: 0.8, margin: '4px 0 0', textTransform: 'capitalize' }}>{tier}</p>
                  <p style={{ fontSize: 11, color: '#9C8E7E', margin: '2px 0 0' }}>
                    {loyaltyReport.total_accounts > 0 ? `${((count / loyaltyReport.total_accounts) * 100).toFixed(1)}%` : '0%'}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ── Discounts by type ── */}
      {!loading && tab === 'Discounts' && discountsReport && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Discounts" value={mvr((discountsReport.rows ?? []).reduce((s, r) => s + r.amount, 0))} accent="#ef4444" />
            <StatCard label="Discount Types" value={String((discountsReport.rows ?? []).filter(r => r.amount > 0).length)} accent="#D4813A" />
          </div>
          <Card>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Type</th>
                <th style={S.th}>Orders</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Amount</th>
              </tr></thead>
              <tbody>
                {(discountsReport.rows ?? []).map((row) => (
                  <tr key={row.type}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{DISCOUNT_TYPE_LABELS[row.type] ?? row.type}</td>
                    <td style={S.td}>{row.orders_count.toLocaleString()}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{mvr(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* ── Voids by staff + reason ── */}
      {!loading && tab === 'Voids' && voidsReport && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Voids" value={String((voidsReport.rows ?? []).reduce((s, r) => s + r.voids_count, 0))} accent="#ef4444" />
            <StatCard label="Staff Involved" value={String((voidsReport.rows ?? []).length)} accent="#6B5D4F" />
            <StatCard label="Reasons" value={String((voidsByReason?.rows ?? []).length)} accent="#D4813A" />
          </div>
          {(voidsReport.rows ?? []).length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No voids in this period.</p></Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Card>
                <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 13, color: '#1C1408' }}>By staff</p>
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>Staff</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Voids</th>
                  </tr></thead>
                  <tbody>
                    {(voidsReport.rows ?? []).map((row, i) => (
                      <tr key={row.user_id ?? `sys-${i}`}>
                        <td style={{ ...S.td, fontWeight: 600 }}>{row.name}</td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{row.voids_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card>
                <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 13, color: '#1C1408' }}>By reason</p>
                {(voidsByReason?.rows ?? []).length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px 0', color: '#9C8E7E', fontSize: 13 }}>No reason data.</p>
                ) : (
                  <table style={S.table}>
                    <thead><tr>
                      <th style={S.th}>Reason</th>
                      <th style={{ ...S.th, textAlign: 'right' }}>Voids</th>
                    </tr></thead>
                    <tbody>
                      {(voidsByReason?.rows ?? []).map((row) => (
                        <tr key={row.reason}>
                          <td style={{ ...S.td, fontWeight: 600 }}>{row.reason}</td>
                          <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{row.voids_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {/* ── Refunds by reason ── */}
      {!loading && tab === 'Refunds' && refundsReport && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Refunded" value={mvr((refundsReport.rows ?? []).reduce((s, r) => s + r.amount, 0))} accent="#ef4444" />
            <StatCard label="Refund Count" value={String((refundsReport.rows ?? []).reduce((s, r) => s + r.refunds_count, 0))} accent="#D4813A" />
          </div>
          {(refundsReport.rows ?? []).length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No refunds in this period.</p></Card>
          ) : (
            <Card>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Reason</th>
                  <th style={S.th}>Count</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Amount</th>
                </tr></thead>
                <tbody>
                  {(refundsReport.rows ?? []).map((row) => (
                    <tr key={row.reason}>
                      <td style={{ ...S.td, fontWeight: 600, textTransform: 'capitalize' }}>{row.reason.replace(/_/g, ' ')}</td>
                      <td style={S.td}>{row.refunds_count}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{mvr(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* ── Deposit exposure ── */}
      {!loading && tab === 'Deposit Exposure' && depositExposure && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Liability" value={mvr(depositExposure.total_balance)} accent="#047857" />
            <StatCard label="Customers with Balance" value={String(depositExposure.customers_count)} accent="#8b5cf6" />
          </div>
          {(depositExposure.top_customers ?? []).length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No outstanding deposit balances.</p></Card>
          ) : (
            <Card>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>Top customers by deposit balance</p>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Customer</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Balance</th>
                  <th style={S.th}>Status</th>
                </tr></thead>
                <tbody>
                  {(depositExposure.top_customers ?? []).map((c) => (
                    <tr key={c.id}>
                      <td style={{ ...S.td, fontWeight: 600 }}>
                        <Link to={`/customers?customer=${c.id}`} style={{ color: '#D4813A', textDecoration: 'none' }}>{c.name}</Link>
                      </td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#047857' }}>{mvr(c.balance)}</td>
                      <td style={S.td}>{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* ── Deposit activity (ledger movements, not sales) ── */}
      {!loading && tab === 'Deposit Activity' && depositActivity && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Received (top-ups)" value={mvr(depositActivity.received)} accent="#047857" />
            <StatCard label="Used on orders" value={mvr(depositActivity.used)} accent="#f59e0b" />
            <StatCard label="Cash payouts" value={mvr(depositActivity.payouts)} accent="#ef4444" />
            <StatCard label="Transferred to credit" value={mvr(depositActivity.transfers)} accent="#8b5cf6" />
          </div>
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 8px' }}>Deposit ledger activity</p>
            <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>
              Period {depositActivity.from} — {depositActivity.to}. These figures are customer liability movements, not café revenue.
            </p>
          </Card>
        </>
      )}

      {/* ── Credit exposure ── */}
      {!loading && tab === 'Credit Exposure' && creditExposure && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <a
              href="/api/reports/credit-exposure/csv"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid #D4813A',
                color: '#D4813A', textDecoration: 'none', fontWeight: 700, fontSize: 13,
              }}
            >
              ↓ Export CSV
            </a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Outstanding" value={mvr(creditExposure.total_balance)} accent="#ef4444" />
            <StatCard label="Customers with Balance" value={String(creditExposure.customers_count)} accent="#8b5cf6" />
          </div>
          {(creditExposure.top_customers ?? []).length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No outstanding credit balances.</p></Card>
          ) : (
            <Card>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>Top customers by balance</p>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Customer</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Balance</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Limit</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Available</th>
                  <th style={S.th}>Status</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Overdue</th>
                </tr></thead>
                <tbody>
                  {(creditExposure.top_customers ?? []).map((c) => (
                    <tr key={c.id}>
                      <td style={{ ...S.td, fontWeight: 600 }}>
                        <Link to={`/customers?customer=${c.id}`} style={{ color: '#D4813A', textDecoration: 'none' }}>{c.name}</Link>
                      </td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{mvr(c.balance)}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{mvr(c.limit)}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{mvr(c.available)}</td>
                      <td style={S.td}>{c.credit_enabled ? c.status : `${c.status} (disabled)`}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{c.overdue_invoices_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {!loading && tab === 'Overrides' && overridesReport && (
        <Card>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>
            Manager overrides ({overridesReport.from} – {overridesReport.to})
          </p>
          {(overridesReport.rows ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9C8E7E' }}>No override actions in this period.</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>When</th>
                <th style={S.th}>Staff</th>
                <th style={S.th}>Action</th>
                <th style={S.th}>Target</th>
              </tr></thead>
              <tbody>
                {overridesReport.rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...S.td, fontSize: 12, color: '#9C8E7E' }}>{new Date(row.created_at).toLocaleString()}</td>
                    <td style={S.td}>{row.user_name}</td>
                    <td style={S.td}>{row.action}</td>
                    <td style={{ ...S.td, color: '#6B5D4F' }}>
                      {(() => {
                        const path = auditTargetPath(row.model_type, row.model_id);
                        if (!path) return <>{row.model_type} #{row.model_id ?? '—'}</>;
                        return (
                          <Link to={path} style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}>
                            {row.model_type} #{row.model_id}
                          </Link>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!loading && tab === 'Stock Velocity' && velocityReport && (
        <Card>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>
            Menu item velocity ({velocityReport.from} – {velocityReport.to})
          </p>
          {(velocityReport.rows ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9C8E7E' }}>No completed sales in this period.</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Item</th>
                <th style={S.th}>Qty sold</th>
                <th style={S.th}>Velocity</th>
              </tr></thead>
              <tbody>
                {velocityReport.rows.map((row) => (
                  <tr key={row.item_id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{row.item_name}</td>
                    <td style={S.td}>{row.qty_sold}</td>
                    <td style={S.td}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        background: row.velocity === 'fast' ? '#DCFCE7' : row.velocity === 'slow' ? '#FEE2E2' : '#F3F4F6',
                        color: row.velocity === 'fast' ? '#166534' : row.velocity === 'slow' ? '#991B1B' : '#6B7280',
                      }}>{row.velocity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!loading && tab === 'Shift Variances' && shiftVariances && (
        <Card>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>
            Cash drawer variances ({shiftVariances.from} – {shiftVariances.to})
          </p>
          {(shiftVariances.rows ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9C8E7E' }}>No closed shifts in this period.</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Cashier</th>
                <th style={S.th}>Closed</th>
                <th style={S.th}>Expected</th>
                <th style={S.th}>Counted</th>
                <th style={S.th}>Variance</th>
              </tr></thead>
              <tbody>
                {shiftVariances.rows.map((row) => (
                  <tr key={row.id}>
                    <td style={S.td}>
                      <Link to={`/shifts?shift=${row.id}`} style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}>
                        {row.user_name}
                      </Link>
                    </td>
                    <td style={{ ...S.td, fontSize: 12, color: '#9C8E7E' }}>{row.closed_at ? new Date(row.closed_at).toLocaleString() : '—'}</td>
                    <td style={S.td}>{row.expected_cash != null ? mvr(row.expected_cash) : '—'}</td>
                    <td style={S.td}>{row.closing_cash != null ? mvr(row.closing_cash) : '—'}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: row.variance != null && Math.abs(row.variance) >= 0.01 ? '#ef4444' : '#16a34a' }}>
                      {row.variance != null ? mvr(row.variance) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!loading && tab === 'Customer LTV' && customerLtv && (
        <Card>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>
            Top customers by spend{customerLtv.from && customerLtv.to ? ` (${customerLtv.from} – ${customerLtv.to})` : ''}
          </p>
          {(customerLtv.rows ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9C8E7E' }}>No customer orders yet.</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Customer</th>
                <th style={S.th}>Orders</th>
                <th style={S.th}>Total spent</th>
                <th style={S.th}>Last order</th>
              </tr></thead>
              <tbody>
                {customerLtv.rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>
                      <Link to={`/customers?customer=${row.id}`} style={{ color: '#D4813A', textDecoration: 'none' }}>{row.name}</Link>
                    </td>
                    <td style={S.td}>{row.order_count}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{mvr(row.total_spent)}</td>
                    <td style={{ ...S.td, fontSize: 12, color: '#9C8E7E' }}>{row.last_order ? new Date(row.last_order).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!loading && tab === 'Customer Cohorts' && customerCohorts && (
        <Card>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>
            New vs returning customers by first-order month ({customerCohorts.from} – {customerCohorts.to})
          </p>
          {(customerCohorts.cohorts ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9C8E7E' }}>No first-time customers in this period.</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Cohort month</th>
                <th style={S.th}>New customers</th>
                <th style={S.th}>Repeat (2+ orders)</th>
                <th style={S.th}>Repeat rate</th>
              </tr></thead>
              <tbody>
                {customerCohorts.cohorts.map((row) => (
                  <tr key={row.cohort_month}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{row.cohort_month}</td>
                    <td style={S.td}>{row.new_customers}</td>
                    <td style={S.td}>{row.repeat_customers}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{row.repeat_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!loading && tab === 'Cashier Performance' && cashierPerf && (
        <Card>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>
            Cashier performance ({cashierPerf.from} – {cashierPerf.to})
          </p>
          {(cashierPerf.rows ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9C8E7E' }}>No completed orders in this period.</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Cashier</th>
                <th style={S.th}>Orders</th>
                <th style={S.th}>Sales</th>
                <th style={S.th}>Avg order</th>
                <th style={S.th}>Voids</th>
              </tr></thead>
              <tbody>
                {cashierPerf.rows.map((row) => (
                  <tr key={row.user_id ?? row.name}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{row.name}</td>
                    <td style={S.td}>{row.orders_count}</td>
                    <td style={S.td}>{mvr(row.total)}</td>
                    <td style={S.td}>{mvr(row.avg_order)}</td>
                    <td style={{ ...S.td, color: row.voids_count > 0 ? '#ef4444' : '#1C1408' }}>{row.voids_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!loading && tab === 'Product Margins' && productMargins && (
        <Card>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>Menu item margins</p>
          {(productMargins.rows ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9C8E7E' }}>No menu items found.</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Item</th>
                <th style={S.th}>Category</th>
                <th style={S.th}>Price</th>
                <th style={S.th}>Cost</th>
                <th style={S.th}>Margin</th>
              </tr></thead>
              <tbody>
                {productMargins.rows.map((row) => (
                  <tr key={row.item_id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{row.name}</td>
                    <td style={S.td}>{row.category ?? '—'}</td>
                    <td style={S.td}>{mvr(row.price)}</td>
                    <td style={S.td}>{row.cost != null ? mvr(row.cost) : '—'}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: row.margin_pct != null && row.margin_pct < 30 ? '#ef4444' : '#16a34a' }}>
                      {row.margin_pct != null ? `${row.margin_pct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!loading && tab === 'Stock Discrepancy' && stockDiscrepancy && (
        <Card>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>Stock anomalies</p>
          {(stockDiscrepancy.rows ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9C8E7E' }}>No discrepancies detected.</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Type</th>
                <th style={S.th}>Name</th>
                <th style={S.th}>Detail</th>
              </tr></thead>
              <tbody>
                {stockDiscrepancy.rows.map((row) => (
                  <tr key={`${row.type}-${row.id}`}>
                    <td style={S.td}>{row.type.replace(/_/g, ' ')}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{row.name}</td>
                    <td style={S.td}>{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!loading && tab === 'Hourly Sales' && hourlySales && (
        <Card>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>
            Hourly sales ({hourlySales.from} – {hourlySales.to})
          </p>
          {(hourlySales.hours ?? []).every((h) => h.count === 0) ? (
            <p style={{ fontSize: 13, color: '#9C8E7E' }}>No orders in this period.</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Hour</th>
                <th style={S.th}>Orders</th>
                <th style={S.th}>Revenue</th>
                <th style={S.th}>Avg order</th>
                <th style={S.th}></th>
              </tr></thead>
              <tbody>
                {hourlySales.hours.filter((h) => h.count > 0).map((row) => {
                  const maxCount = Math.max(...hourlySales.hours.map((h) => h.count), 1);
                  return (
                    <tr key={row.hour}>
                      <td style={S.td}>{row.label}</td>
                      <td style={S.td}>{row.count}</td>
                      <td style={S.td}>{mvr(row.revenue)}</td>
                      <td style={S.td}>{mvr(row.avg_total)}</td>
                      <td style={{ ...S.td, width: '30%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, background: '#F0EAE3', borderRadius: 4, height: 8 }}>
                            <div style={S.bar((row.count / maxCount) * 100)} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {!loading && tab === 'Station Performance' && stationPerf && (
        <Card>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 12px' }}>
            Kitchen station performance ({stationPerf.from} – {stationPerf.to})
          </p>
          {(stationPerf.rows ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9C8E7E' }}>No completed order lines in this period.</p>
          ) : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Station</th>
                <th style={S.th}>Lines</th>
                <th style={S.th}>Qty sold</th>
                <th style={S.th}>Revenue</th>
              </tr></thead>
              <tbody>
                {stationPerf.rows.map((row) => (
                  <tr key={`${row.menu_group_id ?? 'none'}-${row.station}`}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{row.station}</td>
                    <td style={S.td}>{row.line_count}</td>
                    <td style={S.td}>{row.qty}</td>
                    <td style={S.td}>{mvr(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

    </>
  );
}
