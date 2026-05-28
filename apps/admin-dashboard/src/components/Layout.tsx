import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { StaffUser } from '../api';
import { fetchLowStockItems } from '../api';
import { Bell, BellOff, ChevronDown, ChevronLeft, ChevronRight, Menu, Moon, Search, Sun, UserCircle, X } from 'lucide-react';
import { isAudioEnabled, setAudioEnabled } from '../utils/audio';
import { useNotifications, markAllRead, clearAll } from '../utils/notifications';
import {
  PINNED_NAV_ITEMS, getNavGroups, getAllNavItems, BOTTOM_TABS, can, LogOut,
  type NavItem,
} from './navConfig';

function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}

function SideNavItem({
  to, icon: Icon, label, collapsed, badge,
}: { to: string; icon: React.ElementType; label: string; collapsed: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        [
          'admin-nav-item',
          isActive ? 'admin-nav-item--active' : '',
          collapsed ? 'admin-nav-item--collapsed' : '',
        ].filter(Boolean).join(' ')
      }
    >
      <span style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
        <Icon size={17} />
        {(badge ?? 0) > 0 && (
          <span className="admin-nav-icon-badge">
            {badge! > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {!collapsed && <span className="admin-nav-item-label">{label}</span>}
      {!collapsed && (badge ?? 0) > 0 && (
        <span className="admin-nav-badge">{badge}</span>
      )}
    </NavLink>
  );
}

function SidebarFooterBtn({
  onClick, children, collapsed, title, danger, ...rest
}: {
  onClick: () => void; children: React.ReactNode; collapsed: boolean;
  title?: string; danger?: boolean;
  [key: string]: unknown;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        'admin-sidebar-footer-btn',
        collapsed ? 'admin-sidebar-footer-btn--collapsed' : '',
        danger ? 'admin-sidebar-footer-btn--danger' : '',
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

function NavSection({
  items, user, collapsed, lowStockCount,
}: {
  items: NavItem[];
  user: StaffUser;
  collapsed: boolean;
  lowStockCount: number;
}) {
  const visible = items.filter((item) => can(user, item.permission));
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map(({ to, icon, label }) => (
        <SideNavItem
          key={to}
          to={to}
          icon={icon}
          label={label}
          collapsed={collapsed}
          badge={to === '/inventory' && lowStockCount > 0 ? lowStockCount : undefined}
        />
      ))}
    </>
  );
}

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

  const navGroups = getNavGroups();
  const allNavItems = getAllNavItems();

  const toggleAudio = () => {
    const next = !audioOn;
    setAudioEnabled(next);
    setAudioOn(next);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('bg_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (!notifOpen) return;
    const h = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [notifOpen]);

  useEffect(() => {
    const load = () => {
      fetchLowStockItems()
        .then((r) => setLowStockCount((r.data ?? []).length))
        .catch(() => { /* non-blocking */ });
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
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

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('bg_nav_open_groups');
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        return new Set(parsed.filter((id) => navGroups.some((g) => g.id === id)));
      }
    } catch { /* ignore */ }
    return new Set(['operations', 'customers']);
  });

  useEffect(() => {
    const activeGroup = navGroups.find((g) =>
      g.items.some((i) => location.pathname.startsWith(i.to)),
    );
    if (activeGroup) {
      setOpenGroups((prev) => {
        if (prev.has(activeGroup.id)) return prev;
        const next = new Set(prev);
        next.add(activeGroup.id);
        return next;
      });
    }
  }, [location.pathname, navGroups]);

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

  const currentPage = allNavItems.find((i) => location.pathname.startsWith(i.to))?.label ?? 'Admin';
  const sidebarW = collapsed ? 68 : 260;

  const renderMobileDrawer = () => (
    <>
      <div
        className="overlay-enter"
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40 }}
        onClick={() => setMoreOpen(false)}
      />
      <div
        ref={drawerRef}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 41,
          background: 'var(--color-surface)', borderRadius: '20px 20px 0 0',
          maxHeight: '85vh', overflowY: 'auto',
          animation: 'fade-in-up 0.2s ease both',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="" style={{ width: 32, height: 32, borderRadius: 8 }} />
            <div>
              <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)', margin: 0 }}>{user.name}</p>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0, textTransform: 'capitalize' }}>{user.role}</p>
            </div>
          </div>
          <button
            onClick={() => setMoreOpen(false)}
            aria-label="Close menu"
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none',
              background: 'var(--color-bg)', cursor: 'pointer', color: 'var(--color-text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {PINNED_NAV_ITEMS.filter((item) => can(user, item.permission)).length > 0 && (
            <div>
              <p className="admin-mobile-drawer-group-title">
                <Menu size={14} />
                Quick access
              </p>
              <div className="more-drawer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {PINNED_NAV_ITEMS.filter((item) => can(user, item.permission)).map(({ to, icon: Icon, label }) => {
                  const isActive = location.pathname.startsWith(to);
                  return (
                    <NavLink key={to} to={to} className={`admin-mobile-drawer-tile${isActive ? ' admin-mobile-drawer-tile--active' : ''}`}>
                      <Icon size={22} />
                      <span>{label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          )}

          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => can(user, item.permission));
            if (visibleItems.length === 0) return null;
            const GroupIcon = group.icon;
            return (
              <div key={group.id}>
                <p className="admin-mobile-drawer-group-title">
                  <GroupIcon size={14} />
                  {group.label}
                </p>
                <div className="more-drawer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {visibleItems.map(({ to, icon: Icon, label }) => {
                    const isActive = location.pathname.startsWith(to);
                    return (
                      <NavLink key={to} to={to} className={`admin-mobile-drawer-tile${isActive ? ' admin-mobile-drawer-tile--active' : ''}`}>
                        <Icon size={22} />
                        <span>{label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => { setMoreOpen(false); navigate('/account'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: 16, borderRadius: 12,
              border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              color: 'var(--color-text)', fontWeight: 600, fontSize: 14,
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
              border: '1px solid #fca5a5', background: 'var(--color-surface)',
              color: '#dc2626', fontWeight: 600, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <LogOut size={18} />
            Log Out
          </button>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className="admin-mobile-shell">
        <header className="admin-mobile-header">
          <button
            onClick={() => setMoreOpen(true)}
            style={{
              width: 44, height: 44, borderRadius: 10,
              border: 'none', background: 'var(--color-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--color-text-secondary)', flexShrink: 0,
            }}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <img src="/logo.png" alt="Bake & Grill" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
          <span style={{ flex: 1, fontWeight: 700, color: 'var(--color-text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

        <main style={{ flex: 1, padding: '16px', paddingBottom: 80, overflowX: 'hidden' }}>
          {children}
        </main>

        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
          height: 56, background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)',
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
                    cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'inherit',
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
                  color: isActive ? '#D4813A' : 'var(--color-text-muted)',
                }}
              >
                <Icon size={20} />
                <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
              </NavLink>
            );
          })}
        </nav>

        {moreOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
            {renderMobileDrawer()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar sidebar-transition" style={{ width: sidebarW }}>
        <div className={`admin-sidebar-brand${collapsed ? ' admin-sidebar-brand--collapsed' : ''}`}>
          <img
            src="/logo.png"
            alt="Bake & Grill"
            style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
          />
          {!collapsed && (
            <div>
              <p style={{ fontWeight: 700, color: '#fff', fontSize: 13, margin: 0, lineHeight: 1.3 }}>Bake &amp; Grill</p>
              <p style={{ color: 'var(--color-sidebar-text)', fontSize: 10, margin: 0 }}>Admin Panel</p>
            </div>
          )}
        </div>

        <nav className="admin-sidebar-nav">
          {!collapsed && PINNED_NAV_ITEMS.some((i) => can(user, i.permission)) && (
            <div className="admin-nav-pinned">
              <NavSection
                items={PINNED_NAV_ITEMS}
                user={user}
                collapsed={collapsed}
                lowStockCount={lowStockCount}
              />
            </div>
          )}

          {collapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
              <NavSection
                items={PINNED_NAV_ITEMS}
                user={user}
                collapsed={collapsed}
                lowStockCount={lowStockCount}
              />
            </div>
          )}

          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => can(user, item.permission));
            if (visibleItems.length === 0) return null;
            const isOpen = collapsed || openGroups.has(group.id);
            const hasActive = group.items.some((i) => location.pathname.startsWith(i.to));
            const GroupIcon = group.icon;

            return (
              <div key={group.id} className="admin-nav-group">
                {!collapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={`admin-nav-group-header${hasActive ? ' admin-nav-group-header--active' : ''}`}
                  >
                    <span className="admin-nav-group-icon"><GroupIcon size={13} /></span>
                    <span className="admin-nav-group-label">{group.label}</span>
                    <ChevronDown
                      size={12}
                      className={`admin-nav-group-chevron${openGroups.has(group.id) ? '' : ' admin-nav-group-chevron--closed'}`}
                    />
                  </button>
                ) : (
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '6px 10px' }} />
                )}

                <div
                  className="admin-nav-group-items"
                  style={{ maxHeight: isOpen ? '800px' : '0px' }}
                >
                  {visibleItems.map(({ to, icon, label }) => (
                    <SideNavItem
                      key={to}
                      to={to}
                      icon={icon}
                      label={label}
                      collapsed={collapsed}
                      badge={to === '/inventory' && lowStockCount > 0 ? lowStockCount : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
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
                <p style={{ color: 'var(--color-sidebar-text)', fontSize: 10, margin: 0, textTransform: 'capitalize' }}>{user.role}</p>
              </div>
            </button>
          )}
          {collapsed && (
            <SidebarFooterBtn onClick={() => navigate('/account')} title="My account" collapsed={collapsed}>
              <UserCircle size={16} style={{ flexShrink: 0 }} />
            </SidebarFooterBtn>
          )}
          <SidebarFooterBtn onClick={onLogout} title={collapsed ? 'Log out' : undefined} collapsed={collapsed} danger>
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {!collapsed && 'Log out'}
          </SidebarFooterBtn>
          <SidebarFooterBtn
            onClick={() => setCollapsed((c) => !c)}
            collapsed={collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} style={{ flexShrink: 0 }} /> : <ChevronLeft size={16} style={{ flexShrink: 0 }} />}
            {!collapsed && <span style={{ fontSize: 12 }}>Collapse</span>}
          </SidebarFooterBtn>
        </div>
      </aside>

      <div className="admin-main" style={{ marginLeft: sidebarW }}>
        <header className="admin-main-header">
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Bake &amp; Grill</span>
            <ChevronRight size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentPage}
            </span>
          </div>
          {onSearch && (
            <button
              onClick={onSearch}
              title="Search (Ctrl+K)"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 10,
                border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 12,
                fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              <Search size={14} />
              <span style={{ color: 'var(--color-text-muted)' }}>Search…</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', background: 'var(--color-border)', borderRadius: 4, padding: '1px 5px' }}>⌘K</span>
            </button>
          )}
          <button
            onClick={() => setDarkMode((d) => !d)}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              border: '1px solid var(--color-border)', background: darkMode ? '#1C1910' : 'var(--color-bg)',
              cursor: 'pointer', color: darkMode ? '#D4813A' : 'var(--color-text-secondary)',
            }}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={toggleAudio}
            title={audioOn ? 'Sound alerts ON — click to mute' : 'Sound alerts OFF — click to enable'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              border: '1px solid var(--color-border)',
              background: audioOn ? 'rgba(212,129,58,0.08)' : 'var(--color-bg)',
              cursor: 'pointer',
              color: audioOn ? '#D4813A' : 'var(--color-text-muted)',
            }}
          >
            {audioOn ? <Bell size={16} /> : <BellOff size={16} />}
          </button>

          <div ref={notifRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => { setNotifOpen((o) => !o); if (!notifOpen) markAllRead(); }}
              title="Notifications"
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 10,
                border: '1px solid var(--color-border)', background: notifOpen ? 'rgba(212,129,58,0.08)' : 'var(--color-bg)',
                cursor: 'pointer', color: notifications.length > 0 ? '#D4813A' : 'var(--color-text-muted)',
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
                background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14,
                boxShadow: 'var(--shadow-lg)', zIndex: 60, overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border-light)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', flex: 1 }}>Notifications</span>
                  {notifications.length > 0 && (
                    <button onClick={clearAll} style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Clear all
                    </button>
                  )}
                  <button onClick={() => setNotifOpen(false)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                      No notifications yet
                    </div>
                  ) : notifications.map((n) => {
                    const iconMap: Record<string, string> = { order: '🛒', stock: '📦', info: 'ℹ️', warning: '⚠️' };
                    return (
                      <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{iconMap[n.type] ?? 'ℹ️'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{n.title}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>{n.body}</p>
                          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
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

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderRadius: 10,
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
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
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{user.name}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>· {user.role}</span>
          </div>
        </header>

        <main style={{ flex: 1, padding: 24, overflowX: 'hidden' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

export {
  Spinner, Card, Badge, ErrorMsg, EmptyState, PageHeader, Btn, Input, Select, statColor,
  Modal, ModalActions, StatCard, TableCard, TH, TD, DateInput, SectionLabel, Pagination,
  ConfirmDialog, useConfirmDialog,
} from './SharedUI';
