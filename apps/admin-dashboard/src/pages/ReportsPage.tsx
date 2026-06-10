import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchSalesSummary, getSalesBreakdown, getXReport, getZReport, getTaxReport,
  getInventoryValuation, getAccountsPayable, getAccountsReceivable,
  getPromotionReport, getLoyaltyReport, getDeliveryZonesReport,
  getDiscountsByTypeReport, getVoidsByStaffReport, getRefundsByReasonReport, getCreditExposureReport, getDepositExposureReport, getDepositActivityReport,
  getManagerOverridesReport, getStockVelocityReport, getShiftVariancesReport, getCustomerLtvReport,
  getCashierPerformanceReport, getProductMarginsReport, getCustomerCohortsReport, getStockDiscrepancyReport,
  getHourlySalesReport, getStationPerformanceReport,
  fetchPosStaffOptions, fetchShiftHistory, fetchDevices,
  type SalesSummary, type SalesBreakdown, type XReport, type ZReport,
  type TaxReport, type InventoryValuation, type AccountsPayable, type AccountsReceivable,
  type PromotionReportItem, type LoyaltyReport, type DeliveryZonesReport,
  type DiscountsByTypeReport, type VoidsByStaffReport, type RefundsByReasonReport, type CreditExposureReport, type DepositExposureReport, type DepositActivityReport,
  type ManagerOverridesReport, type StockVelocityReport, type ShiftVariancesReport, type CustomerLtvReport,
  type CashierPerformanceReport, type ProductMarginsReport, type CustomerCohortsReport, type StockDiscrepancyReport,
  type HourlySalesReport, type StationPerformanceReport,
  type PaymentCommissionSummary,
} from '../api';
import { Btn, Card, DateInput, ErrorMsg, PageHeader, Spinner, StatCard } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { downloadCSV } from '../utils/csvExport';

