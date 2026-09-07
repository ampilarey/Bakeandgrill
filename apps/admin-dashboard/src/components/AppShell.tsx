import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import type { StaffUser } from '../api';
import { fetchLowStockItems } from '../api';
import {
  Bell, BellOff, ChevronLeft, ChevronRight, Moon, Search, Sun, UserCircle, X,
} from 'lucide-react';
import { isAudioEnabled, setAudioEnabled } from '../utils/audio';
import { useNotifications, markAllRead, clearAll } from '../utils/notifications';
import {
  getActiveSection,
  getAllNavItems,
  getFirstPermittedItem,
  getPermittedSections,
  getSectionById,
  LogOut,
  resolveNavItemForPath,
  type NavGroup,
} from './navConfig';
import { SectionBar, rememberSectionPath } from './SectionBar';
import { SectionRail } from './SectionRail';
import { MobileTabBar } from './MobileTabBar';
import { MobileSectionSheet } from './MobileSectionSheet';
import { SystemHealthBanner } from './SystemHealthBanner';

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

/** Where the open panel sits, in viewport coordinates. */
type PanelBox = { top: number; left: number; width: number; maxHeight: number };

/**
 * Owner, 2026-09-07, from a phone: "There is problem with mobile view. Check
 * notifications."
 *
 * The panel used to be an absolutely-positioned child of the header, and the
 * mobile header carries `overflow-x: clip` to stop wide chrome from widening
 * the document. Current Chromium leaves the other axis visible, but Safari
 * and older Android browsers resolve `clip` next to `visible` by clipping
 * both — so the panel was cut off at the header's 56px edge and all anyone
 * saw was an 8px sliver of its top border. Every admin page has this header,
 * so it looked broken everywhere.
 *
 * It is now placed in a portal on `document.body` at fixed coordinates
 * measured from the bell. No ancestor's overflow can reach it, in any
 * browser, and it stays on screen on a narrow phone.
 */
