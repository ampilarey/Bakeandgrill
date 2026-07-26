import { Component, type CSSProperties, type ErrorInfo, type ReactNode, useMemo } from 'react';
import { formatPrice, resolveBoundItems } from './bindMenu';
import { interpolate } from './interpolate';
import type { MenuItemLite, SignageConfig, SignageElement, SignageSlide, SignageTheme } from './types';

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
      ? (theme.font_display || 'Georgia, serif')
      : (theme.font_body || 'system-ui, sans-serif'),
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
    case 'qr': {
      const url = String(el.binding?.url ?? '/order/view');
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
          {list.map((item) => (
            <div key={item.id} className="signage-menu-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '1vmin', borderBottom: '1px solid rgba(255,255,255,0.12)', padding: '0.4vmin 0' }}>
              <span style={{ fontWeight: 700 }}>{item.name}</span>
              <span style={{ color: theme.primary, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {formatPrice(Number(item.special?.effective_price ?? item.base_price))}
              </span>
            </div>
          ))}
        </div>
      );
      break;
    }
    case 'item_card': {
      const list = resolveBoundItems(el, items, config);
      const item = list[0];
      body = item ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.8vmin' }}>
          {item.image_url ? <img src={item.image_url} alt="" style={{ flex: 1, objectFit: 'cover', borderRadius: '50%', aspectRatio: '1' }} /> : null}
          <div style={{ fontWeight: 800 }}>{item.name}</div>
          <div style={{ color: theme.primary, fontWeight: 800 }}>{formatPrice(item.base_price)}</div>
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
          <span className="signage-price" style={{ color: theme.primary, fontWeight: 800 }}>{formatPrice(item.base_price)}</span>
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
        fontFamily: theme.font_body || 'system-ui, sans-serif',
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
