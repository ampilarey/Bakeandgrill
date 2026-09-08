import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';

/*
 * Customers — the customer record and everything that grows out of it.
 * Directory, Growth, Referrals and Reviews were four sidebar entries.
 */

const CustomersPage = lazy(() => import('./CustomersPage').then((m) => ({ default: m.CustomersPage })));
const CustomerGrowthPage = lazy(() => import('./CustomerGrowthPage').then((m) => ({ default: m.CustomerGrowthPage })));
const ReferralsPage = lazy(() => import('./ReferralsPage'));
const ReviewsPage = lazy(() => import('./ReviewsPage'));

export const CUSTOMERS_TABS: HubTab[] = [
  { id: 'directory', label: 'Directory', permissions: ['customers.manage'], desc: 'Every registered customer', render: () => <CustomersPage /> },
  { id: 'growth', label: 'Growth', permissions: ['customers.manage'], desc: 'Metrics, segments and follow-ups', render: () => <CustomerGrowthPage /> },
  { id: 'referrals', label: 'Referrals', permissions: ['customers.manage'], desc: 'The referral programme', render: () => <ReferralsPage /> },
  { id: 'reviews', label: 'Reviews', permissions: ['customers.manage'], desc: 'Ratings to moderate', render: () => <ReviewsPage /> },
];

export const CUSTOMERS_HUB_PERMISSIONS = hubPermissions(CUSTOMERS_TABS);

export function CustomersHub() {
  return <HubPage base="/customers" section="Customers & Marketing" title="Customers" tabs={CUSTOMERS_TABS} />;
}
