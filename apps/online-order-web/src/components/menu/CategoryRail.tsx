import { useEffect, useRef } from 'react';
import { API_ORIGIN } from '../../api';
import type { Category } from '../../api';
import { useLanguage } from '../../context/LanguageContext';

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
};

/**
 * Sticky left category rail — scroll-spy sync via activeCategoryId.
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
}: Props) {
  const { t } = useLanguage();
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [activeCategoryId]);

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
        {showCateringPill && onCateringClick && (
          <button
            type="button"
            role="tab"
            aria-selected={cateringActive}
            className={`cat-rail__item${cateringActive ? ' is-active' : ''}`}
            data-testid="cat-rail-catering"
            onClick={onCateringClick}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '0.5rem 0.35rem',
              border: 'none',
              background: cateringActive ? 'var(--color-primary-light)' : 'transparent',
              borderLeft: cateringActive ? '3px solid var(--color-primary)' : '3px solid transparent',
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
                fontWeight: 800,
                fontSize: '0.9rem',
                color: 'var(--color-dark)',
              }}
            >
              C
            </span>
            <span className="cat-rail__label">Catering</span>
            {cateringCount > 0 && (
              <span style={{ fontSize: 10, opacity: 0.7 }}>{cateringCount}</span>
            )}
          </button>
        )}
        {categories.map((cat) => {
          const active = activeCategoryId === cat.id;
          const img = cat.image_url
            ? (cat.image_url.startsWith('http')
              ? cat.image_url
              : `${API_ORIGIN}${cat.image_url.startsWith('/') ? '' : '/'}${cat.image_url}`)
            : null;
          const initial = (cat.name?.trim()?.[0] ?? '?').toUpperCase();
          return (
            <button
              key={cat.id}
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
                <img
                  className="cat-rail__thumb"
                  src={img}
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
          );
        })}
      </div>
    </nav>
  );
}
