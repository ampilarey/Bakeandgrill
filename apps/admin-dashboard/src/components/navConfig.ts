import {
  LayoutDashboard, ClipboardList, ChefHat, Truck,
  UtensilsCrossed, Package, Target, CalendarDays,
  BarChart3, DollarSign, Receipt, TrendingDown, PieChart,
  Users, Settings, LogOut,
  Heart, MessageSquare, BarChart2, Factory, Webhook,
  Gift, Star, Tag, RotateCcw, Trash2,
  Boxes, LayoutGrid, Wallet, Clock, Monitor, Share2,
  Printer, Link, ShoppingBag,
  Menu,
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
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'OPERATIONS',
    items: [
      { to: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard',        permission: 'dashboard.view'  },
      { to: '/orders',           icon: ClipboardList,   label: 'Orders',           permission: 'orders.view'     },
      { to: '/kds',              icon: ChefHat,         label: 'Kitchen',          permission: 'orders.view'     },
      { to: '/delivery',         icon: Truck,           label: 'Delivery',         permission: 'delivery.view'   },
      { to: '/tables',           icon: LayoutGrid,      label: 'Tables',           permission: 'orders.view'     },
      { to: '/shifts',           icon: Wallet,          label: 'Shifts',           permission: 'orders.view'     },
      { to: '/online-ordering',  icon: ShoppingBag,     label: 'Online Ordering',  permission: 'settings.update' },
    ],
  },
  {
    label: 'MENU & INVENTORY',
    items: [
      { to: '/menu',            icon: UtensilsCrossed, label: 'Menu Items',     permission: 'menu.view'           },
      { to: '/specials',        icon: Tag,             label: 'Daily Specials', permission: 'menu.manage'         },
      { to: '/inventory',       icon: Boxes,           label: 'Inventory',      permission: 'inventory.manage'    },
      { to: '/purchase-orders', icon: Package,         label: 'Stock & POs',    permission: 'suppliers.purchases' },
      { to: '/waste-logs',      icon: Trash2,          label: 'Waste Tracking', permission: 'menu.manage'         },
    ],
  },
  {
    label: 'CUSTOMERS',
    items: [
      { to: '/customers',    icon: Users,        label: 'Customers',    permission: 'customers.manage'  },
      { to: '/loyalty',      icon: Heart,        label: 'Loyalty',      permission: 'loyalty.view'      },
      { to: '/reservations', icon: CalendarDays, label: 'Reservations', permission: 'reservations.view' },
      { to: '/reviews',      icon: Star,         label: 'Reviews',      permission: 'customers.manage'  },
      { to: '/gift-cards',   icon: Gift,         label: 'Gift Cards',   permission: 'promotions.manage' },
      { to: '/referrals',    icon: Share2,       label: 'Referrals',    permission: 'customers.manage'  },
    ],
  },
  {
    label: 'MARKETING',
    items: [
      { to: '/promotions', icon: Target,       label: 'Promotions',    permission: 'promotions.view'  },
      { to: '/sms',        icon: MessageSquare, label: 'SMS Campaigns', permission: 'integrations.sms' },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { to: '/reports',               icon: BarChart3,    label: 'Reports',       permission: 'reports.view'        },
      { to: '/invoices',              icon: DollarSign,   label: 'Invoices',      permission: 'finance.invoices'    },
      { to: '/expenses',              icon: Receipt,      label: 'Expenses',      permission: 'finance.expenses'    },
      { to: '/refunds',               icon: RotateCcw,    label: 'Refunds',       permission: 'orders.refund'       },
      { to: '/profit-loss',           icon: PieChart,     label: 'Profit & Loss', permission: 'finance.profit_loss' },
      { to: '/forecasts',             icon: TrendingDown, label: 'Forecasts',     permission: 'reports.financial'   },
      { to: '/supplier-intelligence', icon: Factory,      label: 'Suppliers',     permission: 'suppliers.view'      },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { to: '/staff',      icon: Users,    label: 'Staff',       permission: 'staff.view'            },
      { to: '/time-clock', icon: Clock,    label: 'Time Clock',  permission: 'staff.view'             },
      { to: '/analytics',  icon: BarChart2, label: 'Analytics',  permission: 'customers.analytics'   },
      { to: '/devices',    icon: Monitor,  label: 'Devices',     permission: 'devices.manage'         },
      { to: '/print-jobs', icon: Printer,  label: 'Print Queue', permission: 'devices.manage'         },
      { to: '/settings',   icon: Settings, label: 'Settings',    permission: 'website.manage'         },
      { to: '/webhooks',   icon: Webhook,  label: 'Webhooks',    permission: 'integrations.webhooks'  },
      { to: '/xero',       icon: Link,     label: 'Xero',        permission: 'integrations.xero'      },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export const BOTTOM_TABS: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dash',   permission: 'dashboard.view' },
  { to: '/orders',    icon: ClipboardList,   label: 'Orders', permission: 'orders.view'    },
  { to: '/menu',      icon: UtensilsCrossed, label: 'Menu',   permission: 'menu.view'      },
  { to: '/reports',   icon: PieChart,        label: 'Money',  permission: 'reports.view'   },
  { to: '#more',      icon: Menu,            label: 'More'   },
];

/** Returns true if the given user has the specified permission. */
export function can(user: StaffUser, permission?: string): boolean {
  if (!permission) return true;
  if (user.role === 'owner') return true;
  return user.permissions?.includes(permission) ?? false;
}
