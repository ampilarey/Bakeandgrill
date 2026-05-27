import {
  LayoutDashboard, ClipboardList, ChefHat, Truck,
  UtensilsCrossed, Package, Tag, CalendarDays,
  BarChart3, DollarSign, Receipt, TrendingDown, PieChart,
  Users, Settings, LogOut,
  Heart, MessageSquare, BarChart2, Factory, Webhook,
  Gift, Star, Target, RotateCcw, Trash2,
  Boxes, LayoutGrid, Wallet, Clock, Monitor, Share2,
  Printer, Link, ShoppingBag, Menu, Zap,
} from 'lucide-react';
import type { StaffUser } from '../api';

export { LogOut };

export interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  permission?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'service',
    label: 'SERVICE',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard.view' },
      { to: '/orders',    icon: ClipboardList,   label: 'Orders',    permission: 'orders.view'    },
      { to: '/activity',  icon: Zap,             label: 'POS Activity', permission: 'reports.view' },
      { to: '/kds',       icon: ChefHat,         label: 'Kitchen',   permission: 'orders.view'    },
      { to: '/tables',    icon: LayoutGrid,      label: 'Tables',    permission: 'orders.view'    },
      { to: '/delivery',  icon: Truck,           label: 'Delivery',  permission: 'delivery.view'  },
      { to: '/shifts',    icon: Wallet,          label: 'Shifts',    permission: 'shifts.view_own_history'    },
    ],
  },
  {
    id: 'kitchen',
    label: 'KITCHEN',
    items: [
      { to: '/menu',                  icon: UtensilsCrossed, label: 'Menu Items',      permission: 'menu.view'            },
      { to: '/specials',              icon: Tag,             label: 'Item Discounts',  permission: 'menu.manage'          },
      { to: '/inventory',             icon: Boxes,           label: 'Inventory',       permission: 'inventory.manage'     },
      { to: '/purchase-orders',       icon: Package,         label: 'Purchase Orders', permission: 'suppliers.purchases'  },
      { to: '/supplier-intelligence', icon: Factory,         label: 'Suppliers',       permission: 'suppliers.view'       },
      { to: '/waste-logs',            icon: Trash2,          label: 'Waste Tracking',  permission: 'menu.manage'          },
    ],
  },
  {
    id: 'guests',
    label: 'GUESTS',
    items: [
      { to: '/customers',    icon: Users,         label: 'Customers',    permission: 'customers.manage'  },
      { to: '/reservations', icon: CalendarDays,  label: 'Reservations', permission: 'reservations.view' },
      { to: '/reviews',      icon: Star,          label: 'Reviews',      permission: 'customers.manage'  },
      { to: '/loyalty',      icon: Heart,         label: 'Loyalty',      permission: 'loyalty.manage'    },
      { to: '/gift-cards',   icon: Gift,          label: 'Gift Cards',   permission: 'promotions.manage' },
      { to: '/referrals',    icon: Share2,        label: 'Referrals',    permission: 'customers.manage'  },
      { to: '/promotions',   icon: Target,        label: 'Promotions',   permission: 'promotions.manage' },
      { to: '/sms',          icon: MessageSquare, label: 'SMS',          permission: 'sms_marketing.view'  },
    ],
  },
  {
    id: 'money',
    label: 'MONEY',
    items: [
      { to: '/reports',     icon: BarChart3,    label: 'Reports',       permission: 'reports.view'        },
      { to: '/profit-loss', icon: PieChart,     label: 'Profit & Loss', permission: 'finance.profit_loss' },
      { to: '/invoices',    icon: DollarSign,   label: 'Invoices',      permission: 'finance.invoices'    },
      { to: '/expenses',    icon: Receipt,      label: 'Expenses',      permission: 'finance.expenses'    },
      { to: '/refunds',     icon: RotateCcw,    label: 'Refunds',       permission: 'orders.refund'       },
      { to: '/forecasts',   icon: TrendingDown, label: 'Forecasts',     permission: 'reports.financial'   },
      { to: '/analytics',   icon: BarChart2,    label: 'Analytics',     permission: 'customers.analytics' },
    ],
  },
  {
    id: 'admin',
    label: 'ADMIN',
    items: [
      { to: '/staff',           icon: Users,       label: 'Staff',           permission: 'staff.view'            },
      { to: '/time-clock',      icon: Clock,       label: 'Time Clock',      permission: 'staff.view'            },
      { to: '/settings',        icon: Settings,    label: 'Settings',           permission: 'website.manage'        },
      { to: '/online-ordering', icon: ShoppingBag, label: 'Online Ordering',    permission: 'settings.update'       },
      { to: '/delivery-settings', icon: Truck,     label: 'Delivery Settings',  permission: 'settings.update'       },
      { to: '/devices',         icon: Monitor,     label: 'Devices',         permission: 'devices.view'        },
      { to: '/print-jobs',      icon: Printer,     label: 'Print Queue',     permission: 'devices.view'        },
      { to: '/webhooks',        icon: Webhook,     label: 'Webhooks',        permission: 'webhooks.manage' },
      { to: '/xero',            icon: Link,        label: 'Xero',            permission: 'xero.manage'     },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export const BOTTOM_TABS: NavItem[] = [
  { to: '/orders',   icon: ClipboardList,   label: 'Orders',  permission: 'orders.view'  },
  { to: '/kds',      icon: ChefHat,         label: 'Kitchen', permission: 'orders.view'  },
  { to: '/tables',   icon: LayoutGrid,      label: 'Tables',  permission: 'orders.view'  },
  { to: '/reports',  icon: BarChart3,       label: 'Money',   permission: 'reports.view' },
  { to: '#more',     icon: Menu,            label: 'More'                                },
];

/** Returns true if the given user has the specified permission (with legacy alias support). */
const PERM_ALIASES: Record<string, string[]> = {
  'devices.manage': ['devices.approve', 'devices.view'],
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
