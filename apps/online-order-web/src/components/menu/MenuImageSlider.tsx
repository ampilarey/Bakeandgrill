import { useEffect, useRef, useState } from 'react';

type Props = {
  slides: string[];
  alt: string;
  /** Auto-advance interval in ms (default 3500). Disabled when < 2 slides. */
  intervalMs?: number;
  aspectRatio?: string;
  className?: string;
  /** Show bottom dots when multiple slides */
  showDots?: boolean;
  /** Emoji / placeholder when no slides */
  placeholder?: string;
};

/**
 * Cross-fading image slider for menu cards / item sheets.
 * Auto-advances when in view; pauses on hover and for reduced-motion.
 */
export function MenuImageSlider({
  slides,
  alt,
  intervalMs = 3500,
  aspectRatio = '4 / 3',
  className,
  showDots = true,
  placeholder = '🍽️',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [inView, setInView] = useState(true);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [reduceMotion, setReduceMotion] = useState(false);

  const usable = slides.filter((_, i) => !failed[i]);
  const activeSrc = slides[index] && !failed[index] ? slides[index] : usable[0] ?? null;

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
  }, [slides.join('|')]);

  useEffect(() => {
    if (slides.length < 2 || reduceMotion || !inView || paused) return;
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
  }, [slides.length, reduceMotion, inView, paused, intervalMs, failed]);

  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        width: '100%',
        aspectRatio,
        background: activeSrc
          ? 'var(--color-surface-alt)'
          : 'linear-gradient(135deg, var(--color-primary-light), var(--color-surface-alt))',
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
      {slides.length > 0 ? (
        slides.map((src, i) => (
          failed[i] ? null : (
            <img
              key={`${src}-${i}`}
              src={src}
              alt={i === index ? alt : ''}
              aria-hidden={i !== index}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              onError={() => setFailed((f) => ({ ...f, [i]: true }))}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                opacity: i === index ? 1 : 0,
                transition: reduceMotion ? 'none' : 'opacity 0.55s ease',
              }}
            />
          )
        ))
      ) : (
        <span style={{ fontSize: '2.5rem', opacity: 0.35 }} aria-hidden>{placeholder}</span>
      )}

      {showDots && slides.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 5,
            zIndex: 2,
            pointerEvents: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Photo ${i + 1} of ${slides.length}`}
              onClick={(e) => {
                e.stopPropagation();
                setIndex(i);
              }}
              style={{
                width: i === index ? 16 : 8,
                height: 8,
                borderRadius: 99,
                border: 'none',
                background: i === index ? '#fff' : 'rgba(255,255,255,0.55)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                cursor: 'pointer',
                padding: 0,
                transition: 'width 0.2s ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
