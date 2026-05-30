import { describe, it, expect } from 'vitest';
import {
  PINNED_NAV_ITEMS,
  NAV_GROUPS,
  resolveNavItemForPath,
  can,
} from '../components/navConfig';
import type { StaffUser } from '../api';

describe('navConfig', () => {
  it('Inventory lives in Menu & Inventory group, not pinned', () => {
    expect(PINNED_NAV_ITEMS.find((i) => i.to === '/inventory')).toBeUndefined();
    const group = NAV_GROUPS.find((g) => g.id === 'menu-inventory');
    const inv = group?.items.find((i) => i.to === '/inventory');
    expect(inv?.permission).toBe('inventory.view');
  });

  it('pinned quick access has four daily ops items', () => {
    expect(PINNED_NAV_ITEMS.map((i) => i.to)).toEqual([
      '/dashboard',
      '/orders',
      '/kds',
      '/menu',
    ]);
  });

  it('resolveNavItemForPath matches delivery route', () => {
    const all = [...PINNED_NAV_ITEMS, ...NAV_GROUPS.flatMap((g) => g.items)];
    const match = resolveNavItemForPath('/delivery', all);
    expect(match?.to).toBe('/delivery');
  });

  it('resolveNavItemForPath does not match delivery-settings as delivery', () => {
    const all = [...PINNED_NAV_ITEMS, ...NAV_GROUPS.flatMap((g) => g.items)];
    const match = resolveNavItemForPath('/delivery-settings', all);
    expect(match?.to).toBe('/delivery-settings');
  });

  it('ordering control is under Online Store group', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'online-store');
    const ordering = group?.items.find((i) => i.to === '/online-ordering');
    expect(ordering?.label).toBe('Ordering Control');
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
});
