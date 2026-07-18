import { API_ORIGIN } from '../../api';
import type { Category } from '../../api';

type Props = {
  category: Category;
  id?: string;
};

export function MenuSectionHeader({ category, id }: Props) {
  const img = category.image_url
    ? (category.image_url.startsWith('http')
      ? category.image_url
      : `${API_ORIGIN}${category.image_url.startsWith('/') ? '' : '/'}${category.image_url}`)
    : null;

  return (
    <header
      id={id}
      className="menu-section-header"
      data-category-id={category.id}
      style={{
        padding: '1.25rem 0 0.75rem',
        scrollMarginTop: 'calc(var(--menu-header-height) + 8px)',
      }}
    >
      {img && (
        <div
          style={{
            aspectRatio: '3 / 1',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            marginBottom: '0.75rem',
            background: 'var(--color-surface-alt)',
          }}
        >
          <img
            src={img}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}
      <h2
        className="section-accent"
        style={{
          margin: 0,
          fontSize: '1.125rem',
          fontWeight: 800,
          color: 'var(--color-dark)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 4,
            height: '1.1em',
            borderRadius: 2,
            background: 'var(--color-primary)',
            flexShrink: 0,
          }}
        />
        {category.name}
      </h2>
    </header>
  );
}
