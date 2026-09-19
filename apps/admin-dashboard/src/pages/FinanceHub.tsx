import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';

/*
 * Finance — the owner's money view. Six sidebar entries became six tabs,
 * each still gated on the permission its page carried.
 *
 * Route audit, 2026-09-19: GST and Refunds were two more Analyze entries.
 * GST is a finance report and a refund is money going back out, so both
 * are tabs here now.
 */

const MonthlySheetPage = lazy(() => import('./MonthlySheetPage').then((m) => ({ default: m.MonthlySheetPage })));
const ProfitLossPage = lazy(() => import('./ProfitLossPage').then((m) => ({ default: m.ProfitLossPage })));
const BreakEvenPage = lazy(() => import('./BreakEvenPage').then((m) => ({ default: m.BreakEvenPage })));
const ExpensesPage = lazy(() => import('./ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const InvoicesPage = lazy(() => import('./InvoicesPage').then((m) => ({ default: m.InvoicesPage })));
const SettlementsPage = lazy(() => import('./SettlementsPage').then((m) => ({ default: m.SettlementsPage })));
const GstPage = lazy(() => import('./GstPage'));
const RefundsPage = lazy(() => import('./RefundsPage'));

export const FINANCE_TABS: HubTab[] = [
  { id: 'monthly-sheet', label: 'Monthly sheet', permissions: ['reports.financial'], desc: 'Income, ingredients, expenses and profit — one month on one sheet', render: () => <MonthlySheetPage /> },
  { id: 'profit-loss', label: 'Profit & loss', permissions: ['reports.financial'], desc: 'The P&L statement', render: () => <ProfitLossPage /> },
  { id: 'break-even', label: 'Break-even', permissions: ['reports.financial'], desc: 'Estimated sales needed to cover costs', render: () => <BreakEvenPage /> },
  { id: 'expenses', label: 'Expenses', permissions: ['finance.expenses'], desc: 'Operating costs', render: () => <ExpensesPage /> },
  { id: 'invoices', label: 'Invoices', permissions: ['finance.invoices'], desc: 'Billing and money owed', render: () => <InvoicesPage /> },
  { id: 'settlements', label: 'Bank settlements', permissions: ['finance.settlements'], desc: 'Card, QR, transfers and cash against the bank', render: () => <SettlementsPage /> },
  { id: 'gst', label: 'GST', permissions: ['reports.financial'], desc: 'MIRA GST reports & exports', render: () => <GstPage /> },
  { id: 'refunds', label: 'Refunds', permissions: ['orders.refund'], desc: 'Refund history — the system must match actual money received', render: () => <RefundsPage /> },
];

export const FINANCE_HUB_PERMISSIONS = hubPermissions(FINANCE_TABS);

export function FinanceHub() {
  return <HubPage base="/finance" section="Analyze" title="Finance" tabs={FINANCE_TABS} />;
}
