import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Btn, ErrorMsg, PageHeader, PageShell, Spinner } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { downloadCSV } from '../utils/csvExport';
import { ReportsTabPanels } from './ReportsPage/ReportsTabPanels';
import {
  DISCOUNT_TYPE_LABELS, fetchReportData, mvr, parseReportTab, REPORT_SECTIONS,
  S, sectionForTab, type Tab,
} from './ReportsPage/reportsShared';
import { ReportsFilters, useReportsFilters } from './ReportsPage/useReportsFilters';

export function ReportsPage() {
  usePageTitle('Reports');
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState<Tab>(() => parseReportTab(searchParams.get('tab')) ?? 'Summary');
  const currentSection = sectionForTab(tab);

  const setTab = (next: Tab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'Summary') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    const fromUrl = parseReportTab(searchParams.get('tab'));
    if (fromUrl && fromUrl !== tab) setTabState(fromUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sync URL → state only
  }, [searchParams]);

  const {
    from, setFrom, to, setTo,
    cashierId, setCashierId, shiftId, setShiftId, deviceId, setDeviceId,
    posFilters, staffOptions, shiftOptions, deviceOptions, needsDate,
  } = useReportsFilters(tab);

  const {
    data: reportData,
    isLoading: loading,
    error: reportError,
  } = useQuery({
    queryKey: ['reports', tab, from, to, cashierId, shiftId, deviceId],
    queryFn: () => fetchReportData(tab, from, to, posFilters),
  });
  const error = reportError?.message ?? '';

  const summary = reportData?.summary ?? null;
  const breakdown = reportData?.breakdown ?? null;
  const taxReport = reportData?.taxReport ?? null;
  const inventory = reportData?.inventory ?? null;
  const spendByItem = reportData?.spendByItem ?? null;
  const spendHub = reportData?.spendHub ?? null;
  const ap = reportData?.ap ?? null;
  const ar = reportData?.ar ?? null;
  const promoReport = reportData?.promoReport ?? null;
  const loyaltyReport = reportData?.loyaltyReport ?? null;
  const discountsReport = reportData?.discountsReport ?? null;
  const voidsReport = reportData?.voidsReport ?? null;
  const refundsReport = reportData?.refundsReport ?? null;
  const creditExposure = reportData?.creditExposure ?? null;
  const depositExposure = reportData?.depositExposure ?? null;
  const depositActivity = reportData?.depositActivity ?? null;

  const handleExportCSV = () => {
    if (tab === 'Summary' && summary) {
      downloadCSV('sales-summary', [{
        Period: summary.period,
        'Retail revenue': mvr(summary.total_revenue),
        'Wholesale revenue': mvr(summary.wholesale_revenue ?? 0),
        'Wholesale invoices': summary.wholesale_invoices ?? 0,
        Orders: summary.order_count,
        'Avg Order': mvr(summary.average_order_value ?? 0),
      }]);
    } else if (tab === 'Breakdown' && breakdown) {
      downloadCSV('sales-breakdown-items', [
        ...(breakdown.top_items ?? []).map(i => ({ Channel: 'retail', Item: i.name, Qty: i.qty, Revenue: mvr(i.revenue) })),
        ...(breakdown.wholesale_items ?? []).map(i => ({ Channel: 'wholesale', Item: i.item_name, Qty: i.quantity, Revenue: mvr(i.total) })),
      ]);
    } else if (tab === 'Tax' && taxReport) {
      downloadCSV('tax-report', (taxReport.by_rate ?? []).map(r => ({ 'Rate %': r.rate_pct, 'Net Sales': mvr(r.net_sales), 'Tax Amount': mvr(r.tax_amount) })));
    } else if (tab === 'Inventory' && inventory) {
      downloadCSV('inventory-valuation', (inventory.items ?? []).map((i) => ({
        Item: i.name,
        Unit: i.unit,
        Qty: i.quantity,
        'Unit cost': i.cost_per_unit,
        Value: i.total_value,
      })));
    } else if (tab === 'Spend by Item' && spendByItem) {
      downloadCSV('spend-by-item', spendByItem.rows.map((r) => ({
        Item: r.item_name,
        Unit: r.unit ?? '',
        'Qty received': r.qty_received,
        'Total spend': r.total_spend,
        'Avg unit cost': r.avg_unit_cost,
        'Last unit cost': r.last_unit_cost,
        'Last supplier': r.last_supplier ?? '',
        'Cheapest unit cost': r.cheapest_unit_cost ?? '',
        'Cheapest supplier': r.cheapest_supplier ?? '',
        Receipts: r.receipts_count,
      })));
    } else if (tab === 'Spend Hub' && spendHub) {
      downloadCSV('spend-hub-daily', spendHub.daily.map((d) => ({
        Date: d.date,
        Purchases: d.purchases,
        Expenses: d.expenses,
        Waste: d.waste ?? 0,
        'Cash total': d.total,
        'With waste': d.total_with_waste ?? d.total,
      })));
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
    (tab === 'Spend by Item' && spendByItem) ||
    (tab === 'Spend Hub' && spendHub) ||
    (tab === 'Accounts Payable' && ap) || (tab === 'Accounts Receivable' && ar) ||
    (tab === 'Promotions' && promoReport) || (tab === 'Loyalty' && loyaltyReport) ||
    (tab === 'Discounts' && discountsReport) || (tab === 'Voids' && voidsReport) ||
    (tab === 'Refunds' && refundsReport) || (tab === 'Credit Exposure' && creditExposure)
    || (tab === 'Deposit Exposure' && depositExposure)
    || (tab === 'Deposit Activity' && depositActivity);

  return (
    <PageShell>
    <>
      <PageHeader section="Analyze"
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

      {needsDate && (
        <ReportsFilters
          tab={tab}
          from={from}
          setFrom={setFrom}
          to={to}
          setTo={setTo}
          cashierId={cashierId}
          setCashierId={setCashierId}
          shiftId={shiftId}
          setShiftId={setShiftId}
          deviceId={deviceId}
          setDeviceId={setDeviceId}
          staffOptions={staffOptions}
          shiftOptions={shiftOptions}
          deviceOptions={deviceOptions}
        />
      )}

      {error && <ErrorMsg message={error} />}
      {loading && <Spinner />}

      <ReportsTabPanels tab={tab} loading={loading} reportData={reportData} />
    </>

    </PageShell>
  );
}
