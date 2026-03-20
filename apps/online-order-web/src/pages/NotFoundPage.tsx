import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-dark)', marginBottom: '0.5rem' }}>
        Page not found
      </h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        The page you're looking for doesn't exist.
      </p>
      <Link to="/" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
        Back to home
      </Link>
    </div>
  );
}
