import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';

/*
 * System Health — is it up, and the switches to take a part of it down.
 *
 * Route audit, 2026-09-19: System Health (status) and Service Availability
 * (controls) were two System entries about the same thing. One entry, two
 * tabs, each keeping the permission its page carried — the health API is
 * gated on website.manage, the controls on service_availability.view.
 */

const SystemHealthPage = lazy(() => import('./SystemHealthPage').then((m) => ({ default: m.SystemHealthPage })));
const ServiceAvailabilityPage = lazy(() => import('./ServiceAvailabilityPage'));

export const SYSTEM_TABS: HubTab[] = [
  { id: 'status', label: 'Status', permissions: ['website.manage'], desc: 'Redis, queue, payments, webhooks, SMS and print-proxy status', render: () => <SystemHealthPage /> },
  { id: 'controls', label: 'Availability controls', permissions: ['service_availability.view'], desc: 'Pause or restore services during maintenance — every change is audited', render: () => <ServiceAvailabilityPage /> },
];

export const SYSTEM_HUB_PERMISSIONS = hubPermissions(SYSTEM_TABS);

export function SystemHub() {
  return <HubPage base="/system-health" section="System" title="System Health" tabs={SYSTEM_TABS} />;
}