// Local-timezone date helpers — `toISOString()` is always UTC and was
// shifting Maldives (UTC+5) reports by a day during the late-evening
// hours. See ADM-012.
function localISO(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function today()        { return localISO(new Date()); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return localISO(d); }
function mvr(n: number) { return `MVR ${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function pct(n: number, total: number) { return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%'; }

function PaymentCommissionBlock({ commission }: { commission?: PaymentCommissionSummary }) {
  if (!commission || (commission.totals.gross_commissionable ?? 0) <= 0) return null;
  const th = { textAlign: 'left' as const, padding: '8px 12px', fontSize: 11, color: '#9C8E7E', borderBottom: '1px solid #E8E0D8' };
  const td = { padding: '8px 12px', fontSize: 13, borderBottom: '1px solid #F3EDE4' };
  return (
    <div style={{ marginTop: 20 }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: '#1C1408', margin: '0 0 8px' }}>Card / gateway settlement</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Channel</th>
            <th style={{ ...th, textAlign: 'right' }}>Gross</th>
            <th style={{ ...th, textAlign: 'right' }}>Rate</th>
            <th style={{ ...th, textAlign: 'right' }}>Commission</th>
            <th style={{ ...th, textAlign: 'right' }}>Net</th>
          </tr>
        </thead>
        <tbody>
          {(commission.by_channel ?? []).filter((row) => row.gross > 0).map((row) => (
            <tr key={row.channel}>
              <td style={td}>{row.label}</td>
              <td style={{ ...td, textAlign: 'right' }}>{mvr(row.gross)}</td>
              <td style={{ ...td, textAlign: 'right', color: '#9C8E7E' }}>{row.rate_percent}%</td>
              <td style={{ ...td, textAlign: 'right', color: '#dc2626' }}>{mvr(row.commission)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{mvr(row.net)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 700 }}>Total</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{mvr(commission.totals.gross_commissionable)}</td>
            <td style={td} />
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{mvr(commission.totals.commission_total)}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{mvr(commission.totals.net_settlement)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  online_pickup: 'Online Pickup', delivery: 'Delivery', dine_in: 'Dine-In',
  takeaway: 'Takeaway', pos: 'POS',
};

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  promo: 'Promo code', loyalty: 'Loyalty', manual: 'Manual',
  gift_card: 'Gift card', referral: 'Referral',
};

const REPORT_SECTIONS = [
  {
    id: 'sales',
    label: 'Sales',
    tabs: ['Summary', 'Breakdown', 'Hourly Sales', 'Station Performance', 'Cashier Performance', 'Product Margins'],
  },
  {
    id: 'finance',
    label: 'Finance',
    tabs: ['X / Z Report', 'Tax', 'Accounts Payable', 'Accounts Receivable', 'Credit Exposure', 'Deposit Exposure', 'Deposit Activity'],
  },
  {
    id: 'operations',
    label: 'Operations',
    tabs: ['Delivery Zones', 'Discounts', 'Voids', 'Refunds', 'Overrides', 'Shift Variances'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    tabs: ['Inventory', 'Stock Velocity', 'Stock Discrepancy'],
  },
  {
    id: 'customers',
    label: 'Customers',
    tabs: ['Promotions', 'Loyalty', 'Customer LTV', 'Customer Cohorts'],
  },
] as const;

type Tab = typeof REPORT_SECTIONS[number]['tabs'][number];

function sectionForTab(t: Tab) {
  return REPORT_SECTIONS.find((s) => (s.tabs as readonly string[]).includes(t)) ?? REPORT_SECTIONS[0];
}

type ReportData = {
  summary?: SalesSummary;
  breakdown?: SalesBreakdown;
  xReport?: XReport | null;
  zReport?: ZReport | null;
  taxReport?: TaxReport;
  inventory?: InventoryValuation;
  ap?: AccountsPayable[];
  ar?: AccountsReceivable[];
  promoReport?: PromotionReportItem[];
  loyaltyReport?: LoyaltyReport;
  deliveryZones?: DeliveryZonesReport;
  discountsReport?: DiscountsByTypeReport;
  voidsReport?: VoidsByStaffReport;
  refundsReport?: RefundsByReasonReport;
  creditExposure?: CreditExposureReport;
  depositExposure?: DepositExposureReport;
  depositActivity?: DepositActivityReport;
  overridesReport?: ManagerOverridesReport;
  velocityReport?: StockVelocityReport;
  shiftVariances?: ShiftVariancesReport;
  customerLtv?: CustomerLtvReport;
  customerCohorts?: CustomerCohortsReport;
  cashierPerf?: CashierPerformanceReport;
  productMargins?: ProductMarginsReport;
  stockDiscrepancy?: StockDiscrepancyReport;
  hourlySales?: HourlySalesReport;
  stationPerf?: StationPerformanceReport;
};

async function fetchReportData(
  tab: Tab,
  from: string,
  to: string,
  posFilters: { user_id?: number; shift_id?: number; device_id?: number },
): Promise<ReportData> {
  const result: ReportData = {};
  if (tab === 'Summary') result.summary = await fetchSalesSummary({ from, to, ...posFilters });
  if (tab === 'Breakdown') result.breakdown = await getSalesBreakdown({ from, to });
  if (tab === 'Delivery Zones') result.deliveryZones = await getDeliveryZonesReport({ from, to });
  if (tab === 'Tax') result.taxReport = await getTaxReport({ from, to });
  if (tab === 'X / Z Report') {
    const [xResult, zResult] = await Promise.allSettled([
      getXReport(),
      getZReport({ from, to }),
    ]);
    result.xReport = xResult.status === 'fulfilled' ? xResult.value : null;
    result.zReport = zResult.status === 'fulfilled' ? zResult.value : null;
    if (xResult.status === 'rejected' && zResult.status === 'rejected') {
      throw xResult.reason;
    }
  }
  if (tab === 'Inventory') result.inventory = await getInventoryValuation();
  if (tab === 'Accounts Payable') result.ap = (await getAccountsPayable()).data;
  if (tab === 'Accounts Receivable') result.ar = (await getAccountsReceivable()).data;
  if (tab === 'Promotions') result.promoReport = (await getPromotionReport({ from, to })).report;
  if (tab === 'Loyalty') result.loyaltyReport = (await getLoyaltyReport({ from, to })).report;
  if (tab === 'Discounts') result.discountsReport = await getDiscountsByTypeReport({ from, to });
  if (tab === 'Voids') result.voidsReport = await getVoidsByStaffReport({ from, to });
  if (tab === 'Refunds') result.refundsReport = await getRefundsByReasonReport({ from, to });
  if (tab === 'Credit Exposure') result.creditExposure = await getCreditExposureReport();
  if (tab === 'Deposit Exposure') result.depositExposure = await getDepositExposureReport();
  if (tab === 'Deposit Activity') result.depositActivity = await getDepositActivityReport({ from, to });
  if (tab === 'Overrides') result.overridesReport = await getManagerOverridesReport({ from, to });
  if (tab === 'Stock Velocity') result.velocityReport = await getStockVelocityReport({ from, to });
  if (tab === 'Shift Variances') result.shiftVariances = await getShiftVariancesReport({ from, to });
  if (tab === 'Customer LTV') result.customerLtv = await getCustomerLtvReport({ from, to });
  if (tab === 'Customer Cohorts') result.customerCohorts = await getCustomerCohortsReport({ from, to });
  if (tab === 'Cashier Performance') result.cashierPerf = await getCashierPerformanceReport({ from, to });
  if (tab === 'Product Margins') result.productMargins = await getProductMarginsReport();
  if (tab === 'Stock Discrepancy') result.stockDiscrepancy = await getStockDiscrepancyReport();
  if (tab === 'Hourly Sales') result.hourlySales = await getHourlySalesReport({ from, to });
  if (tab === 'Station Performance') result.stationPerf = await getStationPerformanceReport({ from, to });
  return result;
}

const S = {
  sectionTab: (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? '#D4813A' : '#9C8E7E',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    borderBottom: active ? '2px solid #D4813A' : '2px solid transparent',
    marginBottom: -2,
    whiteSpace: 'nowrap',
  }),
  sectionBar: {
    marginBottom: 0,
    borderBottom: '2px solid #E8E0D8',
  },
  subTabBar: {
    marginBottom: 20,
    marginTop: 12,
  },
  tab: (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 400,
    background: active ? '#D4813A' : 'transparent', color: active ? '#fff' : '#6B5D4F',
    transition: 'all .15s',
  }),
  table: { width: '100%', borderCollapse: 'collapse' } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', fontSize: 12, color: '#9C8E7E', borderBottom: '1px solid #F0EAE3', whiteSpace: 'nowrap' as const },
  td: { padding: '10px 12px', fontSize: 13, color: '#1C1408', borderBottom: '1px solid #F8F4F0' },
  bar: (pctVal: number): React.CSSProperties => ({
    height: 8, borderRadius: 4, background: '#D4813A', width: `${Math.min(100, pctVal)}%`, minWidth: pctVal > 0 ? 4 : 0,
  }),
};

function BarCell({ value, max }: { value: number; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#F0EAE3', borderRadius: 4, height: 8 }}>
        <div style={S.bar(max > 0 ? (value / max) * 100 : 0)} />
      </div>
      <span style={{ fontSize: 12, color: '#6B5D4F', width: 80, textAlign: 'right' }}>{mvr(value)}</span>
    </div>
  );
}

export function ReportsPage() {
  usePageTitle('Reports');
  const [tab, setTab]         = useState<Tab>('Summary');
  const currentSection = sectionForTab(tab);
  const [from, setFrom]       = useState(daysAgo(7));
  const [to, setTo]           = useState(today());
  const [cashierId, setCashierId] = useState('');
  const [shiftId, setShiftId]     = useState('');
  const [deviceId, setDeviceId]   = useState('');

  const posFilters = {
    user_id: cashierId ? Number(cashierId) : undefined,
    shift_id: shiftId ? Number(shiftId) : undefined,
    device_id: deviceId ? Number(deviceId) : undefined,
  };

  const {
    data: reportData,
    isLoading: loading,
    error: reportError,
    refetch: load,
  } = useQuery({
    queryKey: ['reports', tab, from, to, cashierId, shiftId, deviceId],
    queryFn: () => fetchReportData(tab, from, to, posFilters),
  });
  const error = reportError?.message ?? '';

  const { data: staffOptions = [] } = useQuery({
    queryKey: ['reports', 'pos-staff-options'],
    queryFn: async () => (await fetchPosStaffOptions()).staff ?? [],
  });

  const { data: shiftOptions = [] } = useQuery({
    queryKey: ['reports', 'shift-history'],
    queryFn: async () => (await fetchShiftHistory()).shifts?.map((s) => ({
      id: s.id,
      label: `#${s.id} · ${s.user?.name ?? 'Unknown'} · ${new Date(s.opened_at).toLocaleDateString()}`,
    })) ?? [],
  });

  const { data: deviceOptions = [] } = useQuery({
    queryKey: ['reports', 'devices'],
    queryFn: async () => (await fetchDevices()).data?.map((d) => ({ id: d.id, name: d.name })) ?? [],
  });

  const summary = reportData?.summary ?? null;
  const breakdown = reportData?.breakdown ?? null;
  const xReport = reportData?.xReport ?? null;
  const zReport = reportData?.zReport ?? null;
  const taxReport = reportData?.taxReport ?? null;
  const inventory = reportData?.inventory ?? null;
  const ap = reportData?.ap ?? null;
  const ar = reportData?.ar ?? null;
  const promoReport = reportData?.promoReport ?? null;
  const loyaltyReport = reportData?.loyaltyReport ?? null;
  const deliveryZones = reportData?.deliveryZones ?? null;
  const discountsReport = reportData?.discountsReport ?? null;
  const voidsReport = reportData?.voidsReport ?? null;
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

  const needsDate = tab === 'Summary' || tab === 'Breakdown' || tab === 'Delivery Zones' || tab === 'Tax' || tab === 'Promotions' || tab === 'Loyalty' || tab === 'Discounts' || tab === 'Voids' || tab === 'Refunds' || tab === 'Overrides' || tab === 'Stock Velocity' || tab === 'Shift Variances' || tab === 'Cashier Performance' || tab === 'Customer LTV' || tab === 'Customer Cohorts' || tab === 'Hourly Sales' || tab === 'Station Performance' || tab === 'Deposit Activity';

  const handleExportCSV = () => {
    if (tab === 'Summary' && summary) {
      downloadCSV('sales-summary', [{ Period: summary.period, Revenue: mvr(summary.total_revenue), Orders: summary.order_count, 'Avg Order': mvr(summary.average_order_value ?? 0) }]);
    } else if (tab === 'Breakdown' && breakdown) {
      downloadCSV('sales-breakdown-items', (breakdown.top_items ?? []).map(i => ({ Item: i.name, Qty: i.qty, Revenue: mvr(i.revenue) })));
    } else if (tab === 'Tax' && taxReport) {
      downloadCSV('tax-report', (taxReport.by_rate ?? []).map(r => ({ 'Rate %': r.rate_pct, 'Net Sales': mvr(r.net_sales), 'Tax Amount': mvr(r.tax_amount) })));
    } else if (tab === 'Inventory' && inventory) {
      downloadCSV('inventory-valuation', [{ 'Total Value (MVR)': inventory.total_value, 'Total Quantity': inventory.total_quantity }]);
    } else if (tab === 'Accounts Payable' && ap) {
      downloadCSV('accounts-payable', ap.map(s => ({ Supplier: s.supplier_name, 'Outstanding (MVR)': mvr(s.outstanding_amount), 'Open Invoices': s.invoices.length })));
    } else if (tab === 'Accounts Receivable' && ar) {
      downloadCSV('accounts-receivable', ar.map(c => ({ Customer: c.customer_name ?? 'Unknown', 'Outstanding (MVR)': mvr(c.outstanding_amount), 'Open Invoices': c.invoices.length })));
    } else if (tab === 'Promotions' && promoReport) {
      downloadCSV('promotions-report', promoReport.map(p => ({ Name: p.name, Code: p.code, Redemptions: p.redemptions_count, 'Total Discount (MVR)': mvr(p.total_discount_laar / 100) })));
    } else if (tab === 'Loyalty' && loyaltyReport) {
      downloadCSV('loyalty-report', [{ 'Total Accounts': loyaltyReport.total_accounts, 'Outstanding Pts': loyaltyReport.total_outstanding_points, 'Lifetime Pts': loyaltyReport.total_earned_lifetime, Bronze: loyaltyReport.bronze_count, Silver: loyaltyReport.silver_count, Gold: loyaltyReport.gold_count, Platinum: loyaltyReport.platinum_count }]);
    } else if (tab === 'Discounts' && discountsReport) {
      downloadCSV('discounts-by-type', (discountsReport.rows ?? []).map(r => ({ Type: DISCOUNT_TYPE_LABELS[r.type] ?? r.type, Amount: mvr(r.amount), Orders: r.orders_count })));
    } else if (tab === 'Voids' && voidsReport) {
      downloadCSV('voids-by-staff', (voidsReport.rows ?? []).map(r => ({ Staff: r.name, Voids: r.voids_count })));
    } else if (tab === 'Refunds' && refundsReport) {
      downloadCSV('refunds-by-reason', (refundsReport.rows ?? []).map(r => ({ Reason: r.reason, Count: r.refunds_count, Amount: mvr(r.amount) })));
    } else if (tab === 'Credit Exposure' && creditExposure) {
      downloadCSV('credit-exposure', (creditExposure.top_customers ?? []).map(c => ({
        Customer: c.name,
        Balance: mvr(c.balance),
        Limit: mvr(c.limit),
        Available: mvr(c.available),
        Status: c.status,
        Enabled: c.credit_enabled ? 'yes' : 'no',
        Overdue: c.overdue_invoices_count,
      })));
    } else if (tab === 'Deposit Exposure' && depositExposure) {
      downloadCSV('deposit-exposure', (depositExposure.top_customers ?? []).map(c => ({
        Customer: c.name,
        Balance: mvr(c.balance),
        Status: c.status,
      })));
    } else if (tab === 'Deposit Activity' && depositActivity) {
      downloadCSV('deposit-activity', [{
        Period: `${depositActivity.from} — ${depositActivity.to}`,
        Received: mvr(depositActivity.received),
        Used: mvr(depositActivity.used),
        Payouts: mvr(depositActivity.payouts),
        'To Credit': mvr(depositActivity.transfers),
      }]);
    }
  };

  const canExport = (tab === 'Summary' && summary) || (tab === 'Breakdown' && breakdown) ||
    (tab === 'Tax' && taxReport) || (tab === 'Inventory' && inventory) ||
    (tab === 'Accounts Payable' && ap) || (tab === 'Accounts Receivable' && ar) ||
    (tab === 'Promotions' && promoReport) || (tab === 'Loyalty' && loyaltyReport) ||
    (tab === 'Discounts' && discountsReport) || (tab === 'Voids' && voidsReport) ||
    (tab === 'Refunds' && refundsReport) || (tab === 'Credit Exposure' && creditExposure)
    || (tab === 'Deposit Exposure' && depositExposure)
    || (tab === 'Deposit Activity' && depositActivity);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Sales, finance, operations, inventory, and customer reports"
        action={canExport ? <Btn small variant="secondary" onClick={handleExportCSV}>Export CSV</Btn> : undefined}
      />

      {/* Section + report tabs */}
      <div className="tab-scroll-row" style={S.sectionBar}>
        {REPORT_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            style={S.sectionTab(currentSection.id === section.id)}
            onClick={() => setTab(section.tabs[0])}
          >
            {section.label}
          </button>
        ))}
      </div>
      <div className="tab-scroll-row" style={S.subTabBar}>
        {currentSection.tabs.map((t) => (
          <button key={t} type="button" style={S.tab(tab === t)} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Date filters — only for date-range tabs */}
      {needsDate && (
        <Card style={{ marginBottom: 20 }}>
          <div className="mobile-filters-body" data-responsive-grid style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <DateInput label="From" value={from} onChange={setFrom} />
            <DateInput label="To"   value={to}   onChange={setTo} />
            {tab === 'Summary' && (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B5D4F' }}>
                  Cashier
                  <select value={cashierId} onChange={(e) => setCashierId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit', fontSize: 13 }}>
                    <option value="">All</option>
                    {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B5D4F' }}>
                  Shift
                  <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit', fontSize: 13, maxWidth: 220 }}>
                    <option value="">All</option>
                    {shiftOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B5D4F' }}>
                  Station
                  <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit', fontSize: 13 }}>
                    <option value="">All</option>
                    {deviceOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ label: 'Today', days: 0 }, { label: '7 days', days: 7 }, { label: '30 days', days: 30 }, { label: '90 days', days: 90 }].map(({ label, days }) => (
                <Btn key={label} small variant="secondary" onClick={() => { setFrom(daysAgo(days)); setTo(today()); }}>
                  {label}
                </Btn>
              ))}
              <Btn small onClick={() => { void load(); }}>Apply</Btn>
            </div>
          </div>
        </Card>
      )}

      {error && <ErrorMsg message={error} />}
      {loading && <Spinner />}

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
                    {Object.entries(summary.payments).map(([method, amount]) => (
                      <tr key={method}>
                        <td style={S.td}>{method.replace(/_/g, ' ')}</td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{mvr(Number(amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                            {Object.entries(data.payments ?? {}).map(([method, total]) => (
                              <tr key={method}>
                                <td style={S.td}>{method}</td>
                                <td style={S.td}>{mvr(total as number)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
          </div>
          <Card>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1408', margin: '0 0 8px' }}>How this is calculated</p>
            <p style={{ fontSize: 13, color: '#6B5D4F', margin: 0 }}>
              Value is <code>SUM(current_stock × unit_cost)</code> across every inventory item.
              For a per-item breakdown use <a href="/inventory" style={{ color: '#D4813A', fontWeight: 600 }}>Inventory</a>.
            </p>
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
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{inv.invoice_number}</td>
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
                <span style={{ fontWeight: 700, fontSize: 14, color: '#1C1408' }}>{customer.customer_name ?? 'Unknown Customer'}</span>
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
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{inv.invoice_number}</td>
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

      {/* ── Voids by staff ── */}
      {!loading && tab === 'Voids' && voidsReport && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Voids" value={String((voidsReport.rows ?? []).reduce((s, r) => s + r.voids_count, 0))} accent="#ef4444" />
            <StatCard label="Staff Involved" value={String((voidsReport.rows ?? []).length)} accent="#6B5D4F" />
          </div>
          {(voidsReport.rows ?? []).length === 0 ? (
            <Card><p style={{ textAlign: 'center', padding: '32px 0', color: '#9C8E7E', fontSize: 14 }}>No voids in this period.</p></Card>
          ) : (
            <Card>
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
                      <td style={{ ...S.td, fontWeight: 600 }}>{c.name}</td>
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
                      <td style={{ ...S.td, fontWeight: 600 }}>{c.name}</td>
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
                    <td style={{ ...S.td, color: '#6B5D4F' }}>{row.model_type} #{row.model_id ?? '—'}</td>
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
                    <td style={S.td}>{row.user_name}</td>
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
                    <td style={{ ...S.td, fontWeight: 600 }}>{row.name}</td>
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
