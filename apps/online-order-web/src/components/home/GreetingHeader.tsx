import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';

type Props = {
  /** Usually the 7-digit local phone from AuthContext (or a profile name). */
  customerName: string | null;
  isAuthenticated: boolean;
  /**
   * Density only — brand/account chrome lives in HomePhoneHeader (phone)
   * or TopNav (desktop), not in this welcome block.
   */
  chrome?: 'phone' | 'desktop';
};

/** True when the label is a Maldives local phone (digits only). */
function isPhoneLabel(value: string | null): boolean {
  if (!value) return false;
  return /^\d{6,}$/.test(value.replace(/[\s-]/g, ''));
}

/**
 * Home greeting block: welcome title + subtitle only (scrolls with the page).
 */
export function GreetingHeader({
  customerName,
  isAuthenticated,
  chrome = 'phone',
}: Props) {
  const { t } = useLanguage();
  const { text } = useSiteSettingsContext();
  const displayName =
    isAuthenticated && customerName && !isPhoneLabel(customerName)
      ? customerName.trim()
      : null;
  const hello = text('order_home_greeting_hello', t('home.greeting_hello'));
  const namedTemplate = text('order_home_greeting_named', t('home.greeting_named'));
  const subtitle = text('order_home_greeting_sub', t('home.greeting_sub'));
  const title = displayName
    ? namedTemplate.replace('{name}', displayName)
    : hello;

  return (
    <section
      className={`home-greeting home-greeting--${chrome}`}
      data-testid="home-greeting"
      style={{
        padding:
          chrome === 'desktop'
            ? '0.85rem var(--page-gutter) 0.15rem'
            : '0.55rem var(--page-gutter) 0.2rem',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
      }}
    >
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
        {subtitle}
      </p>
    </section>
  );
}
