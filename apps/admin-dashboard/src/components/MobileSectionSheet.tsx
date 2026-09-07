import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, BellOff, LogOut, Moon, Sun, UserCircle, X } from 'lucide-react';
import type { StaffUser } from '../api';
import {
  NAV_EXACT_MATCH_PATHS,
  canNavItem,
  navItemPathname,
  type NavGroup,
} from './navConfig';
import { rememberSectionPath } from './SectionBar';
import { useDialogChrome } from './SharedUI';

interface MobileSectionSheetProps {
  section: NavGroup;
  user: StaffUser;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  lowStockCount?: number;
  /* Header controls that do not fit beside the page title on a narrow phone. */
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  audioOn?: boolean;
  onToggleAudio?: () => void;
}

/*
 * The gate is separate so the panel below can call `useDialogChrome`
 * unconditionally — a hook cannot sit after an `if (!open) return null`.
 */
export function MobileSectionSheet(props: MobileSectionSheetProps) {
  if (!props.open) return null;

  return <SectionSheetPanel {...props} />;
}

function SectionSheetPanel({
  section, user, onClose, onLogout, lowStockCount = 0,
  darkMode = false, onToggleDarkMode, audioOn = false, onToggleAudio,
}: MobileSectionSheetProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const visible = section.items.filter((item) => canNavItem(user, item));

  // Was a hand-rolled Escape handler and scroll lock; the shared hook adds the
  // focus trap and focus restore this sheet did not have (audit A3).
  useDialogChrome(onClose, panelRef, closeRef);

  const SectionIcon = section.icon;

  return createPortal(
    <div className="admin-mobile-drawer-overlay">
      <div className="admin-mobile-drawer-backdrop overlay-enter" onClick={onClose} />
      <div
        ref={panelRef}
        className="admin-mobile-drawer-panel admin-shell-section-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${section.label} pages`}
      >
        <div className="admin-shell-section-sheet-header">
          <div className="admin-shell-section-sheet-title">
            <SectionIcon size={16} />
            <span>{section.label}</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close section menu"
            className="admin-shell-icon-btn"
          >
            <X size={16} />
          </button>
        </div>

        <div className="admin-shell-section-sheet-body">
          <div className="more-drawer-grid admin-shell-section-sheet-grid">
            {visible.map(({ to, icon: Icon, label }) => {
              const path = navItemPathname(to);
              const pathOk = NAV_EXACT_MATCH_PATHS.has(path)
                ? location.pathname === path
                : location.pathname === path || location.pathname.startsWith(path + '/');
              let isActive = pathOk;
              if (to.includes('?')) {
                const want = new URLSearchParams(to.split('?')[1]);
                const have = new URLSearchParams(location.search.startsWith('?') ? location.search.slice(1) : location.search);
                isActive = pathOk && [...want.entries()].every(([k, v]) => have.get(k) === v);
              }
              const badge = path === '/inventory' && lowStockCount > 0 ? lowStockCount : undefined;
              return (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => {
                    rememberSectionPath(section.id, to);
                    onClose();
                  }}
                  className={`admin-mobile-drawer-tile${isActive ? ' admin-mobile-drawer-tile--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="admin-shell-rail-icon-wrap">
                    <Icon size={22} />
                    {(badge ?? 0) > 0 && (
                      <span className="admin-nav-icon-badge">{badge! > 99 ? '99+' : badge}</span>
                    )}
                  </span>
                  <span>{label}</span>
                </NavLink>
              );
            })}
          </div>

          {(onToggleDarkMode || onToggleAudio) && (
            <div className="admin-shell-sheet-prefs">
              {onToggleDarkMode && (
                <button type="button" className="admin-shell-sheet-pref" onClick={onToggleDarkMode} aria-pressed={darkMode}>
                  {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                  {darkMode ? 'Light mode' : 'Dark mode'}
                </button>
              )}
              {onToggleAudio && (
                <button type="button" className="admin-shell-sheet-pref" onClick={onToggleAudio} aria-pressed={audioOn}>
                  {audioOn ? <Bell size={18} /> : <BellOff size={18} />}
                  {audioOn ? 'Sound alerts on' : 'Sound alerts off'}
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            className="admin-shell-sheet-account"
            onClick={() => { onClose(); navigate('/account'); }}
          >
            <UserCircle size={18} />
            My Account
          </button>
          <button
            type="button"
            className="admin-shell-sheet-logout"
            onClick={() => { onClose(); onLogout(); }}
          >
            <LogOut size={18} />
            Log Out
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
