import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import type { HeroSlideRow } from '../../context/SiteSettingsContext';
import { useLanguage } from '../../context/LanguageContext';
import { safePublicUrl } from '../../utils/safePublicUrl';
import {
  headingLengthBand,
  resolveHeroSlidePresentation,
  splitHeroRichTextLines,
  type HeroElementBackground,
} from '../../utils/heroSlidePresentation';

function elementBgProps(el: HeroElementBackground): {
  'data-has-bg'?: '1';
  'data-bg-glass'?: '1';
  'data-bg-full'?: '1' | '0';
  style?: CSSProperties;
} {
  if (!el.css) return {};
  const style = { ['--hero-el-bg' as string]: el.css } as CSSProperties;
  if (el.token === 'glass') {
    return {
      'data-bg-glass': '1',
      ...(el.full_width ? { 'data-bg-full': '1' as const } : {}),
      style,
    };
  }
  return {
    'data-has-bg': '1',
    'data-bg-full': el.full_width ? '1' : '0',
    style,
  };
}

/** Sanitize rich hero copy (title/subtitle allow br/em/strong). */
function sanitizeHeroHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['br', 'em', 'strong'] });
}

/** Wrap each hard <br> segment so desktop can keep intentional line breaks. */
function titleLineNodes(html: string): ReactNode {
  const lines = splitHeroRichTextLines(html);
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      <span className="hero-title-line" dangerouslySetInnerHTML={{ __html: line }} />
    </Fragment>
  ));
}

/**
 * Title/subtitle with optional per-element contrast.
 * Glass: frosted panel. Full-width solid bar. Else: letter outline / halo.
 * Titles split on <br> into .hero-title-line (desktop nowrap).
 */
function HeroTextBlock({
  as: Tag,
  className,
  html,
  el,
  testId,
}: {
  as: 'h2' | 'p';
  className: string;
  html: string;
  el: HeroElementBackground;
  testId?: string;
}) {
  const clean = sanitizeHeroHtml(html);
  const isTitle = Tag === 'h2';

  // Shape drives the look; glass is a material that layers onto it. Lockstep
  // with the website Blade and HeroSlides::resolveElementShape().
  const contrastProps: {
    'data-bg-glass'?: '1';
    'data-bg-shape'?: string;
    'data-has-bg'?: '1';
    style?: CSSProperties;
  } = {};
  if (el.css) {
    contrastProps['data-has-bg'] = '1';
    contrastProps['data-bg-shape'] = el.shape;
    if (el.token === 'glass') contrastProps['data-bg-glass'] = '1';
    contrastProps.style = { ['--hero-el-bg' as string]: el.css } as CSSProperties;
  }

  if (isTitle) {
    // Long headings shrink rather than wrap and burst out of a fixed-height
    // banner. Owner's choice, 2026-08-16. Lockstep with the website's
    // data-len bands.
    const band = headingLengthBand(html);
    return (
      <Tag
        className={className}
        data-testid={testId}
        {...(band ? { 'data-len': band } : {})}
        {...contrastProps}
      >
        {titleLineNodes(clean)}
      </Tag>
    );
  }

  // The inline span is what the per-line shape paints; a block element can
  // only ever draw one box around all the lines.
  return (
    <Tag className={className} data-testid={testId} {...contrastProps}>
      <span className="hero-sub-line" dangerouslySetInnerHTML={{ __html: clean }} />
    </Tag>
  );
}

function resolveImg(src: string | undefined, apiOrigin: string): string | null {
  if (!src) return null;
  if (src.startsWith('http')) return src;
  return `${apiOrigin}${src.startsWith('/') ? '' : '/'}${src}`;
}

