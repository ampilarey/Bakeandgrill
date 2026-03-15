import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { StaffUser } from '../api';
import {
  LayoutDashboard, ClipboardList, ChefHat, Truck,
  UtensilsCrossed, Package, Target, CalendarDays,
  BarChart3, DollarSign, Receipt, TrendingDown,
  Users, Settings, LogOut, Menu, X,
  ChevronLeft, ChevronRight, PieChart,
} from 'lucide-react';

// ── Navigation structure (14 items in 4 groups) ──────────────────────────────
const NAV_GROUPS = [
  {
    label: 'OPERATIONS',
    items: [
      { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'   },
      { to: '/orders',     icon: ClipboardList,   label: 'Orders'      },
      { to: '/kds',        icon: ChefHat,         label: 'Kitchen'     },
      { to: '/delivery',   icon: Truck,           label: 'Delivery'    },
    ],
  },
  {
    label: 'BUSINESS',
    items: [
      { to: '/menu',             icon: UtensilsCrossed, label: 'Menu'              },
      { to: '/purchase-orders',  icon: Package,         label: 'Inventory & Stock' },
      { to: '/promotions',       icon: Target,          label: 'Marketing'         },
      { to: '/reservations',     icon: CalendarDays,    label: 'Reservations'      },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { to: '/reports',   icon: BarChart3,    label: 'Reports'         },
      { to: '/invoices',  icon: DollarSign,   label: 'Revenue'         },
      { to: '/expenses',  icon: Receipt,      label: 'Expenses'        },
      { to: '/forecasts', icon: TrendingDown, label: 'Forecasts'       },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { to: '/staff',    icon: Users,    label: 'Staff & Schedules' },
      { to: '/settings', icon: Settings, label: 'Settings'          },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

// Bottom tab bar items (mobile)
const BOTTOM_TABS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dash'   },
  { to: '/orders',    icon: ClipboardList,   label: 'Orders' },
  { to: '/menu',      icon: UtensilsCrossed, label: 'Menu'   },
  { to: '/reports',   icon: PieChart,        label: 'Money'  },
  { to: '#more',      icon: Menu,            label: 'More'   },
];

// ── Responsive hook ───────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function useIsTablet() {
  const [isTablet, setIsTablet] = useState(() => window.innerWidth >= 768 && window.innerWidth < 1024);
  useEffect(() => {
    const handler = () => setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isTablet;
}

// ── Sidebar nav item ──────────────────────────────────────────────────────────
function SideNavItem({
  to, icon: Icon, label, collapsed,
}: { to: string; icon: React.ElementType; label: string; collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) => [
        'flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-all duration-150 group relative',
        isActive
          ? 'bg-[#D4813A]/15 text-[#D4813A] font-semibold'
          : 'text-[#C4B5A3] hover:bg-[#D4813A]/10 hover:text-[#E8A66A]',
        collapsed ? 'justify-center' : '',
      ].join(' ')}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#D4813A] rounded-r-full" />
          )}
          <Icon size={18} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────
interface LayoutProps {
  user: StaffUser;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ user, onLogout, children }: LayoutProps) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Auto-collapse on tablet
  useEffect(() => {
    if (isTablet) setCollapsed(true);
    else if (!isMobile) setCollapsed(false);
  }, [isTablet, isMobile]);

  // Close "More" drawer on navigation
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  // Close More drawer on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  // Current page label
  const currentPage = ALL_ITEMS.find((i) => location.pathname.startsWith(i.to))?.label ?? 'Admin';

  const sidebarWidth = collapsed ? 64 : 240;

  // ── MOBILE LAYOUT ───────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="min-h-screen bg-[#F8F6F3] flex flex-col">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-40 h-14 bg-white border-b border-[#E8E0D8] flex items-center px-4 gap-3">
          <button
            onClick={() => setMoreOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-[10px] text-[#6B5D4F] hover:bg-[#F8F6F3] transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <img src="/logo.png" alt="Bake & Grill" className="w-8 h-8 rounded-[8px] object-cover" />
          <span className="flex-1 font-bold text-[#1C1408] text-sm truncate">{currentPage}</span>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#D4813A]/15 flex items-center justify-center text-[#D4813A] font-bold text-xs">
              {user.name?.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 pb-20 overflow-x-hidden">
          {children}
        </main>

        {/* Bottom tab bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E8E0D8] h-14 flex items-stretch">
          {BOTTOM_TABS.map(({ to, icon: Icon, label }) => {
            if (to === '#more') {
              return (
                <button
                  key="more"
                  onClick={() => setMoreOpen(true)}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#9C8E7E] hover:text-[#D4813A] transition-colors"
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-semibold">{label}</span>
                </button>
              );
            }
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => [
                  'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
                  isActive ? 'text-[#D4813A]' : 'text-[#9C8E7E] hover:text-[#D4813A]',
                ].join(' ')}
              >
                <Icon size={20} />
                <span className="text-[10px] font-semibold">{label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* "More" full-screen overlay */}
        {moreOpen && (
          <div className="fixed inset-0 z-50 overlay-enter">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
            <div ref={drawerRef} className="absolute inset-x-0 bottom-0 bg-white rounded-t-[20px] max-h-[85vh] overflow-y-auto animate-fade-in">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E0D8]">
                <div className="flex items-center gap-2">
                  <img src="/logo.png" alt="Bake & Grill" className="w-8 h-8 rounded-[8px]" />
                  <div>
                    <p className="font-bold text-sm text-[#1C1408]">{user.name}</p>
                    <p className="text-xs text-[#9C8E7E] capitalize">{user.role}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#9C8E7E] hover:bg-[#F8F6F3]"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Nav groups as icon grids */}
              <div className="p-4 space-y-5">
                {NAV_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-[10px] font-bold text-[#9C8E7E] tracking-wider mb-2">{group.label}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {group.items.map(({ to, icon: Icon, label }) => (
                        <NavLink
                          key={to}
                          to={to}
                          className={({ isActive }) => [
                            'flex flex-col items-center gap-1.5 p-3 rounded-[12px] border transition-all',
                            isActive
                              ? 'bg-[#D4813A]/10 border-[#D4813A]/30 text-[#D4813A]'
                              : 'border-[#E8E0D8] text-[#6B5D4F] hover:border-[#D4813A]/30 hover:bg-[#FDF8F4]',
                          ].join(' ')}
                        >
                          <Icon size={22} />
                          <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
                        </NavLink>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Logout */}
                <button
                  onClick={() => { setMoreOpen(false); onLogout(); }}
                  className="w-full flex items-center gap-3 p-4 rounded-[12px] border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={18} />
                  <span className="text-sm font-semibold">Log Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DESKTOP / TABLET LAYOUT ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F8F6F3] flex">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        className="fixed left-0 top-0 bottom-0 z-30 flex flex-col bg-[#1C1408] sidebar-transition overflow-hidden"
        style={{ width: sidebarWidth }}
      >
        {/* Logo */}
        <div className={['flex items-center gap-3 px-4 py-4 border-b border-white/10 flex-shrink-0', collapsed ? 'justify-center' : ''].join(' ')}>
          <img src="/logo.png" alt="Bake & Grill" className="w-9 h-9 rounded-[8px] object-cover flex-shrink-0" />
          {!collapsed && (
            <div>
              <p className="font-bold text-white text-sm leading-tight">Bake & Grill</p>
              <p className="text-[#C4B5A3] text-[10px]">Admin Panel</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="text-[10px] font-bold text-[#6B5D4F] tracking-widest px-3 mb-1">{group.label}</p>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ to, icon, label }) => (
                  <SideNavItem key={to} to={to} icon={icon} label={label} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="flex-shrink-0 border-t border-white/10 p-2">
          {!collapsed && (
            <div className="flex items-center gap-2 px-3 py-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-[#D4813A]/20 flex items-center justify-center text-[#D4813A] font-bold text-xs flex-shrink-0">
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-semibold truncate">{user.name}</p>
                <p className="text-[#C4B5A3] text-[10px] capitalize">{user.role}</p>
              </div>
            </div>
          )}
          <button
            onClick={onLogout}
            title={collapsed ? 'Log out' : undefined}
            className={['flex items-center gap-3 w-full px-3 py-2.5 rounded-[10px] text-[#C4B5A3] hover:bg-red-900/30 hover:text-red-400 transition-colors text-sm', collapsed ? 'justify-center' : ''].join(' ')}
          >
            <LogOut size={16} className="flex-shrink-0" />
            {!collapsed && 'Log out'}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-16 w-6 h-6 bg-[#D4813A] rounded-full flex items-center justify-center text-white shadow-md hover:bg-[#B5692E] transition-colors z-10"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 sidebar-transition" style={{ marginLeft: sidebarWidth }}>

        {/* Header bar */}
        <header className="sticky top-0 z-20 h-14 bg-white border-b border-[#E8E0D8] flex items-center px-6 gap-4">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] bg-[#F8F6F3] border border-[#E8E0D8]">
              <div className="w-6 h-6 rounded-full bg-[#D4813A]/15 flex items-center justify-center text-[#D4813A] font-bold text-xs">
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-[#1C1408]">{user.name}</span>
              <span className="text-xs text-[#9C8E7E] capitalize">· {user.role}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

// Re-export shared UI helpers so pages can continue importing from '../components/Layout'
export { Spinner, Card, Badge, ErrorMsg, EmptyState, PageHeader, Btn, Input, Select, statColor } from './SharedUI';
