import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MediaSlide } from '../../utils/itemMedia';
import { buildJpegSrcSet, buildWebpSrcSet } from '../../utils/itemMedia';
import { BrandedMediaPlaceholder } from './BrandedMediaPlaceholder';
import { PictureImg } from './PictureImg';

type Props = {
  slides: MediaSlide[] | string[];
  alt: string;
  /** Auto-advance interval in ms (default 3500). Disabled when < 2 slides. */
  intervalMs?: number;
  aspectRatio?: string;
  className?: string;
  /** Show bottom dots when multiple slides */
  showDots?: boolean;
  /** @deprecated Emoji placeholder removed — branded fill is always used */
  placeholder?: string;
  /** Optional logo for branded empty state */
  logoSrc?: string | null;
  /** Monogram when no logo (defaults from alt initial or BG) */
  monogram?: string;
  /**
   * When true (menu cards), never mount <video> — render poster/image only.
   * Item sheet should leave this false so muted clips can autoplay.
   */
  posterOnly?: boolean;
  /** CSS sizes hint for srcset selection (e.g. card vs sheet). */
  sizes?: string;
  /**
   * How to frame the site stand-in when an item has no photo of its own.
   *
   * 'cover' (default) suits a round card — the logo fills the circle. 'contain'
   * suits a wide hero, where cropping a square logo to 16/10 cuts the flame off
   * the top and the wordmark off the bottom. Real photos always cover.
   */
  placeholderFit?: 'cover' | 'contain';
};

function normalizeSlides(slides: MediaSlide[] | string[], fallbackAlt: string): MediaSlide[] {
  if (slides.length === 0) return [];
  if (typeof slides[0] === 'string') {
    return (slides as string[]).map((url) => ({ type: 'image' as const, url, alt: fallbackAlt }));
  }
  return slides as MediaSlide[];
}

/**
 * Cross-fading media slider for menu cards / item sheets.
 * Video autoplays muted+loop+playsInline only when posterOnly is false.
 */
