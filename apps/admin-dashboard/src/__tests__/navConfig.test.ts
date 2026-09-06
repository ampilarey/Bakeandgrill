import { describe, it, expect } from 'vitest';
import {
  PINNED_NAV_ITEMS,
  NAV_GROUPS,
  resolveNavItemForPath,
  can,
  canNavItem,
  getDefaultNavPath,
  canAny,
  getAllNavItems,
  getActiveSection,
  getNavGroups,
  navItemPathname,
} from '../components/navConfig';
import type { StaffUser } from '../api';

/** Frozen route + permission pairs — IA regroup must not change gating or deep links. */
const ROUTE_PERMISSION_BASELINE: Array<{ to: string; permission?: string; permissions?: string[] }> = [
  { to: '/dashboard', permission: 'dashboard.view' },
  { to: '/orders', permission: 'orders.view' },
  { to: '/kds', permission: 'orders.view' },
  { to: '/tables', permission: 'orders.view' },
  { to: '/delivery', permission: 'orders.manage' },
  { to: '/kitchen-production', permission: 'kitchen.production.view_all' },
  { to: '/activity', permission: 'reports.view' },
  { to: '/shifts', permission: 'shifts.view_all_history' },
  { to: '/time-clock', permissions: ['staff.view', 'pos.time_clock'] },
  { to: '/menu', permission: 'menu.manage' },
  { to: '/specials', permission: 'menu.manage' },
  { to: '/inventory', permission: 'inventory.view' },
  // Purchasing audit, 2026-09-05: five entries became one hub whose tabs are
  // each gated on the permission the old page carried.
  { to: '/purchasing', permissions: ['purchase_requests.view_all', 'suppliers.purchases', 'purchase_requests.create', 'suppliers.view', 'settings.update'] },
  { to: '/reservations', permission: 'reservations.manage' },
  { to: '/online-ordering', permission: 'settings.update' },
  { to: '/wholesale', permission: 'trade.view' },
  { to: '/wholesale/deliveries', permission: 'trade.view' },
  { to: '/wholesale/invoicing', permission: 'trade.view' },
  { to: '/wholesale/reports', permission: 'trade.view' },
  { to: '/customers', permission: 'customers.manage' },
  { to: '/customers/growth', permission: 'customers.manage' },
  { to: '/catering', permissions: ['events.manage', 'customers.manage'] },
  { to: '/loyalty', permission: 'loyalty.manage' },
  { to: '/gift-cards', permission: 'promotions.manage' },
  { to: '/discount-cards', permission: 'promotions.discount_cards' },
  { to: '/referrals', permission: 'customers.manage' },
  { to: '/reviews', permission: 'customers.manage' },
  { to: '/complaints', permission: 'complaints.view' },
  { to: '/promotions', permission: 'promotions.manage' },
  { to: '/discount-controls', permission: 'discounts.settings.manage' },
  { to: '/sms', permissions: ['integrations.sms', 'sms_marketing.manage'] },
  { to: '/sms/control-center', permissions: ['sms.settings.manage', 'sms.logs.view', 'integrations.sms', 'sms_marketing.manage'] },
  { to: '/signage', permission: 'signage.manage' },
  { to: '/social', permission: 'social.view' },
  { to: '/reports', permission: 'reports.view' },
  { to: '/analytics', permission: 'customers.analytics' },
  { to: '/forecasts', permission: 'reports.financial' },
  { to: '/break-even', permission: 'reports.financial' },
  { to: '/procurement-report', permission: 'reports.financial' },
  { to: '/gst', permission: 'reports.financial' },
  { to: '/profit-loss', permission: 'reports.financial' },
  { to: '/break-even', permission: 'reports.financial' },
  { to: '/invoices', permission: 'finance.invoices' },
  { to: '/expenses', permission: 'finance.expenses' },
  { to: '/refunds', permission: 'orders.refund' },
  { to: '/staff', permission: 'staff.view' },
  { to: '/content/website', permission: 'website.manage' },
  { to: '/content/order-app', permission: 'website.manage' },
  { to: '/business-details', permission: 'website.manage' },
  { to: '/media', permission: 'media.view' },
  { to: '/settings/permissions', permissions: ['settings.update', 'roles_permissions.manage', 'website.manage'] },
  { to: '/settings/notifications', permissions: ['settings.update', 'roles_permissions.manage', 'website.manage'] },
  { to: '/settings/charges', permission: 'settings.update' },
  { to: '/settings/credit', permission: 'settings.update' },
  { to: '/settings/currency', permission: 'website.manage' },
  { to: '/devices', permission: 'devices.view' },
  { to: '/print-jobs', permission: 'devices.view' },
  { to: '/webhooks', permission: 'integrations.webhooks' },
  { to: '/xero', permission: 'integrations.xero' },
  { to: '/system-health', permission: 'website.manage' },
  { to: '/service-availability', permission: 'service_availability.view' },
  { to: '/account' },
  { to: '/checklist', permission: 'website.manage' },
];

function staff(permissions: string[]): StaffUser {
  return {
    id: 99,
    name: 'Tester',
    email: 't@test.com',
    role: 'staff',
    permissions,
  };
}

