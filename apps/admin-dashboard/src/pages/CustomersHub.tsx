import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';

/*
 * Customers — the customer record and everything that grows out of it.
 * Directory, Growth, Referrals and Reviews were four sidebar entries.
 *
 * Route audit, 2026-09-19 (owner: "complain management should be under
 * customers"): the two complaint pages sat under Analyze, among the reports.
 * They are customer follow-up, the same work as Reviews — a one-star rating
 * already turns into an order complaint — so they are tabs here now, each
 * still gated on the complaints permission it had.
 */

const CustomersPage = lazy(() => import('./CustomersPage').then((m) => ({ default: m.CustomersPage })));
const CustomerGrowthPage = lazy(() => import('./CustomerGrowthPage').then((m) => ({ default: m.CustomerGrowthPage })));
const ReferralsPage = lazy(() => import('./ReferralsPage'));
const ReviewsPage = lazy(() => import('./ReviewsPage'));
const ComplaintsPage = lazy(() => import('./ComplaintsPage'));
const ComplaintBoxPage = lazy(() => import('./ComplaintBoxPage'));

export const CUSTOMERS_TABS: HubTab[] = [
  { id: 'directory', label: 'Directory', permissions: ['customers.manage'], desc: 'Every registered customer', render: () => <CustomersPage /> },
  { id: 'growth', label: 'Growth', permissions: ['customers.manage'], desc: 'Metrics, segments and follow-ups', render: () => <CustomerGrowthPage /> },
  { id: 'referrals', label: 'Referrals', permissions: ['customers.manage'], desc: 'The referral programme', render: () => <ReferralsPage /> },
  { id: 'reviews', label: 'Reviews', permissions: ['customers.manage'], desc: 'Ratings to moderate', render: () => <ReviewsPage /> },
  { id: 'complaints', label: 'Order complaints', permissions: ['complaints.view'], desc: 'Problems with a specific receipt or invoice', render: () => <ComplaintsPage /> },
  { id: 'complaint-box', label: 'Complaint box', permissions: ['complaints.view'], desc: 'Staff, food and service complaints from the public form — anonymous or with a number', render: () => <ComplaintBoxPage /> },
];

export const CUSTOMERS_HUB_PERMISSIONS = hubPermissions(CUSTOMERS_TABS);

export function CustomersHub() {
  return <HubPage base="/customers" section="Customers & Marketing" title="Customers" tabs={CUSTOMERS_TABS} />;
}
