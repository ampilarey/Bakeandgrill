import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { StaffUser } from '../api';
import { fetchLowStockItems } from '../api';
import { Bell, BellOff, ChevronDown, ChevronLeft, ChevronRight, Menu, Moon, Search, Sun, UserCircle, X } from 'lucide-react';
import { isAudioEnabled, setAudioEnabled } from '../utils/audio';
import { useNotifications, markAllRead, clearAll } from '../utils/notifications';
import { NAV_GROUPS, ALL_NAV_ITEMS, BOTTOM_TABS, can, LogOut } from './navConfig';

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
  to, icon: Icon, label, collapsed, badge,
}: { to: string; icon: React.ElementType; label: string; collapsed: boolean; badge?: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        color: isActive ? '#D4813A' : hovered ? '#E8A66A' : '#C4B5A3',
        background: isActive ? 'rgba(212,129,58,0.12)' : hovered ? 'rgba(212,129,58,0.08)' : 'transparent',
        position: 'relative',
        transition: 'background 0.15s, color 0.15s',
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span style={{
              position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
              width: 3, height: 20, background: '#D4813A', borderRadius: '0 4px 4px 0',
            }} />
          )}
          <span style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
            <Icon size={17} />
            {(badge ?? 0) > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -6,
                minWidth: 14, height: 14, borderRadius: 7,
                background: '#ef4444', color: '#fff',
                fontSize: 9, fontWeight: 800, lineHeight: '14px',
                textAlign: 'center', padding: '0 3px',
              }}>
                {badge! > 99 ? '99+' : badge}
              </span>
            )}
          </span>
          {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>}
          {!collapsed && (badge ?? 0) > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#ef4444',
              background: 'rgba(239,68,68,0.12)', borderRadius: 10,
              padding: '1px 6px', flexShrink: 0,
            }}>{badge}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

