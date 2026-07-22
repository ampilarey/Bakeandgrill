import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import type { HeroSlideRow } from '../../context/SiteSettingsContext';
import { useLanguage } from '../../context/LanguageContext';

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
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  if (href.startsWith('http')) {
    return (
      <a href={href} className={className} rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link to={orderAppHref(href)} className={className}>
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
 * 16:9 promotional carousel.
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

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    setPaused(false);
    if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
  };

  const handleImgError = (i: number) => {
    setImgErrors((prev) => {
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  };

  const outerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    overflow: 'hidden',
    background: 'var(--color-surface-alt)',
  };

  if (loading) {
    return (
      <div style={outerStyle} aria-label={t('home.promo_region')} aria-busy="true">
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
        style={{
          ...outerStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '0.5rem',
          borderTop: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          padding: '1.25rem',
          textAlign: 'center',
        }}
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
      aria-label={t('home.promo_region')}
      style={outerStyle}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {statusSlot}
      {/* Sliding track */}
      <div
        style={{
          display: 'flex',
          width: `${n * 100}%`,
          height: '100%',
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
          const alt =
            slide.image_alt
            || (slide.title ? String(slide.title).replace(/<[^>]+>/g, '') : 'Promotional banner');
          return (
            <div
              key={i}
              style={{
                flex: `0 0 ${100 / n}%`,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {videoSrc ? (
                <video
                  src={videoSrc}
                  poster={posterSrc || undefined}
                  autoPlay
                  muted
                  loop
                  playsInline
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                    objectPosition: `${focalX}% ${focalY}%`,
                  }}
                />
              ) : imgSrc && !imgBroken ? (
                <img
                  src={imgSrc}
                  alt={alt}
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                    objectPosition: `${focalX}% ${focalY}%`,
                  }}
                  onError={() => handleImgError(i)}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'var(--color-surface-alt)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src="/logo.png"
                    alt="Bake & Grill"
                    style={{ height: 48, objectFit: 'contain', opacity: 0.5 }}
                  />
                </div>
              )}

              {/* Overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(to top, rgba(28,20,8,0.72) 0%, rgba(28,20,8,0.12) 55%, transparent 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  padding: 'clamp(0.75rem, 4%, 2rem)',
                }}
              >
                {slide.eyebrow && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: 'rgba(255,255,255,0.75)',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {slide.eyebrow}
                  </span>
                )}
                {slide.title && (
                  <h2
                    style={{
                      fontSize: 'clamp(1rem, 4vw, 2rem)',
                      fontWeight: 800,
                      color: '#fff',
                      margin: '0 0 0.375rem',
                      lineHeight: 1.2,
                      letterSpacing: '-0.02em',
                    }}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(slide.title, {
                        ALLOWED_TAGS: ['br', 'em', 'strong'],
                      }),
                    }}
                  />
                )}
                {slide.subtitle && (
                  <p
                    style={{
                      fontSize: 'clamp(0.8rem, 2.5vw, 1rem)',
                      color: 'rgba(255,255,255,0.8)',
                      margin: '0 0 0.625rem',
                      lineHeight: 1.4,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(slide.subtitle, {
                        ALLOWED_TAGS: ['br', 'em', 'strong'],
                      }),
                    }}
                  />
                )}
                {(slide.cta_text && slide.cta_url) ||
                (slide.cta2_text && slide.cta2_url) ? (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {slide.cta_text && slide.cta_url && (
                      <CtaLink href={slide.cta_url} className="home-banner-cta-primary">
                        {slide.cta_text}
                      </CtaLink>
                    )}
                    {slide.cta2_text && slide.cta2_url && (
                      <CtaLink href={slide.cta2_url} className="home-banner-cta-secondary">
                        {slide.cta2_text}
                      </CtaLink>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dot navigation */}
      {n > 1 && (
        <div
          role="tablist"
          aria-label="Slides"
          style={{
            position: 'absolute',
            bottom: '0.625rem',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '0.375rem',
            zIndex: 2,
          }}
        >
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-label={`Slide ${i + 1}`}
              aria-selected={i === idx}
              onClick={() => setIdx(i)}
              style={{
                width: i === idx ? 20 : 8,
                height: 8,
                borderRadius: 'var(--radius-full)',
                background: i === idx ? '#fff' : 'rgba(255,255,255,0.45)',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
