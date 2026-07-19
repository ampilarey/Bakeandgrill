import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useActiveOrder } from '../../hooks/useActiveOrder';
import { SHELL_NAV_TABS } from './navTabs';

/**
 * 5-tab bottom navigation — phone only (≤767px).
 * Tablet/desktop use TopNav instead.
 * Active orders show a count next to the Orders label.
 */
export function BottomNav() {
  const { t } = useLanguage();
  const { hideNav } = useShellNav();
  const location = useLocation();
  const { activeOrderCount } = useActiveOrder();

  if (hideNav) return null;

  return (
    <nav className="bottom-nav" aria-label={t('nav.aria')}>
      {SHELL_NAV_TABS.map(({ to, labelKey, match, Icon, showActiveOrderBadge }) => {
        const active = match(location.pathname);
        const count = showActiveOrderBadge ? activeOrderCount : 0;
        return (
          <Link
            key={to}
            to={to}
            className={`bottom-nav__item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={
              count > 0
                ? `${t(labelKey)}, ${count} ${t('orders.active_badge')}`
                : undefined
            }
          >
            <span className="bottom-nav__icon" style={{ position: 'relative', display: 'flex' }}>
              <Icon size={24} />
            </span>
            <span className="bottom-nav__label">
              {t(labelKey)}
              {count > 0 && (
                <span className="bottom-nav__count" aria-hidden>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
