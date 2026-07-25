import { API_ORIGIN } from '../../api';
import type { Category } from '../../api';

type Props = {
  category: Category;
  id?: string;
  /** When true, this section is the scroll-spy active category */
  active?: boolean;
};

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

function tintFromId(id: number): string {
  const hues = [18, 28, 38, 160, 200, 280];
  const h = hues[id % hues.length];
  return `linear-gradient(135deg, hsl(${h} 48% 42%) 0%, hsl(${(h + 28) % 360} 42% 28%) 100%)`;
}

/**
 * ZUS-style category section header: wide promo banner, then accent title + items.
 * Uses category.image_url when set; otherwise a branded gradient so every
 * category still gets the same visual treatment.
 */
export function MenuSectionHeader({ category, id, active = false }: Props) {
  const img = resolveImageUrl(category.image_url);
  const description = category.description?.trim() || null;

  return (
    <header
      id={id}
      className={`menu-section-header${active ? ' is-active' : ''}`}
      data-category-id={category.id}
      style={{
        padding: '0.55rem 0 0.45rem',
        scrollMarginTop: 'calc(var(--menu-header-height) + var(--menu-active-cat-bar-height, 0px) + 8px)',
      }}
    >
      <div
        className="menu-cat-promo"
        aria-hidden={img ? undefined : true}
        style={img ? undefined : { background: tintFromId(category.id) }}
      >
        {img ? (
          <img
            className="menu-cat-promo__img"
            src={img}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div className="menu-cat-promo__scrim" />
        <div className="menu-cat-promo__copy">
          <p className="menu-cat-promo__eyebrow">Category</p>
          <p className="menu-cat-promo__title">{category.name}</p>
          {/* Description kept in DOM for a11y/tests; CSS hides it on the thin strip */}
          {description ? (
            <p className="menu-cat-promo__desc">{description}</p>
          ) : null}
        </div>
      </div>

      <h2 className="menu-cat-title section-accent">
        <span className="menu-cat-title__bar" aria-hidden="true" />
        {category.name}
      </h2>
    </header>
  );
}
