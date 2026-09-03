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

function resolve(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
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
  /** Sub-categories by parent id, listed under their parent with a smaller photo. */
  subcategories?: Record<number, Category[]>;
  activeSubcategoryId?: number | null;
  onSelectSubcategory?: (id: number, parentId: number) => void;
};

/**
 * Photo (or tinted initial) for a rail entry. `size` is the intrinsic box
 * in px for the image hint; the rendered size comes from the stylesheet,
 * which fits the photo to the rail width at each breakpoint.
 */
function RailThumb({ category, size, className }: { category: Category; size: number; className: string }) {
  const img = resolve(category.image_url);
  const webp = resolve(category.image_webp_url);
  const initial = (category.name?.trim()?.[0] ?? '?').toUpperCase();
  if (img) {
    return (
      <PictureImg
        className={className}
        src={img}
        webpSrc={webp}
        sizes={`${size}px`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        background: tintFromId(category.id),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: size >= 60 ? '1.1rem' : '0.95rem',
        color: 'var(--color-dark)',
      }}
    >
      {initial}
    </span>
  );
}

/**
 * Sticky left category rail — scroll-spy sync via activeCategoryId.
 *
 * One look for every entry, the way the ZUS app does it (owner, 2026-09-03:
 * "make the pic in main category big and subcategory little smaller"): a
 * photo over a short label, air between entries, the active one marked by
 * a left bar and the brand colour. Sub-categories sit under their parent
 * with the same shape and a smaller photo — no pills, hairlines or folding.
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const userTouchedAt = useRef(0);

  // Follow the active entry by scrolling the rail's own scroller only.
  // scrollIntoView used to scroll every ancestor, so it could nudge the page
  // while the customer was reading, and it fought a finger that was
  // scrolling the rail at that moment — so after a touch on the rail the
  // follow-along waits a moment (owner, 2026-09-03: "rail not scrolling").
  useEffect(() => {
    const el = activeRef.current;
    const box = scrollRef.current;
    if (!el || !box) return;
    if (Date.now() - userTouchedAt.current < 1500) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    const viewTop = box.scrollTop;
    const viewBottom = viewTop + box.clientHeight;
    if (top >= viewTop && bottom <= viewBottom) return;
    const target = top < viewTop ? top - 8 : bottom - box.clientHeight + 8;
    if (typeof box.scrollTo === 'function') box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    else box.scrollTop = Math.max(0, target);
  }, [activeCategoryId, activeSubcategoryId, cateringActive]);

  const noteTouch = () => { userTouchedAt.current = Date.now(); };

  // Size the scroller to what is actually on screen. A fixed
  // `100dvh - header - bottom nav` is only right once the rail is stuck; at
  // the top of the page the rail starts lower, so its bottom entries sat
  // below the fold and could not be reached until the page itself moved
  // (owner, 2026-09-03: "make it scroll till the last cat").
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || typeof window === 'undefined') return;
    let pending = false;
    const fit = () => {
      pending = false;
      const nav = document.querySelector<HTMLElement>('.bottom-nav');
      const floor = nav && getComputedStyle(nav).position === 'fixed'
        ? nav.getBoundingClientRect().top
        : window.innerHeight;
      const room = floor - box.getBoundingClientRect().top - 8;
      box.style.maxHeight = `${Math.max(160, Math.round(room))}px`;
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(fit);
    };
    fit();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <nav
      className={`cat-rail${dimmed ? ' is-dimmed' : ''}`}
      aria-label={t('menu.categories')}
      style={{
        opacity: dimmed ? 0.4 : 1,
        pointerEvents: dimmed ? 'none' : 'auto',
      }}
    >
      {/* The sticky nav does not scroll itself: iOS Safari will not take a
          touch-scroll on an element that is both sticky and the scroller. */}
      <div
        ref={scrollRef}
        className="cat-rail__scroll"
        onTouchStart={noteTouch}
        onPointerDown={noteTouch}
        onWheel={noteTouch}
      >
      <div role="tablist" aria-orientation="vertical" className="cat-rail__list">
        {showOffersPill && onOffersClick && (
          <button
            type="button"
            role="tab"
            className="cat-rail__item cat-rail__item--offers"
            onClick={onOffersClick}
          >
            <span
              className="cat-rail__thumb"
              aria-hidden="true"
              style={{
                background: 'hsl(18 55% 88%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-dark)',
              }}
            >
              %
            </span>
            <span className="cat-rail__label">Offers</span>
          </button>
        )}
        {categories.map((cat) => {
          const active = activeCategoryId === cat.id;
          const subs = subcategories[cat.id] ?? [];
          return (
            <div key={cat.id} className="cat-rail__group" role="presentation">
              <button
                ref={active && activeSubcategoryId == null ? activeRef : undefined}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={(counts[cat.id] ?? 0) > 0 ? `${cat.name}, ${counts[cat.id]} item${counts[cat.id] === 1 ? '' : 's'}` : undefined}
                // A parent whose sub-category is the one in view is "within",
                // not chosen: it keeps a soft tint so exactly one entry reads
                // as selected (owner, 2026-09-03).
                className={`cat-rail__item${active ? ' is-active' : ''}${active && activeSubcategoryId != null ? ' is-within' : ''}`}
                onClick={() => onSelect(cat.id)}
              >
                <RailThumb category={cat} size={64} className="cat-rail__thumb" />
                <span className="cat-rail__label">{cat.name}</span>
              </button>
              {subs.map((sub) => {
                const subActive = activeSubcategoryId === sub.id;
                const count = counts[sub.id] ?? 0;
                return (
                  <button
                    key={sub.id}
                    ref={subActive ? activeRef : undefined}
                    type="button"
                    role="tab"
                    aria-selected={subActive}
                    aria-label={count > 0 ? `${sub.name}, ${count} item${count === 1 ? '' : 's'}` : undefined}
                    className={`cat-rail__item cat-rail__sub${subActive ? ' is-active' : ''}`}
                    data-testid="cat-rail-sub"
                    data-parent-category-id={cat.id}
                    onClick={() => onSelectSubcategory?.(sub.id, cat.id)}
                  >
                    <RailThumb category={sub} size={52} className="cat-rail__thumb cat-rail__thumb--sub" />
                    <span className="cat-rail__label cat-rail__sub-label">{sub.name}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {/* Events / catering shortcut — always last on the left rail */}
        {showCateringPill && onCateringClick && (
          <button
            type="button"
            role="tab"
            aria-selected={cateringActive}
            aria-label={cateringCount > 0 ? `Events, ${cateringCount} package${cateringCount === 1 ? '' : 's'}` : undefined}
            ref={cateringActive ? activeRef : undefined}
            className={`cat-rail__item cat-rail__item--events${cateringActive ? ' is-active' : ''}`}
            data-testid="cat-rail-events"
            onClick={onCateringClick}
          >
            <span
              className="cat-rail__thumb"
              aria-hidden="true"
              style={{
                background: 'hsl(32 55% 88%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-dark)',
              }}
            >
              <PartyPopper size={24} strokeWidth={2.25} />
            </span>
            <span className="cat-rail__label">Events</span>
          </button>
        )}
      </div>
      </div>
    </nav>
  );
}
