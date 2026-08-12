import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { usePageBlocks } from '../../context/PageBlocksContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useActiveOrder } from '../../hooks/useActiveOrder';
import { resolveBottomNavTabs } from './navTabs';

/**
 * 5-tab bottom navigation — phone only (≤767px).
 * Tablet/desktop use TopNav instead.
 * Active orders show a count badge on the Orders icon (top-right).
 */
export function BottomNav() {
  const { t } = useLanguage();
  const { hideNav } = useShellNav();
  const { blocks } = usePageBlocks();
  const location = useLocation();
  const { activeOrderCount } = useActiveOrder();
  const tabs = resolveBottomNavTabs(blocks);

  if (hideNav) return null;

  return (
    <nav className="bottom-nav" aria-label={t('nav.aria')}>
      {tabs.map(({ to, labelKey, match, Icon, showActiveOrderBadge, displayLabel }) => {
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
            <span className="bottom-nav__icon">
              <Icon size={24} />
              {count > 0 && (
                <span className="bottom-nav__count" aria-hidden>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span>{displayLabel ?? t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
