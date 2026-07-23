import type { StaffUser } from '../api';
import { getActiveSection, getPermittedSections, type NavGroup } from './navConfig';
import { useLocation } from 'react-router-dom';

interface MobileTabBarProps {
  user: StaffUser;
  onSelectSection: (section: NavGroup) => void;
  sheetOpen?: boolean;
}

export function MobileTabBar({ user, onSelectSection, sheetOpen }: MobileTabBarProps) {
  const location = useLocation();
  const sections = getPermittedSections(user);
  const activeId = getActiveSection(location.pathname)?.id;

  return (
    <nav className="admin-shell-mobile-tabs" role="navigation" aria-label="Admin sections">
      {sections.map((section) => {
        const Icon = section.icon;
        const selected = section.id === activeId || (sheetOpen && section.id === activeId);
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