describe('navConfig', () => {
  it('has six IA sections with metadata and no pinned strip', () => {
    expect(PINNED_NAV_ITEMS).toEqual([]);
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      'monitor',
      'manage',
      'customers-marketing',
      'analyze',
      'system',
      'team',
    ]);
    for (const g of NAV_GROUPS) {
      expect(g.order).toBeTypeOf('number');
      expect(g.icon).toBeTruthy();
      expect(g.label.length).toBeGreaterThan(0);
    }
  });

  it('every routed page appears exactly once with unchanged permissions', () => {
    const items = getAllNavItems(false);
    const pairs = items.map((i) => ({ to: i.to, permission: i.permission, permissions: i.permissions }));
    expect(pairs).toHaveLength(ROUTE_PERMISSION_BASELINE.length);
    for (const baseline of ROUTE_PERMISSION_BASELINE) {
      const matches = pairs.filter((p) => p.to === baseline.to);
      expect(matches).toHaveLength(1);
      expect(matches[0].permission).toBe(baseline.permission);
      expect(matches[0].permissions).toEqual(baseline.permissions);
    }
  });

  it('nav permissions for corrected pages match the API-enforced slug', () => {
    const byTo = Object.fromEntries(getAllNavItems().map((i) => [i.to, i]));
    expect(byTo['/menu']?.permission).toBe('menu.manage');
    expect(byTo['/delivery']?.permission).toBe('orders.manage');
    expect(byTo['/reservations']?.permission).toBe('reservations.manage');
    expect(byTo['/profit-loss']?.permission).toBe('reports.financial');
    expect(byTo['/sms']?.permissions).toEqual(['integrations.sms', 'sms_marketing.manage']);
    expect(byTo['/webhooks']?.permission).toBe('integrations.webhooks');
    expect(byTo['/xero']?.permission).toBe('integrations.xero');
  });

  it('user holding only the API permission sees the nav link; weaker drift slug does not', () => {
    const cases: Array<{ to: string; apiPerm: string; weakPerm: string }> = [
      { to: '/menu', apiPerm: 'menu.manage', weakPerm: 'menu.view' },
      { to: '/delivery', apiPerm: 'orders.manage', weakPerm: 'delivery.view' },
      { to: '/reservations', apiPerm: 'reservations.manage', weakPerm: 'reservations.view' },
      { to: '/profit-loss', apiPerm: 'reports.financial', weakPerm: 'finance.profit_loss' },
      { to: '/sms', apiPerm: 'integrations.sms', weakPerm: 'sms_marketing.view' },
      { to: '/webhooks', apiPerm: 'integrations.webhooks', weakPerm: 'webhooks.manage' },
      { to: '/xero', apiPerm: 'integrations.xero', weakPerm: 'xero.manage' },
    ];

    for (const { to, apiPerm, weakPerm } of cases) {
      const item = getAllNavItems().find((i) => i.to === to);
      expect(item, to).toBeTruthy();
      expect(canNavItem(staff([apiPerm]), item!), `${to} visible with ${apiPerm}`).toBe(true);
      expect(canNavItem(staff([weakPerm]), item!), `${to} hidden for ${weakPerm}`).toBe(false);
    }

    // sms_marketing.manage satisfies SMS APIs — must still see the nav link
    const sms = getAllNavItems().find((i) => i.to === '/sms')!;
    expect(canNavItem(staff(['sms_marketing.manage']), sms)).toBe(true);
  });

  it('reports.basic alone does not open reports.view-gated pages', () => {
    expect(can(staff(['reports.basic']), 'reports.view')).toBe(false);
    expect(can(staff(['reports.view']), 'reports.basic')).toBe(true);
  });

  it('every item belongs to exactly one section and has a route path', () => {
    const seen = new Map<string, string>();
    for (const g of getNavGroups()) {
      // System includes Website Content, Order App Content, Business Details
      // and the Credit Accounts settings page.
      expect(g.items.length).toBeLessThanOrEqual(17);
      for (const item of g.items) {
        expect(item.to.startsWith('/') || item.to.startsWith('#')).toBe(true);
        const key = item.to;
        expect(seen.has(key)).toBe(false);
        seen.set(key, g.id);
      }
    }
  });

  it('getActiveSection maps routes to the rebalanced sections', () => {
    expect(getActiveSection('/orders')?.id).toBe('monitor');
    expect(getActiveSection('/inventory')?.id).toBe('manage');
    expect(getActiveSection('/customers')?.id).toBe('customers-marketing');
    expect(getActiveSection('/reports')?.id).toBe('analyze');
    expect(getActiveSection('/devices')?.id).toBe('system');
    expect(getActiveSection('/staff')?.id).toBe('team');
    expect(getActiveSection('/shifts')?.id).toBe('team');
    expect(getActiveSection('/settings/permissions')?.id).toBe('system');
    expect(getActiveSection('/settings/notifications')?.id).toBe('system');
    expect(getActiveSection('/delivery-settings')?.id).toBe('manage');
  });

  it('Inventory lives in Manage group, not pinned', () => {
    expect(PINNED_NAV_ITEMS.find((i) => i.to === '/inventory')).toBeUndefined();
    const group = NAV_GROUPS.find((g) => g.id === 'manage');
    const inv = group?.items.find((i) => i.to === '/inventory');
    expect(inv?.permission).toBe('inventory.view');
  });

  it('resolveNavItemForPath matches delivery route', () => {
    const all = getAllNavItems();
    const match = resolveNavItemForPath('/delivery', all);
    expect(match?.to).toBe('/delivery');
  });

  it('resolveNavItemForPath maps delivery-settings to Ordering Control', () => {
    const all = getAllNavItems();
    const match = resolveNavItemForPath('/delivery-settings', all);
    expect(match?.to).toBe('/online-ordering');
  });

  it('ordering control is under Manage group and Delivery & Zones is not duplicated in sidebar', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'manage');
    const ordering = group?.items.find((i) => i.to === '/online-ordering');
    expect(ordering?.label).toBe('Ordering Control');
    expect(group?.items.find((i) => i.to === '/delivery-settings')).toBeUndefined();
  });

  it('navItemPathname strips query strings', () => {
    expect(navItemPathname('/settings?tab=permissions')).toBe('/settings');
  });

  it('settings nav links use path segments not query strings', () => {
    const items = getAllNavItems();
    expect(items.some((i) => i.to === '/settings/permissions')).toBe(true);
    expect(items.some((i) => i.to === '/settings/notifications')).toBe(true);
    expect(items.some((i) => i.to.includes('?tab='))).toBe(false);
  });

  it('inventory.view passes for user with inventory.manage only', () => {
    const user: StaffUser = {
      id: 3,
      name: 'Manager',
      email: 'm@test.com',
      role: 'manager',
      permissions: ['inventory.manage'],
    };
    expect(can(user, 'inventory.view')).toBe(true);
    expect(can(user, 'inventory.manage')).toBe(true);
  });

  it('reports.view does not satisfy shifts.view_all_history', () => {
    const user: StaffUser = {
      id: 6,
      name: 'Reporter',
      email: 'r@test.com',
      role: 'staff',
      permissions: ['reports.view', 'finance.cash_manage'],
    };
    expect(can(user, 'shifts.view_all_history')).toBe(false);
    // Owner, 2026-09-01: cash_manage no longer implies shift history either —
    // only an explicit grant opens it.
    expect(can(user, 'shifts.view_own_history')).toBe(false);
    expect(can({ ...user, permissions: [...user.permissions ?? [], 'shifts.view_own_history'] }, 'shifts.view_own_history')).toBe(true);
  });

  it('orders.view is not granted by holding only pos.active_orders on the FE check direction', () => {
    // BE: pos.active_orders ← orders.view (checking POS slug accepts orders.view).
    // Checking orders.view must NOT accept pos.active_orders alone.
    expect(can(staff(['pos.active_orders']), 'orders.view')).toBe(false);
    expect(can(staff(['orders.view']), 'pos.active_orders')).toBe(true);
  });

  it('inventory.view alone does not grant inventory.manage', () => {
    const user: StaffUser = {
      id: 4,
      name: 'Cashier',
      email: 'c@test.com',
      role: 'staff',
      permissions: ['inventory.view'],
    };
    expect(can(user, 'inventory.view')).toBe(true);
    expect(can(user, 'inventory.manage')).toBe(false);
  });

  it('devices.view alone does not grant devices.manage', () => {
    const user: StaffUser = {
      id: 5,
      name: 'Supervisor',
      email: 's@test.com',
      role: 'manager',
      permissions: ['devices.view'],
    };
    expect(can(user, 'devices.view')).toBe(true);
    expect(can(user, 'devices.manage')).toBe(false);
    expect(can(user, 'devices.approve')).toBe(false);
  });

  it('devices.approve alone does not grant devices.manage (no reverse alias)', () => {
    const user: StaffUser = {
      id: 6,
      name: 'Approver',
      email: 'a@test.com',
      role: 'manager',
      permissions: ['devices.approve'],
    };
    expect(can(user, 'devices.approve')).toBe(true);
    expect(can(user, 'devices.view')).toBe(true);
    expect(can(user, 'devices.manage')).toBe(false);
  });

  it('getDefaultNavPath picks first accessible route', () => {
    const cashier: StaffUser = {
      id: 7,
      name: 'Cashier',
      email: 'c2@test.com',
      role: 'staff',
      permissions: ['admin.access', 'orders.view', 'dashboard.view'],
    };
    expect(getDefaultNavPath(cashier)).toBe('/dashboard');

    const ordersOnly: StaffUser = {
      ...cashier,
      permissions: ['admin.access', 'orders.view'],
    };
    expect(getDefaultNavPath(ordersOnly)).toBe('/orders');
  });

  it('canAny passes when user holds one slug', () => {
    const user: StaffUser = {
      id: 8,
      name: 'Ops',
      email: 'ops@test.com',
      role: 'manager',
      permissions: ['settings.update'],
    };
    expect(canAny(user, ['website.manage', 'settings.update'])).toBe(true);
    expect(canAny(user, ['website.manage', 'roles_permissions.manage'])).toBe(false);
  });
});
