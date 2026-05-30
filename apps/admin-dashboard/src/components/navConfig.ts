import {
  LayoutDashboard, ClipboardList, ChefHat, Truck,
  UtensilsCrossed, Package, Tag, CalendarDays,
  BarChart3, DollarSign, Receipt, TrendingDown, PieChart,
  Users, Settings, LogOut,
  Heart, MessageSquare, BarChart2, Factory, Webhook,
  Gift, Star, Target, RotateCcw, Trash2,
  Boxes, LayoutGrid, Wallet, Clock, Monitor, Share2,
  Printer, Link, ShoppingBag, Menu, Zap, MapPin, Store,
  ConciergeBell, CircleDollarSign, Wrench, ClipboardCheck, HeartPulse, UserCircle,
} from 'lucide-react';
import type { StaffUser } from '../api';

export { LogOut };

export interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  permission?: string;
  /** Short hint for command palette / search */
  description?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

/** Daily operations — pinned at top of sidebar when user has permission */
export const PINNED_NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard.view', description: 'Overview & KPIs' },
  { to: '/orders',    icon: ClipboardList,   label: 'Orders',    permission: 'orders.view',    description: 'Live order queue' },
  { to: '/kds',       icon: ChefHat,         label: 'Kitchen Display', permission: 'orders.view', description: 'KDS screen' },
  { to: '/menu',      icon: UtensilsCrossed, label: 'Menu Items', permission: 'menu.view',      description: 'Categories & items' },
];

/** Paths that should not stay active for nested routes (e.g. /customers vs /customers/growth) */
export const NAV_EXACT_MATCH_PATHS = new Set(['/customers']);