function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<PanelBox | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount } = useNotifications();

  /** Anchor under the bell, right-aligned, but never off either edge. */
  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(320, Math.max(240, vw - margin * 2));
    const left = Math.max(margin, Math.min(b.right - width, vw - margin - width));
    const top = b.bottom + 8;
    setBox({ top: Math.round(top), left: Math.round(left), width: Math.round(width), maxHeight: Math.max(160, Math.round(vh - top - margin)) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onPointer = (e: Event) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // The bell moves with the sticky header, so follow scroll and resize.
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  const panel = (
    <div
      ref={panelRef}
      className="admin-shell-notif-dropdown"
      role="dialog"
      aria-label="Notifications"
      style={box ? { top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight } : undefined}
    >
      <div className="admin-shell-notif-dropdown-header">
        <span>Notifications</span>
        {notifications.length > 0 && (
          <button type="button" onClick={clearAll} className="admin-shell-link-btn">Clear all</button>
        )}
        <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="admin-shell-icon-btn admin-shell-icon-btn--tiny">
          <X size={14} />
        </button>
      </div>
      <div className="admin-shell-notif-list">
        {notifications.length === 0 ? (
          <div className="admin-shell-notif-empty">No notifications yet</div>
        ) : notifications.map((n) => {
          const iconMap: Record<string, string> = { order: '🛒', stock: '📦', info: 'ℹ️', warning: '⚠️' };
          return (
            <div key={n.id} className="admin-shell-notif-row">
              <span aria-hidden>{iconMap[n.type] ?? 'ℹ️'}</span>
              <div>
                <p className="admin-shell-notif-title">{n.title}</p>
                <p className="admin-shell-notif-body">{n.body}</p>
                <p className="admin-shell-notif-time">{formatNotifTime(n.ts)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="admin-shell-notif-wrap">
      <button
        ref={btnRef}
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) markAllRead(); }}
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={open}
        className={`admin-shell-icon-btn${open ? ' admin-shell-icon-btn--active' : ''}`}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="admin-shell-notif-dot">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(panel, document.body)}
    </div>
  );
}

interface AppShellProps {
  user: StaffUser;
  onLogout: () => void;
  /** Revoke every token this account holds — for a lost or stolen device. */
  onLogoutEverywhere?: () => void;
  children: React.ReactNode;
  onSearch?: () => void;
}

/** Two-level admin shell: top section tabs + left rail (desktop) / bottom tabs + sheet (mobile). */
export function AppShell({ user, onLogout, onLogoutEverywhere, children, onSearch }: AppShellProps) {
  const band = useViewportBand();
  const isMobile = band === 'mobile';
  const [collapsed, setCollapsed] = useState(() => readPersistedCollapsed());
  const viewportBandRef = useRef<ViewportBand>(band);
  const [sheetSection, setSheetSection] = useState<NavGroup | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [audioOn, setAudioOn] = useState(isAudioEnabled);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('bg_theme') === 'dark');
  const location = useLocation();
  const navigate = useNavigate();

  const allNavItems = useMemo(() => getAllNavItems(), []);
  const permittedSections = useMemo(() => getPermittedSections(user), [user]);
  const routeSection = getActiveSection(location.pathname);
  const activeSection = routeSection
    ?? permittedSections[0]
    ?? getSectionById('monitor');

  useEffect(() => {
    if (routeSection) {
      const match = resolveNavItemForPath(location.pathname, routeSection.items);
      if (match) rememberSectionPath(routeSection.id, match.to);
    }
  }, [location.pathname, location.search, routeSection]);

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

  useEffect(() => { setSheetSection(null); }, [location.pathname, location.search]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  const toggleAudio = () => {
    const next = !audioOn;
    setAudioEnabled(next);
    setAudioOn(next);
  };

  const currentPage = resolveNavItemForPath(location.pathname, allNavItems)?.label ?? 'Admin';
  const sectionLabel = activeSection?.label ?? 'Admin';
  const railW = collapsed ? 68 : 220;

  const openSectionSheet = (section: NavGroup) => {
    // Always open the page list first. Navigating here would change pathname and
    // the effect below would close the sheet before the user sees other pages.
    setSheetSection(section);
  };

  const headerControls = (
    <>
      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          title={`Search (${SEARCH_SHORTCUT})`}
          className="admin-shell-search-btn"
        >
          <Search size={14} />
          <span className="admin-shell-search-label">Search…</span>
          <kbd className="admin-shell-kbd">{SEARCH_SHORTCUT}</kbd>
        </button>
      )}
      {/* On a narrow phone these two move into the section sheet, next to
          Log Out, so the page title keeps its room. See .admin-shell-icon-btn--secondary. */}
      <button
        type="button"
        onClick={() => setDarkMode((d) => !d)}
        title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`admin-shell-icon-btn admin-shell-icon-btn--secondary${darkMode ? ' admin-shell-icon-btn--active' : ''}`}
      >
        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <button
        type="button"
        onClick={toggleAudio}
        title={audioOn ? 'Sound alerts ON — click to mute' : 'Sound alerts OFF — click to enable'}
        className={`admin-shell-icon-btn admin-shell-icon-btn--secondary${audioOn ? ' admin-shell-icon-btn--active' : ''}`}
      >
        {audioOn ? <Bell size={16} /> : <BellOff size={16} />}
      </button>
      <NotificationsBell />
    </>
  );

  if (isMobile) {
    return (
      <div className="admin-mobile-shell admin-shell-root">
        <header className="admin-mobile-header admin-shell-mobile-top">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            aria-label="Go to dashboard"
            className="admin-shell-brand-btn"
          >
            <img src="/logo.png" alt="Bake & Grill" width={32} height={32} />
          </button>
          <div className="admin-shell-mobile-titles">
            <span className="admin-shell-mobile-section">{sectionLabel}</span>
            <span className="admin-shell-mobile-page">{currentPage}</span>
          </div>
          {headerControls}
          <div className="admin-shell-avatar" aria-hidden>
            {user.name?.charAt(0).toUpperCase()}
          </div>
        </header>

        <SystemHealthBanner />

        <main className="admin-shell-main admin-shell-main--mobile">
          {children}
        </main>

        <MobileTabBar
          user={user}
          sheetSectionId={sheetSection?.id ?? null}
          onSelectSection={openSectionSheet}
        />

        {sheetSection && (
          <MobileSectionSheet
            section={sheetSection}
            user={user}
            open
            onClose={() => setSheetSection(null)}
            onLogout={onLogout}
            lowStockCount={lowStockCount}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            audioOn={audioOn}
            onToggleAudio={toggleAudio}
          />
        )}
      </div>
    );
  }

  return (
    <div className="admin-shell admin-shell-root admin-shell-root--desktop">
      <header className="admin-shell-topbar">
        <button
          type="button"
          onClick={() => navigate(getFirstPermittedItem(permittedSections[0] ?? activeSection!, user)?.to ?? '/dashboard')}
          className="admin-shell-brand"
          aria-label="Bake & Grill Admin home"
        >
          <img src="/logo.png" alt="" width={32} height={32} />
          <span>Bake &amp; Grill</span>
        </button>

        <SectionBar user={user} activeSectionId={activeSection?.id} />

        <div className="admin-shell-topbar-actions">
          {headerControls}
          <div className="admin-shell-user-chip">
            <div className="admin-shell-avatar">{user.name?.charAt(0).toUpperCase()}</div>
            <span className="admin-shell-user-name">{user.name}</span>
            <span className="admin-shell-user-role">· {user.role}</span>
          </div>
        </div>
      </header>

      <div className="admin-shell-body">
        <aside
          className={`admin-shell-rail sidebar-transition${collapsed ? ' admin-shell-rail--collapsed' : ''}`}
          style={{ width: railW }}
        >
          <div className="admin-shell-rail-label">
            {!collapsed && <span>{activeSection?.label}</span>}
          </div>
          {activeSection && (
            <SectionRail
              section={activeSection}
              user={user}
              collapsed={collapsed}
              lowStockCount={lowStockCount}
            />
          )}
          <div className="admin-sidebar-footer admin-shell-rail-footer">
            {!collapsed ? (
              <button type="button" className="admin-shell-rail-account" onClick={() => navigate('/account')}>
                <div className="admin-shell-avatar">{user.name?.charAt(0).toUpperCase()}</div>
                <div>
                  <p>{user.name}</p>
                  <p className="admin-shell-user-role">{user.role}</p>
                </div>
              </button>
            ) : (
              <button type="button" className="admin-sidebar-footer-btn admin-sidebar-footer-btn--collapsed" onClick={() => navigate('/account')} title="My account">
                <UserCircle size={16} />
              </button>
            )}
            <button
              type="button"
              className={`admin-sidebar-footer-btn admin-sidebar-footer-btn--danger${collapsed ? ' admin-sidebar-footer-btn--collapsed' : ''}`}
              onClick={onLogout}
              title={collapsed ? 'Log out' : undefined}
            >
              <LogOut size={16} />
              {!collapsed && 'Log out'}
            </button>
            {onLogoutEverywhere && !collapsed ? (
              <button
                type="button"
                className="admin-sidebar-footer-btn admin-sidebar-footer-btn--danger"
                data-testid="admin-logout-everywhere"
                onClick={onLogoutEverywhere}
                title="Sign out on every device signed in as you"
              >
                <LogOut size={16} />
                Log out everywhere
              </button>
            ) : null}
            <button
              type="button"
              className={`admin-sidebar-footer-btn${collapsed ? ' admin-sidebar-footer-btn--collapsed' : ''}`}
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </aside>

        <div className="admin-main admin-shell-content" style={{ marginLeft: railW }}>
          <SystemHealthBanner />
          <main className="admin-shell-main">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer AppShell — Layout kept as alias for existing imports. */
export const Layout = AppShell;

export {
  Spinner, Card, Badge, ErrorMsg, EmptyState, PageShell, PageHeader, Btn, Input, Select, statColor,
  Modal, ModalActions, StatCard, TableCard, TH, TD, DateInput, SectionLabel, Pagination,
  ConfirmDialog, useConfirmDialog, TableSkeleton, TableStateBar, ScrollX, ResponsiveTable, Toolbar,
} from './SharedUI';