export function MenuImageSlider({
  slides: rawSlides,
  alt,
  intervalMs = 3500,
  aspectRatio = '4 / 3',
  className,
  showDots = true,
  logoSrc,
  monogram,
  posterOnly = false,
  sizes = '(max-width: 640px) 92vw, 480px',
  placeholderFit = 'cover',
}: Props) {
  const slides = normalizeSlides(rawSlides, alt);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const [index, setIndex] = useState(0);
  const [inView, setInView] = useState(true);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [reduceMotion, setReduceMotion] = useState(false);

  const usable = slides.filter((_, i) => !failed[i]);
  const active = slides[index] && !failed[index] ? slides[index] : usable[0] ?? null;
  const mark = monogram
    || (alt.trim()[0]?.toUpperCase() ?? 'B') + (alt.trim().split(/\s+/)[1]?.[0]?.toUpperCase() ?? 'G');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    setIndex(0);
    setFailed({});
  }, [slides.map((s) => s.url).join('|')]);

  useEffect(() => {
    if (slides.length < 2 || reduceMotion || !inView || paused) return;
    // Don't auto-advance away from an active video while it's playing.
    if (!posterOnly && active?.type === 'video') return;
    const id = window.setInterval(() => {
      setIndex((i) => {
        for (let step = 1; step <= slides.length; step++) {
          const next = (i + step) % slides.length;
          if (!failed[next]) return next;
        }
        return i;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [slides.length, reduceMotion, inView, paused, intervalMs, failed, posterOnly, active?.type]);

  // Play/pause videos based on active index + visibility + reduced motion.
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([key, el]) => {
      if (!el) return;
      const i = Number(key);
      const shouldPlay =
        !posterOnly
        && !reduceMotion
        && inView
        && !paused
        && i === index
        && slides[i]?.type === 'video';
      if (shouldPlay) {
        const playResult = el.play();
        if (playResult && typeof (playResult as Promise<void>).catch === 'function') {
          void (playResult as Promise<void>).catch(() => undefined);
        }
      } else if (typeof el.pause === 'function') {
        el.pause();
      }
    });
  }, [index, inView, paused, reduceMotion, posterOnly, slides]);

  /** True when the slide on screen is the stand-in and this surface contains it. */
  const containingPlaceholder = placeholderFit === 'contain'
    && slides[index]?.isPlaceholder === true;

  const renderSlide = (slide: MediaSlide, i: number) => {
    if (failed[i]) return null;
    const isActive = i === index;
    // Framing is the surface's call, not this component's. A round card wants
    // the stand-in logo cropped to fill the circle; a wide hero does not,
    // because cover at 16/10 slices the flame off the top and the wordmark off
    // the bottom — which is what an item with no photo used to show.
    const containThis = slide.isPlaceholder === true && placeholderFit === 'contain';
    const commonStyle: CSSProperties = {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: containThis ? 'contain' : 'cover',
      // border-box so the inset:0 box is not grown by the padding.
      padding: containThis ? '4%' : undefined,
      boxSizing: 'border-box',
      display: 'block',
      opacity: isActive ? 1 : 0,
      transition: reduceMotion ? 'none' : 'opacity 0.55s ease',
    };

    const showVideo = slide.type === 'video' && !posterOnly && !reduceMotion;
    if (showVideo) {
      return (
        <video
          key={`v-${slide.url}-${i}`}
          ref={(el) => { videoRefs.current[i] = el; }}
          src={slide.url}
          poster={slide.poster || undefined}
          muted
          loop
          playsInline
          autoPlay={isActive && inView}
          preload="metadata"
          aria-label={isActive ? (slide.alt || alt) : undefined}
          aria-hidden={isActive ? undefined : true}
          onError={() => setFailed((f) => ({ ...f, [i]: true }))}
          style={commonStyle}
        />
      );
    }

    const imgSrc = slide.type === 'video'
      ? (slide.poster || slide.thumbUrl || slide.url)
      : slide.url;
    const webpSrc = slide.type === 'video' ? null : slide.webpUrl;
    const jpegSrcSet = slide.type === 'video'
      ? undefined
      : buildJpegSrcSet({ url: slide.url, thumbUrl: slide.thumbUrl });
    const webpSrcSet = slide.type === 'video'
      ? undefined
      : buildWebpSrcSet({ webpUrl: slide.webpUrl, thumbWebpUrl: slide.thumbWebpUrl });

    return (
      <PictureImg
        key={`i-${imgSrc}-${i}`}
        src={imgSrc}
        webpSrc={webpSrc}
        srcSet={jpegSrcSet}
        webpSrcSet={webpSrcSet}
        sizes={sizes}
        alt={isActive ? (slide.alt || alt) : ''}
        aria-hidden={isActive ? undefined : true}
        loading="lazy"
        decoding="async"
        onError={() => setFailed((f) => ({ ...f, [i]: true }))}
        style={commonStyle}
      />
    );
  };

  return (
    <div
      ref={rootRef}
      className={`menu-image-slider${className ? ` ${className}` : ''}`}
      style={{
        width: '100%',
        height: '100%',
        aspectRatio,
        background: containingPlaceholder
          // Matches the stand-in's own ground, so the contained logo reads as
          // one panel rather than a black square floating on cream. Sampled
          // from the current stand-in, which is solid #000 to every edge.
          ? 'var(--menu-placeholder-bg, #000)'
          : (active ? 'var(--color-surface-alt)' : undefined),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {active ? (
        slides.map((slide, i) => renderSlide(slide, i))
      ) : (
        <BrandedMediaPlaceholder logoSrc={logoSrc} monogram={mark.slice(0, 2)} />
      )}

      {showDots && usable.length > 1 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 8,
            display: 'flex',
            justifyContent: 'center',
            gap: 5,
            zIndex: 2,
          }}
        >
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show slide ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                border: 'none',
                padding: 0,
                background: i === index ? 'var(--color-primary)' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