// ── Sidebar footer button (hover without DOM mutation) ───────────────────────
function SidebarFooterBtn({
  onClick, children, collapsed, title, hoverStyle, ...rest
}: {
  onClick: () => void; children: React.ReactNode; collapsed: boolean;
  title?: string; hoverStyle: React.CSSProperties;
  [key: string]: unknown;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        justifyContent: collapsed ? 'center' : undefined,
        width: '100%', padding: collapsed ? '10px 0' : '10px 12px',
        borderRadius: 10, border: 'none',
        background: hovered ? (hoverStyle.background as string) : 'transparent',
        color: hovered ? (hoverStyle.color as string) : '#C4B5A3',
        fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background 0.15s, color 0.15s',
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────
interface LayoutProps {
  user: StaffUser;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ user, onLogout, children, onSearch }: LayoutProps & { onSearch?: () => void }) {
  const width = useWindowWidth();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [audioOn, setAudioOn] = useState(isAudioEnabled);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('bg_theme') === 'dark');
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const drawerRef = useRef<HTMLDivElement>(null);

  const toggleAudio = () => {
    const next = !audioOn;
    setAudioEnabled(next);
    setAudioOn(next);
  };

  // Apply dark mode to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('bg_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const h = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [notifOpen]);

  // Fetch low-stock count once on mount (refresh every 5 min)
  useEffect(() => {
    const fetch = () => {
      fetchLowStockItems()
        .then((r) => setLowStockCount((r.data ?? []).length))
        .catch(() => { /* non-blocking */ });
    };
    fetch();
    const t = setInterval(fetch, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

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

  // ── Collapsible sidebar groups ─────────────────────────────────────────────
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('bg_nav_open_groups');
      if (saved) return new Set<string>(JSON.parse(saved));
    } catch { /* ignore */ }
    const activeGroup = NAV_GROUPS.find((g) =>
      g.items.some((i) => location.pathname.startsWith(i.to))
    );
    return new Set<string>(activeGroup ? [activeGroup.id] : ['service']);
  });

  // Auto-open group when navigating to a page inside it
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((g) =>
      g.items.some((i) => location.pathname.startsWith(i.to))
    );
    if (activeGroup) {
      setOpenGroups((prev) => {
        if (prev.has(activeGroup.id)) return prev;
        const next = new Set(prev);
        next.add(activeGroup.id);
        return next;
      });
    }
  }, [location.pathname]);

  // Persist open groups
  useEffect(() => {
    try {
      localStorage.setItem('bg_nav_open_groups', JSON.stringify([...openGroups]));
    } catch { /* ignore */ }
  }, [openGroups]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentPage = ALL_NAV_ITEMS.find((i) => location.pathname.startsWith(i.to))?.label ?? 'Admin';
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
              width: 44, height: 44, borderRadius: 10,
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
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
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
                      <div className="more-drawer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
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

                {/* My account + Logout */}
                <button
                  type="button"
                  onClick={() => { setMoreOpen(false); navigate('/account'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: 16, borderRadius: 12,
                    border: '1px solid #E8E0D8', background: '#fff',
                    color: '#3D2B1F', fontWeight: 600, fontSize: 14,
                    cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8,
                  }}
                >
                  <UserCircle size={18} />
                  My Account
                </button>
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
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => can(user, item.permission));
            if (visibleItems.length === 0) return null;
            const isOpen = collapsed || openGroups.has(group.id);
            const hasActive = group.items.some((i) => location.pathname.startsWith(i.to));
            return (
              <div key={group.id} style={{ marginBottom: 4 }}>
                {/* Group header — clickable only in expanded sidebar */}
                {!collapsed ? (
                  <button
                    onClick={() => toggleGroup(group.id)}
                    style={{
                      display: 'flex', alignItems: 'center',
                      width: '100%', padding: '5px 12px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: hasActive ? 'rgba(212,129,58,0.7)' : 'rgba(255,255,255,0.32)',
                      fontFamily: 'inherit',
                      transition: 'color 0.15s',
                    }}
                  >
                    <span style={{ flex: 1, textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>
                      {group.label}
                    </span>
                    <ChevronDown
                      size={11}
                      style={{
                        transform: openGroups.has(group.id) ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                      }}
                    />
                  </button>
                ) : (
                  /* Thin divider between groups in icon-only mode */
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 8px' }} />
                )}

                {/* Items — animated open/close */}
                <div style={{
                  overflow: 'hidden',
                  maxHeight: isOpen ? '600px' : '0px',
                  transition: 'max-height 0.22s ease',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {visibleItems.map(({ to, icon, label }) => (
                    <SideNavItem
                      key={to} to={to} icon={icon} label={label} collapsed={collapsed}
                      badge={to === '/inventory' && lowStockCount > 0 ? lowStockCount : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User + Logout + Collapse */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: 8, flexShrink: 0 }}>
          {!collapsed && (
            <button
              type="button"
              onClick={() => navigate('/account')}
              title="My account preferences"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 12px', marginBottom: 4,
                border: 'none', borderRadius: 8, background: 'transparent',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(212,129,58,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#D4813A', fontWeight: 700, fontSize: 11, flexShrink: 0,
              }}>
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ color: '#fff', fontSize: 12, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name}
                </p>
                <p style={{ color: '#C4B5A3', fontSize: 10, margin: 0, textTransform: 'capitalize' }}>{user.role}</p>
              </div>
            </button>
          )}
          {collapsed && (
            <SidebarFooterBtn
              onClick={() => navigate('/account')}
              title="My account"
              collapsed={collapsed}
              hoverStyle={{ background: 'rgba(212,129,58,0.1)', color: '#E8A66A' }}
            >
              <UserCircle size={16} style={{ flexShrink: 0 }} />
            </SidebarFooterBtn>
          )}
          <SidebarFooterBtn
            onClick={onLogout}
            title={collapsed ? 'Log out' : undefined}
            collapsed={collapsed}
            hoverStyle={{ background: 'rgba(220,38,38,0.15)', color: '#f87171' }}
          >
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {!collapsed && 'Log out'}
          </SidebarFooterBtn>
          {/* Collapse toggle — inside sidebar, no floating button */}
          <SidebarFooterBtn
            onClick={() => setCollapsed((c) => !c)}
            collapsed={collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            hoverStyle={{ background: 'rgba(212,129,58,0.1)', color: '#E8A66A' }}
          >
            {collapsed ? <ChevronRight size={16} style={{ flexShrink: 0 }} /> : <ChevronLeft size={16} style={{ flexShrink: 0 }} />}
            {!collapsed && <span style={{ fontSize: 12 }}>Collapse</span>}
          </SidebarFooterBtn>
        </div>
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
          {/* Breadcrumb */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: '#C4B5A3', fontWeight: 500, whiteSpace: 'nowrap' }}>Bake &amp; Grill</span>
            <ChevronRight size={12} style={{ color: '#C4B5A3', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1408', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentPage}
            </span>
          </div>
          {/* Search trigger */}
          {onSearch && (
            <button
              onClick={onSearch}
              title="Search (Ctrl+K)"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 10,
                border: '1px solid #E8E0D8', background: '#F8F6F3',
                cursor: 'pointer', color: '#9C8E7E', fontSize: 12,
                fontFamily: 'inherit', flexShrink: 0,
                transition: 'border-color 0.15s',
              }}
            >
              <Search size={14} />
              <span style={{ color: '#C4B5A3' }}>Search…</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#C4B5A3', background: '#E8E0D8', borderRadius: 4, padding: '1px 5px' }}>⌘K</span>
            </button>
          )}
          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode((d) => !d)}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              border: '1px solid #E8E0D8', background: darkMode ? '#1C1910' : '#F8F6F3',
              cursor: 'pointer', color: darkMode ? '#D4813A' : '#6B5D4F',
              transition: 'all 0.15s',
            }}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Audio alert toggle */}
          <button
            onClick={toggleAudio}
            title={audioOn ? 'Sound alerts ON — click to mute' : 'Sound alerts OFF — click to enable'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              border: '1px solid #E8E0D8',
              background: audioOn ? 'rgba(212,129,58,0.08)' : '#F8F6F3',
              cursor: 'pointer',
              color: audioOn ? '#D4813A' : '#C4B5A3',
              transition: 'all 0.15s',
            }}
          >
            {audioOn ? <Bell size={16} /> : <BellOff size={16} />}
          </button>

          {/* Notification center */}
          <div ref={notifRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => { setNotifOpen((o) => !o); if (!notifOpen) markAllRead(); }}
              title="Notifications"
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 10,
                border: '1px solid #E8E0D8', background: notifOpen ? 'rgba(212,129,58,0.08)' : '#F8F6F3',
                cursor: 'pointer', color: notifications.length > 0 ? '#D4813A' : '#C4B5A3',
                transition: 'all 0.15s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: '#ef4444', color: '#fff',
                  fontSize: 9, fontWeight: 800, lineHeight: '16px', textAlign: 'center', padding: '0 3px',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div style={{
                position: 'absolute', top: 42, right: 0, width: 320,
                background: '#fff', border: '1px solid #E8E0D8', borderRadius: 14,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 60, overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #F0EAE3' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1408', flex: 1 }}>Notifications</span>
                  {notifications.length > 0 && (
                    <button onClick={clearAll} style={{ fontSize: 11, color: '#9C8E7E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Clear all
                    </button>
                  )}
                  <button onClick={() => setNotifOpen(false)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#9C8E7E', display: 'flex' }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9C8E7E', fontSize: 13 }}>
                      No notifications yet
                    </div>
                  ) : notifications.map((n) => {
                    const iconMap: Record<string, string> = { order: '🛒', stock: '📦', info: 'ℹ️', warning: '⚠️' };
                    return (
                      <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F8F4F0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{iconMap[n.type] ?? 'ℹ️'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1C1408' }}>{n.title}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B5D4F' }}>{n.body}</p>
                          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#C4B5A3' }}>
                            {new Date(n.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* User pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderRadius: 10,
            background: '#F8F6F3', border: '1px solid #E8E0D8',
            flexShrink: 0,
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
