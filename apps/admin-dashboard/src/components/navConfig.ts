import {
  LayoutDashboard, ClipboardList, ChefHat, Truck,
  UtensilsCrossed, Package, Tag, CalendarDays, Plus,
  BarChart3, DollarSign, Receipt, TrendingDown,
  Users, LogOut,
  Heart, MessageSquare, BarChart2, Webhook,
  Target, RotateCcw,
  Boxes, LayoutGrid, Wallet, Clock, Monitor, Share2,
  Printer, Link, ShoppingBag, Zap,
  ConciergeBell, Wrench, ClipboardCheck, HeartPulse, UserCircle, Utensils,
  AlertTriangle, LayoutTemplate, Shield, UserCog, Images, Tv, Store,
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
  /** Short label for compact mobile tab bar */
  shortLabel?: string;
  icon: React.ElementType;
  /** Display order in section bar / mobile tabs (ascending) */
  order: number;
  items: NavItem[];
}

/** All sidebar pages live in NAV_GROUPS. Mobile bottom tabs are derived from sections. */
export const PINNED_NAV_ITEMS: NavItem[] = [];

/** Paths that should not stay active for nested routes (e.g. /customers vs /customers/growth) */
/**
 * Paths that must match exactly rather than by prefix. Empty since the hubs
 * (2026-09-08): /customers/growth and /wholesale/deliveries are tabs of the
 * /customers and /wholesale entries now, so the prefix is the right match.
 */
export const NAV_EXACT_MATCH_PATHS = new Set<string>([]);

const PINNED_PATHS = new Set(PINNED_NAV_ITEMS.map((i) => i.to));

