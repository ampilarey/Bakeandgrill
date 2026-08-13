import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, ShoppingBag } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';

/**
 * Stage A — /content is a chooser between the two independent Content Hub destinations.
 * No combined editor.
 */
export function ContentHubChooser() {
  usePageTitle('Content');
  const navigate = useNavigate();

  return (
    <div className="hub-task-landing" data-testid="content-hub-chooser" style={{ padding: '24px 20px', maxWidth: 720 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--color-text)' }}>Content</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        Website and Order App are edited separately. Pick where you want to change copy or branding.
      </p>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <button
          type="button"
          data-testid="content-chooser-website"
          onClick={() => navigate('/content/website')}
          style={cardStyle}
        >
          <Globe size={22} aria-hidden />
          <span style={{ fontWeight: 600, fontSize: 16 }}>Website</span>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'left' }}>
            Public site pages, homepage, footer, and SEO
          </span>
        </button>
        <button
          type="button"
          data-testid="content-chooser-order-app"
          onClick={() => navigate('/content/order-app')}
          style={cardStyle}
        >
          <ShoppingBag size={22} aria-hidden />
          <span style={{ fontWeight: 600, fontSize: 16 }}>Order App</span>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'left' }}>
            Ordering app home, menu, checkout, and status banners
          </span>
        </button>
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
  padding: 20,
  borderRadius: 12,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 120,
};
