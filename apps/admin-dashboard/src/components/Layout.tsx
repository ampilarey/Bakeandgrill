import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { StaffUser } from '../api';
import {
  LayoutDashboard, ClipboardList, ChefHat, Truck,
  UtensilsCrossed, Package, Target, CalendarDays,
  BarChart3, DollarSign, Receipt, TrendingDown, PieChart,
  Users, Settings, LogOut, Menu, X,
  ChevronLeft, ChevronRight,
  Heart, MessageSquare, BarChart2, Factory, Webhook,
  Gift, Star, Tag, RotateCcw, Trash2,
  Boxes, LayoutGrid, Wallet, Clock, Monitor, Share2,
  Printer, Link,
} from 'lucide-react';

// ── Navigation structure ──────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'OPERATIONS',
    items: [
      { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard',  permission: 'dashboard.view' },
      { to: '/orders',     icon: ClipboardList,   label: 'Orders',     permission: 'orders.view'   },
      { to: '/kds',        icon: ChefHat,         label: 'Kitchen',    permission: 'orders.view'   },
      { to: '/delivery',   icon: Truck,           label: 'Delivery',   permission: 'delivery.view' },
      { to: '/tables',     icon: LayoutGrid,      label: 'Tables',     permission: 'orders.view'   },
      { to: '/shifts',     icon: Wallet,          label: 'Shifts',     permission: 'orders.view'   },
    ],
  },
  {
    label: 'MENU & INVENTORY',
    items: [
      { to: '/menu',            icon: UtensilsCrossed, label: 'Menu Items',    permission: 'menu.view'           },
      { to: '/specials',        icon: Tag,             label: 'Daily Specials',permission: 'menu.manage'         },
      { to: '/inventory',       icon: Boxes,           label: 'Inventory',     permission: 'inventory.manage'    },
      { to: '/purchase-orders', icon: Package,         label: 'Stock & POs',   permission: 'suppliers.purchases' },
      { to: '/waste-logs',      icon: Trash2,          label: 'Waste Tracking',permission: 'menu.manage'         },
    ],
  },
  {
    label: 'CUSTOMERS',
    items: [
      { to: '/customers',       icon: Users,           label: 'Customers',     permission: 'customers.manage'    },
      { to: '/loyalty',         icon: Heart,           label: 'Loyalty',       permission: 'loyalty.view'        },
      { to: '/reservations',    icon: CalendarDays,    label: 'Reservations',  permission: 'reservations.view'   },
      { to: '/reviews',         icon: Star,            label: 'Reviews',       permission: 'customers.manage'    },
      { to: '/gift-cards',      icon: Gift,            label: 'Gift Cards',    permission: 'promotions.manage'   },
      { to: '/referrals',       icon: Share2,          label: 'Referrals',     permission: 'customers.manage'    },
    ],
  },
  {
    label: 'MARKETING',
    items: [
      { to: '/promotions',      icon: Target,          label: 'Promotions',    permission: 'promotions.view'     },
      { to: '/sms',             icon: MessageSquare,   label: 'SMS Campaigns', permission: 'integrations.sms'   },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { to: '/reports',               icon: BarChart3,    label: 'Reports',        permission: 'reports.view'       },
      { to: '/invoices',              icon: DollarSign,   label: 'Invoices',       permission: 'finance.invoices'   },
      { to: '/expenses',              icon: Receipt,      label: 'Expenses',       permission: 'finance.expenses'   },
      { to: '/refunds',               icon: RotateCcw,    label: 'Refunds',        permission: 'orders.manage'      },
      { to: '/profit-loss',           icon: PieChart,     label: 'Profit & Loss',  permission: 'finance.profit_loss'},
      { to: '/forecasts',             icon: TrendingDown, label: 'Forecasts',      permission: 'reports.financial'  },
      { to: '/supplier-intelligence', icon: Factory,      label: 'Suppliers',      permission: 'suppliers.view'     },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { to: '/staff',      icon: Users,    label: 'Staff',         permission: 'staff.view'              },
      { to: '/time-clock', icon: Clock,    label: 'Time Clock',    permission: 'staff.view'              },
      { to: '/analytics',  icon: BarChart2, label: 'Analytics',   permission: 'customers.analytics'     },
      { to: '/devices',    icon: Monitor,  label: 'Devices',       permission: 'device.manage'           },
      { to: '/print-jobs', icon: Printer,  label: 'Print Queue',   permission: 'device.manage'           },
      { to: '/settings',   icon: Settings, label: 'Settings',      permission: 'website.manage'          },
      { to: '/webhooks',   icon: Webhook,  label: 'Webhooks',      permission: 'integrations.webhooks'   },
      { to: '/xero',       icon: Link,     label: 'Xero',          permission: 'finance.invoices'        },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const BOTTOM_TABS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dash',   permission: 'dashboard.view' },
  { to: '/orders',    icon: ClipboardList,   label: 'Orders' },
  { to: '/menu',      icon: UtensilsCrossed, label: 'Menu'   },
  { to: '/reports',   icon: PieChart,        label: 'Money'  },
  { to: '#more',      icon: Menu,            label: 'More'   },
];

// ── Permission helper ─────────────────────────────────────────────────────────
function can(user: StaffUser, permission?: string): boolean {
  if (!permission) return true;
  if (user.role === 'owner') return true;
  return user.permissions?.includes(permission) ?? false;
}

// ── Responsive hook ───────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}

// ── Sidebar nav item ──────────────────────────────────────────────────────────
function SideNavItem({
  to, icon: Icon, label, collapsed,
}: { to: string; icon: React.ElementType; label: string; collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '10px 0' : '10px 12px',
        justifyContent: collapsed ? 'center' : undefined,
        borderRadius: 10,
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: isActive ? 700 : 400,
        color: isActive ? '#D4813A' : '#C4B5A3',
        background: isActive ? 'rgba(212,129,58,0.12)' : 'transparent',
        position: 'relative',
        transition: 'background 0.15s, color 0.15s',
      })}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        if (!el.style.background.includes('0.12')) {
          el.style.background = 'rgba(212,129,58,0.08)';
          el.style.color = '#E8A66A';
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        if (!el.style.background.includes('0.12')) {
          el.style.background = 'transparent';
          el.style.color = '#C4B5A3';
        }
      }}
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span style={{
              position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
              width: 3, height: 20, background: '#D4813A', borderRadius: '0 4px 4px 0',
            }} />
          )}
          <Icon size={17} style={{ flexShrink: 0 }} />
          {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
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
  const width = useWindowWidth();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isTablet) setCollapsed(true);
    else if (!isMobile) setCollapsed(false);
  }, [isTablet, isMobile]);

  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

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

  const currentPage = ALL_ITEMS.find((i) => location.pathname.startsWith(i.to))?.label ?? 'Admin';
  const sidebarW = collapsed ? 64 : 240;

  // ── MOBILE ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F6F3', display: 'flex', flexDirection: 'column' }}>

        {/* Top bar */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 40,
          height: 56, background: '#fff',
          borderBottom: '1px solid #E8E0D8',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
        }}>
          <button
            onClick={() => setMoreOpen(true)}
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: 'none', background: '#F8F6F3',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#6B5D4F', flexShrink: 0,
            }}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <img src="/logo.png" alt="Bake & Grill" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
          <span style={{ flex: 1, fontWeight: 700, color: '#1C1408', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentPage}
          </span>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(212,129,58,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#D4813A', fontWeight: 700, fontSize: 12, flexShrink: 0,
          }}>
            {user.name?.charAt(0).toUpperCase()}
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '16px', paddingBottom: 80, overflowX: 'hidden' }}>
          {children}
        </main>

        {/* Bottom tab bar */}
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
          height: 56, background: '#fff', borderTop: '1px solid #E8E0D8',
          display: 'flex', alignItems: 'stretch',
        }}>
          {BOTTOM_TABS.filter((item) => can(user, item.permission)).map(({ to, icon: Icon, label }) => {
            if (to === '#more') {
              return (
                <button
                  key="more"
                  onClick={() => setMoreOpen(true)}
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 2,
                    cursor: 'pointer', color: '#9C8E7E', fontFamily: 'inherit',
                  }}
                >
                  <Icon size={20} />
                  <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
                </button>
              );
            }
            const isActive = location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                style={{
                  flex: 1, textDecoration: 'none',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 2,
                  color: isActive ? '#D4813A' : '#9C8E7E',
                }}
              >
                <Icon size={20} />
                <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* "More" slide-up drawer */}
        {moreOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
            <div
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
              onClick={() => setMoreOpen(false)}
            />
            <div
              ref={drawerRef}
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                background: '#fff', borderRadius: '20px 20px 0 0',
                maxHeight: '85vh', overflowY: 'auto',
                animation: 'fade-in-up 0.2s ease both',
              }}
            >
              {/* Drawer header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderBottom: '1px solid #E8E0D8',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src="/logo.png" alt="" style={{ width: 32, height: 32, borderRadius: 8 }} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 13, color: '#1C1408', margin: 0 }}>{user.name}</p>
                    <p style={{ fontSize: 11, color: '#9C8E7E', margin: 0, textTransform: 'capitalize' }}>{user.role}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMoreOpen(false)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', border: 'none',
                    background: '#F8F6F3', cursor: 'pointer', color: '#9C8E7E',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Nav grid */}
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
                {NAV_GROUPS.map((group) => {
                  const visibleItems = group.items.filter((item) => can(user, item.permission));
                  if (visibleItems.length === 0) return null;
                  return (
                    <div key={group.label}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#9C8E7E', letterSpacing: '0.08em', marginBottom: 8, margin: '0 0 8px' }}>
                        {group.label}
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {visibleItems.map(({ to, icon: Icon, label }) => {
                          const isActive = location.pathname.startsWith(to);
                          return (
                            <NavLink
                              key={to}
                              to={to}
                              style={{
                                textDecoration: 'none',
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', gap: 6,
                                padding: 12, borderRadius: 12,
                                border: `1px solid ${isActive ? 'rgba(212,129,58,0.3)' : '#E8E0D8'}`,
                                background: isActive ? 'rgba(212,129,58,0.08)' : '#fff',
                                color: isActive ? '#D4813A' : '#6B5D4F',
                              }}
                            >
                              <Icon size={22} />
                              <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Logout */}
                <button
                  onClick={() => { setMoreOpen(false); onLogout(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: 16, borderRadius: 12,
                    border: '1px solid #fca5a5', background: '#fff',
                    color: '#dc2626', fontWeight: 600, fontSize: 14,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <LogOut size={18} />
                  Log Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DESKTOP / TABLET ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F8F6F3', display: 'flex' }}>

      {/* Sidebar */}
      <aside style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 30,
        width: sidebarW,
        background: '#1C1408',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.2s ease',
      }}>

        {/* Logo */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: collapsed ? 0 : 12,
          padding: collapsed ? '16px 0' : '16px',
          justifyContent: collapsed ? 'center' : undefined,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <img
            src="/logo.png"
            alt="Bake & Grill"
            style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
          />
          {!collapsed && (
            <div>
              <p style={{ fontWeight: 700, color: '#fff', fontSize: 13, margin: 0, lineHeight: 1.3 }}>Bake &amp; Grill</p>
              <p style={{ color: '#C4B5A3', fontSize: 10, margin: 0 }}>Admin Panel</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => can(user, item.permission));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label}>
                {!collapsed && (
                  <p style={{
                    fontSize: 10, fontWeight: 700, color: '#4a3d2e',
                    letterSpacing: '0.1em', padding: '0 12px', marginBottom: 4, margin: '0 0 4px',
                  }}>
                    {group.label}
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {visibleItems.map(({ to, icon, label }) => (
                    <SideNavItem key={to} to={to} icon={icon} label={label} collapsed={collapsed} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: 8, flexShrink: 0 }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(212,129,58,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#D4813A', fontWeight: 700, fontSize: 11, flexShrink: 0,
              }}>
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: '#fff', fontSize: 12, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name}
                </p>
                <p style={{ color: '#C4B5A3', fontSize: 10, margin: 0, textTransform: 'capitalize' }}>{user.role}</p>
              </div>
            </div>
          )}
          <button
            onClick={onLogout}
            title={collapsed ? 'Log out' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              justifyContent: collapsed ? 'center' : undefined,
              width: '100%', padding: collapsed ? '10px 0' : '10px 12px',
              borderRadius: 10, border: 'none',
              background: 'transparent', color: '#C4B5A3',
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.15)'; e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C4B5A3'; }}
          >
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {!collapsed && 'Log out'}
          </button>
        </div>

        {/* Collapse toggle button */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            position: 'absolute', right: -12, top: 64,
            width: 24, height: 24, borderRadius: '50%',
            background: '#D4813A', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: 'pointer', zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Main content area */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
        marginLeft: sidebarW,
        transition: 'margin-left 0.2s ease',
      }}>

        {/* Top header */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 20,
          height: 56, background: '#fff',
          borderBottom: '1px solid #E8E0D8',
          display: 'flex', alignItems: 'center',
          padding: '0 24px', gap: 16,
        }}>
          <div style={{ flex: 1 }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderRadius: 10,
            background: '#F8F6F3', border: '1px solid #E8E0D8',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'rgba(212,129,58,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#D4813A', fontWeight: 700, fontSize: 11,
            }}>
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1408' }}>{user.name}</span>
            <span style={{ fontSize: 12, color: '#9C8E7E', textTransform: 'capitalize' }}>· {user.role}</span>
          </div>
        </header>

        {/* Page */}
        <main style={{ flex: 1, padding: 24, overflowX: 'hidden' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

// Re-export shared UI helpers so pages can continue importing from '../components/Layout'
export {
  Spinner, Card, Badge, ErrorMsg, EmptyState, PageHeader, Btn, Input, Select, statColor,
  Modal, ModalActions, StatCard, TableCard, TH, TD, DateInput, SectionLabel, Pagination,
  ConfirmDialog, useConfirmDialog,
} from './SharedUI';
