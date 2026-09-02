import { useEffect, useRef } from 'react';
import { PartyPopper } from 'lucide-react';
import { API_ORIGIN } from '../../api';
import type { Category } from '../../api';
import { useLanguage } from '../../context/LanguageContext';
import { PictureImg } from './PictureImg';

function tintFromId(id: number): string {
  const hues = [18, 32, 48, 160, 200, 280];
  const h = hues[id % hues.length];
  return `hsl(${h} 55% 88%)`;
}

type Props = {
  categories: Category[];
  activeCategoryId: number | null;
  onSelect: (id: number) => void;
  dimmed?: boolean;
  counts?: Record<number, number>;
  showOffersPill?: boolean;
  onOffersClick?: () => void;
  showCateringPill?: boolean;
  cateringActive?: boolean;
  cateringCount?: number;
  onCateringClick?: () => void;
  /** Sub-categories by parent id, listed under their parent as text-only tabs. */
  subcategories?: Record<number, Category[]>;
  activeSubcategoryId?: number | null;
  onSelectSubcategory?: (id: number, parentId: number) => void;
};

/**
 * Sticky left category rail — scroll-spy sync via activeCategoryId.
 *
 * Sub-categories sit under their parent as smaller, text-only entries.
 * Owner, 2026-09-02: "add subcategories to the rail as well" — until then
 * a customer looking for Beef under Grill had nothing in the rail to tap,
 * and the spy folded every sub-category into its parent.
 */
export function CategoryRail({
  categories,
  activeCategoryId,
  onSelect,
  dimmed = false,
  counts = {},
  showOffersPill = false,
  onOffersClick,
  showCateringPill = false,
  cateringActive = false,
  cateringCount = 0,
  onCateringClick,
  subcategories = {},
  activeSubcategoryId = null,
  onSelectSubcategory,
}: Props) {
  const { t } = useLanguage();
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [activeCategoryId, cateringActive]);

  return (
    <nav
      className={`cat-rail${dimmed ? ' is-dimmed' : ''}`}
      aria-label={t('menu.categories')}
      style={{
        opacity: dimmed ? 0.4 : 1,
        pointerEvents: dimmed ? 'none' : 'auto',
        overflowY: 'auto',
        padding: '0.5rem 0',
      }}
    >
      <div role="tablist" aria-orientation="vertical" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {showOffersPill && onOffersClick && (
          <button
            type="button"
            role="tab"
            className="cat-rail__item"
            onClick={onOffersClick}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '0.5rem 0.35rem',
              border: 'none',
              background: 'transparent',
              borderLeft: '3px solid transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: 'var(--color-primary)',
              width: '100%',
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            Offers
          </button>
        )}
        {categories.map((cat) => {
          const active = activeCategoryId === cat.id;
          const resolve = (url: string | null | undefined) => {
            if (!url) return null;
            return url.startsWith('http')
              ? url
              : `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
          };
          const img = resolve(cat.image_url);
          const webp = resolve(cat.image_webp_url);
          const initial = (cat.name?.trim()?.[0] ?? '?').toUpperCase();
          const subs = subcategories[cat.id] ?? [];
          return (
            <div key={cat.id} className="cat-rail__group" role="presentation">
            <button
              ref={active ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              className={`cat-rail__item${active ? ' is-active' : ''}`}
              onClick={() => onSelect(cat.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '0.5rem 0.35rem',
                border: 'none',
                background: active ? 'var(--color-primary-light)' : 'transparent',
                borderLeft: active ? '3px solid var(--color-primary)' : '3px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                width: '100%',
              }}
            >
              {img ? (
                <PictureImg
                  className="cat-rail__thumb"
                  src={img}
                  webpSrc={webp}
                  sizes="40px"
                  alt=""
                  width={40}
                  height={40}
                  loading="lazy"
                  decoding="async"
                  style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }}
                />
              ) : (
                <span
                  className="cat-rail__thumb"
                  aria-hidden="true"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: tintFromId(cat.id),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    color: 'var(--color-dark)',
                  }}
                >
                  {initial}
                </span>
              )}
              <span className="cat-rail__label">
                {cat.name}
              </span>
              {(counts[cat.id] ?? 0) > 0 && (
                <span style={{ fontSize: 10, opacity: 0.7 }}>{counts[cat.id]}</span>
              )}
            </button>
            {subs.length > 0 && (
              <div className="cat-rail__subs" role="presentation">
                {subs.map((sub) => {
                  const subActive = activeSubcategoryId === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      role="tab"
                      aria-selected={subActive}
                      className={`cat-rail__sub${subActive ? ' is-active' : ''}`}
                      data-testid="cat-rail-sub"
                      data-parent-category-id={cat.id}
                      onClick={() => onSelectSubcategory?.(sub.id, cat.id)}
                    >
                      <span className="cat-rail__sub-label">{sub.name}</span>
                      {(counts[sub.id] ?? 0) > 0 && (
                        <span className="cat-rail__sub-count">{counts[sub.id]}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            </div>
          );
        })}
        {/* Events / catering shortcut — always last on the left rail */}
        {showCateringPill && onCateringClick && (
          <button
            type="button"
            role="tab"
            aria-selected={cateringActive}
            ref={cateringActive ? activeRef : undefined}
            className={`cat-rail__item cat-rail__item--events${cateringActive ? ' is-active' : ''}`}
            data-testid="cat-rail-events"
            onClick={onCateringClick}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '0.5rem 0.35rem',
              marginTop: 6,
              border: 'none',
              background: cateringActive ? 'var(--color-primary-light)' : 'transparent',
              borderLeft: cateringActive ? '3px solid var(--color-primary)' : '3px solid transparent',
              borderTop: '1px solid var(--color-border, #E8E0D8)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: cateringActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              width: '100%',
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            <span
              className="cat-rail__thumb"
              aria-hidden="true"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'hsl(32 55% 88%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-dark)',
              }}
            >
              <PartyPopper size={18} strokeWidth={2.25} />
            </span>
            <span className="cat-rail__label">Events</span>
            {cateringCount > 0 && (
              <span style={{ fontSize: 10, opacity: 0.7 }}>{cateringCount}</span>
            )}
          </button>
        )}
      </div>
    </nav>
  );
}
