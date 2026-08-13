import { useEffect, useState } from 'react';
import { resolveHeroSlidePresentation } from '../../utils/heroSlidePresentation';

function isShowing(slide: { showing?: boolean }): boolean {
  return slide.showing !== false;
}

type PreviewProps = {
  editor: string;
  value: string;
  appLabel: string;
  /**
   * Plain / textarea keys with no `editor` — render the customer-facing string
   * (§6.4: `home_proof_eyebrow` is not something anyone can picture from its key).
   */
  fallbackLabel?: string;
};

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Read-only live preview for visual Content Studio blocks (active draft). */
export function VisualBlockPreview({ editor, value, appLabel, fallbackLabel }: PreviewProps) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), 200);
    return () => window.clearTimeout(t);
  }, [value]);

  return (
    <div
      className="visual-block-preview"
      data-testid="content-live-preview"
      data-editor={editor || 'text'}
    >
      <div className="visual-block-preview__eyebrow">
        Live preview · {appLabel}
      </div>
      {renderPreview(editor, debounced, fallbackLabel)}
    </div>
  );
}

function renderPreview(editor: string, value: string, fallbackLabel?: string) {
  switch (editor) {
    case 'hero':
      return <HeroVisualPreview value={value} />;
    case 'trust': {
      const items = safeParse<{ icon: string; heading: string; subtext: string }[]>(value, []);
      return (
        <div className="visual-block-preview__grid visual-block-preview__grid--2">
          {items.map((item, i) => (
            <div key={i} className="visual-block-preview__card">
              <div className="visual-block-preview__icon">{item.icon || '·'}</div>
              <div className="visual-block-preview__heading">{item.heading || '—'}</div>
              <div className="visual-block-preview__muted">{item.subtext}</div>
            </div>
          ))}
        </div>
      );
    }
    case 'categories': {
      const items = safeParse<{ icon: string; name: string; hook: string; image_url: string }[]>(value, []);
      return (
        <div className="visual-block-preview__grid visual-block-preview__grid--2">
          {items.map((item, i) => (
            <div key={i} className="visual-block-preview__card visual-block-preview__card--flush">
              {item.image_url ? (
                <img src={item.image_url} alt="" className="visual-block-preview__cat-img" />
              ) : (
                <div className="visual-block-preview__cat-fallback">{item.icon || '?'}</div>
              )}
              <div className="visual-block-preview__pad">
                <div className="visual-block-preview__heading">{item.name || 'Category'}</div>
                <div className="visual-block-preview__muted">{item.hook}</div>
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'proof': {
      const items = safeParse<{ value: string; label: string }[]>(value, []);
      return (
        <div className="visual-block-preview__proof-row">
          {items.map((item, i) => (
            <div key={i} className="visual-block-preview__proof">
              <div className="visual-block-preview__proof-value">{item.value || '—'}</div>
              <div className="visual-block-preview__muted">{item.label}</div>
            </div>
          ))}
        </div>
      );
    }
    case 'about_values': {
      const items = safeParse<{ initial: string; title: string; description: string }[]>(value, []);
      return (
        <div className="visual-block-preview__stack">
          {items.map((item, i) => (
            <div key={i} className="visual-block-preview__value-row">
              <div className="visual-block-preview__initial">{item.initial || '?'}</div>
              <div>
                <div className="visual-block-preview__heading">{item.title || '—'}</div>
                <div className="visual-block-preview__muted">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'preorder_steps': {
      const items = safeParse<{ text: string }[]>(value, []);
      return (
        <ol className="visual-block-preview__steps">
          {items.map((item, i) => (
            <li key={i}>{item.text || '—'}</li>
          ))}
        </ol>
      );
    }
    case 'footer_links': {
      const items = safeParse<{ label: string; url: string }[]>(value, []);
      return (
        <div className="visual-block-preview__stack">
          {items.map((item, i) => (
            <div key={i}>
              <span className="visual-block-preview__link">{item.label || 'Link'}</span>
              {' '}
              <span className="visual-block-preview__muted">{item.url}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'business_hours': {
      const parsed = safeParse<Record<string, string>>(value, {});
      return (
        <div className="visual-block-preview__hours">
          {Object.entries(parsed).map(([day, hours]) => (
            <div key={day} className="visual-block-preview__hours-row">
              <span className="visual-block-preview__muted visual-block-preview__day">{day}</span>
              <span>{hours}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'text':
    case '': {
      const trimmed = value.trim();
      const display = trimmed.includes('<') ? stripHtml(trimmed) : trimmed;
      return (
        <div className="visual-block-preview__as-seen" data-testid="content-value-as-seen">
          {fallbackLabel ? (
            <div className="visual-block-preview__muted visual-block-preview__as-seen-label">{fallbackLabel}</div>
          ) : null}
          <div className="visual-block-preview__as-seen-value">
            {display || 'Not set yet'}
          </div>
        </div>
      );
    }
    default:
      return <div className="visual-block-preview__muted">No preview for this block.</div>;
  }
}

type HeroSlide = Record<string, unknown> & {
  image?: string;
  video?: string;
  video_poster?: string;
  image_focal_x?: number | string;
  image_focal_y?: number | string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  cta_text?: string;
  cta2_text?: string;
  showing?: boolean;
};

function HeroVisualPreview({ value }: { value: string }) {
  const parsed = safeParse<unknown>(value, []);
  const slides = (Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? [parsed]
      : []) as HeroSlide[];

  const showing = slides.filter((s) => isShowing(s));
  const slide = showing[0] || slides[0] || {};
  const presentation = resolveHeroSlidePresentation(slide);
  const media = String(slide.video_poster || slide.image || '').trim();
  const hasVideo = Boolean(String(slide.video || '').trim());
  const fx = Number(slide.image_focal_x);
  const fy = Number(slide.image_focal_y);
  const objectPosition = Number.isFinite(fx) && Number.isFinite(fy)
    ? `${fx}% ${fy}%`
    : '50% 50%';

  return (
    <div
      className={`visual-block-preview__hero visual-block-preview__hero--${presentation.text_position}`}
      data-testid="hero-visual-preview"
      data-showing-count={showing.length}
      data-slide-count={slides.length}
      data-has-video={hasVideo ? '1' : '0'}
    >
      {media ? (
        <img
          src={media}
          alt=""
          className="visual-block-preview__hero-media"
          style={{
            opacity: Math.max(0.15, presentation.photo),
            objectPosition,
          }}
        />
      ) : (
        <div className="visual-block-preview__hero-media visual-block-preview__hero-media--empty" />
      )}
      {presentation.scrim > 0.02 ? (
        <div
          className="visual-block-preview__hero-scrim"
          style={{ opacity: presentation.scrim }}
          aria-hidden
        />
      ) : null}
      <div className="visual-block-preview__hero-copy">
        <div className="visual-block-preview__muted visual-block-preview__hero-meta">
          {showing.length} showing
          {slides.length !== showing.length ? ` · ${slides.length} total` : ''}
          {hasVideo ? ' · video' : ''}
        </div>
        {slide.eyebrow ? (
          <div className="visual-block-preview__hero-eyebrow">{String(slide.eyebrow)}</div>
        ) : null}
        <div
          className="visual-block-preview__hero-title"
          dangerouslySetInnerHTML={{ __html: String(slide.title || 'Hero title') }}
        />
        {slide.subtitle ? (
          <p className="visual-block-preview__hero-subtitle">{String(slide.subtitle)}</p>
        ) : null}
        <div className="visual-block-preview__hero-ctas">
          {slide.cta_text ? (
            <span className="visual-block-preview__cta visual-block-preview__cta--primary">
              {String(slide.cta_text)}
            </span>
          ) : null}
          {slide.cta2_text ? (
            <span className="visual-block-preview__cta visual-block-preview__cta--ghost">
              {String(slide.cta2_text)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
