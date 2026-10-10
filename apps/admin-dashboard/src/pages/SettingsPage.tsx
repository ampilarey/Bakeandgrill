import { lazy, useEffect } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';
import { PermissionsSettings } from './SettingsPage/PermissionsSettingsSubPage';
import { ServiceChargeSettings } from './SettingsPage/ServiceChargeSettings';
import { PaymentCommissionSettings } from './SettingsPage/PaymentCommissionSettings';
import { CreditAccountSettings } from './SettingsPage/CreditAccountSettings';
import { RefundPayoutSettings } from './SettingsPage/RefundPayoutSettings';
import { CurrencyPhotosSettings } from './SettingsPage/CurrencyPhotosSubPage';

/** Legacy ?tab= values from before the settings hub — redirect to the tab's path. */
const LEGACY_TAB_REDIRECTS: Record<string, string> = {
  ordering: '/settings/ordering',
  delivery: '/settings/delivery',
  'ordering-charges': '/settings/charges',
  website: '/content/website',
  permissions: '/settings/permissions',
  // Notifications audit, 2026-10-10: System → Notifications has every switch.
  notifications: '/notifications/messages',
  charges: '/settings/charges',
};

function ChargesSettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <ServiceChargeSettings />
      <PaymentCommissionSettings />
      <RefundPayoutSettings />
    </div>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────
/*
 * Settings — one page for every switch that is not owned by a domain page.
 * Owner, 2026-09-08: "related tabs together and under same settings". Six
 * System entries, Ordering Control from Manage, and the delivery settings
 * that had no sidebar entry at all, are now tabs here. Purchasing, Kitchen,
 * GST and Promotions keep their own settings tab, next to the work those
 * switches govern. Notifications left for System → Notifications
 * (2026-10-10), where every message's switches are.
 */

const BusinessDetailsPage = lazy(() => import('./BusinessDetailsPage'));
const OnlineOrderingPage = lazy(() => import('./OnlineOrderingPage'));
const DeliverySettingsPage = lazy(() => import('./DeliverySettingsPage'));

const ANY_ADMIN = ['settings.update', 'roles_permissions.manage', 'website.manage'] as const;

/** Roles & permissions still takes ?user= to open straight onto one person. */
function PermissionsTab() {
  const [searchParams] = useSearchParams();
  const userParam = searchParams.get('user');
  const id = userParam ? Number(userParam) : null;
  return <PermissionsSettings initialUserId={id !== null && Number.isFinite(id) ? id : null} />;
}

export const SETTINGS_TABS: HubTab[] = [
  { id: 'business', label: 'Business', permissions: ['website.manage'], desc: 'The business record on invoices, receipts, signage and SMS', render: () => <BusinessDetailsPage /> },
  { id: 'ordering', label: 'Ordering', permissions: ['settings.update'], desc: 'Online, pickup, delivery, pre-order and feature gates', render: () => <OnlineOrderingPage /> },
  { id: 'delivery', label: 'Delivery', permissions: ['settings.update'], desc: 'Delivery areas, fees and timing', render: () => <DeliverySettingsPage /> },
  { id: 'charges', label: 'Charges & fees', permissions: ['settings.update'], desc: 'Service charge, payment commission, refunds and payouts', render: () => <ChargesSettings /> },
  { id: 'credit', label: 'Credit accounts', permissions: ['settings.update'], desc: 'Approval ceiling, payment terms, and whether credit is open', render: () => <CreditAccountSettings /> },
  { id: 'currency', label: 'Currency photos', permissions: ['website.manage'], desc: 'Note & coin photos shown on the POS cash count', render: () => <CurrencyPhotosSettings /> },
  { id: 'permissions', label: 'Roles & permissions', permissions: ANY_ADMIN, desc: 'Role defaults and per-user overrides', render: () => <PermissionsTab /> },
];

export const SETTINGS_HUB_PERMISSIONS = hubPermissions(SETTINGS_TABS);

export function SettingsPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const userParam = searchParams.get('user');
  const legacyTarget = tabParam ? LEGACY_TAB_REDIRECTS[tabParam] : undefined;
  // Stock Corrections moved to Purchasing → Settings (audit 2026-09-05),
  // alongside every other switch that governs buying.
  const stock = /^\/settings\/stock(\/|$)/.test(pathname);

  useEffect(() => {
    if (legacyTarget) {
      // Preserve ?user= when bouncing permissions query → path
      const qs = tabParam === 'permissions' && userParam ? `?user=${userParam}` : '';
      navigate(`${legacyTarget}${qs}`, { replace: true });
      return;
    }
    if (stock) {
      navigate('/purchasing/settings', { replace: true });
    }
  }, [legacyTarget, stock, tabParam, userParam, navigate]);

  // Avoid a flash while a legacy URL is being redirected.
  if (legacyTarget || stock) {
    return null;
  }

  // Route audit, 2026-09-19: three settings tabs live with their pages (owner,
  // 2026-09-08). Said here, so nobody hunts through this page for them; one
  // line since the 2026-10-09 audit, where three on a phone came before any
  // setting.
  const note = (
    <span data-testid="settings-elsewhere">
      More settings:{' '}
      <Link to="/purchasing/settings" title="Purchasing → Settings: buying switches">Buying</Link>
      {' · '}
      <Link to="/kitchen/settings" title="Kitchen → Settings: handover rules">Kitchen</Link>
      {' · '}
      <Link to="/notifications" title="System → Notifications: every text, email and Telegram alert">Notifications</Link>
    </span>
  );

  return <HubPage base="/settings" section="System" title="Settings" tabs={SETTINGS_TABS} note={note} />;
}
