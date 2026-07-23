import { useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, UserCircle, X } from 'lucide-react';
import type { StaffUser } from '../api';
import {
  NAV_EXACT_MATCH_PATHS,
  canNavItem,
  navItemPathname,
  type NavGroup,
} from './navConfig';
import { rememberSectionPath } from './SectionBar';

interface MobileSectionSheetProps {
  section: NavGroup;
  user: StaffUser;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  lowStockCount?: number;
}

export function MobileSectionSheet({
  section, user, open, onClose, onLogout, lowStockCount = 0,
}: MobileSectionSheetProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const visible = section.items.filter((item) => canNavItem(user, item));

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const SectionIcon = section.icon;

  return (
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
    </div>
  );
}
