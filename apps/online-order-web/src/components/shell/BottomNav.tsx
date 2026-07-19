import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useActiveOrder } from '../../hooks/useActiveOrder';
import { SHELL_NAV_TABS } from './navTabs';

/**
 * 5-tab bottom navigation — phone only (≤767px).
 * Tablet/desktop use TopNav instead.
 */
export function BottomNav() {
  const { t } = useLanguage();
  const { hideNav } = useShellNav();
  const location = useLocation();
  const { hasActiveOrder } = useActiveOrder();

  if (hideNav) return null;

  return (
    <nav className="bottom-nav" aria-label={t('nav.aria')}>
      {SHELL_NAV_TABS.map(({ to, labelKey, match, Icon, showActiveOrderBadge }) => {
        const active = match(location.pathname);
        const badge = showActiveOrderBadge && hasActiveOrder;
        return (
          <Link
            key={to}
            to={to}
            className={`bottom-nav__item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="bottom-nav__icon" style={{ position: 'relative', display: 'flex' }}>
              <Icon size={24} />
              {badge && (
                <span
                  className="bottom-nav__badge"
                  aria-label={t('orders.active_badge')}
                />
              )}
            </span>
            <span>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
