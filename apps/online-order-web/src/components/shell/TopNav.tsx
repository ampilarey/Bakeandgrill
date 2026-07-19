import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { useActiveOrder } from '../../hooks/useActiveOrder';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { SHELL_NAV_TABS } from './navTabs';

/**
 * Tablet/desktop top bar — logo, text links, account, cart.
 * Mounted only at ≥768px; BottomNav covers phone.
 */
export function TopNav() {
  const { t } = useLanguage();
  const { hideNav, openCartSheet, cartSheetOpen } = useShellNav();
  const { settings: s } = useSiteSettingsContext();
  const { cart, cartTotal } = useCart();
  const { isAuthenticated, customerName } = useAuth();
  const location = useLocation();
  const { hasActiveOrder } = useActiveOrder();
  /** Menu page already shows cart-sidebar at this width — don't open a sheet over it. */
  const menuHasSidebar = useMediaQuery('(min-width: 900px)');

  if (hideNav) return null;

  const siteName = s.site_name || 'Bake & Grill';
  const logoSrc = s.logo || '/logo.png';
  const count = cart.reduce((sum, e) => sum + e.quantity, 0);
  const onCheckout = location.pathname.startsWith('/checkout');
  const onMenu = location.pathname === '/menu' || location.pathname.startsWith('/menu/');
  const onAccount =
    location.pathname === '/account' || location.pathname.startsWith('/account/');

  const handleCartClick = () => {
    if (onMenu && menuHasSidebar) {
      document.getElementById('menu-cart-sidebar')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
      return;
    }
    openCartSheet();
  };

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

          {!onCheckout && (
            <button
              type="button"
              className="top-nav__cart"
              onClick={handleCartClick}
              aria-expanded={onMenu && menuHasSidebar ? undefined : cartSheetOpen}
              aria-label={
                count > 0
                  ? `${t('cart.view')} — ${count} — ${Math.round(cartTotal)}/-`
                  : t('cart.view')
              }
              disabled={count === 0}
            >
              <span className="top-nav__cart-label">{t('cart.view')}</span>
              {count > 0 && (
                <>
                  <span className="top-nav__cart-count" aria-hidden>
                    {count > 99 ? '99+' : count}
                  </span>
                  <span className="top-nav__cart-total" aria-hidden>
                    {Math.round(cartTotal)}/-
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