/** Strip query/hash so path comparisons ignore search/hash. */
export function navItemPathname(to: string): string {
  return to.split(/[?#]/)[0] || '/';
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'monitor',
    label: 'Monitor',
    shortLabel: 'Monitor',
    icon: ConciergeBell,
    order: 1,
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard.view', description: 'Overview & KPIs' },
      { to: '/orders',    icon: ClipboardList,   label: 'Orders',    permission: 'orders.view',    description: 'Live order queue' },
      { to: '/kds',       icon: ChefHat,         label: 'Kitchen Display', permission: 'orders.view', description: 'KDS screen' },
      { to: '/tables',      icon: LayoutGrid, label: 'Tables',         permission: 'orders.view',            description: 'Floor plan & seating' },
      { to: '/delivery',    icon: Truck,      label: 'Delivery Orders', permission: 'orders.manage',          description: 'Active delivery queue' },
      // Owner, 2026-09-08: "related tabs together". The production plan and
      // the handover (batches, receiving, variances, waste) share one page
      // and one settings tab; each tab keeps the permission its page had.
      { to: '/kitchen', icon: Utensils, label: 'Kitchen', permissions: ['kitchen.production.plan', 'kitchen.production.reports', 'kitchen.production.view_all', 'kitchen.variance.review', 'kitchen.production.manage'], description: 'Plan, handover, receiving & variance' },
      { to: '/activity',    icon: Zap,        label: 'POS Activity',   permission: 'reports.view',            description: 'Audit log & POS events' },
    ],
  },
  {
    id: 'manage',
    label: 'Manage',
    shortLabel: 'Manage',
    icon: Boxes,
    order: 2,
    items: [
      { to: '/menu',      icon: UtensilsCrossed, label: 'Menu Items', permission: 'menu.manage',      description: 'Categories & items' },
      { to: '/specials',          icon: Tag,         label: 'Daily Specials',   permission: 'menu.manage',     description: 'Scheduled item discounts' },
      // 2026-09-07 audit, finding 11: add-ons had no screen and moved no stock.
      { to: '/modifiers',         icon: Plus,        label: 'Add-ons',          permission: 'menu.manage',     description: 'Extras and what each one uses' },
      { to: '/inventory',             icon: Boxes,         label: 'Inventory',       permission: 'inventory.view',      description: 'Stock levels, counts, waste' },
      // Purchasing audit, 2026-09-05: requests, orders, shopping lists, suppliers
      // and every buying switch are tabs of one page. Old paths redirect.
      { to: '/purchasing',            icon: Package,       label: 'Purchasing',      permissions: ['purchase_requests.view_all', 'suppliers.purchases', 'purchase_requests.create', 'suppliers.view', 'settings.update'], description: 'Requests, orders, suppliers & buying settings' },
      { to: '/reservations',     icon: CalendarDays, label: 'Reservations',  permission: 'reservations.manage',   description: 'Table bookings' },
      // Delivery settings: Ordering Control → Delivery tab only (/delivery-settings). Not listed again here.
      { to: '/wholesale', icon: Store, label: 'Wholesale', permission: 'trade.view', description: 'Shops, deliveries, invoicing & reports' },
    ],
  },
  {
    id: 'customers-marketing',
    label: 'Customers & Marketing',
    shortLabel: 'Customers',
    icon: Users,
    order: 3,
    items: [
      { to: '/customers',        icon: Users,      label: 'Customers',       permission: 'customers.manage',    description: 'Directory, growth, referrals & reviews' },
      { to: '/catering',         icon: ConciergeBell, label: 'Events & Catering', permissions: ['events.manage', 'customers.manage'], description: 'Event orders, quotes & catering pipeline' },
      { to: '/loyalty',          icon: Heart,      label: 'Loyalty',         permission: 'loyalty.manage',      description: 'Points & rewards' },
      { to: '/promotions', icon: Target,        label: 'Promotions',      permissions: ['promotions.manage', 'promotions.discount_cards', 'discounts.settings.manage'], description: 'Offers, gift cards, discount cards & controls' },
      { to: '/sms',        icon: MessageSquare, label: 'SMS & Messaging', permissions: ['integrations.sms', 'sms_marketing.manage', 'sms.settings.manage', 'sms.logs.view'], description: 'Campaigns, templates, sends & the control center' },
      { to: '/signage', icon: Tv, label: 'TV Signage', permission: 'signage.manage', description: 'Digital menu boards' },
      { to: '/social', icon: Share2, label: 'Social Hub', permission: 'social.view', description: 'Post to Facebook, Instagram & Telegram' },
    ],
  },
  {
    id: 'analyze',
    label: 'Analyze',
    shortLabel: 'Analyze',
    icon: BarChart3,
    order: 4,
    items: [
      { to: '/reports',     icon: BarChart3,  label: 'Reports',       permission: 'reports.view',        description: 'Sales & daily summaries' },
      { to: '/analytics',        icon: BarChart2,  label: 'Analytics',       permission: 'customers.analytics', description: 'Advanced insights' },
      { to: '/forecasts',             icon: TrendingDown,  label: 'Forecasts',       permission: 'reports.financial',   description: 'Demand forecasting' },
      { to: '/procurement-report',     icon: ShoppingBag,   label: 'Procurement',     permission: 'reports.financial',   description: 'Spend, price trends & quote savings' },
      { to: '/gst',         icon: Receipt,    label: 'GST',           permission: 'reports.financial',   description: 'MIRA GST reports & exports' },
      { to: '/finance',     icon: DollarSign, label: 'Finance',       permissions: ['reports.financial', 'finance.expenses', 'finance.invoices', 'finance.settlements'], description: 'Monthly sheet, P&L, break-even, expenses, invoices & settlements' },
      // Owner, 2026-09-07: "the system must match actual money received."
      { to: '/refunds',     icon: RotateCcw,  label: 'Refunds',       permission: 'orders.refund',       description: 'Refund history' },
      { to: '/complaints',  icon: AlertTriangle, label: 'Complaints', permission: 'complaints.view',    description: 'Customer receipt & invoice concerns' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    shortLabel: 'System',
    icon: Wrench,
    order: 5,
    items: [
      { to: '/content/website', icon: LayoutTemplate, label: 'Website Content', permission: 'website.manage', description: 'Public website copy, branding & visuals' },
      { to: '/content/order-app', icon: ShoppingBag, label: 'Order App Content', permission: 'website.manage', description: 'Ordering app copy, branding & visuals' },
      { to: '/media', icon: Images, label: 'Media Library', permission: 'media.view', description: 'Uploaded images, video, audio & documents' },
      // Every switch not owned by a domain page: business record, ordering,
      // delivery, charges, credit, notifications, currency photos, roles.
      { to: '/settings', icon: Shield, label: 'Settings', permissions: ['settings.update', 'roles_permissions.manage', 'website.manage'], description: 'Business, ordering, delivery, fees, credit, notifications & roles' },
      { to: '/devices',       icon: Monitor,     label: 'Devices',        permission: 'devices.view',   description: 'POS & KDS devices' },
      { to: '/print-jobs',    icon: Printer,     label: 'Print Queue',    permission: 'devices.view',   description: 'Receipt print jobs' },
      { to: '/webhooks',      icon: Webhook,     label: 'Webhooks',       permission: 'integrations.webhooks', description: 'Outbound integrations' },
      { to: '/xero',          icon: Link,        label: 'Xero',           permission: 'integrations.xero',    description: 'Accounting sync' },
      { to: '/system-health', icon: HeartPulse,  label: 'System Health',  permission: 'website.manage', description: 'Queue, webhooks & alerts' },
      { to: '/service-availability', icon: AlertTriangle, label: 'Service Availability', permission: 'service_availability.view', description: 'Maintenance & incident controls' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    shortLabel: 'Team',
    icon: UserCog,
    order: 6,
    items: [
      { to: '/staff',         icon: Users,       label: 'Staff',          permission: 'staff.view',     description: 'Team management & schedules' },
      { to: '/shifts',      icon: Wallet,     label: 'Shifts & Cash',  permission: 'shifts.view_all_history', description: 'Live stations & shift history' },
      { to: '/time-clock',  icon: Clock,      label: 'Time Clock',     permissions: ['staff.view', 'pos.time_clock'], description: 'Punch history & summaries' },
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
  return items.filter((i) => !PINNED_PATHS.has(navItemPathname(i.to)));
}

/** @deprecated Checklist is always in System nav (permission-gated). Kept for Dashboard CTA. */
export function showDevNavItems(): boolean {
  return true;
}

export function getNavGroups(_includeDevItems = true): NavGroup[] {
  return NAV_GROUPS
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((g) => {
      const items = withoutPinnedItems(g.items);
      if (g.id === 'system') {
        return { ...g, items: [...items, CHECKLIST_NAV_ITEM] };
      }
      return { ...g, items };
    });
}

export function getAllNavItems(_includeDevItems = true): NavItem[] {
  return [...PINNED_NAV_ITEMS, ...getNavGroups().flatMap((g) => g.items)];
}

/**
 * Paths that belong to another nav item for highlighting.
 * Delivery settings live under Ordering Control → Delivery tab.
 */
export const NAV_PATH_ALIASES: Record<string, string> = {
  // Old paths still resolve to their hub for highlighting until the
  // redirect in App.tsx has fired.
  '/purchase-requests': '/purchasing',
  '/purchase-orders': '/purchasing',
  '/shopping-lists': '/purchasing',
  '/supplier-intelligence': '/purchasing',
  '/waste-logs': '/inventory',
  '/settings/stock': '/purchasing',
  // Hubs, 2026-09-08.
  '/kitchen-production': '/kitchen',
  '/production-plan': '/kitchen',
  '/referrals': '/customers',
  '/reviews': '/customers',
  '/gift-cards': '/promotions',
  '/discount-cards': '/promotions',
  '/discount-controls': '/promotions',
  '/invoices': '/finance',
  '/expenses': '/finance',
  '/profit-loss': '/finance',
  '/monthly-sheet': '/finance',
  '/settlements': '/finance',
  '/break-even': '/finance',
  '/business-details': '/settings',
  '/online-ordering': '/settings',
  '/delivery-settings': '/settings',
};

function resolveNavPath(pathname: string): string {
  const path = pathname.replace(/\/$/, '') || '/';
  return NAV_PATH_ALIASES[path] ?? path;
}

/** Longest-prefix match so /delivery-settings does not match /delivery */
export function resolveNavItemForPath(pathname: string, items: NavItem[]): NavItem | undefined {
  const path = resolveNavPath(pathname);
  return [...items]
    .sort((a, b) => navItemPathname(b.to).length - navItemPathname(a.to).length)
    .find((item) => {
      const base = navItemPathname(item.to);
      if (NAV_EXACT_MATCH_PATHS.has(base)) return path === base;
      return path === base || path.startsWith(base + '/');
    });
}

/**
 * Section (level-1) that owns the current route.
 * Prefers longest-matching item across all groups.
 */
export function getActiveSection(pathname: string): NavGroup | undefined {
  const groups = getNavGroups();
  const allItems = groups.flatMap((g) => g.items.map((item) => ({ group: g, item })));
  const path = resolveNavPath(pathname);
  const match = [...allItems]
    .sort((a, b) => navItemPathname(b.item.to).length - navItemPathname(a.item.to).length)
    .find(({ item }) => {
      const base = navItemPathname(item.to);
      if (NAV_EXACT_MATCH_PATHS.has(base)) return path === base;
      return path === base || path.startsWith(base + '/');
    });
  return match?.group;
}

export function getSectionById(id: string): NavGroup | undefined {
  return getNavGroups().find((g) => g.id === id);
}

/** Sections that have at least one permitted item for this user. */
export function getPermittedSections(user: StaffUser): NavGroup[] {
  return getNavGroups()
    .map((g) => ({ ...g, items: g.items.filter((item) => canNavItem(user, item)) }))
    .filter((g) => g.items.length > 0);
}

export function getFirstPermittedItem(group: NavGroup, user: StaffUser): NavItem | undefined {
  return group.items.find((item) => canNavItem(user, item) && !item.to.startsWith('#'));
}

/**
 * @deprecated Mobile bottom tabs are now section-based (MobileTabBar).
 * Kept briefly so any leftover imports fail softly at runtime shape.
 */
export const BOTTOM_TABS: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home',    permission: 'dashboard.view' },
  { to: '/orders',    icon: ClipboardList,   label: 'Orders',  permission: 'orders.view'  },
  { to: '/kds',       icon: ChefHat,         label: 'Kitchen', permission: 'orders.view'  },
  { to: '/menu',      icon: UtensilsCrossed, label: 'Menu',    permission: 'menu.manage'  },
];

/** Returns true if the given user has the specified permission (with legacy alias support). */
/**
 * Aliases for `can()` — must mirror backend PermissionCatalog::SATISFIED_BY
 * directionality exactly (see fixtures/permission_satisfied_by_parity.json).
 * Never add reverse aliases that the API does not honour
 * (e.g. devices.approve must not satisfy devices.manage).
 */
export const PERM_ALIASES: Record<string, string[]> = {
  'devices.approve': ['devices.manage'],
  'devices.view': ['devices.manage', 'devices.approve'],
  'settings.update': ['settings.manage'],
  'reports.basic': ['reports.view'],
  'finance.cash_manage': ['payments.cash_manage'],
  'payments.cash_manage': ['finance.cash_manage'],
  'payments.cash_in_out': ['finance.cash_manage'],
  'payments.deposit': ['payments.wallet'],
  'payments.wallet': ['payments.deposit'],
  'customers.deposit.view': ['customers.deposit.manage'],
  'customers.deposit.receive': ['customers.deposit.manage'],
  'customers.deposit.freeze': ['customers.deposit.manage'],
  'customers.deposit.refund': ['customers.deposit.manage'],
  'customers.deposit.transfer_credit': ['customers.deposit.manage'],
  'sms_marketing.view': ['integrations.sms'],
  'sms_marketing.manage': ['integrations.sms'],
  'sms.logs.view': ['integrations.sms', 'sms_marketing.manage'],
  'sms.templates.edit': ['integrations.sms', 'sms_marketing.manage'],
  'sms.settings.manage': ['integrations.sms', 'sms_marketing.manage'],
  'sms.contacts.manage': ['integrations.sms', 'sms_marketing.manage'],
  'sms.scheduled.manage': ['integrations.sms', 'sms_marketing.manage'],
  'sms.campaigns.send': ['integrations.sms', 'sms_marketing.manage'],
  'sms.transactional.manage': ['integrations.sms', 'sms_marketing.manage'],
  'media.view': ['website.manage', 'menu.manage'],
  'media.manage': ['website.manage'],
  'webhooks.manage': ['integrations.webhooks'],
  'xero.manage': ['integrations.xero'],
  'users.view': ['staff.view'],
  'users.create': ['staff.create'],
  'users.update': ['staff.update'],
  'users.delete': ['staff.delete'],
  'menu.manage': ['menu.manage'],
  'website.manage': ['website.manage'],
  'pos.active_orders': ['orders.view'],
  'pos.view_this_device_orders': ['orders.view'],
  'pos.ring_sales': ['orders.create'],
  'pos.hold_resume': ['orders.create'],
  'pos.open_shift': ['finance.cash_manage', 'payments.cash_manage'],
  'pos.close_shift': ['finance.cash_manage', 'payments.cash_manage'],
  'pos.lock_screen': ['pos.access'],
  'pos.time_clock': ['pos.access'],
  'pos.manage_order_status': ['pos.active_orders'],
  'orders.receipts': ['orders.view'],
  'orders.send_sms_bill': ['orders.view'],
  'orders.send_payment_link': ['orders.view'],
  'orders.update': ['orders.manage'],
  'customers.lookup': ['customers.view'],
  'customers.create': ['customers.manage'],
  'loyalty.manage': ['loyalty.manage'],
  'promotions.apply_promo_code': ['promotions.discounts'],
  // shifts.view_own_history: no alias — cash_manage no longer implies shift
  // history (owner, 2026-09-01; mirrors PermissionCatalog::SATISFIED_BY).
  'inventory.view': ['inventory.manage'],
  'inventory.stock_count': ['inventory.manage'],
  // Anyone who can verify a request can certainly accept one delivered line.
  'purchase_requests.receive': ['purchase_requests.verify'],
  'suppliers.view': ['suppliers.view'],
  'kds.view': ['orders.view'],
  'kds.start_order': ['orders.manage'],
  'kds.bump_order': ['orders.manage'],
  'kds.recall_order': ['orders.manage'],
  'kds.mark_kitchen_done': ['orders.manage'],
  'kds.print_ticket': ['orders.manage'],
  'kds.manage_availability': ['menu.manage'],
  'service_availability.view': ['settings.update'],
  'service_availability.manage_public': ['settings.update'],
  'trade.view': [
    'trade.manage_accounts',
    'trade.manage_prices',
    'trade.dispatch',
    'trade.reconcile',
    'trade.invoice',
  ],
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
  const path = navItemPathname(to);
  if (PINNED_NAV_ITEMS.some((i) => navItemPathname(i.to) === path)) return 'Quick access';
  if (path === DEV_NAV_ITEM.to) return 'System';
  for (const g of getNavGroups()) {
    if (g.items.some((i) => navItemPathname(i.to) === path || i.to === to)) return g.label;
  }
  return 'Navigate';
}
