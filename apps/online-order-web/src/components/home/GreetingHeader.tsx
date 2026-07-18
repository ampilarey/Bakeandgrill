import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

type Props = {
  customerName: string | null;
  isAuthenticated: boolean;
  /** Compact status pill under the greeting (e.g. OpeningStatusBadge). */
  statusBadge?: ReactNode;
};

/** True when the "name" is really a phone (no profile name set). */
function isPhoneLabel(value: string | null): boolean {
  if (!value) return false;
  return /^\d{6,}$/.test(value.replace(/[\s-]/g, ''));
}

function AccountAvatarGlyph({ label }: { label: string | null }) {
  // Phone-only accounts: first digit ("7") looks like a badge count — use a person mark instead.
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

export function GreetingHeader({ customerName, isAuthenticated, statusBadge }: Props) {
  const { t } = useLanguage();

  return (
    <section
      style={{
        padding: '1rem var(--page-gutter) 0.35rem',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: '1.35rem',
              fontWeight: 800,
              color: 'var(--color-dark)',
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {customerName ? (
              <>
                {t('home.greeting_hello')},{' '}
                <span style={{ fontWeight: 800 }}>{customerName}</span>
              </>
            ) : (
              t('home.greeting_hello')
            )}
          </h1>
          <p
            style={{
              margin: '0.25rem 0 0',
              fontSize: '0.875rem',
              color: 'var(--color-text-muted)',
            }}
          >
            {t('home.greeting_sub')}
          </p>
          {statusBadge ? (
            <div className="greeting-header-status" style={{ marginTop: '0.5rem' }}>
              {statusBadge}
            </div>
          ) : null}
        </div>

        <div style={{ flexShrink: 0 }}>
          {isAuthenticated ? (
            <Link
              to="/account"
              aria-label={t('nav.account')}
              style={{
                display: 'flex',
                alignItems: 'center',
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'var(--color-primary-light)',
                  border: '2px solid var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'var(--color-primary)',
                  userSelect: 'none',
                }}
              >
                <AccountAvatarGlyph label={customerName} />
              </div>
            </Link>
          ) : (
            <Link
              to="/account"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 36,
                padding: '0.35rem 0.8rem',
                background: 'var(--color-primary)',
                color: '#fff',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.8125rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {t('home.sign_in')}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
