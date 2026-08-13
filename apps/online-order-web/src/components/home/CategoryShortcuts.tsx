import { Link } from 'react-router-dom';
import type { HomepageCategoryRow } from '../../context/SiteSettingsContext';
import { API_ORIGIN } from '../../api';
import { safePublicUrl } from '../../utils/safePublicUrl';

function orderAppHref(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '/menu';
  if (trimmed === '/order' || trimmed === '/order/') return '/menu';
  if (trimmed.startsWith('/order/')) {
    const rest = trimmed.slice('/order'.length);
    return rest || '/menu';
  }
  if (trimmed.startsWith('http')) return trimmed;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function resolveImg(src: string | undefined): string | null {
  if (!src) return null;
  if (src.startsWith('http')) return src;
  return `${API_ORIGIN}${src.startsWith('/') ? '' : '/'}${src}`;
}

type Props = {
  categories: HomepageCategoryRow[];
  eyebrow?: string;
  title?: string;
};

/** CMS homepage categories as order-app menu shortcuts. */
export function CategoryShortcuts({ categories, eyebrow, title }: Props) {
  const rows = categories.filter((c) => (c.name || c.label || '').trim() !== '');
  if (rows.length === 0) return null;

  return (
    <section
      aria-label={title || 'Browse by category'}
      style={{
        borderTop: '1px solid var(--color-border)',
        padding: '1.25rem 0 0.5rem',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--layout-max)',
          margin: '0 auto',
          padding: '0 var(--page-gutter)',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        {(eyebrow || title) && (
          <div style={{ marginBottom: '0.85rem' }}>
            {eyebrow && (
              <p
                style={{
                  margin: '0 0 0.2rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--color-primary)',
                }}
              >
                {eyebrow}
              </p>
            )}
            {title && (
              <h2
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: 'var(--color-dark)',
                }}
              >
                {title}
              </h2>
            )}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            paddingBottom: 4,
          }}
        >
          {rows.map((cat, i) => {
            const safeLink = safePublicUrl(cat.link || '/menu') ?? '#';
            const href = safeLink === '#' ? '#' : orderAppHref(safeLink);
            const img = resolveImg(cat.image_url);
            const label = cat.name || cat.label || 'Category';
            const inner = (
              <>
                <div
                  style={{
                    height: 72,
                    background: 'var(--color-surface-alt)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    overflow: 'hidden',
                  }}
                >
                  {img ? (
                    <img
                      src={img}
                      alt={cat.image_alt || label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span aria-hidden>{cat.icon || '🍽️'}</span>
                  )}
                </div>
                <div style={{ padding: '0.55rem 0.65rem' }}>
                  {cat.label && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--color-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {cat.label}
                    </p>
                  )}
                  <p
                    style={{
                      margin: '0.15rem 0 0',
                      fontSize: 12,
                      fontWeight: 800,
                      color: 'var(--color-dark)',
                      lineHeight: 1.3,
                    }}
                  >
                    {label}
                  </p>
                  {cat.hook && (
                    <p
                      style={{
                        margin: '0.2rem 0 0',
                        fontSize: 11,
                        color: 'var(--color-text-muted)',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {cat.hook}
                    </p>
                  )}
                </div>
              </>
            );

            const cardStyle: React.CSSProperties = {
              flex: '0 0 auto',
              width: 148,
              borderRadius: 14,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              overflow: 'hidden',
              textDecoration: 'none',
              color: 'inherit',
            };

            if (!href.startsWith('/') || href === '#') {
              return (
                <a key={`${label}-${i}`} href={href} style={cardStyle} rel="noopener noreferrer">
                  {inner}
                </a>
              );
            }
            return (
              <Link key={`${label}-${i}`} to={href} style={cardStyle}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
