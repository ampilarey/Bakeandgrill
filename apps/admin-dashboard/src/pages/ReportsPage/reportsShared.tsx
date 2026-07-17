import {
  fetchSalesSummary, getSalesBreakdown, getXReport, getZReport, getTaxReport,
  getInventoryValuation, getAccountsPayable, getAccountsReceivable,
  getPromotionReport, getLoyaltyReport, getDeliveryZonesReport,
  getDiscountsByTypeReport, getVoidsByStaffReport, getRefundsByReasonReport, getCreditExposureReport, getDepositExposureReport, getDepositActivityReport,
  getManagerOverridesReport, getStockVelocityReport, getShiftVariancesReport, getCustomerLtvReport,
  getCashierPerformanceReport, getProductMarginsReport, getCustomerCohortsReport, getStockDiscrepancyReport,
  getHourlySalesReport, getStationPerformanceReport, getSpendByItem,
  type SalesSummary, type SalesBreakdown, type XReport, type ZReport,
  type TaxReport, type InventoryValuation, type AccountsPayable, type AccountsReceivable,
  type PromotionReportItem, type LoyaltyReport, type DeliveryZonesReport,
  type DiscountsByTypeReport, type VoidsByStaffReport, type RefundsByReasonReport, type CreditExposureReport, type DepositExposureReport, type DepositActivityReport,
  type ManagerOverridesReport, type StockVelocityReport, type ShiftVariancesReport, type CustomerLtvReport,
  type CashierPerformanceReport, type ProductMarginsReport, type CustomerCohortsReport, type StockDiscrepancyReport,
  type HourlySalesReport, type StationPerformanceReport, type SpendByItemReport,
  type PaymentCommissionSummary,
} from '../../api';
import { localISO, today, daysAgo } from '../../utils/dateHelpers';

// Re-export for report tab modules that import from here.
export { localISO, today, daysAgo };
export function mvr(n: number) { return `MVR ${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
export function pct(n: number, total: number) { return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%'; }

export function PaymentCommissionBlock({ commission }: { commission?: PaymentCommissionSummary }) {
  if (!commission || (commission.totals.gross_commissionable ?? 0) <= 0) return null;
  const th = { textAlign: 'left' as const, padding: '8px 12px', fontSize: 11, color: '#9C8E7E', borderBottom: '1px solid #E8E0D8' };
  const td = { padding: '8px 12px', fontSize: 13, borderBottom: '1px solid #F3EDE4' };
  return (
    <div style={{ marginTop: 20 }}>
      <p style={{ fontWeight: 700, fontSize: 13, color: '#1C1408', margin: '0 0 8px' }}>Card / QR / gateway settlement</p>
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

export const ORDER_TYPE_LABELS: Record<string, string> = {
  online_pickup: 'Online Pickup', delivery: 'Delivery', dine_in: 'Dine-In',
  takeaway: 'Takeaway', pos: 'POS',
};

export const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  promo: 'Promo code', loyalty: 'Loyalty', manual: 'Manual',
  gift_card: 'Gift card', referral: 'Referral',
};

export const REPORT_SECTIONS = [
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
    tabs: ['Inventory', 'Spend by Item', 'Stock Velocity', 'Stock Discrepancy'],
  },
  {
    id: 'customers',
    label: 'Customers',
    tabs: ['Promotions', 'Loyalty', 'Customer LTV', 'Customer Cohorts'],
  },
] as const;

export type Tab = typeof REPORT_SECTIONS[number]['tabs'][number];

export function sectionForTab(t: Tab) {
  return REPORT_SECTIONS.find((s) => (s.tabs as readonly string[]).includes(t)) ?? REPORT_SECTIONS[0];
}

export type ReportData = {
  summary?: SalesSummary;
  breakdown?: SalesBreakdown;
  xReport?: XReport | null;
  zReport?: ZReport | null;
  taxReport?: TaxReport;
  inventory?: InventoryValuation;
  spendByItem?: SpendByItemReport;
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

export async function fetchReportData(
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
  if (tab === 'Spend by Item') result.spendByItem = await getSpendByItem({ from, to });
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

export const S = {
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

export function BarCell({ value, max }: { value: number; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#F0EAE3', borderRadius: 4, height: 8 }}>
        <div style={S.bar(max > 0 ? (value / max) * 100 : 0)} />
      </div>
      <span style={{ fontSize: 12, color: '#6B5D4F', width: 80, textAlign: 'right' }}>{mvr(value)}</span>
    </div>
  );
}

export function tabNeedsDate(tab: Tab): boolean {
  return tab === 'Summary' || tab === 'Breakdown' || tab === 'Delivery Zones' || tab === 'Tax' || tab === 'Promotions' || tab === 'Loyalty' || tab === 'Discounts' || tab === 'Voids' || tab === 'Refunds' || tab === 'Overrides' || tab === 'Spend by Item' || tab === 'Stock Velocity' || tab === 'Shift Variances' || tab === 'Cashier Performance' || tab === 'Customer LTV' || tab === 'Customer Cohorts' || tab === 'Hourly Sales' || tab === 'Station Performance' || tab === 'Deposit Activity';
}
