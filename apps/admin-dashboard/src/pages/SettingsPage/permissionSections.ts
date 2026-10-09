import { BarChart3, Boxes, ChefHat, CircleDashed, Megaphone, ShoppingCart, UserCog, type LucideIcon } from 'lucide-react';

/*
 * Owner, 2026-10-09: "is it possible to group and make it easier". The
 * catalog has about 190 permissions in 29 groups, which the editor used to
 * show as one list with a heading every few rows. The groups now sit in six
 * sections that follow the admin menu, so "what may a cashier do at the
 * till" is one section, not a hunt down the page.
 *
 * A group the server adds later and nobody lists here still shows, under
 * "Other", so a new permission is never hidden.
 */

export interface PermissionSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Permission groups as the server names them, in display order. */
  groups: readonly string[];
}

export const PERMISSION_SECTIONS: readonly PermissionSection[] = [
  { id: 'till', label: 'Till and orders', icon: ShoppingCart, groups: ['POS', 'Orders', 'Payments', 'Shifts', 'Delivery', 'Reservations'] },
  { id: 'kitchen', label: 'Kitchen', icon: ChefHat, groups: ['Kitchen / KDS', 'Kitchen Production', 'Labels'] },
  { id: 'stock', label: 'Menu, stock and buying', icon: Boxes, groups: ['Menu', 'Inventory', 'Purchase Requests', 'Suppliers', 'Wholesale'] },
  { id: 'customers', label: 'Customers and marketing', icon: Megaphone, groups: ['Customers', 'Complaints', 'Loyalty', 'Promotions', 'Events', 'Marketing', 'SMS', 'Media'] },
  { id: 'money', label: 'Money and reports', icon: BarChart3, groups: ['Reports', 'Finance'] },
  { id: 'system', label: 'Team and system', icon: UserCog, groups: ['Staff', 'System', 'Devices', 'Service Availability', 'Telegram'] },
];

const OTHER: Omit<PermissionSection, 'groups'> = { id: 'other', label: 'Other', icon: CircleDashed };

/**
 * The sections that hold at least one of `groups`, each with only the groups
 * present, in the order above; groups no section names go to "Other".
 */
export function arrangeGroups(groups: Iterable<string>): PermissionSection[] {
  const present = new Set(groups);
  const placed = new Set<string>();
  const out: PermissionSection[] = [];
  for (const section of PERMISSION_SECTIONS) {
    const mine = section.groups.filter((g) => present.has(g));
    mine.forEach((g) => placed.add(g));
    if (mine.length > 0) out.push({ ...section, groups: mine });
  }
  const rest = [...present].filter((g) => !placed.has(g)).sort((a, b) => a.localeCompare(b));
  if (rest.length > 0) out.push({ ...OTHER, groups: rest });
  return out;
}
