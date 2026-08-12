import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { MAIN_WEBSITE_HREF } from '../../utils/mainWebsite';

type Props = {
  /** Usually the 7-digit local phone from AuthContext (or a profile name). */
  customerName: string | null;
  isAuthenticated: boolean;
  /**
   * phone — brand + account chip + Hello (mobile home stack).
   * desktop — Hello only (TopNav already has brand/account).
   */
  chrome?: 'phone' | 'desktop';
};

/** True when the label is a Maldives local phone (digits only). */
function isPhoneLabel(value: string | null): boolean {
  if (!value) return false;
  return /^\d{6,}$/.test(value.replace(/[\s-]/g, ''));
}

/**
 * Home greeting block: welcome line (+ phone chrome with brand/account).
 */
export function GreetingHeader({
  customerName,
  isAuthenticated,
  chrome = 'phone',
}: Props) {
  const { t } = useLanguage();
  const { settings: s } = useSiteSettingsContext();
  const siteName = s.site_name || 'Bake & Grill';
  const logoSrc = s.logo || '/logo.png';
  const phone =
    isAuthenticated && customerName && isPhoneLabel(customerName)
      ? customerName.replace(/[\s-]/g, '')
      : null;
  const displayName =
    isAuthenticated && customerName && !isPhoneLabel(customerName)
      ? customerName.trim()
      : null;
  const title = displayName
    ? t('home.greeting_named').replace('{name}', displayName)
    : t('home.greeting_hello');

  return (
    <section
      className={`home-greeting home-greeting--${chrome}`}
      data-testid="home-greeting"
      style={{
        padding:
          chrome === 'desktop'
            ? '0.85rem var(--page-gutter) 0.15rem'
            : '0.65rem var(--page-gutter) 0.2rem',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
      }}
    >
      {chrome === 'phone' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.55rem',
          }}
        >
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
      ) : null}

      <h1
        className="home-greeting__title"
        style={{
          margin: 0,
          fontSize: chrome === 'desktop' ? '1.5rem' : '1.35rem',
          fontWeight: 800,
          color: 'var(--color-dark)',
          letterSpacing: '-0.02em',
          lineHeight: 1.25,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </h1>
      <p
        className="home-greeting__sub"
        style={{
          margin: '0.25rem 0 0',
          fontSize: '0.875rem',
          color: 'var(--color-text-muted)',
        }}
      >
        {t('home.greeting_sub')}
      </p>
    </section>
  );
}
