import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';

/*
 * Finance — the owner's money view. Six sidebar entries become six tabs,
 * each still gated on the permission its page carried.
 */

const MonthlySheetPage = lazy(() => import('./MonthlySheetPage').then((m) => ({ default: m.MonthlySheetPage })));
const ProfitLossPage = lazy(() => import('./ProfitLossPage').then((m) => ({ default: m.ProfitLossPage })));
const BreakEvenPage = lazy(() => import('./BreakEvenPage').then((m) => ({ default: m.BreakEvenPage })));
const ExpensesPage = lazy(() => import('./ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const InvoicesPage = lazy(() => import('./InvoicesPage').then((m) => ({ default: m.InvoicesPage })));
const SettlementsPage = lazy(() => import('./SettlementsPage').then((m) => ({ default: m.SettlementsPage })));

export const FINANCE_TABS: HubTab[] = [
  { id: 'monthly-sheet', label: 'Monthly sheet', permissions: ['reports.financial'], desc: 'Income, ingredients, expenses and profit — one month on one sheet', render: () => <MonthlySheetPage /> },
  { id: 'profit-loss', label: 'Profit & loss', permissions: ['reports.financial'], desc: 'The P&L statement', render: () => <ProfitLossPage /> },
  { id: 'break-even', label: 'Break-even', permissions: ['reports.financial'], desc: 'Estimated sales needed to cover costs', render: () => <BreakEvenPage /> },
  { id: 'expenses', label: 'Expenses', permissions: ['finance.expenses'], desc: 'Operating costs', render: () => <ExpensesPage /> },
  { id: 'invoices', label: 'Invoices', permissions: ['finance.invoices'], desc: 'Billing and money owed', render: () => <InvoicesPage /> },
  { id: 'settlements', label: 'Bank settlements', permissions: ['finance.settlements'], desc: 'Card, QR, transfers and cash against the bank', render: () => <SettlementsPage /> },
];

export const FINANCE_HUB_PERMISSIONS = hubPermissions(FINANCE_TABS);

export function FinanceHub() {
  return <HubPage base="/finance" section="Analyze" title="Finance" tabs={FINANCE_TABS} />;
}
