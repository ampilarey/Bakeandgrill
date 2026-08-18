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
 * Category section header: one banner carrying the category name, then items.
 *
 * The banner used to be followed by a second, accent-barred <h2> with the same
 * name — a leftover from when the banner was a tall promo image and its caption
 * read as a caption. Once the banner shrank to a strip the two labels ended up
 * stacked eight pixels apart. Owner, 2026-08-18: "main category name is in the
 * banner and below the photo also … name in the banner is enough."
 *
 * So the banner's title is now the section's only heading, and it is a real
 * <h2>: the sub-category titles under it are <h3>s and need a parent in the
 * outline. Uses category.image_url when set; otherwise a branded gradient so
 * every category still gets the same treatment.
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
        padding: '0.35rem 0 0.45rem',
        scrollMarginTop: 'calc(var(--menu-sticky-offset, var(--menu-header-height)) + 4px)',
      }}
    >
      {/*
        Not aria-hidden, even without an image: the name inside is the section's
        only heading now, so hiding the band would hide the category itself from
        a screen reader. The decorative parts opt out individually.
      */}
      <div
        className="menu-cat-promo"
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
        <div className="menu-cat-promo__scrim" aria-hidden="true" />
        <div className="menu-cat-promo__copy">
          <p className="menu-cat-promo__eyebrow">Category</p>
          <h2 className="menu-cat-promo__title">{category.name}</h2>
          {/* Description kept in DOM for a11y/tests; CSS hides it on the thin strip */}
          {description ? (
            <p className="menu-cat-promo__desc">{description}</p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
