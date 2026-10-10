import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';

/*
 * System → Notifications (notifications audit, 2026-10-10; owner: "to make
 * setting less complicated"). Every text, email and Telegram alert in one
 * place. Before, the switches for one alert could sit in three places: the
 * SMS Control Center, the SMS page's Automations tab and a second switch
 * on the page the alert is about (Purchasing, Delivery, the Complaint box,
 * the Social Hub, TV Signage), with Settings → Notifications and
 * Telegram's Alerts card besides. Now each alert is one row here with its
 * own SMS, Email and Telegram switches, and nothing else turns it off.
 *
 * Each tab keeps the permissions its old page used; routes and their
 * permissions are unchanged.
 */

const MessagesTab = lazy(() => import('./Notifications/MessagesTab'));
const PeopleTab = lazy(() => import('./Notifications/PeopleTab'));
const RulesTab = lazy(() => import('./Notifications/RulesTab'));
const LogTab = lazy(() => import('./Notifications/LogTab'));

export const NOTIFICATIONS_TABS: HubTab[] = [
  {
    id: 'messages',
    label: 'Messages',
    permissions: ['sms.settings.manage', 'sms.logs.view', 'telegram.manage'],
    desc: 'Every text, email and Telegram alert: switch each one on or off, choose who gets it, change its wording',
    render: () => <MessagesTab />,
  },
  {
    id: 'people',
    label: 'People',
    permissions: ['sms.settings.manage', 'staff.update', 'sms.contacts.manage'],
    desc: 'Who gets order alerts, how each person gets their alerts, and extra numbers',
    render: () => <PeopleTab />,
  },
  {
    id: 'rules',
    label: 'Rules',
    permissions: ['sms.settings.manage', 'sms.logs.view', 'telegram.manage'],
    desc: 'Stop all SMS, Telegram alerts, spending limit, quiet hours and email copies',
    render: () => <RulesTab />,
  },
  {
    id: 'log',
    label: 'Log',
    permissions: ['sms.logs.view'],
    desc: 'Every message sent, and the order alerts each person got',
    render: () => <LogTab />,
  },
];

export const NOTIFICATIONS_HUB_PERMISSIONS = hubPermissions(NOTIFICATIONS_TABS);

export function NotificationsHub() {
  return <HubPage base="/notifications" section="System" title="Notifications" tabs={NOTIFICATIONS_TABS} />;
}
