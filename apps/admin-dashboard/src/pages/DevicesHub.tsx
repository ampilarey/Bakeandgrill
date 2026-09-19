import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';

/*
 * Devices — the tills and kitchen screens, and the receipts they print.
 *
 * Route audit, 2026-09-19: Print Queue was its own System entry next to
 * Devices, and both share one permission. One entry, two tabs.
 */

const DevicesPage = lazy(() => import('./DevicesPage'));
const PrintJobsPage = lazy(() => import('./PrintJobsPage'));

export const DEVICES_TABS: HubTab[] = [
  { id: 'devices', label: 'Devices', permissions: ['devices.view'], desc: 'POS & KDS devices — approve, name and watch them', render: () => <DevicesPage /> },
  { id: 'print-queue', label: 'Print queue', permissions: ['devices.view'], desc: 'Receipt and kitchen print jobs — monitor and retry', render: () => <PrintJobsPage /> },
];

export const DEVICES_HUB_PERMISSIONS = hubPermissions(DEVICES_TABS);

export function DevicesHub() {
  return <HubPage base="/devices" section="System" title="Devices" tabs={DEVICES_TABS} />;
}
