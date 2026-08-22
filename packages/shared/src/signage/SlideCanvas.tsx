import { Component, type CSSProperties, type ErrorInfo, type ImgHTMLAttributes, type ReactNode, useMemo } from 'react';
import { formatPrice, resolveBoundItems } from './bindMenu';
import { EmergencyIcon } from './emergencyIcons';
import { interpolate } from './interpolate';
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
        <div className="signage-text" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
          {interpolate(el.text || String(el.binding?.text ?? ''), variables)}
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
      const url = String(el.binding?.url ?? '/menu');
      const abs = url.startsWith('http') ? url : `${typeof window !== 'undefined' ? window.location.origin : ''}${url.startsWith('/') ? '' : '/'}${url}`;
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(abs)}`;
      body = <img src={qrSrc} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} />;
      break;
    }
    case 'menu_list': {
      const list = resolveBoundItems(el, items, config);
      const cols = Number(style.columns ?? 2) || 2;
      body = (
        <div className="signage-menu-list" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '0.6vmin 2vmin', width: '100%', height: '100%', alignContent: 'start' }}>
          {list.map((item) => {
            const thumb = style.showThumbs ? (item.thumb_url ?? item.image_url) : null;
            const thumbWebp = style.showThumbs ? (item.thumb_webp_url ?? item.image_webp_url) : null;
            return (
              <div key={item.id} className="signage-menu-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '1vmin', borderBottom: '1px solid rgba(255,255,255,0.12)', padding: '0.4vmin 0', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '1vmin', minWidth: 0 }}>
                  {thumb ? (
                    <PictureImg
                      src={thumb}
                      webpSrc={thumbWebp}
                      alt=""
                      data-testid="signage-row-thumb"
                      style={{ width: '3.4vmin', height: '3.4vmin', objectFit: 'cover', borderRadius: '50%', flex: '0 0 auto' }}
                    />
                  ) : null}
                  <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                </span>
                <span style={{ color: theme.primary, fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {formatPrice(Number(item.special?.effective_price ?? item.base_price))}
                </span>
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
      const badge = special
        ? (special.discount_pct ? `${special.discount_pct}% OFF` : 'SPECIAL')
        : null;
      body = item ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.8vmin', alignItems: 'center', justifyContent: 'center' }}>
          {item.image_url ? (
            <PictureImg
              src={item.image_url}
              webpSrc={item.image_webp_url}
              alt=""
              style={{ flex: 1, minHeight: 0, objectFit: 'cover', borderRadius: '50%', aspectRatio: '1' }}
            />
          ) : null}
          {badge && style.showBadge ? (
            <div
              data-testid="signage-special-badge"
              style={{ background: theme.primary, color: '#1C1408', fontWeight: 800, borderRadius: '99vmin', padding: '0.3vmin 1.6vmin', fontSize: '0.55em', letterSpacing: '0.08em' }}
            >
              {badge}
            </div>
          ) : null}
          <div style={{ fontWeight: 800, textAlign: 'center' }}>{item.name}</div>
          {style.showDescription && item.short_description ? (
            <div style={{ fontSize: '0.5em', color: theme.muted, textAlign: 'center', maxWidth: '80%' }}>
              {item.short_description}
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.2vmin' }}>
            {special && wasPrice > nowPrice ? (
              <span
                data-testid="signage-was-price"
                style={{ color: theme.muted, textDecoration: 'line-through', fontSize: '0.62em' }}
              >
                {formatPrice(wasPrice)}
              </span>
            ) : null}
            <span style={{ color: theme.primary, fontWeight: 800 }}>{formatPrice(nowPrice)}</span>
          </div>
        </div>
      ) : null;
      break;
    }
    case 'price_row': {
      const list = resolveBoundItems(el, items, config);
      const item = list[0];
      body = item ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <span>{item.name}</span>
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

  return (
    <div
      className={`signage-slide-canvas${preview ? ' is-preview' : ''}`}
      data-testid="signage-slide-canvas"
      data-slide-id={slide.id}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        color: theme.text || '#FFF8F0',
        fontFamily: theme.font_body || 'var(--font-ui)',
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
