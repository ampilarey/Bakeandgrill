import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';

/*
 * Integrations — what the system sends to other software.
 *
 * Nav check, 2026-10-17: Webhooks and Xero were a System entry each, for one
 * small screen apiece. One entry, two tabs; each tab keeps its permission and
 * the old paths forward here.
 */

const WebhooksPage = lazy(() => import('./WebhooksPage').then((m) => ({ default: m.WebhooksPage })));
const XeroPage = lazy(() => import('./XeroPage'));

export const INTEGRATIONS_TABS: HubTab[] = [
  { id: 'webhooks', label: 'Webhooks', permissions: ['integrations.webhooks'], desc: 'Outbound webhooks to other systems', render: () => <WebhooksPage /> },
  { id: 'xero', label: 'Xero', permissions: ['integrations.xero'], desc: 'Accounting sync with Xero', render: () => <XeroPage /> },
];

export const INTEGRATIONS_HUB_PERMISSIONS = hubPermissions(INTEGRATIONS_TABS);

export function IntegrationsHub() {
  return <HubPage base="/integrations" section="System" title="Integrations" tabs={INTEGRATIONS_TABS} />;
}
