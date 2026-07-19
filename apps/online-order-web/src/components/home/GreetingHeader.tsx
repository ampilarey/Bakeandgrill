import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

type Props = {
  customerName: string | null;
  isAuthenticated: boolean;
};

/** True when the "name" is really a phone (no profile name set). */
function isPhoneLabel(value: string | null): boolean {
  if (!value) return false;
  return /^\d{6,}$/.test(value.replace(/[\s-]/g, ''));
}

function AccountAvatarGlyph({ label }: { label: string | null }) {
  // Phone-only accounts: first digit looks like a badge count — use a person mark instead.
  if (!label || isPhoneLabel(label)) {
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
  return <>{label.charAt(0).toUpperCase()}</>;
}

/**
 * Phone-only account affordance (no "Hello" — brand lives in the shell).
 * Hidden on tablet/desktop where TopNav carries Sign in / Account.
 */
export function GreetingHeader({ customerName, isAuthenticated }: Props) {
  const { t } = useLanguage();

  return (
    <section className="home-account-bar" aria-label={t('nav.account')}>
      <div className="home-account-bar__inner">
        {isAuthenticated ? (
          <Link
            to="/account"
            className="home-account-bar__avatar"
            aria-label={t('nav.account')}
          >
            <AccountAvatarGlyph label={customerName} />
          </Link>
        ) : (
          <Link to="/account" className="home-account-bar__sign-in">
            {t('home.sign_in')}
          </Link>
        )}
      </div>
    </section>
  );
}
