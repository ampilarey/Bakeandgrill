import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { MAIN_WEBSITE_HREF } from '../../utils/mainWebsite';

type Props = {
  customerName: string | null;
  isAuthenticated: boolean;
};

/** True when the label is a Maldives local phone (digits only). */
function isPhoneLabel(value: string | null): boolean {
  if (!value) return false;
  return /^\d{6,}$/.test(value.replace(/[\s-]/g, ''));
}

/**
 * Sticky phone home header — brand + account only.
 * Welcome copy stays in GreetingHeader so it can scroll away.
 */
export function HomePhoneHeader({ customerName, isAuthenticated }: Props) {
  const { t } = useLanguage();
  const { settings: s } = useSiteSettingsContext();
  const siteName = s.site_name || 'Bake & Grill';
  const logoSrc = s.logo || '/logo.png';
  const phone =
    isAuthenticated && customerName && isPhoneLabel(customerName)
      ? customerName.replace(/[\s-]/g, '')
      : null;

  return (
    <header className="home-phone-header" data-testid="home-phone-header">
      <div className="home-phone-header__inner">
        <a
          href={MAIN_WEBSITE_HREF}
          className="home-brand-link"
          aria-label={t('header.website_aria').replace('{name}', siteName)}
        >
          <img
            src={logoSrc}
            alt=""
            width={36}
            height={36}
            className="home-brand-link__logo"
            decoding="async"
          />
          <span className="home-brand-link__name">{siteName}</span>
        </a>

        <div className="home-greeting-actions">
          {isAuthenticated ? (
            <Link
              to="/account"
              className="home-account-chip"
              aria-label={phone ? `${t('nav.account')} ${phone}` : t('nav.account')}
            >
              {phone ? <span className="home-account-chip__phone">{phone}</span> : null}
              <span className="home-account-avatar" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M5 19.5c1.5-3.2 4-4.8 7-4.8s5.5 1.6 7 4.8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </Link>
          ) : (
            <Link to="/account" className="home-sign-in-btn">
              {t('home.sign_in')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