const PINNED_PATHS = new Set(PINNED_NAV_ITEMS.map((i) => i.to));

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'operations',
    label: 'Operations',
    icon: ConciergeBell,
    items: [
      { to: '/activity',    icon: Zap,        label: 'POS Activity',   permission: 'reports.view',            description: 'Audit log & POS events' },
      { to: '/tables',      icon: LayoutGrid, label: 'Tables',         permission: 'orders.view',            description: 'Floor plan & seating' },
      { to: '/delivery',    icon: Truck,      label: 'Delivery Orders', permission: 'delivery.view',          description: 'Active delivery queue' },
      { to: '/shifts',      icon: Wallet,     label: 'Shifts & Cash',  permission: 'shifts.view_own_history', description: 'Cash drawer & shifts' },
      { to: '/time-clock',  icon: Clock,      label: 'Time Clock',     permission: 'pos.time_clock',         description: 'Clock in / out' },
    ],
  },
  {
    id: 'online-store',
    label: 'Online Store',
    icon: Store,
    items: [
      { to: '/online-ordering',   icon: ShoppingBag, label: 'Ordering Control', permission: 'settings.update', description: 'Online hours, fees & overrides' },
      { to: '/delivery-settings', icon: MapPin,      label: 'Delivery & Zones', permission: 'settings.update', description: 'Delivery hours, zone fees & alerts' },
      { to: '/specials',          icon: Tag,         label: 'Daily Specials',   permission: 'menu.manage',     description: 'Scheduled item discounts' },
    ],
  },
  {
    id: 'menu-inventory',
    label: 'Menu & Inventory',
    icon: Boxes,
    items: [
      { to: '/inventory',             icon: Boxes,         label: 'Inventory',       permission: 'inventory.view',      description: 'Stock levels' },
      { to: '/purchase-orders',       icon: Package,       label: 'Purchase Orders', permission: 'suppliers.purchases', description: 'Supplier orders' },
      { to: '/waste-logs',            icon: Trash2,        label: 'Waste Tracking',  permission: 'menu.manage',         description: 'Log waste & shrinkage' },
      { to: '/supplier-intelligence', icon: Factory,       label: 'Suppliers',       permission: 'suppliers.view',      description: 'Supplier performance' },
      { to: '/forecasts',             icon: TrendingDown,  label: 'Forecasts',       permission: 'reports.financial',   description: 'Demand forecasting' },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    items: [
      { to: '/customers',        icon: Users,      label: 'Customers',       permission: 'customers.manage',    description: 'Customer database' },
      { to: '/customers/growth', icon: BarChart2,  label: 'Customer Growth', permission: 'customers.manage',    description: 'Metrics, segments & CRM' },
      { to: '/analytics',        icon: BarChart2,  label: 'Analytics',       permission: 'customers.analytics', description: 'Advanced insights' },
      { to: '/reservations',     icon: CalendarDays, label: 'Reservations',  permission: 'reservations.view',   description: 'Table bookings' },
      { to: '/reviews',          icon: Star,       label: 'Reviews',         permission: 'customers.manage',    description: 'Moderate ratings' },
      { to: '/loyalty',          icon: Heart,      label: 'Loyalty',         permission: 'loyalty.manage',      description: 'Points & rewards' },
      { to: '/gift-cards',       icon: Gift,       label: 'Gift Cards',      permission: 'promotions.manage',   description: 'Issue & manage cards' },
      { to: '/referrals',        icon: Share2,     label: 'Referrals',       permission: 'customers.manage',    description: 'Referral program' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Target,
    items: [
      { to: '/promotions', icon: Target,        label: 'Promotions',      permission: 'promotions.manage',  description: 'Discounts & offers' },
      { to: '/sms',        icon: MessageSquare, label: 'SMS & Messaging', permission: 'sms_marketing.view', description: 'Campaigns, templates & sends' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: CircleDollarSign,
    items: [
      { to: '/reports',     icon: BarChart3,  label: 'Reports',       permission: 'reports.view',        description: 'Sales & daily summaries' },
      { to: '/gst',         icon: Receipt,    label: 'GST',           permission: 'reports.financial',   description: 'MIRA GST reports & exports' },
      { to: '/profit-loss', icon: PieChart,   label: 'Profit & Loss', permission: 'finance.profit_loss', description: 'P&L statement' },
      { to: '/invoices',    icon: DollarSign, label: 'Invoices',      permission: 'finance.invoices',    description: 'Billing & AR' },
      { to: '/expenses',    icon: Receipt,    label: 'Expenses',      permission: 'finance.expenses',    description: 'Operating costs' },
      { to: '/refunds',     icon: RotateCcw,  label: 'Refunds',       permission: 'orders.refund',       description: 'Refund history' },
    ],
  },
  {
    id: 'team-system',
    label: 'Team & System',
    icon: Wrench,
    items: [
      { to: '/staff',         icon: Users,       label: 'Staff',          permission: 'staff.view',     description: 'Team management & schedules' },
      { to: '/account',       icon: UserCircle,  label: 'My Account',     description: 'Profile & session' },
      { to: '/settings',      icon: Settings,    label: 'Settings',       permission: 'settings.update', description: 'Operational settings & charges' },
      { to: '/system-health', icon: HeartPulse,  label: 'System Health',  permission: 'website.manage', description: 'Queue, webhooks & alerts' },
      { to: '/devices',       icon: Monitor,     label: 'Devices',        permission: 'devices.view',   description: 'POS & KDS devices' },
      { to: '/print-jobs',    icon: Printer,     label: 'Print Queue',    permission: 'devices.view',   description: 'Receipt print jobs' },
      { to: '/webhooks',      icon: Webhook,     label: 'Webhooks',       permission: 'webhooks.manage', description: 'Outbound integrations' },
      { to: '/xero',          icon: Link,        label: 'Xero',           permission: 'xero.manage',    description: 'Accounting sync' },
    ],
  },
];

const CHECKLIST_NAV_ITEM: NavItem = {
  to: '/checklist',
  icon: ClipboardCheck,
  label: 'Go-live Checklist',
  permission: 'website.manage',
  description: 'UAT checklist before launch',
};

/** Legacy alias — checklist is always available to owners */
const DEV_NAV_ITEM = CHECKLIST_NAV_ITEM;

function withoutPinnedItems(items: NavItem[]): NavItem[] {
  return items.filter((i) => !PINNED_PATHS.has(i.to));
}

/** Hide go-live checklist in production builds; route remains reachable by URL. */
export function showDevNavItems(): boolean {
  return import.meta.env.DEV;
}

export function getNavGroups(includeDevItems = showDevNavItems()): NavGroup[] {
  let groups = NAV_GROUPS.map((g) => ({ ...g, items: withoutPinnedItems(g.items) }));
  if (includeDevItems) {
    groups = groups.map((g) =>
      g.id === 'team-system'
        ? { ...g, items: [...g.items, CHECKLIST_NAV_ITEM] }
        : g,
    );
  }
  return groups;
}

export function getAllNavItems(includeDevItems = showDevNavItems()): NavItem[] {
  return [...PINNED_NAV_ITEMS, ...getNavGroups(includeDevItems).flatMap((g) => g.items)];
}

/** Longest-prefix match so /delivery-settings does not match /delivery */
export function resolveNavItemForPath(pathname: string, items: NavItem[]): NavItem | undefined {
  const path = pathname.replace(/\/$/, '') || '/';
  return [...items]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => path === item.to || path.startsWith(item.to + '/'));
}

/** @deprecated Use getAllNavItems() — kept for gradual migration */
export const ALL_NAV_ITEMS = getAllNavItems();

export const BOTTOM_TABS: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home',    permission: 'dashboard.view' },
  { to: '/orders',    icon: ClipboardList,   label: 'Orders',  permission: 'orders.view'  },
  { to: '/kds',       icon: ChefHat,         label: 'Kitchen', permission: 'orders.view'  },
  { to: '/menu',      icon: UtensilsCrossed, label: 'Menu',    permission: 'menu.view'    },
  { to: '#more',      icon: Menu,            label: 'More'                                },
];

/** Returns true if the given user has the specified permission (with legacy alias support). */
const PERM_ALIASES: Record<string, string[]> = {
  'devices.manage': ['devices.approve'],
  'devices.view': ['devices.manage', 'devices.approve'],
  'integrations.sms': ['sms_marketing.view', 'sms_marketing.manage'],
  'sms_marketing.view': ['integrations.sms', 'sms_marketing.manage'],
  'sms_marketing.manage': ['integrations.sms', 'sms_marketing.view'],
  'webhooks.manage': ['integrations.webhooks'],
  'integrations.webhooks': ['webhooks.manage'],
  'xero.manage': ['integrations.xero'],
  'integrations.xero': ['xero.manage'],
  'website.manage': ['settings.manage', 'roles_permissions.manage'],
  'roles_permissions.manage': ['website.manage', 'settings.manage'],
  'settings.manage': ['website.manage', 'settings.update'],
  'settings.update': ['settings.manage', 'website.manage'],
  'shifts.view_own_history': ['finance.cash_manage', 'payments.cash_manage'],
  'shifts.view_all_history': ['reports.view', 'finance.cash_manage'],
  'reports.view': ['reports.basic'],
  'reports.basic': ['reports.view'],
  'orders.view': ['pos.active_orders', 'pos.view_this_device_orders'],
  'orders.create': ['pos.ring_sales', 'pos.hold_resume'],
  'pos.ring_sales': ['orders.create'],
  'pos.hold_resume': ['orders.create'],
  'finance.cash_manage': ['payments.cash_manage', 'pos.open_shift', 'pos.close_shift'],
  'payments.cash_manage': ['finance.cash_manage', 'pos.open_shift', 'pos.close_shift'],
  'inventory.view': ['inventory.manage'],
};

export function can(user: StaffUser, permission?: string): boolean {
  if (!permission) return true;
  if (user.role === 'owner') return true;
  const perms = user.permissions ?? [];
  if (perms.includes(permission)) return true;
  for (const alias of PERM_ALIASES[permission] ?? []) {
    if (perms.includes(alias)) return true;
  }
  return false;
}

/** True if the user holds any of the listed permission slugs (owner always true). */
export function canAny(user: StaffUser, permissions: string[]): boolean {
  if (user.role === 'owner') return true;
  return permissions.some((p) => can(user, p));
}

/** First sidebar route this user may open — used for login redirect and / fallback. */
export function getDefaultNavPath(user: StaffUser): string {
  const items = getAllNavItems(showDevNavItems() || user.role === 'owner');
  for (const item of items) {
    if (item.to.startsWith('#')) continue;
    if (can(user, item.permission)) return item.to;
  }
  return '/account';
}

/** Nav items the user can access (for palette / diagnostics). */
export function getAccessibleNavItems(user: StaffUser): NavItem[] {
  return getAllNavItems(showDevNavItems() || user.role === 'owner').filter(
    (item) => !item.to.startsWith('#') && can(user, item.permission),
  );
}

/** Map route → group label for search palette subtitles */
export function getNavItemGroupLabel(to: string): string {
  if (PINNED_NAV_ITEMS.some((i) => i.to === to)) return 'Quick access';
  if (to === DEV_NAV_ITEM.to) return 'Team & System';
  for (const g of NAV_GROUPS) {
    if (g.items.some((i) => i.to === to)) return g.label;
  }
  return 'Navigate';
}
