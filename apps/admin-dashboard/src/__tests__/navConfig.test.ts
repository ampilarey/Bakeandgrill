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

  it('resolveNavItemForPath matches delivery route', () => {
    const all = [...PINNED_NAV_ITEMS, ...NAV_GROUPS.flatMap((g) => g.items)];
    const match = resolveNavItemForPath('/delivery', all);
    expect(match?.to).toBe('/delivery');
  });

  it('ordering control nav item points to online-ordering', () => {
    const all = [...PINNED_NAV_ITEMS, ...NAV_GROUPS.flatMap((g) => g.items)];
    const ordering = all.find((i) => i.to === '/online-ordering');
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