function orderAppHref(bladeUrl: string): string {
  const trimmed = bladeUrl.trim();
  if (trimmed === '/order' || trimmed === '/order/') return '/';
  if (trimmed.startsWith('/order/')) {
    const rest = trimmed.slice('/order'.length);
    return rest || '/';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function CtaLink({
  href,
  className,
  children,
  ...rest
}: {
  href: string;
  className: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLAnchorElement>) {
  const safeHref = safePublicUrl(href) ?? '#';
  if (!safeHref.startsWith('/')) {
    return (
      <a href={safeHref} className={className} rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={orderAppHref(safeHref)} className={className} {...rest}>
      {children}
    </Link>
  );
}

type Props = {
  slides: HeroSlideRow[];
  apiOrigin: string;
  loading?: boolean;
  /** CMS empty-hero fallback */
  fallbackTitle?: string;
  fallbackSubtitle?: string;
  logoSrc?: string;
  siteName?: string;
  /** Ordering open/closed pill — sits on the hero (top-right). */
  statusSlot?: ReactNode;
};

/**
 * Homepage hero carousel — heights match main-site `.hero-banner`
 * (mobile soft portrait 4:5; desktop min(78vh, 760px)).
 * - Autoplay every 5s; pauses on hover/touch-hold.
 * - Respects prefers-reduced-motion.
 * - Zero slides → static cream fallback card (never collapses).
 * - Broken image → cream + logo fallback per slide.
 * - Optional statusSlot overlays the top of the hero.
 */
export function PromoCarousel({
  slides,
  apiOrigin,
  loading,
  fallbackTitle,
  fallbackSubtitle,
  logoSrc = '/logo.png',
  siteName = 'Bake & Grill',
  statusSlot,
}: Props) {
  const { t } = useLanguage();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set());
  const touchStartX = useRef<number | null>(null);
  const n = slides.length;

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const move = useCallback(
    (delta: number) => {
      if (n <= 0) return;
      setIdx((i) => (i + delta + n) % n);
    },
    [n],
  );

  useEffect(() => {
    if (n <= 1 || paused || prefersReduced) return;
    const timer = window.setInterval(() => move(1), 5000);
    return () => clearInterval(timer);
  }, [n, move, paused, prefersReduced]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  };

  const endTouch = (clientX: number | null) => {
    if (touchStartX.current === null || clientX === null) {
      touchStartX.current = null;
      setPaused(false);
      return;
    }
    const dx = clientX - touchStartX.current;
    touchStartX.current = null;
    setPaused(false);
    if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    endTouch(e.changedTouches[0]?.clientX ?? null);
  };

  const onTouchCancel = () => {
    endTouch(null);
  };

  const handleImgError = (i: number) => {
    setImgErrors((prev) => {
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="home-promo-hero" aria-label={t('home.promo_region')} aria-busy="true">
        <span
          className="skeleton-block"
          style={{ width: '100%', height: '100%', borderRadius: 0, display: 'block' }}
          role="status"
          aria-label={t('common.loading')}
        />
        {statusSlot}
      </div>
    );
  }

  if (n === 0) {
    return (
      <div
        className="home-promo-hero home-promo-hero--empty"
        aria-label={t('home.promo_region')}
      >
        {statusSlot}
        <img
          src={logoSrc}
          alt={siteName}
          style={{ height: 48, objectFit: 'contain', opacity: 0.55 }}
        />
        {fallbackTitle && (
          <p style={{ margin: 0, fontWeight: 800, fontSize: '1.05rem', color: 'var(--color-dark)' }}>
            {fallbackTitle}
          </p>
        )}
        {fallbackSubtitle && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted)', maxWidth: 360, lineHeight: 1.45 }}>
            {fallbackSubtitle}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="home-promo-hero"
      data-testid="home-promo-hero"
      aria-label={t('home.promo_region')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      {statusSlot}
      {/* Sliding track */}
      <div
        className="home-promo-hero__track"
        style={{
          width: `${n * 100}%`,
          transform: `translateX(-${idx * (100 / n)}%)`,
          transition: prefersReduced ? 'none' : 'transform 0.45s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {slides.map((slide, i) => {
          const imgSrc = resolveImg(slide.image, apiOrigin);
          const videoSrc = resolveImg(slide.video, apiOrigin);
          const posterSrc = resolveImg(slide.video_poster || slide.image, apiOrigin);
          const imgBroken = imgErrors.has(i);
          const focalX = Number(slide.image_focal_x ?? 50);
          const focalY = Number(slide.image_focal_y ?? 50);
          const presentation = resolveHeroSlidePresentation(slide);
          const alt =
            slide.image_alt
            || (slide.title ? String(slide.title).replace(/<[^>]+>/g, '') : 'Promotional banner');
          const eyebrow = (slide.eyebrow ?? '').trim();
          const cta1 = (slide.cta_text ?? '').trim();
          const cta2 = (slide.cta2_text ?? '').trim();
          const cta1Raw = (slide.cta_url ?? '').trim();
          const cta2Raw = (slide.cta2_url ?? '').trim();
          const cta1Href = safePublicUrl(cta1Raw || '/order/') ?? '#';
          const cta2Href = safePublicUrl(cta2Raw || '/order/menu') ?? '#';
          return (
            <div
              key={i}
              className="home-promo-hero__slide"
              style={{
                flex: `0 0 ${100 / n}%`,
                ...( {
                  '--hero-photo': String(presentation.photo),
                  '--hero-scrim': String(presentation.scrim),
                } as CSSProperties ),
              }}
            >
              {videoSrc ? (
                <video
                  className="home-promo-hero__media"
                  src={videoSrc}
                  poster={posterSrc || undefined}
                  autoPlay
                  muted
                  loop
                  playsInline
                  style={{ objectPosition: `${focalX}% ${focalY}%` }}
                />
              ) : imgSrc && !imgBroken ? (
                <img
                  className="home-promo-hero__media"
                  src={imgSrc}
                  alt={alt}
                  style={{ objectPosition: `${focalX}% ${focalY}%` }}
                  onError={() => handleImgError(i)}
                />
              ) : (
                <div className="home-promo-hero__fallback">
                  <img
                    src="/logo.png"
                    alt="Bake & Grill"
                    style={{ height: 48, objectFit: 'contain', opacity: 0.5 }}
                  />
                </div>
              )}

              <div
                className="home-promo-hero__overlay"
                data-text-position={presentation.text_position}
                data-testid={`hero-overlay-${i}`}
              >
                <div
                  className="home-promo-hero__copy"
                  {...(presentation.copy_scrim ? {} : { 'data-copy-scrim': 'off' as const })}
                >
                {eyebrow ? (
                  <span className="home-promo-hero__eyebrow" {...elementBgProps(presentation.elements.eyebrow)}>
                    {eyebrow}
                  </span>
                ) : null}
                {slide.title ? (
                  <HeroTextBlock
                    as="h2"
                    className="home-promo-hero__title"
                    html={slide.title}
                    el={presentation.elements.title}
                    testId={`hero-title-${i}`}
                  />
                ) : null}
                {slide.subtitle ? (
                  <HeroTextBlock
                    as="p"
                    className="home-promo-hero__sub"
                    html={slide.subtitle}
                    el={presentation.elements.subtitle}
                    testId={`hero-sub-${i}`}
                  />
                ) : null}
                {cta1 || cta2 ? (
                  <div className="home-promo-hero__ctas">
                    {cta1 ? (
                      <CtaLink
                        href={cta1Href}
                        className="home-banner-cta-primary"
                        {...elementBgProps(presentation.elements.cta1)}
                      >
                        {cta1}
                      </CtaLink>
                    ) : null}
                    {cta2 ? (
                      <CtaLink
                        href={cta2Href}
                        className="home-promo-hero__cta-secondary"
                        {...elementBgProps(presentation.elements.cta2)}
                      >
                        {cta2}
                      </CtaLink>
                    ) : null}
                  </div>
                ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <>
          <button
            type="button"
            className="home-promo-hero__btn home-promo-hero__btn--prev"
            aria-label="Previous slide"
            onClick={() => move(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="home-promo-hero__btn home-promo-hero__btn--next"
            aria-label="Next slide"
            onClick={() => move(1)}
          >
            ›
          </button>
          <div className="home-promo-hero__dots" role="tablist" aria-label="Slides">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-label={`Slide ${i + 1}`}
                aria-selected={i === idx}
                className={`home-promo-hero__dot${i === idx ? ' is-active' : ''}`}
                onClick={() => setIdx(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
