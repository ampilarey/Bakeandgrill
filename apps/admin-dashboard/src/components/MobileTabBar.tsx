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

/**
 * An iPhone leaves a `position: fixed` bar where the keyboard's top edge was
 * once the keyboard closes (owner, 2026-11-23: the tab bar across the middle
 * of Labels after typing in a pop-up, worst in the home-screen app). The
 * screen has its full height back but Safari has not laid the bar out again,
 * so once nothing is being typed in, the bar is redrawn and the page nudged a
 * pixel and back, which makes Safari place fixed things afresh.
 */
export function settleFixedBar(el: HTMLElement | null) {
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
  if (el) {
    const was = el.style.display;
    el.style.display = 'none';
    void el.offsetHeight;
    el.style.display = was;
  }
  const y = window.scrollY;
  window.scrollTo(window.scrollX, y + 1);
  window.scrollTo(window.scrollX, y);
}

function useSettleAfterKeyboard(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    let timers: number[] = [];
    const soon = () => {
      timers.forEach((t) => window.clearTimeout(t));
      // Twice: straight after the keyboard starts to go, and once it has gone.
      timers = [120, 500].map((ms) => window.setTimeout(() => settleFixedBar(ref.current), ms));
    };
    const vv = window.visualViewport;
    document.addEventListener('focusout', soon);
    vv?.addEventListener('resize', soon);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      document.removeEventListener('focusout', soon);
      vv?.removeEventListener('resize', soon);
    };
  }, [ref]);
}

export function MobileTabBar({ user, onSelectSection, sheetSectionId }: MobileTabBarProps) {
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const sections = getPermittedSections(user);
  const routeSectionId = getActiveSection(location.pathname)?.id;
  const activeId = sheetSectionId ?? routeSectionId;
  useSettleAfterKeyboard(navRef);

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
