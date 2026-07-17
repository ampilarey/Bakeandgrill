import { Link, useNavigate } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/shell/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';

/**
 * Phase 2 stub — full Rewards content lands in Phase 6.
 * Document title is a hard gate for this route.
 */
export function RewardsPage() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  usePageTitle(t('rewards.title'));

  return (
    <div style={{ paddingBottom: '1rem' }}>
      <PageHeader title={t('rewards.title')} />
      <div style={{ padding: '1.25rem var(--page-gutter)' }}>
        <EmptyState
          title={t('rewards.stub_title')}
          body={t('rewards.stub_body')}
          actionLabel={isAuthenticated ? t('rewards.checkout_cta') : t('rewards.stub_cta')}
          onAction={() => navigate(isAuthenticated ? '/checkout' : '/account')}
        >
          {isAuthenticated && (
            <Link
              to="/checkout"
              style={{
                display: 'block',
                textAlign: 'center',
                marginTop: '0.5rem',
                padding: '0.75rem 1rem',
                border: '1.5px solid var(--color-border)',
                borderRadius: 12,
                fontWeight: 600,
                color: 'var(--color-text)',
                textDecoration: 'none',
                background: 'var(--color-surface)',
                width: '100%',
                maxWidth: 320,
              }}
            >
              {t('rewards.checkout_cta')}
            </Link>
          )}
        </EmptyState>
      </div>
    </div>
  );
}
