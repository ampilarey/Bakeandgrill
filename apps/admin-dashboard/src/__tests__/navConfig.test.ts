import { describe, it, expect } from 'vitest';
import {
  PINNED_NAV_ITEMS,
  NAV_GROUPS,
  resolveNavItemForPath,
  can,
} from '../components/navConfig';
import type { StaffUser } from '../api';

describe('navConfig', () => {
  it('Inventory nav item uses inventory.view', () => {
    const inv = PINNED_NAV_ITEMS.find((i) => i.to === '/inventory');
    expect(inv?.permission).toBe('inventory.view');
    const inGroup = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === '/inventory');
    expect(inGroup).toBeUndefined();
  });

  it('resolveNavItemForPath prefers delivery-settings over delivery', () => {
    const all = [...PINNED_NAV_ITEMS, ...NAV_GROUPS.flatMap((g) => g.items)];
    const deliverySettings = all.find((i) => i.to === '/delivery-settings');
    expect(deliverySettings?.label).toBe('Delivery Settings');
    const match = resolveNavItemForPath('/delivery-settings', all);
    expect(match?.to).toBe('/delivery-settings');
    expect(match?.label).not.toBe('Delivery');
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
