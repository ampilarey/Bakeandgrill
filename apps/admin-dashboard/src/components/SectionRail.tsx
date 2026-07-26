import { NavLink, useLocation } from 'react-router-dom';
import type { StaffUser } from '../api';
import {
  NAV_EXACT_MATCH_PATHS,
  canNavItem,
  navItemPathname,
  type NavGroup,
  type NavItem,
} from './navConfig';
import { rememberSectionPath } from './SectionBar';

function isNavItemActive(pathname: string, search: string, to: string): boolean {
  const [pathPart, queryPart] = to.split('?');
  const base = pathPart || '/';
  const path = pathname.replace(/\/$/, '') || '/';
  const pathOk = NAV_EXACT_MATCH_PATHS.has(base)
    ? path === base
    : path === base || path.startsWith(base + '/');
  if (!pathOk) return false;
  if (!queryPart) {
    // Bare /settings should not highlight when another ?tab= item is active
    if (base === '/settings' && new URLSearchParams(search).has('tab')) return false;
    // Bare /content should not highlight when a ?group= deep-link item is active
    if (base === '/content' && new URLSearchParams(search).has('group')) return false;
    return true;
  }
  const want = new URLSearchParams(queryPart);
  const have = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [k, v] of want.entries()) {
    if (have.get(k) !== v) return false;
  }
  return true;
}

export function getNavItemBadge(to: string, lowStockCount: number): number | undefined {
  if (navItemPathname(to) === '/inventory' && lowStockCount > 0) return lowStockCount;
  return undefined;
}

interface SectionRailProps {
  section: NavGroup;
  user: StaffUser;
  collapsed: boolean;
  lowStockCount: number;
}

export function SectionRail({ section, user, collapsed, lowStockCount }: SectionRailProps) {
  const location = useLocation();
  const visible = section.items.filter((item) => canNavItem(user, item));

  return (
    <nav
      id={`section-rail-${section.id}`}
      className={`admin-shell-rail-nav${collapsed ? ' admin-shell-rail-nav--collapsed' : ''}`}
      aria-label={`${section.label} pages`}
    >
      {visible.map((item) => (
        <RailItem
          key={item.to}
          item={item}
          sectionId={section.id}
          collapsed={collapsed}
          badge={getNavItemBadge(item.to, lowStockCount)}
          active={isNavItemActive(location.pathname, location.search, item.to)}
        />
      ))}
    </nav>
  );
}

function RailItem({
  item, sectionId, collapsed, badge, active,
}: {
  item: NavItem;
  sectionId: string;
  collapsed: boolean;
  badge?: number;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={[
        'admin-nav-item',
        active ? 'admin-nav-item--active' : '',
        collapsed ? 'admin-nav-item--collapsed' : '',
      ].filter(Boolean).join(' ')}
      end={NAV_EXACT_MATCH_PATHS.has(navItemPathname(item.to))}
      onClick={() => rememberSectionPath(sectionId, item.to)}
    >
      <span className="admin-shell-rail-icon-wrap">
        <Icon size={17} />
        {(badge ?? 0) > 0 && (
          <span className="admin-nav-icon-badge">
            {badge! > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {!collapsed && <span className="admin-nav-item-label">{item.label}</span>}
      {!collapsed && (badge ?? 0) > 0 && (
        <span className="admin-nav-badge">{badge}</span>
      )}
    </NavLink>
  );
}
