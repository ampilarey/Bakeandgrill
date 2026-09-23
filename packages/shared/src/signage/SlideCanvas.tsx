import { Component, type CSSProperties, type ErrorInfo, type ImgHTMLAttributes, type ReactNode, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatPrice, resolveBoundItems } from './bindMenu';
import { EmergencyIcon } from './emergencyIcons';
import { interpolate, tidyInterpolated } from './interpolate';
import type { MenuItemLite, SignageConfig, SignageElement, SignageSlide, SignageTheme } from './types';

function PictureImg({
  src,
  webpSrc,
  alt = '',
  style,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string; webpSrc?: string | null }) {
  const webp = webpSrc && webpSrc.trim() !== '' ? webpSrc : null;
  if (!webp) {
    return <img src={src} alt={alt} style={style} {...rest} />;
  }
  return (
    <picture>
      <source type="image/webp" srcSet={webp} />
      <img src={src} alt={alt} style={style} {...rest} />
    </picture>
  );
}

/**
 * A Dhivehi name beside its English one. Marking it `lang="dv"` is what
 * selects the Thaana face (shared fonts.css) — no per-element font wiring.
 */
function DvName({ text, className, style }: { text?: string | null; className: string; style?: CSSProperties }) {
  const dv = text?.trim();
  if (!dv) return null;
  return <span lang="dv" dir="rtl" className={className} style={style}>{dv}</span>;
}

/** How wide the brand mark sits across the code — the same as the printed codes. */
const QR_SIZE = 300;
const QR_LOGO_RATIO = 0.26;

function isNewItem(item: MenuItemLite, days: number): boolean {
  if (!item.created_at || !(days > 0)) return false;
  const t = new Date(item.created_at).getTime();
  return Number.isFinite(t) && Date.now() - t <= days * 86400000;
}

/**
 * The pill on a showcase card: why this dish has a slide of its own.
 * A special leads with its saving; the others say what the owner ticked.
 */
export function cardBadge(item: MenuItemLite, config: SignageConfig): string | null {
  const special = item.special;
  if (special) return special.discount_pct ? `${special.discount_pct}% OFF` : 'SPECIAL';
  if (item.is_signage_promoted === true) return 'FEATURED';
  if (item.is_featured === true) return "CHEF'S PICK";
  if (isNewItem(item, config.menu_new_days)) return 'NEW';
  return null;
}

/**
 * Row type size that fills a list box, in vmin.
 *
 * Layout pass, 2026-09-23: eight bestsellers in a box meant for fourteen
 * sat in the top third of the screen over a dark void. Rows now stretch
 * to the box, and the type follows the row height — bigger for a short
 * list, smaller for a long one — inside sane bounds.
 */
export function fitListFontSize(boxHeightPct: number, rows: number, columns: number, requested?: number): number {
  const perColumn = Math.max(1, Math.ceil(Math.max(1, rows) / Math.max(1, columns)));
  const rowHeight = Math.max(1, boxHeightPct) / perColumn;
  const fit = Math.min(4.6, Math.max(2, rowHeight * 0.36));
  return requested != null && Number.isFinite(requested) && requested > 0 ? Math.max(Math.min(requested, fit), Math.min(fit, 2)) : fit;
}

/**
 * The showcase card: photo beside the words (`split`), or the words under
 * a round photo. A photo that fails to load drops the card back to words
 * alone rather than leaving a broken frame on the screen.
 */
function ShowcaseCard({ item, split, children }: { item: MenuItemLite; split: boolean; children: ReactNode }) {
  const [broken, setBroken] = useState(false);
  const photo = !broken && item.image_url ? item.image_url : null;
  const onError = () => setBroken(true);

  if (split && photo) {
    return (
      <div className="signage-card signage-card--split" data-layout="split">
        <PictureImg src={photo} webpSrc={item.image_webp_url} alt="" className="signage-card-photo" onError={onError} />
        <div className="signage-card-words signage-card-words--left">{children}</div>
      </div>
    );
  }
  return (
    <div className="signage-card signage-card--stack">
      {photo ? (
        <PictureImg src={photo} webpSrc={item.image_webp_url} alt="" className="signage-card-photo signage-card-photo--round" onError={onError} />
      ) : null}
      <div className="signage-card-words">{children}</div>
    </div>
  );
}

class ElementBoundary extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(_e: Error, _i: ErrorInfo) { /* swallow */ }
  render() { return this.state.err ? null : this.props.children; }
}

