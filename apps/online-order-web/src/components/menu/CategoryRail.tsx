import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { PartyPopper, Star } from 'lucide-react';
import { API_ORIGIN } from '../../api';
import type { Category } from '../../api';
import { useLanguage } from '../../context/LanguageContext';
import { PictureImg } from './PictureImg';

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
  /** The owner's hand-picked strip ahead of the categories (2026-09-21). */
  showFeaturedPill?: boolean;
  featuredActive?: boolean;
  featuredLabel?: string;
  onFeaturedClick?: () => void;
  showCateringPill?: boolean;
  cateringActive?: boolean;
  cateringCount?: number;
  onCateringClick?: () => void;
  /**
   * The "Other" section — dishes with no live category. Owner, 2026-09-21:
   * "'other' items that are not in category does not show the tab in rail."
   * The section was on the page; the rail had nothing to reach it with.
   */
  showOtherPill?: boolean;
  otherActive?: boolean;
  otherCount?: number;
  onOtherClick?: () => void;
  /** Pinned above the tiles: the phone's day and order-type button. */
  headSlot?: ReactNode;
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
  // Cream with the letter in rust, like every tile without a photo (owner,
  // 2026-10-07: the pastel tiles picked from the id were not brand colours).
  return (
    <span className={`${className} cat-rail__thumb--plain`} aria-hidden="true">
      {initial}
    </span>
  );
}

/**
 * Sticky left category rail — scroll-spy sync via activeCategoryId. Main
 * categories only since 2026-10-07 (owner: "keep the main category in the
 * rail and sub category below the banner"); the sub-categories are the
 * buttons under the menu's pinned banner.
 *
 * A photo over a short label, the way the ZUS app does it (owner,
 * 2026-09-03): each tile a flush photo over a bold name, the chosen one
 * tinted and ringed by a brand-colour outline that glides from tile to tile
 * (`.cat-rail__pill`). `size` here is only the image hint.
 */
export function CategoryRail({
  categories,
  activeCategoryId,
  onSelect,
  dimmed = false,
  counts = {},
  showOffersPill = false,
  onOffersClick,
  showFeaturedPill = false,
  featuredActive = false,
  featuredLabel = "Chef's picks",
  onFeaturedClick,
  showCateringPill = false,
  cateringActive = false,
  cateringCount = 0,
  onCateringClick,
  showOtherPill = false,
  otherActive = false,
  otherCount = 0,
  onOtherClick,
  headSlot,
}: Props) {
  const { t } = useLanguage();
  const activeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userTouchedAt = useRef(0);
  const pillRef = useRef<HTMLSpanElement>(null);

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
  }, [activeCategoryId, cateringActive, otherActive, featuredActive]);

  // The chosen tile's ring glides from one tile to the next (owner,
  // 2026-10-07: "some animation ... now just appear"). Without it the tile's
  // own colour still marks it.
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const el = activeRef.current;
    if (!pill) return;
    if (!el) { pill.classList.remove('is-on'); return; }
    pill.style.transform = `translateY(${el.offsetTop}px)`;
    pill.style.height = `${el.offsetHeight}px`;
    pill.classList.add('is-on');
  });

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
      {headSlot}
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
        <span ref={pillRef} className="cat-rail__pill" aria-hidden="true" />
        {showOffersPill && onOffersClick && (
          <button
            type="button"
            role="tab"
            className="cat-rail__item cat-rail__item--offers"
            onClick={onOffersClick}
          >
            <span
              className="cat-rail__thumb cat-rail__thumb--plain"
              aria-hidden="true"
            >
              %
            </span>
            <span className="cat-rail__label">Offers</span>
          </button>
        )}
        {showFeaturedPill && onFeaturedClick && (
          <button
            type="button"
            role="tab"
            ref={featuredActive ? activeRef : undefined}
            aria-selected={featuredActive}
            className={`cat-rail__item cat-rail__item--featured${featuredActive ? ' is-active' : ''}`}
            data-testid="cat-rail-featured"
            aria-label={featuredLabel}
            onClick={onFeaturedClick}
          >
            <span
              className="cat-rail__thumb cat-rail__thumb--plain"
              aria-hidden="true"
            >
              <Star size={24} strokeWidth={1.5} fill="currentColor" />
            </span>
            <span className="cat-rail__label">{featuredLabel}</span>
          </button>
        )}
        {categories.map((cat) => {
          const active = activeCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              ref={active ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={(counts[cat.id] ?? 0) > 0 ? `${cat.name}, ${counts[cat.id]} item${counts[cat.id] === 1 ? '' : 's'}` : undefined}
              className={`cat-rail__item${active ? ' is-active' : ''}`}
              onClick={() => onSelect(cat.id)}
            >
              <RailThumb category={cat} size={64} className="cat-rail__thumb" />
              <span className="cat-rail__label">{cat.name}</span>
            </button>
          );
        })}
        {/* Dishes with no live category, after the categories and before Events. */}
        {showOtherPill && onOtherClick && (
          <button
            type="button"
            role="tab"
            aria-selected={otherActive}
            aria-label={otherCount > 0 ? `Other, ${otherCount} item${otherCount === 1 ? '' : 's'}` : undefined}
            ref={otherActive ? activeRef : undefined}
            className={`cat-rail__item cat-rail__item--other${otherActive ? ' is-active' : ''}`}
            data-testid="cat-rail-other"
            onClick={onOtherClick}
          >
            <span
              className="cat-rail__thumb cat-rail__thumb--plain"
              aria-hidden="true"
            >
              O
            </span>
            <span className="cat-rail__label">Other</span>
          </button>
        )}
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
              className="cat-rail__thumb cat-rail__thumb--plain"
              aria-hidden="true"
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
