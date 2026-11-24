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
const CatalogFeedsPage = lazy(() => import('./CatalogFeedsPage'));
const AssistantPage = lazy(() => import('./AssistantPage'));
const SuggestionsPage = lazy(() => import('./SuggestionsPage'));

export const INTEGRATIONS_TABS: HubTab[] = [
  { id: 'webhooks', label: 'Webhooks', permissions: ['integrations.webhooks'], desc: 'Outbound webhooks to other systems', render: () => <WebhooksPage /> },
  { id: 'xero', label: 'Xero', permissions: ['integrations.xero'], desc: 'Accounting sync with Xero', render: () => <XeroPage /> },
  // iruali import plan, feature 11: the menu for Facebook / Instagram shops and Google.
  { id: 'feeds', label: 'Catalogue feeds', permissions: ['website.manage'], desc: 'The menu for Facebook, Instagram and Google', render: () => <CatalogFeedsPage /> },
  // Owner, 2026-11-24: Claude's drafts and suggestions, a switch for each.
  // What the assistant proposed by itself, waiting for a yes: seen by whoever may change the menu, the inventory or the labels.
  { id: 'suggestions', label: 'Suggestions', permissions: ['menu.manage', 'inventory.manage', 'labels.manage', 'media.manage'], desc: 'Changes the assistant proposes, for you to approve', render: () => <SuggestionsPage /> },
  { id: 'assistant', label: 'Assistant', permissions: ['settings.update'], desc: 'Switch Claude\'s drafts and suggestions on or off', render: () => <AssistantPage /> },
];

export const INTEGRATIONS_HUB_PERMISSIONS = hubPermissions(INTEGRATIONS_TABS);

export function IntegrationsHub() {
  return <HubPage base="/integrations" section="System" title="Integrations" tabs={INTEGRATIONS_TABS} />;
}
