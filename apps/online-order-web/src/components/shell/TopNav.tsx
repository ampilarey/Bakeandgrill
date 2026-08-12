import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { PrayerBar } from '../PrayerBar';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useShellNav } from '../../context/ShellNavContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { useActiveOrder } from '../../hooks/useActiveOrder';
import { MAIN_WEBSITE_HREF } from '../../utils/mainWebsite';
import { SHELL_NAV_TABS } from './navTabs';
import { useHomeChrome } from '../../hooks/useHomeChrome';

/** Local phone digits only (AuthContext stores 7-digit local when available). */
function localPhoneDigits(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/[\s-]/g, '');
  return /^\d{6,}$/.test(digits) ? digits : null;
}

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 19.5c1.5-3.2 4-4.8 7-4.8s5.5 1.6 7 4.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Tablet/desktop top bar — logo, text links, prayer strip, account.
 * Brand (logo + name) leaves the order app for the main website.
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
  const chrome = useHomeChrome();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf: number | null = null;
    const onScroll = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 12);
        raf = null;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

  if (hideNav) return null;

  const siteName = s.site_name || 'Bake & Grill';
  const logoSrc = s.logo || '/logo.png';
  const onAccount =
    location.pathname === '/account' || location.pathname.startsWith('/account/');
  const phone = isAuthenticated ? localPhoneDigits(customerName) : null;

  return (
    <header className={`top-nav${scrolled ? ' is-scrolled' : ''}`}>
      <div className="top-nav__inner">
        <a
          href={MAIN_WEBSITE_HREF}
          className="top-nav__brand"
          aria-label={t('header.website_aria').replace('{name}', siteName)}
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
        </a>

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

        {chrome.prayerHeaderDesktop ? (
          <div className="top-nav__prayer" data-home-chrome="prayer_bar" data-placement="header">
            <PrayerBar />
          </div>
        ) : null}

        <div className="top-nav__actions">
          {isAuthenticated ? (
            <Link
              to="/account"
              className={`top-nav__account-chip${onAccount ? ' is-active' : ''}`}
              aria-current={onAccount ? 'page' : undefined}
              aria-label={phone ? `${t('nav.account')} ${phone}` : t('nav.account')}
            >
              {phone ? <span className="top-nav__account-phone">{phone}</span> : null}
              <span className="top-nav__account-avatar" aria-hidden>
                <PersonIcon />
              </span>
            </Link>
          ) : (
            <Link
              to="/account"
              className={`top-nav__account${onAccount ? ' is-active' : ''}`}
              aria-current={onAccount ? 'page' : undefined}
            >
              {t('home.sign_in')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
