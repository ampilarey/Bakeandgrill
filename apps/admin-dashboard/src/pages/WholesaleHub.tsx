import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';

/*
 * Wholesale — shops, deliveries, invoicing and reports were four entries
 * across two sections. The per-account pages (/wholesale/:id …) stay their
 * own routes; they are opened from the Shops tab.
 */

const WholesalePage = lazy(() => import('./WholesalePage'));
const WholesaleDeliveriesPage = lazy(() => import('./WholesaleDeliveriesPage'));
const WholesaleInvoicingPage = lazy(() => import('./WholesaleInvoicingPage'));
const WholesaleReportsPage = lazy(() => import('./WholesaleReportsPage'));

export const WHOLESALE_TABS: HubTab[] = [
  { id: 'shops', label: 'Shops', permissions: ['trade.view'], desc: 'Trade accounts and shop prices', render: () => <WholesalePage /> },
  { id: 'deliveries', label: 'Deliveries', permissions: ['trade.view'], desc: 'Dispatch notes and reconciliation', render: () => <WholesaleDeliveriesPage /> },
  { id: 'invoicing', label: 'Invoicing', permissions: ['trade.view'], desc: 'Bill reconciled deliveries', render: () => <WholesaleInvoicingPage /> },
  { id: 'reports', label: 'Reports', permissions: ['trade.view'], desc: 'Sell-through, waste, margin and ageing', render: () => <WholesaleReportsPage /> },
];

export const WHOLESALE_HUB_PERMISSIONS = hubPermissions(WHOLESALE_TABS);

export function WholesaleHub() {
  return <HubPage base="/wholesale" section="Manage" title="Wholesale" tabs={WHOLESALE_TABS} />;
}
