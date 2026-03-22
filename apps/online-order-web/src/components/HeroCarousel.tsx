import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import type { HeroSlideRow } from '../context/SiteSettingsContext';

function resolveImg(src: string | undefined, apiOrigin: string): string | null {
  if (!src) return null;
  if (src.startsWith('http')) return src;
  return `${apiOrigin}${src.startsWith('/') ? '' : '/'}${src}`;
}

/** Map Blade paths like /order/ to React Router paths under /order */
function orderAppHref(bladeUrl: string): string {
  const t = bladeUrl.trim();
  if (t === '/order' || t === '/order/') return '/';
  if (t.startsWith('/order/')) {
    const rest = t.slice('/order'.length);
    return rest || '/';
  }
  return t.startsWith('/') ? t : `/${t}`;
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
  /** Shown when slides.length === 0 */
  fallback: React.ReactNode;
  /** Absolute-positioned hero status (e.g. OpeningStatusBadge) */
  statusSlot?: React.ReactNode;
};

/**
 * Mirrors Blade `.hero-banner` carousel: heights 600px / 420px mobile,
 * overlay gradient, dots, auto-advance ~6s.
 */
export function HeroCarousel({ slides, apiOrigin, fallback, statusSlot }: Props) {
  const [idx, setIdx] = useState(0);
  const n = slides.length;

  const move = useCallback(
    (delta: number) => {
      if (n <= 0) return;
      setIdx((i) => (i + delta + n) % n);
    },
    [n]
  );

  useEffect(() => {
    if (n <= 1) return;
    const t = window.setInterval(() => move(1), 6000);
    return () => clearInterval(t);
  }, [n, move]);

  if (n === 0) return <>{fallback}</>;

  return (
    <div className="order-hero-banner">
      {statusSlot}
      <div
        className="order-banner-track"
        style={{ transform: `translateX(-${idx * 100}%)` }}
      >
        {slides.map((slide, i) => {
          const img = resolveImg(slide.image, apiOrigin);
          return (
            <div
              key={i}
              className={`order-banner-slide${i === idx ? ' active' : ''}`}
            >
              {img ? (
                <img src={img} alt="" className="order-banner-slide-img" />
              ) : (
                <div className="order-banner-slide-placeholder" />
              )}
              <div className="order-banner-overlay">
                {slide.eyebrow && (
                  <span className="home-banner-eyebrow order-banner-eyebrow-on-photo">
                    {slide.eyebrow}
                  </span>
                )}
                {slide.title && (
                  <h1
                    className="home-banner-title order-banner-title-on-photo"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(slide.title, { ALLOWED_TAGS: ['br', 'em', 'strong'] }) }}
                  />
                )}
                {slide.subtitle && (
                  <p
                    className="home-banner-sub order-banner-sub-on-photo"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(slide.subtitle, { ALLOWED_TAGS: ['br', 'em', 'strong'] }) }}
                  />
                )}
                <div className="home-banner-ctas order-banner-ctas-on-photo">
                  {slide.cta_text && slide.cta_url && (
                    <CtaLink
                      href={slide.cta_url}
                      className="home-banner-cta-primary"
                    >
                      {slide.cta_text}
                    </CtaLink>
                  )}
                  {slide.cta2_text && slide.cta2_url && (
                    <CtaLink
                      href={slide.cta2_url}
                      className="home-banner-cta-secondary"
                    >
                      {slide.cta2_text}
                    </CtaLink>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <div className="order-banner-dots" role="tablist" aria-label="Hero slides">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`order-banner-dot${i === idx ? ' active' : ''}`}
              aria-label={`Slide ${i + 1}`}
              aria-selected={i === idx}
              onClick={() => setIdx(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