export type SlideCanvasProps = {
  slide: SignageSlide;
  theme: SignageTheme;
  variables: Record<string, string>;
  items: MenuItemLite[];
  config: SignageConfig;
  logoUrl?: string;
  burnInOffset?: { x: number; y: number };
  preview?: boolean;
};

function bgStyle(slide: SignageSlide, theme: SignageTheme): CSSProperties {
  const bg = slide.background ?? { type: 'solid', value: theme.background || '#1C1408' };
  const opacity = bg.opacity ?? 1;
  if (bg.type === 'gradient') {
    return { background: String(bg.value || theme.background), opacity };
  }
  if (bg.type === 'image') {
    return {
      backgroundImage: `url(${bg.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      opacity,
    };
  }
  return { background: String(bg.value || theme.background || '#1C1408'), opacity };
}

function animClass(el: SignageElement): string {
  const a = el.animation ?? {};
  const parts = ['signage-el'];
  if (a.entrance) parts.push(`signage-enter-${a.entrance}`);
  if (a.emphasis) parts.push(`signage-emph-${a.emphasis}`);
  return parts.join(' ');
}

function SignageEl({
  el, theme, variables, items, config, logoUrl, burnInOffset,
}: {
  el: SignageElement;
  theme: SignageTheme;
  variables: Record<string, string>;
  items: MenuItemLite[];
  config: SignageConfig;
  logoUrl?: string;
  burnInOffset?: { x: number; y: number };
}) {
  if (el.hidden) return null;
  const style = (el.style ?? {}) as Record<string, string | number>;
  const isStatic = ['logo', 'clock', 'qr', 'text'].includes(el.type);
  const drift = isStatic && burnInOffset
    ? { transform: `translate(${burnInOffset.x}px, ${burnInOffset.y}px) rotate(${el.rotation ?? 0}deg)` }
    : { transform: `rotate(${el.rotation ?? 0}deg)` };

  const box: CSSProperties = {
    position: 'absolute',
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    zIndex: el.z ?? 1,
    overflow: 'hidden',
    ...drift,
    animationDuration: `${el.animation?.duration ?? 700}ms`,
    animationDelay: `${el.animation?.delay ?? 0}ms`,
    fontFamily: style.fontFamily === 'display'
      ? (theme.font_display || 'var(--font-display)')
      : (theme.font_body || 'var(--font-ui)'),
    color: (style.color as string) || theme.text || '#FFF8F0',
    fontSize: style.fontSize != null ? `${style.fontSize}vmin` : undefined,
    fontWeight: style.fontWeight as number | undefined,
    textAlign: style.textAlign as CSSProperties['textAlign'],
    letterSpacing: style.letterSpacing != null ? `${style.letterSpacing}em` : undefined,
    textTransform: style.textTransform as CSSProperties['textTransform'],
    opacity: style.opacity as number | undefined,
    background: style.fill as string | undefined,
    borderRadius: style.borderRadius != null ? `${style.borderRadius}px` : undefined,
    boxShadow: style.shadow as string | undefined,
    padding: style.padding != null ? `${style.padding}%` : undefined,
  };

  let body: ReactNode = null;
  switch (el.type) {
    case 'text':
    case 'variable':
      body = (
        <div className="signage-text" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '0.6em' }}>
          {tidyInterpolated(interpolate(el.text || String(el.binding?.text ?? ''), variables))}
          <DvName text={el.text_dv} className="signage-text-dv" />
        </div>
      );
      break;
    case 'shape':
      body = <div style={{ width: '100%', height: '100%', background: (style.fill as string) || theme.surface }} />;
      break;
    case 'image': {
      const url = String(el.binding?.url ?? '');
      body = url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: (style.objectFit as CSSProperties['objectFit']) || 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        : null;
      break;
    }
    case 'video': {
      const url = String(el.binding?.url ?? '');
      body = url
        ? <video src={url} autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : null;
      break;
    }
    case 'icon': {
      const name = String(el.binding?.icon ?? el.binding?.name ?? 'megaphone');
      const color = String(style.color || theme.primary || '#D4813A');
      body = (
        <div
          className="signage-emergency-icon"
          data-testid="signage-emergency-icon"
          data-icon={name}
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color }}
        >
          <EmergencyIcon name={name} color={color} />
        </div>
      );
      break;
    }
    case 'logo':
      body = logoUrl
        ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: theme.primary }} />;
      break;
    case 'clock':
      body = (
        <div className="signage-clock" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {variables.current_time || ''}
        </div>
      );
      break;
    case 'countdown': {
      const reopenAt = String(el.binding?.reopen_at ?? '');
      const target = Date.parse(reopenAt);
      const nowMs = Date.parse(variables.server_time ?? '') || Date.now();
      let label = '';
      if (Number.isFinite(target)) {
        const remaining = target - nowMs;
        if (remaining <= 0) {
          label = 'now';
        } else {
          const totalMin = Math.max(0, Math.floor(remaining / 60_000));
          const hours = Math.floor(totalMin / 60);
          const mins = totalMin % 60;
          if (hours > 0 && mins > 0) label = `${hours}h ${mins}m`;
          else if (hours > 0) label = `${hours}h`;
          else if (totalMin < 1) label = '<1m';
          else label = `${mins}m`;
        }
      }
      body = (
        <div
          className="signage-countdown"
          data-testid="signage-countdown"
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}
        >
          {label}
        </div>
      );
      break;
    }
    case 'qr': {
      // Drawn here, with the brand mark in the middle, as on the receipts
      // and posters. It used to be fetched from api.qrserver.com — a bare
      // code from a third party that a TV in offline mode could not reach.
      const url = String(el.binding?.url ?? '/menu');
      const abs = url.startsWith('http') ? url : `${typeof window !== 'undefined' ? window.location.origin : ''}${url.startsWith('/') ? '' : '/'}${url}`;
      const logoSide = Math.round(QR_SIZE * QR_LOGO_RATIO);
      body = (
        <div
          data-testid="signage-qr"
          data-url={abs}
          role="img"
          aria-label="QR code"
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: '2.4vmin', padding: '2%', boxSizing: 'border-box', boxShadow: '0 1.2vmin 4vmin rgba(0,0,0,0.45)' }}
        >
          <QRCodeSVG
            value={abs}
            size={QR_SIZE}
            level="H"
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#1C1408"
            imageSettings={logoUrl ? { src: logoUrl, width: logoSide, height: logoSide, excavate: true } : undefined}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      );
      break;
    }
    case 'menu_list': {
      const list = resolveBoundItems(el, items, config);
      const cols = Number(style.columns ?? 2) || 2;
      const ranked = Boolean(style.rank) || String(el.binding?.smart_type ?? '') === 'bestsellers';
      // Smart lists (offers, bestsellers, new) show photos unless told not to;
      // a hand-designed list keeps its own switch.
      const showThumbs = style.showThumbs != null ? Boolean(style.showThumbs) : String(el.binding?.type ?? '') === 'smart';
      const fontSize = fitListFontSize(el.h, list.length, cols, style.fontSize as number | undefined);
      const anyThumb = showThumbs && list.some((i) => i.thumb_url || i.image_url);
      // A handful of rows sits under the title; a full page spreads evenly.
      const perColumn = Math.ceil(list.length / cols);
      const spread = perColumn > 3;
      body = (
        <div
          className="signage-menu-list"
          data-rows={list.length}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridAutoFlow: 'row',
            gridAutoRows: spread ? '1fr' : 'auto',
            columnGap: '3vmin',
            rowGap: spread ? 0 : '0.6em',
            width: '100%',
            height: '100%',
            alignContent: spread ? 'stretch' : 'start',
            alignItems: 'center',
            fontSize: `${fontSize}vmin`,
          }}
        >
          {list.map((item, index) => {
            const thumb = showThumbs ? (item.thumb_url ?? item.image_url) : null;
            const thumbWebp = showThumbs ? (item.thumb_webp_url ?? item.image_webp_url) : null;
            const special = item.special ?? null;
            const now = Number(special?.effective_price ?? item.base_price);
            const was = Number(special?.original_price ?? 0);
            return (
              <div key={item.id} className="signage-menu-row">
                {ranked ? <span className="signage-row-rank" style={{ color: theme.primary }}>{index + 1}</span> : null}
                {anyThumb ? (
                  <span className="signage-row-thumb-slot">
                    {thumb ? (
                      <PictureImg
                        src={thumb}
                        webpSrc={thumbWebp}
                        alt=""
                        data-testid="signage-row-thumb"
                        className="signage-row-thumb"
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                      />
                    ) : null}
                  </span>
                ) : null}
                <span className="signage-row-name">
                  <span className="signage-row-name-en">{item.name}</span>
                  <DvName text={item.name_dv} className="signage-row-dv" />
                </span>
                <span className="signage-row-leader" aria-hidden="true" />
                {special && was > now ? (
                  <span className="signage-row-was" data-testid="signage-row-was" style={{ color: theme.muted }}>{formatPrice(was)}</span>
                ) : null}
                <span className="signage-row-price" style={{ color: theme.primary }}>{formatPrice(now)}</span>
              </div>
            );
          })}
        </div>
      );
      break;
    }
    case 'item_card': {
      const list = resolveBoundItems(el, items, config);
      const item = list[0];
      const special = item?.special ?? null;
      const wasPrice = Number(special?.original_price ?? item?.base_price ?? 0);
      const nowPrice = Number(special?.effective_price ?? item?.base_price ?? 0);
      const badge = item ? cardBadge(item, config) : null;
      const eyebrow = typeof style.eyebrow === 'string' ? style.eyebrow.trim() : '';
      const pill = badge && style.showBadge ? (
        <div
          className="signage-card-badge"
          data-testid="signage-special-badge"
          style={{ background: theme.primary, color: '#1C1408' }}
        >
          {badge}
        </div>
      ) : null;
      const words = item ? (
        <>
          {eyebrow ? <div className="signage-card-eyebrow" style={{ color: theme.primary }}>{eyebrow}</div> : null}
          {pill}
          <div className="signage-card-name" style={{ fontFamily: theme.font_display || 'var(--font-display)' }}>{item.name}</div>
          <DvName text={item.name_dv} className="signage-card-dv" style={{ color: theme.muted }} />
          {style.showDescription && item.short_description ? (
            <div className="signage-card-desc" style={{ color: theme.muted }}>{item.short_description}</div>
          ) : null}
          <div className="signage-card-prices">
            {special && wasPrice > nowPrice ? (
              <span data-testid="signage-was-price" className="signage-card-was" style={{ color: theme.muted, textDecoration: 'line-through' }}>
                {formatPrice(wasPrice)}
              </span>
            ) : null}
            <span className="signage-card-price" style={{ color: theme.primary }}>{formatPrice(nowPrice)}</span>
          </div>
        </>
      ) : null;
      body = item ? (
        <ShowcaseCard item={item} split={style.layout === 'split'}>{words}</ShowcaseCard>
      ) : null;
      break;
    }
    case 'price_row': {
      const list = resolveBoundItems(el, items, config);
      const item = list[0];
      body = item ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: '1vmin', minWidth: 0 }}>
            {item.name}
            <DvName text={item.name_dv} className="signage-row-dv" />
          </span>
          <span className="signage-price" style={{ color: theme.primary, fontWeight: 800 }}>
            {formatPrice(Number(item.special?.effective_price ?? item.base_price))}
          </span>
        </div>
      ) : null;
      break;
    }
    default:
      body = null;
  }

  if (body == null) return null;
  return (
    <div className={animClass(el)} data-testid={`signage-el-${el.type}`} style={box}>
      {body}
    </div>
  );
}

/** Pure presentational renderer for an element-tree slide (TV + admin designer). */
export function SlideCanvas({
  slide, theme, variables, items, config, logoUrl, burnInOffset, preview = false,
}: SlideCanvasProps) {
  const elements = useMemo(
    () => [...(slide.elements ?? [])].sort((a, b) => (a.z ?? 1) - (b.z ?? 1)),
    [slide.elements],
  );

  const solid = !slide.background?.type || slide.background.type === 'solid';

  return (
    <div
      className={`signage-slide-canvas${preview ? ' is-preview' : ''}${solid ? ' has-solid-bg' : ''}`}
      data-testid="signage-slide-canvas"
      data-slide-id={slide.id}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        color: theme.text || '#FFF8F0',
        fontFamily: theme.font_body || 'var(--font-ui)',
        ['--signage-primary' as string]: theme.primary || '#D4813A',
        ...bgStyle(slide, theme),
      }}
    >
      {slide.background?.type === 'video' && slide.background.value ? (
        <video
          src={slide.background.value}
          autoPlay
          muted
          loop
          playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
        />
      ) : null}
      {elements.map((el) => (
        <ElementBoundary key={el.id}>
          <SignageEl
            el={el}
            theme={theme}
            variables={variables}
            items={items}
            config={config}
            logoUrl={logoUrl}
            burnInOffset={burnInOffset}
          />
        </ElementBoundary>
      ))}
    </div>
  );
}
