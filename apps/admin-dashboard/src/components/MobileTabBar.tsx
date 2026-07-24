import type { StaffUser } from '../api';
import { getActiveSection, getPermittedSections, type NavGroup } from './navConfig';
import { useLocation } from 'react-router-dom';

interface MobileTabBarProps {
  user: StaffUser;
  onSelectSection: (section: NavGroup) => void;
  /** When a section sheet is open, highlight that section instead of the route section. */
  sheetSectionId?: string | null;
}

export function MobileTabBar({ user, onSelectSection, sheetSectionId }: MobileTabBarProps) {
  const location = useLocation();
  const sections = getPermittedSections(user);
  const routeSectionId = getActiveSection(location.pathname)?.id;
  const activeId = sheetSectionId ?? routeSectionId;

  return (
    <nav className="admin-shell-mobile-tabs" role="navigation" aria-label="Admin sections">
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
