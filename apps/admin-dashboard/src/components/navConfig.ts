import {
  LayoutDashboard, ClipboardList, ChefHat, Truck,
  UtensilsCrossed, Package, Tag, CalendarDays,
  BarChart3, DollarSign, Receipt, TrendingDown, PieChart,
  Users, Settings, LogOut,
  Heart, MessageSquare, BarChart2, Factory, Webhook,
  Gift, Star, Target, RotateCcw, Trash2, CreditCard,
  Boxes, LayoutGrid, Wallet, Clock, Monitor, Share2,
  Printer, Link, ShoppingBag, Menu, Zap, MapPin,
  ConciergeBell, Wrench, ClipboardCheck, HeartPulse, UserCircle, ClipboardPen, Utensils,
} from 'lucide-react';
import type { StaffUser } from '../api';

export { LogOut };

export interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  permission?: string;
  /** When set, user needs any one of these slugs (overrides `permission`). */
  permissions?: string[];
  /** Short hint for command palette / search */
  description?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

/** All sidebar pages live in NAV_GROUPS (five sections). Mobile bottom tabs keep quick access. */
export const PINNED_NAV_ITEMS: NavItem[] = [];

/** Paths that should not stay active for nested routes (e.g. /customers vs /customers/growth) */
export const NAV_EXACT_MATCH_PATHS = new Set(['/customers']);

