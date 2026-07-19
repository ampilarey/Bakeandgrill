import { Link, useLocation } from 'react-router-dom';
import { PrayerBar } from '../PrayerBar';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { useActiveOrder } from '../../hooks/useActiveOrder';
import { SHELL_NAV_TABS } from './navTabs';

/**
 * Tablet/desktop top bar — logo, text links, account, prayer strip.
 * Cart uses FloatingCartBar (logo FAB) when the cart has items.
 * Mounted only at ≥768px; BottomNav covers phone.
 */
export function TopNav() {
  const { t } = useLanguage();
  const { hideNav } = useShellNav();
  const { settings: s } = useSiteSettingsContext();
  const { isAuthenticated, customerName } = useAuth();
  const location = useLocation();
  const { hasActiveOrder } = useActiveOrder();

  if (hideNav) return null;

  const siteName = s.site_name || 'Bake & Grill';
  const logoSrc = s.logo || '/logo.png';
  const onAccount =
    location.pathname === '/account' || location.pathname.startsWith('/account/');

  const accountLabel = (() => {
    if (!isAuthenticated) return t('home.sign_in');
    if (customerName && !/^\d{6,}$/.test(customerName.replace(/[\s-]/g, ''))) {
      return customerName.split(/\s+/)[0];
    }
    return t('nav.account');
  })();

  return (
    <header className="top-nav">
      <div className="top-nav__inner">
        <Link
          to="/"
          className="top-nav__brand"
          aria-label={t('header.home_aria').replace('{name}', siteName)}
        >
          <img
            className="top-nav__logo"
            src={logoSrc}
            alt=""
            width={40}
            height={40}
            decoding="async"
          />
          <span className="top-nav__brand-name">{siteName}</span>
        </Link>

        <nav className="top-nav__links" aria-label={t('nav.aria')}>
          {SHELL_NAV_TABS.map(({ to, labelKey, match, showActiveOrderBadge }) => {
            const active = match(location.pathname);
            const badge = showActiveOrderBadge && hasActiveOrder;
            return (
              <Link
                key={to}
                to={to}
                className={`top-nav__link${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {t(labelKey)}
                {badge && (
                  <span
                    className="top-nav__link-badge"
                    aria-label={t('orders.active_badge')}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="top-nav__actions">
          <Link
            to="/account"
            className={`top-nav__account${onAccount ? ' is-active' : ''}`}
            aria-current={onAccount ? 'page' : undefined}
          >
            {accountLabel}
          </Link>
        </div>
      </div>
      <div className="top-nav__prayer">
        <PrayerBar />
      </div>
    </header>
  );
}
