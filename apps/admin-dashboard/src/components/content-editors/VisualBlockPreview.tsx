import { Fragment, useEffect, useState } from 'react';
import {
  heroElementStyleVars,
  resolveHeroSlidePresentation,
  headingLengthBand,
  splitHeroRichTextLines,
  splitHeroWordSpans,
  type HeroElementKey,
} from '../../utils/heroSlidePresentation';

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
  /**
   * Bump to replay the hero's animations. Undefined / 0 renders the settled
   * final state, which is what an editor wants while you are typing.
   */
  playToken?: number;
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
export function VisualBlockPreview({ editor, value, appLabel, fallbackLabel, playToken }: PreviewProps) {
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
      {renderPreview(editor, debounced, fallbackLabel, playToken)}
    </div>
  );
}

function renderPreview(editor: string, value: string, fallbackLabel?: string, playToken?: number) {
  switch (editor) {
    case 'hero':
      return <HeroVisualPreview value={value} playToken={playToken} />;
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

/**
 * The hero as the website actually draws it.
 *
 * This deliberately emits the same class names, data attributes and
 * --hero-el-* custom properties as partials/home/hero.blade.php, and the
 * preview stylesheet ports the matching rules from home.blade.php. That is the
 * only way roughly thirty styling controls — per-line backgrounds, outlines,
 * borders, gradients, geometry, per-part alignment — can be judged without
 * saving and reloading the public site.
 *
 * Motion is represented as final state, not replayed: an editor that
 * re-animates on every keystroke is unusable.
 */
function HeroVisualPreview({ value, playToken }: { value: string; playToken?: number }) {
  const parsed = safeParse<unknown>(value, []);
  const slides = (Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? [parsed]
      : []) as HeroSlide[];

  const showing = slides.filter((s) => isShowing(s));
  const slide = (showing[0] || slides[0] || {}) as HeroSlide;
  const row = slide as Record<string, unknown>;
  const presentation = resolveHeroSlidePresentation(slide);
  const media = String(slide.video_poster || slide.image || '').trim();
  const hasVideo = Boolean(String(slide.video || '').trim());
  const fx = Number(slide.image_focal_x);
  const fy = Number(slide.image_focal_y);
  const objectPosition = Number.isFinite(fx) && Number.isFinite(fy)
    ? `${fx}% ${fy}%`
    : '50% 50%';

  const el = presentation.elements;
  const part = presentation.parts;
  const styles = presentation.styles;

  /** Element background attributes, exactly as the Blade partial sets them. */
  const bgAttrs = (key: HeroElementKey) => {
    const bg = el[key];
    if (!bg?.css) return {};
    return {
      ...(bg.token === 'glass' ? { 'data-bg-glass': '1' } : { 'data-has-bg': '1' }),
      'data-bg-shape': bg.shape,
    };
  };

  const styleVars = (key: HeroElementKey) =>
    heroElementStyleVars(row, key) as React.CSSProperties;

  // No placeholder heading: the site renders nothing when there is no
  // heading, and inventing "Hero title" showed copy that will never appear.
  const titleHtml = String(slide.title ?? '').trim();
  const subtitle = String(slide.subtitle || '');
  const titleLines = splitHeroRichTextLines(titleHtml);
  // Long headings step down on the site; without this the preview shows a
  // size the visitor will not get.
  const titleBand = headingLengthBand(titleHtml);

  return (
    <div
      className={`visual-block-preview__hero hero-preview visual-block-preview__hero--${presentation.text_position}`}
      data-testid="hero-visual-preview"
      data-showing-count={showing.length}
      data-slide-count={slides.length}
      data-has-video={hasVideo ? '1' : '0'}
      data-photo-anim={presentation.motion.photo}
      // Motion runs only while playing, so the editor is not re-animating on
      // every keystroke; the key restarts the CSS animations on replay.
      data-playing={playToken ? 'yes' : 'no'}
      key={playToken ?? 'static'}
      style={{
        // The site paints #1C1408 behind the photo, so a slide with no image
        // reads as a dark banner rather than a white card.
        background: '#1C1408',
        // The copy shade is drawn from this on the site; without it the
        // "shade behind all the text" strength slider does nothing here.
        ['--hero-scrim' as string]: String(presentation.scrim),
        // Both feed the site's animation timing; without them every effect
        // would run at the default speed and stagger.
        ['--hero-speed' as string]: presentation.motion.speed,
        ['--hero-photo-speed' as string]: presentation.motion.photo_speed,
        ['--hero-stagger' as string]: `${presentation.motion.delay_step}ms`,
      } as React.CSSProperties}
    >
      {media ? (
        <img
          src={media}
          alt=""
          className="visual-block-preview__hero-media"
          style={{
            // Exactly the site's rule for .banner-slide img:
            //   opacity: calc(0.45 + 0.55 * var(--hero-photo, 0))
            // presentation.photo is the 0-1 form. The previous version passed
            // photo_brightness — which is 0-100 — into a CSS brightness()
            // filter, so a normal slide rendered at brightness(100): the photo
            // loaded fine and was blown out to solid white.
            opacity: 0.45 + 0.55 * presentation.photo,
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
        <div
          className="banner-copy"
          {...(presentation.copy_scrim ? {} : { 'data-copy-scrim': 'off' })}
        >
          {slide.eyebrow ? (
            <span
              className="banner-eyebrow"
              data-align={part.eyebrow.align}
              {...bgAttrs('eyebrow')}
              style={styleVars('eyebrow')}
            >
              {String(slide.eyebrow)}
            </span>
          ) : null}
          {titleHtml ? (
          <h2
            className="banner-title"
            {...(titleBand ? { 'data-len': titleBand } : {})}
            data-align={part.title.align}
            data-anim={part.title.text}
            {...(part.title.box !== 'none' ? { 'data-box-anim': part.title.box } : {})}
            {...(styles.title.outline ? { 'data-outline': '1' } : {})}
            {...(styles.title.border ? { 'data-border': '1' } : {})}
            {...bgAttrs('title')}
            style={styleVars('title')}
          >
            {titleLines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? <br /> : null}
                <span
                  className="hero-title-line"
                  style={{ '--hero-line-i': i } as React.CSSProperties}
                  dangerouslySetInnerHTML={{
                    __html: part.title.text === 'word' ? splitHeroWordSpans(line) : line,
                  }}
                />
              </Fragment>
            ))}
          </h2>
          ) : null}
          {subtitle ? (
            <p
              className="banner-sub"
              data-align={part.subtitle.align}
              data-anim={part.subtitle.text}
              {...(part.subtitle.box !== 'none' ? { 'data-box-anim': part.subtitle.box } : {})}
              {...(styles.subtitle.outline ? { 'data-outline': '1' } : {})}
              {...(styles.subtitle.border ? { 'data-border': '1' } : {})}
              {...bgAttrs('subtitle')}
              style={styleVars('subtitle')}
            >
              <span
                className="hero-sub-line"
                style={{ '--hero-line-i': 0 } as React.CSSProperties}
                dangerouslySetInnerHTML={{
                  __html: part.subtitle.text === 'word' ? splitHeroWordSpans(subtitle) : subtitle,
                }}
              />
            </p>
          ) : null}
          {slide.cta_text || slide.cta2_text ? (
            <div className="banner-ctas" data-align={part.cta1.align}>
              {slide.cta_text ? (
                <span className="banner-cta-primary" {...bgAttrs('cta1')} style={styleVars('cta1')}>
                  {String(slide.cta_text)}
                </span>
              ) : null}
              {slide.cta2_text ? (
                <span className="banner-cta-secondary" {...bgAttrs('cta2')} style={styleVars('cta2')}>
                  {String(slide.cta2_text)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