const PINNED_PATHS = new Set(PINNED_NAV_ITEMS.map((i) => i.to));

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'monitor',
    label: 'Monitor',
    icon: ConciergeBell,
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard.view', description: 'Overview & KPIs' },
      { to: '/orders',    icon: ClipboardList,   label: 'Orders',    permission: 'orders.view',    description: 'Live order queue' },
      { to: '/kds',       icon: ChefHat,         label: 'Kitchen Display', permission: 'orders.view', description: 'KDS screen' },
      { to: '/tables',      icon: LayoutGrid, label: 'Tables',         permission: 'orders.view',            description: 'Floor plan & seating' },
      { to: '/delivery',    icon: Truck,      label: 'Delivery Orders', permission: 'delivery.view',          description: 'Active delivery queue' },
      { to: '/kitchen-production', icon: Utensils, label: 'Kitchen Handover', permission: 'kitchen.production.view_all', description: 'Production, receiving & variance' },
      { to: '/activity',    icon: Zap,        label: 'POS Activity',   permission: 'reports.view',            description: 'Audit log & POS events' },
      { to: '/shifts',      icon: Wallet,     label: 'Shifts & Cash',  permission: 'shifts.view_all_history', description: 'Live stations & shift history' },
      { to: '/time-clock',  icon: Clock,      label: 'Time Clock',     permissions: ['staff.view', 'pos.time_clock'], description: 'Punch history & summaries' },
    ],
  },
  {
    id: 'manage',
    label: 'Manage',
    icon: Boxes,
    items: [
      { to: '/menu',      icon: UtensilsCrossed, label: 'Menu Items', permission: 'menu.view',      description: 'Categories & items' },
      { to: '/specials',          icon: Tag,         label: 'Daily Specials',   permission: 'menu.manage',     description: 'Scheduled item discounts' },
      { to: '/inventory',             icon: Boxes,         label: 'Inventory',       permission: 'inventory.view',      description: 'Stock levels' },
      { to: '/purchase-requests',     icon: ClipboardPen,  label: 'Purchase Requests', permission: 'purchase_requests.view_all', description: 'Staff buying tasks' },
      { to: '/purchase-orders',       icon: Package,       label: 'Purchase Orders', permission: 'suppliers.purchases', description: 'Supplier orders' },
      { to: '/supplier-intelligence', icon: Factory,       label: 'Suppliers',       permission: 'suppliers.view',      description: 'Supplier performance' },
      { to: '/waste-logs',            icon: Trash2,        label: 'Waste Tracking',  permission: 'inventory.manage',    description: 'Log waste & shrinkage' },
      // Table booking setup — operational config, not CRM outreach
      { to: '/reservations',     icon: CalendarDays, label: 'Reservations',  permission: 'reservations.view',   description: 'Table bookings' },
      { to: '/online-ordering',   icon: ShoppingBag, label: 'Ordering Control', permission: 'settings.update', description: 'Online hours, fees & overrides' },
      { to: '/delivery-settings', icon: MapPin,      label: 'Delivery & Zones', permission: 'settings.update', description: 'Delivery hours, zone fees & alerts' },
    ],
  },
  {
    id: 'customers-marketing',
    label: 'Customers & Marketing',
    icon: Users,
    items: [
      { to: '/customers',        icon: Users,      label: 'Customers',       permission: 'customers.manage',    description: 'Customer database' },
      { to: '/customers/growth', icon: BarChart2,  label: 'Customer Growth', permission: 'customers.manage',    description: 'Metrics, segments & CRM' },
      { to: '/loyalty',          icon: Heart,      label: 'Loyalty',         permission: 'loyalty.manage',      description: 'Points & rewards' },
      { to: '/gift-cards',       icon: Gift,       label: 'Gift Cards',      permission: 'promotions.manage',   description: 'Issue & manage cards' },
      { to: '/discount-cards',   icon: CreditCard, label: 'Discount Cards', permission: 'promotions.discount_cards', description: 'Owner-issued % / fixed cards' },
      { to: '/referrals',        icon: Share2,     label: 'Referrals',       permission: 'customers.manage',    description: 'Referral program' },
      { to: '/reviews',          icon: Star,       label: 'Reviews',         permission: 'customers.manage',    description: 'Moderate ratings' },
      { to: '/promotions', icon: Target,        label: 'Promotions',      permission: 'promotions.manage',  description: 'Discounts & offers' },
      { to: '/sms',        icon: MessageSquare, label: 'SMS & Messaging', permission: 'sms_marketing.view', description: 'Campaigns, templates & sends' },
    ],
  },
  {
    id: 'analyze',
    label: 'Analyze',
    icon: BarChart3,
    items: [
      { to: '/reports',     icon: BarChart3,  label: 'Reports',       permission: 'reports.view',        description: 'Sales & daily summaries' },
      // Insights & forecasting — reporting, not catalog ops
      { to: '/analytics',        icon: BarChart2,  label: 'Analytics',       permission: 'customers.analytics', description: 'Advanced insights' },
      { to: '/forecasts',             icon: TrendingDown,  label: 'Forecasts',       permission: 'reports.financial',   description: 'Demand forecasting' },
      { to: '/gst',         icon: Receipt,    label: 'GST',           permission: 'reports.financial',   description: 'MIRA GST reports & exports' },
      { to: '/profit-loss', icon: PieChart,   label: 'Profit & Loss', permission: 'finance.profit_loss', description: 'P&L statement' },
      { to: '/invoices',    icon: DollarSign, label: 'Invoices',      permission: 'finance.invoices',    description: 'Billing & AR' },
      { to: '/expenses',    icon: Receipt,    label: 'Expenses',      permission: 'finance.expenses',    description: 'Operating costs' },
      { to: '/refunds',     icon: RotateCcw,  label: 'Refunds',       permission: 'orders.refund',       description: 'Refund history' },
    ],
  },
  {
    id: 'system-team',
    label: 'System & Team',
    icon: Wrench,
    items: [
      { to: '/staff',         icon: Users,       label: 'Staff',          permission: 'staff.view',     description: 'Team management & schedules' },
      { to: '/settings',      icon: Settings,    label: 'Settings',       permissions: ['settings.update', 'roles_permissions.manage', 'website.manage'], description: 'Operational settings & charges' },
      { to: '/devices',       icon: Monitor,     label: 'Devices',        permission: 'devices.view',   description: 'POS & KDS devices' },
      { to: '/print-jobs',    icon: Printer,     label: 'Print Queue',    permission: 'devices.view',   description: 'Receipt print jobs' },
      { to: '/webhooks',      icon: Webhook,     label: 'Webhooks',       permission: 'webhooks.manage', description: 'Outbound integrations' },
      { to: '/xero',          icon: Link,        label: 'Xero',           permission: 'xero.manage',    description: 'Accounting sync' },
      { to: '/system-health', icon: HeartPulse,  label: 'System Health',  permission: 'website.manage', description: 'Queue, webhooks & alerts' },
      { to: '/account',       icon: UserCircle,  label: 'My Account',     description: 'Profile & session' },
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

/** @deprecated Checklist is always in System nav (permission-gated). Kept for Dashboard CTA. */
export function showDevNavItems(): boolean {
  return true;
}

export function getNavGroups(_includeDevItems = true): NavGroup[] {
  return NAV_GROUPS.map((g) => {
    const items = withoutPinnedItems(g.items);
    if (g.id === 'system-team') {
      return { ...g, items: [...items, CHECKLIST_NAV_ITEM] };
    }
    return { ...g, items };
  });
}

export function getAllNavItems(_includeDevItems = true): NavItem[] {
  return [...PINNED_NAV_ITEMS, ...getNavGroups().flatMap((g) => g.items)];
}

/** Longest-prefix match so /delivery-settings does not match /delivery */
export function resolveNavItemForPath(pathname: string, items: NavItem[]): NavItem | undefined {
  const path = pathname.replace(/\/$/, '') || '/';
  return [...items]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => path === item.to || path.startsWith(item.to + '/'));
}

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
  // Keep aliases aligned with backend PermissionCatalog::SATISFIED_BY.
  // Do not invent frontend-only aliases (e.g. reports.view → shifts) — UI would open, APIs 403.
  'shifts.view_own_history': ['finance.cash_manage', 'payments.cash_manage'],
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

/** Nav visibility — supports single `permission` or any-of `permissions`. */
export function canNavItem(user: StaffUser, item: NavItem): boolean {
  if (item.permissions?.length) return canAny(user, item.permissions);
  return can(user, item.permission);
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
    if (canNavItem(user, item)) return item.to;
  }
  return '/account';
}

/** Nav items the user can access (for palette / diagnostics). */
export function getAccessibleNavItems(user: StaffUser): NavItem[] {
  return getAllNavItems(showDevNavItems() || user.role === 'owner').filter(
    (item) => !item.to.startsWith('#') && canNavItem(user, item),
  );
}

/** Map route → group label for search palette subtitles */
export function getNavItemGroupLabel(to: string): string {
  if (PINNED_NAV_ITEMS.some((i) => i.to === to)) return 'Quick access';
  if (to === DEV_NAV_ITEM.to) return 'System & Team';
  for (const g of NAV_GROUPS) {
    if (g.items.some((i) => i.to === to)) return g.label;
  }
  return 'Navigate';
}
