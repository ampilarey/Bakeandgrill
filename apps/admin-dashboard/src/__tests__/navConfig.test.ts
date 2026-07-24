import { describe, it, expect } from 'vitest';
import {
  PINNED_NAV_ITEMS,
  NAV_GROUPS,
  resolveNavItemForPath,
  can,
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
  { to: '/delivery', permission: 'delivery.view' },
  { to: '/kitchen-production', permission: 'kitchen.production.view_all' },
  { to: '/activity', permission: 'reports.view' },
  { to: '/shifts', permission: 'shifts.view_all_history' },
  { to: '/time-clock', permissions: ['staff.view', 'pos.time_clock'] },
  { to: '/menu', permission: 'menu.view' },
  { to: '/specials', permission: 'menu.manage' },
  { to: '/inventory', permission: 'inventory.view' },
  { to: '/purchase-requests', permission: 'purchase_requests.view_all' },
  { to: '/shopping-lists', permission: 'purchase_requests.create' },
  { to: '/purchase-orders', permission: 'suppliers.purchases' },
  { to: '/supplier-intelligence', permission: 'suppliers.view' },
  { to: '/waste-logs', permission: 'inventory.manage' },
  { to: '/reservations', permission: 'reservations.view' },
  { to: '/online-ordering', permission: 'settings.update' },
  { to: '/delivery-settings', permission: 'settings.update' },
  { to: '/customers', permission: 'customers.manage' },
  { to: '/customers/growth', permission: 'customers.manage' },
  { to: '/catering', permissions: ['events.manage', 'customers.manage'] },
  { to: '/loyalty', permission: 'loyalty.manage' },
  { to: '/gift-cards', permission: 'promotions.manage' },
  { to: '/discount-cards', permission: 'promotions.discount_cards' },
  { to: '/referrals', permission: 'customers.manage' },
  { to: '/reviews', permission: 'customers.manage' },
  { to: '/promotions', permission: 'promotions.manage' },
  { to: '/discount-controls', permission: 'discounts.settings.manage' },
  { to: '/sms', permission: 'sms_marketing.view' },
  { to: '/sms/control-center', permissions: ['sms.settings.manage', 'sms.logs.view', 'integrations.sms'] },
  { to: '/reports', permission: 'reports.view' },
  { to: '/analytics', permission: 'customers.analytics' },
  { to: '/forecasts', permission: 'reports.financial' },
  { to: '/procurement-report', permission: 'reports.financial' },
  { to: '/gst', permission: 'reports.financial' },
  { to: '/profit-loss', permission: 'finance.profit_loss' },
  { to: '/invoices', permission: 'finance.invoices' },
  { to: '/expenses', permission: 'finance.expenses' },
  { to: '/refunds', permission: 'orders.refund' },
  { to: '/staff', permission: 'staff.view' },
  { to: '/content/website', permission: 'website.manage' },
  { to: '/content/order-app', permission: 'website.manage' },
  { to: '/media', permission: 'media.view' },
  { to: '/settings?tab=permissions', permissions: ['settings.update', 'roles_permissions.manage', 'website.manage'] },
  { to: '/settings?tab=notifications', permissions: ['settings.update', 'roles_permissions.manage', 'website.manage'] },
  { to: '/devices', permission: 'devices.view' },
  { to: '/print-jobs', permission: 'devices.view' },
  { to: '/webhooks', permission: 'webhooks.manage' },
  { to: '/xero', permission: 'xero.manage' },
  { to: '/system-health', permission: 'website.manage' },
  { to: '/service-availability', permission: 'service_availability.view' },
  { to: '/account' },
  { to: '/checklist', permission: 'website.manage' },
];

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

  it('every item belongs to exactly one section and has a route path', () => {
    const seen = new Map<string, string>();
    for (const g of getNavGroups()) {
      expect(g.items.length).toBeLessThanOrEqual(12);
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
    expect(getActiveSection('/settings')?.id).toBe('system');
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

  it('resolveNavItemForPath does not match delivery-settings as delivery', () => {
    const all = getAllNavItems();
    const match = resolveNavItemForPath('/delivery-settings', all);
    expect(match?.to).toBe('/delivery-settings');
  });

  it('ordering control is under Manage group', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'manage');
    const ordering = group?.items.find((i) => i.to === '/online-ordering');
    expect(ordering?.label).toBe('Ordering Control');
  });

  it('navItemPathname strips query strings', () => {
    expect(navItemPathname('/settings?tab=permissions')).toBe('/settings');
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
    expect(can(user, 'shifts.view_own_history')).toBe(true);
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
