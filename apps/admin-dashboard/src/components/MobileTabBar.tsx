import { useEffect, useRef } from 'react';
import type { StaffUser } from '../api';
import { getActiveSection, getPermittedSections, type NavGroup } from './navConfig';
import { useLocation } from 'react-router-dom';

/** Document-root CSS var — measured height of the fixed mobile tab bar. */
export const ADMIN_TABBAR_CSS_VAR = '--admin-tabbar-h';

interface MobileTabBarProps {
  user: StaffUser;
  onSelectSection: (section: NavGroup) => void;
  /** When a section sheet is open, highlight that section instead of the route section. */
  sheetSectionId?: string | null;
}

function publishTabbarHeight(el: HTMLElement) {
  const h = Math.ceil(el.getBoundingClientRect().height);
  if (h > 0) {
    document.documentElement.style.setProperty(ADMIN_TABBAR_CSS_VAR, `${h}px`);
  }
}

export function MobileTabBar({ user, onSelectSection, sheetSectionId }: MobileTabBarProps) {
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const sections = getPermittedSections(user);
  const routeSectionId = getActiveSection(location.pathname)?.id;
  const activeId = sheetSectionId ?? routeSectionId;

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    publishTabbarHeight(el);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        document.documentElement.style.removeProperty(ADMIN_TABBAR_CSS_VAR);
      };
    }

    const ro = new ResizeObserver(() => publishTabbarHeight(el));
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty(ADMIN_TABBAR_CSS_VAR);
    };
  }, []);

  return (
    <nav
      ref={navRef}
      className="admin-shell-mobile-tabs"
      role="navigation"
      aria-label="Admin sections"
      data-testid="admin-mobile-tabbar"
    >
      {sections.map((section) => {
        const Icon = section.icon;
        const selected = section.id === activeId;
        return (
          <button
            key={section.id}
            type="button"
            className={`admin-shell-mobile-tab${selected ? ' admin-shell-mobile-tab--active' : ''}`}
            aria-current={selected ? 'page' : undefined}
            aria-label={section.label}
            onClick={() => onSelectSection(section)}
          >
            <Icon size={20} aria-hidden />
            <span>{section.shortLabel ?? section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
