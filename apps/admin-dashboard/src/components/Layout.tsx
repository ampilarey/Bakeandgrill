import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { StaffUser } from '../api';
import { fetchLowStockItems } from '../api';
import { Bell, BellOff, ChevronDown, ChevronLeft, ChevronRight, Menu, Moon, Search, Sun, UserCircle, X } from 'lucide-react';
import { isAudioEnabled, setAudioEnabled } from '../utils/audio';
import { useNotifications, markAllRead, clearAll } from '../utils/notifications';
import {
  PINNED_NAV_ITEMS, getNavGroups, getAllNavItems, resolveNavItemForPath, BOTTOM_TABS, can, LogOut,
  NAV_EXACT_MATCH_PATHS,
  type NavItem,
} from './navConfig';

const SIDEBAR_COLLAPSED_KEY = 'bg_sidebar_collapsed';

type ViewportBand = 'mobile' | 'tablet' | 'desktop';

function getViewportBand(width: number): ViewportBand {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function readPersistedCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Re-renders only when the mobile/tablet/desktop band changes, not on every resize pixel. */
function useViewportBand(): ViewportBand {
  const [band, setBand] = useState<ViewportBand>(() => getViewportBand(window.innerWidth));
  useEffect(() => {
    const queries = [window.matchMedia('(max-width: 767px)'), window.matchMedia('(min-width: 1024px)')];
    const update = () => setBand(getViewportBand(window.innerWidth));
    queries.forEach((q) => q.addEventListener('change', update));
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, []);
  return band;
}

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const SEARCH_SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl+K';

/** "14:32" today, "Yesterday 14:32", else "12 Jun 14:32". */
function formatNotifTime(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

function isNavItemActive(pathname: string, to: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  if (NAV_EXACT_MATCH_PATHS.has(to)) return path === to;
  return path === to || path.startsWith(to + '/');
}

function getNavItemBadge(to: string, lowStockCount: number): number | undefined {
  if (to === '/inventory' && lowStockCount > 0) return lowStockCount;
  return undefined;
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
      end={NAV_EXACT_MATCH_PATHS.has(to)}
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

/** Bell + dropdown, self-contained so it can live in both the desktop and mobile headers. */
function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount } = useNotifications();

  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) markAllRead(); }}
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={open}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, borderRadius: 10,
          border: '1px solid var(--color-border)', background: open ? 'rgba(212,129,58,0.08)' : 'var(--color-bg)',
          cursor: 'pointer', color: notifications.length > 0 ? '#D4813A' : 'var(--color-text-muted)',
        }}
      >
        <Bell size={16} />
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

      {open && (
        <div style={{
          position: 'absolute', top: 42, right: 0,
          width: 'min(320px, calc(100vw - 24px))',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14,
          boxShadow: 'var(--shadow-lg)', zIndex: 'var(--z-dropdown)' as never, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border-light)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', flex: 1 }}>Notifications</span>
            {notifications.length > 0 && (
              <button onClick={clearAll} style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Clear all
              </button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Close notifications" style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}>
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
                      {formatNotifTime(n.ts)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
          badge={getNavItemBadge(to, lowStockCount)}
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
  const band = useViewportBand();
  const isMobile = band === 'mobile';
  const [collapsed, setCollapsed] = useState(() => readPersistedCollapsed());
  const viewportBandRef = useRef<ViewportBand>(band);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [audioOn, setAudioOn] = useState(isAudioEnabled);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('bg_theme') === 'dark');
  const location = useLocation();
  const navigate = useNavigate();
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = useRef<HTMLElement | null>(null);

  const navGroups = useMemo(() => getNavGroups(), []);
  const allNavItems = useMemo(() => getAllNavItems(), []);

  const groupBadges = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of navGroups) {
      const total = group.items
        .filter((item) => can(user, item.permission))
        .reduce((sum, item) => sum + (getNavItemBadge(item.to, lowStockCount) ?? 0), 0);
      if (total > 0) map.set(group.id, total);
    }
    return map;
  }, [navGroups, lowStockCount, user]);

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
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      fetchLowStockItems()
        .then((r) => setLowStockCount((r.data ?? []).length))
        .catch(() => { /* non-blocking */ });
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const prev = viewportBandRef.current;
    if (band === prev) return;
    viewportBandRef.current = band;

    if (band === 'tablet') {
      setCollapsed(true);
    } else if (band === 'desktop') {
      setCollapsed(readPersistedCollapsed());
    }
  }, [band]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  useEffect(() => {
    if (!isMobile) return;
    if (moreOpen) {
      drawerCloseRef.current?.focus();
      return;
    }
    moreTriggerRef.current?.focus();
  }, [moreOpen, isMobile]);

  useEffect(() => {
    if (!moreOpen || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [moreOpen, isMobile]);

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
    const activeGroup = navGroups.find((g) => {
      const visibleItems = g.items.filter((item) => can(user, item.permission));
      return visibleItems.some((i) => isNavItemActive(location.pathname, i.to));
    });
    if (activeGroup) {
      setOpenGroups((prev) => {
        if (prev.has(activeGroup.id)) return prev;
        const next = new Set(prev);
        next.add(activeGroup.id);
        return next;
      });
    }
  }, [location.pathname, navGroups, user]);

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

  const currentPage = resolveNavItemForPath(location.pathname, allNavItems)?.label ?? 'Admin';
  const openMoreDrawer = (trigger: HTMLElement) => {
    moreTriggerRef.current = trigger;
    setMoreOpen(true);
  };
  const closeDrawer = () => setMoreOpen(false);
  const sidebarW = collapsed ? 68 : 260;

  const renderMobileDrawer = () => (
    <>
      <div className="admin-mobile-drawer-backdrop overlay-enter" onClick={closeDrawer} />
      <div ref={drawerRef} className="admin-mobile-drawer-panel" role="dialog" aria-modal="true" aria-label="Navigation menu">
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
            ref={drawerCloseRef}
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
                  const isActive = isNavItemActive(location.pathname, to);
                  return (
                    <NavLink key={to} to={to} onClick={closeDrawer} className={`admin-mobile-drawer-tile${isActive ? ' admin-mobile-drawer-tile--active' : ''}`}>
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
                    const isActive = isNavItemActive(location.pathname, to);
                    return (
                      <NavLink key={to} to={to} onClick={closeDrawer} className={`admin-mobile-drawer-tile${isActive ? ' admin-mobile-drawer-tile--active' : ''}`}>
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
            onClick={(e) => openMoreDrawer(e.currentTarget)}
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
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            aria-label="Go to dashboard"
            style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', flexShrink: 0, display: 'flex' }}
          >
            <img src="/logo.png" alt="Bake & Grill" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
          </button>
          <span style={{ flex: 1, fontWeight: 700, color: 'var(--color-text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentPage}
          </span>
          <NotificationsBell />
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(212,129,58,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#D4813A', fontWeight: 700, fontSize: 12, flexShrink: 0,
          }}>
            {user.name?.charAt(0).toUpperCase()}
          </div>
        </header>

        <main style={{ flex: 1, padding: '16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))', overflowX: 'hidden' }}>
          {children}
        </main>

        <nav className="admin-mobile-bottom-nav">
          {BOTTOM_TABS.filter((item) => can(user, item.permission)).map(({ to, icon: Icon, label }) => {
            if (to === '#more') {
              return (
                <button
                  key="more"
                  onClick={(e) => openMoreDrawer(e.currentTarget)}
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
            const isActive = isNavItemActive(location.pathname, to);
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
          <div className="admin-mobile-drawer-overlay">
            {renderMobileDrawer()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar sidebar-transition" style={{ width: sidebarW }}>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          aria-label="Go to dashboard"
          className={`admin-sidebar-brand${collapsed ? ' admin-sidebar-brand--collapsed' : ''}`}
          style={{ border: 'none', background: 'transparent', width: '100%', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
        >
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
        </button>

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
            const groupOpen = openGroups.has(group.id);
            const isOpen = collapsed || groupOpen;
            const hasActive = visibleItems.some((i) => isNavItemActive(location.pathname, i.to));
            const GroupIcon = group.icon;
            const groupItemsId = `nav-group-${group.id}-items`;
            const groupBadge = groupBadges.get(group.id) ?? 0;

            return (
              <div key={group.id} className="admin-nav-group">
                {!collapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={`admin-nav-group-header${hasActive ? ' admin-nav-group-header--active' : ''}`}
                    aria-expanded={groupOpen}
                    aria-controls={groupItemsId}
                  >
                    <span className="admin-nav-group-icon"><GroupIcon size={13} /></span>
                    <span className="admin-nav-group-label">{group.label}</span>
                    {!groupOpen && groupBadge > 0 && (
                      <span className="admin-nav-badge">
                        {groupBadge > 99 ? '99+' : groupBadge}
                      </span>
                    )}
                    <ChevronDown
                      size={12}
                      className={`admin-nav-group-chevron${groupOpen ? '' : ' admin-nav-group-chevron--closed'}`}
                    />
                  </button>
                ) : (
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '6px 10px' }} />
                )}

                <div
                  id={groupItemsId}
                  className={[
                    'admin-nav-group-items',
                    isOpen ? 'admin-nav-group-items--open' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="admin-nav-group-items-inner">
                    {visibleItems.map(({ to, icon, label }) => (
                      <SideNavItem
                        key={to}
                        to={to}
                        icon={icon}
                        label={label}
                        collapsed={collapsed}
                        badge={getNavItemBadge(to, lowStockCount)}
                      />
                    ))}
                  </div>
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
            onClick={toggleCollapsed}
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
              title={`Search (${SEARCH_SHORTCUT})`}
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
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', background: 'var(--color-border)', borderRadius: 4, padding: '1px 5px' }}>{SEARCH_SHORTCUT}</span>
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

          <NotificationsBell />

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
  ConfirmDialog, useConfirmDialog, TableSkeleton, TableStateBar,
} from './SharedUI';
