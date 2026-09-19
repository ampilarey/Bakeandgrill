import { describe, it, expect } from 'vitest';
import { getNavGroups, getAllNavItems, NAV_PATH_ALIASES, resolveNavItemForPath } from '../components/navConfig';
import { CUSTOMERS_TABS } from '../pages/CustomersHub';
import { FINANCE_TABS } from '../pages/FinanceHub';
import { DEVICES_TABS } from '../pages/DevicesHub';
import { SYSTEM_TABS } from '../pages/SystemHub';
import { PURCHASING_TABS } from '../pages/PurchasingPage';
import { kitchenTabs } from '../pages/KitchenHub';

/*
 * Route audit, 2026-09-19. Owner: "Some parts are not in the relevant tab.
 * For example i think complain management should be under customers ...
 * and some duplicates are there."
 */

const labelsOf = (groupId: string) =>
  getNavGroups().find((g) => g.id === groupId)!.items.map((i) => i.label);

describe('admin route audit', () => {
  it('puts each sidebar entry with the work it belongs to', () => {
    expect(labelsOf('monitor')).toEqual(['Dashboard', 'Orders', 'Kitchen Display', 'Tables', 'Reservations', 'Delivery Orders', 'Kitchen']);
    expect(labelsOf('manage')).toEqual(['Menu Items', 'Daily Specials', 'Add-ons', 'Inventory', 'Purchasing', 'Wholesale']);
    expect(labelsOf('customers-marketing')).toEqual([
      'Customers', 'Events & Catering', 'Loyalty', 'Promotions', 'SMS & Messaging', 'Social Hub', 'TV Signage',
      'Website Content', 'Order App Content', 'Media Library',
    ]);
    expect(labelsOf('analyze')).toEqual(['Reports', 'Analytics', 'Forecasts', 'Finance']);
    expect(labelsOf('system')).toEqual(['Settings', 'Devices', 'System Health', 'Webhooks', 'Xero']);
    expect(labelsOf('team')).toEqual(['Staff', 'Shifts & Cash', 'Time Clock', 'POS Activity', 'My Account']);
  });

  it('has no complaint, GST, refund, print-queue or availability entries of their own any more', () => {
    const paths = getAllNavItems().map((i) => i.to);
    for (const gone of ['/complaints', '/complaint-box', '/gst', '/refunds', '/procurement-report', '/print-jobs', '/service-availability', '/checklist']) {
      expect(paths, gone).not.toContain(gone);
    }
  });

  it('moved the pages into hubs as tabs, each keeping its permission', () => {
    const tab = (tabs: { id: string; permissions: readonly string[] }[], id: string) => tabs.find((t) => t.id === id);
    expect(tab(CUSTOMERS_TABS, 'complaints')?.permissions).toEqual(['complaints.view']);
    expect(tab(CUSTOMERS_TABS, 'complaint-box')?.permissions).toEqual(['complaints.view']);
    expect(CUSTOMERS_TABS.map((t) => t.label)).toEqual(['Directory', 'Growth', 'Referrals', 'Reviews', 'Order complaints', 'Complaint box']);
    expect(tab(FINANCE_TABS, 'gst')?.permissions).toEqual(['reports.financial']);
    expect(tab(FINANCE_TABS, 'refunds')?.permissions).toEqual(['orders.refund']);
    expect(tab(PURCHASING_TABS as unknown as { id: string; permissions: readonly string[] }[], 'reports')?.permissions).toEqual(['reports.financial']);
    expect(DEVICES_TABS.map((t) => t.id)).toEqual(['devices', 'print-queue']);
    expect(SYSTEM_TABS.map((t) => t.id)).toEqual(['status', 'controls']);
    expect(tab(SYSTEM_TABS, 'status')?.permissions).toEqual(['website.manage']);
    expect(tab(SYSTEM_TABS, 'controls')?.permissions).toEqual(['service_availability.view']);
  });

  it('keeps old addresses lighting up the hub that owns them now', () => {
    const all = getAllNavItems();
    expect(NAV_PATH_ALIASES['/complaints']).toBe('/customers');
    expect(resolveNavItemForPath('/complaint-box', all)?.to).toBe('/customers');
    expect(resolveNavItemForPath('/gst', all)?.to).toBe('/finance');
    expect(resolveNavItemForPath('/refunds', all)?.to).toBe('/finance');
    expect(resolveNavItemForPath('/procurement-report', all)?.to).toBe('/purchasing');
    expect(resolveNavItemForPath('/print-jobs', all)?.to).toBe('/devices');
    expect(resolveNavItemForPath('/service-availability', all)?.to).toBe('/system-health');
  });

  it('tells the two waste tabs apart and names the kitchen demand tab for what it is', () => {
    const kitchen = kitchenTabs(true);
    expect(kitchen.find((t) => t.id === 'waste')?.label).toBe('Waste & remakes');
    expect(kitchen.find((t) => t.id === 'customers')?.label).toBe('Customer demand');
  });
});
