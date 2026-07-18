import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

export function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-dark)', marginBottom: '0.5rem' }}>
        {t('notfound.title')}
      </h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        {t('notfound.body')}
      </p>
      <Link to="/" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
        {t('notfound.home')}
      </Link>
    </div>
  );
}
