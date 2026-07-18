import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

type Props = {
  customerName: string | null;
  isAuthenticated: boolean;
  /** Rendered in the top-right corner of the greeting row (e.g. OpeningStatusBadge). */
  statusBadge?: ReactNode;
};

export function GreetingHeader({ customerName, isAuthenticated, statusBadge }: Props) {
  const { t } = useLanguage();

  const greetingTitle = customerName
    ? t('home.greeting_named').replace('{name}', customerName)
    : t('home.greeting_hello');

  return (
    <section
      style={{
        padding: '1.25rem var(--page-gutter) 0.5rem',
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
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 800,
              color: 'var(--color-dark)',
              letterSpacing: '-0.02em',
            }}
          >
            {greetingTitle}
          </h1>
          <p
            style={{
              margin: '0.35rem 0 0',
              fontSize: '0.9375rem',
              color: 'var(--color-text-muted)',
            }}
          >
            {t('home.greeting_sub')}
          </p>
          {statusBadge ? (
            <div style={{ marginTop: '0.65rem' }}>{statusBadge}</div>
          ) : null}
        </div>

        {isAuthenticated ? (
          <Link
            to="/account"
            aria-label={t('nav.account')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              textDecoration: 'none',
              flexShrink: 0,
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
                textTransform: 'uppercase',
                userSelect: 'none',
              }}
            >
              {customerName ? customerName.charAt(0) : '?'}
            </div>
          </Link>
        ) : (
          <Link
            to="/account"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 40,
              padding: '0.4rem 0.875rem',
              background: 'var(--color-primary)',
              color: '#fff',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            {t('home.sign_in')}
          </Link>
        )}
      </div>
    </section>
  );
}
