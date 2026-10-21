import { useEffect, type CSSProperties } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PosterPiece, PosterSheet } from '../../api';

/** What each variant is called under the preview. */
const VARIANT_CAPTION: Record<string, string> = { large: 'wall design', small: 'counter design', tv: 'TV design', tvp: 'portrait TV design' };

/** The CSS face for each poster font key (PosterFonts::FILES). Jakarta is the admin's own. */
const FONT_CSS: Record<string, CSSProperties> = {
  anton: { fontFamily: "'Anton', 'Plus Jakarta Sans', sans-serif", fontWeight: 400 },
  fri5: { fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontWeight: 500 },
  fri7: { fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontWeight: 700 },
  fri9: { fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', fontWeight: 900 },
  j4: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400 },
  j5: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500 },
  j7: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 },
  j8: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800 },
  ds: { fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400 },
  dv: { fontFamily: "'Noto Sans Thaana', 'A_Faruma', sans-serif", fontWeight: 400 },
  dvb: { fontFamily: "'Noto Sans Thaana', 'A_Faruma', sans-serif", fontWeight: 700 },
};

const PT_TO_MM = 0.352778;

/** Load Anton and Fraunces once, from the same TTFs the print file embeds. */
export function useThemeFonts(fontUrls: Record<string, string> | undefined) {
  useEffect(() => {
    if (!fontUrls || typeof document === 'undefined' || document.getElementById('poster-theme-fonts')) return;
    const faces: string[] = [];
    if (fontUrls.anton) faces.push(`@font-face{font-family:'Anton';font-weight:400;font-display:swap;src:url('${fontUrls.anton}') format('truetype');}`);
    (['fri5', 'fri7', 'fri9'] as const).forEach((key, i) => {
      if (fontUrls[key]) faces.push(`@font-face{font-family:'Fraunces';font-style:italic;font-weight:${[500, 700, 900][i]};font-display:swap;src:url('${fontUrls[key]}') format('truetype');}`);
    });
    if (faces.length === 0) return;
    const style = document.createElement('style');
    style.id = 'poster-theme-fonts';
    style.textContent = faces.join('\n');
    document.head.appendChild(style);
  }, [fontUrls]);
}

/**
 * A poster drawn on a template, on screen: the design's backdrop SVG in
 * layers with each photo between the art before and after it, the photos
 * clipped to their slots, the logo on its badge, the QR, and the text set on
 * its baseline in the print faces. Everything is laid out at one pixel per
 * page unit and scaled as a whole, so the clip paths and sizes the server
 * sends in page millimetres (or, for a TV design, in the screen's pixels) are
 * used as they are. A landscape sheet gets the preview column's full width.
 */
export function ThemedPreview({ sheet, width, gloss = false, keepOut = 0, fontUrls, assetOrigin = '' }: {
  sheet: PosterSheet;
  width?: number;
  gloss?: boolean;
  keepOut?: number;
  fontUrls?: Record<string, string>;
  assetOrigin?: string;
}) {
  useThemeFonts(fontUrls);
  const theme = sheet.theme;
  if (!theme) return null;
  const scale = (width ?? (sheet.w > sheet.h ? 320 : 280)) / sheet.w;
  const m = theme.map;
  const photos = new Map<string, PosterPiece>();
  sheet.pieces.forEach((p) => { if (p.type === 'photo' && p.slot) photos.set(p.slot, p); });
  const stack: Array<{ kind: 'layer'; url: string } | { kind: 'photo'; piece: PosterPiece }> = [];
  theme.layer_urls.forEach((url, i) => {
    stack.push({ kind: 'layer', url });
    const slot = theme.photo_order[i];
    const piece = slot ? photos.get(slot) : undefined;
    if (piece) stack.push({ kind: 'photo', piece });
  });
  photos.forEach((piece, slot) => { if (!theme.photo_order.includes(slot)) stack.push({ kind: 'photo', piece }); });
  const art: CSSProperties = {
    position: 'absolute', left: m.ox - m.bleed_units * m.s, top: m.oy - m.bleed_units * m.s,
    width: theme.canvas[0] * m.s, height: theme.canvas[1] * m.s, pointerEvents: 'none',
  };

  return (
    <aside>
      <div data-testid="poster-themed-preview" style={{ width: sheet.w * scale, height: sheet.h * scale, position: 'relative', overflow: 'hidden', borderRadius: 4, margin: '0 auto', background: sheet.hex_bg }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: sheet.w, height: sheet.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {stack.map((entry, i) => entry.kind === 'layer'
            ? <img key={`layer-${i}`} src={entry.url} alt="" style={art} draggable={false} />
            : <Photo key={`photo-${entry.piece.slot}`} piece={entry.piece} w={sheet.w} h={sheet.h} />)}
          {sheet.pieces.map((p, i) => {
            if (p.type === 'logo') {
              return (
                <div key={`logo-${i}`}>
                  {p.badge && <div style={{ position: 'absolute', left: p.badge.cx - p.badge.r, top: p.badge.cy - p.badge.r, width: p.badge.r * 2, height: p.badge.r * 2, borderRadius: '50%', background: p.badge.hex }} />}
                  <img src={`${assetOrigin}/brand/logo.svg`} alt="" style={{ position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h }} draggable={false} />
                </div>
              );
            }
            if (p.type === 'qr' && p.url) {
              return (
                <div key={`qr-${i}`} style={{ position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h }}>
                  <QRCodeSVG value={p.url} size={p.w} level="M" bgColor="transparent" fgColor={p.hex ?? '#1C1408'} marginSize={p.bare ? 0 : 2} />
                </div>
              );
            }
            if (p.type === 'text') {
              const sizeMm = (p.pt ?? 10) * PT_TO_MM;
              return (
                <div key={`text-${p.slot ?? i}`} data-testid={p.slot ? `poster-preview-text-${p.slot}` : undefined} dir={p.dv ? 'rtl' : undefined} style={{
                  position: 'absolute', left: p.x, top: p.y, whiteSpace: 'nowrap', lineHeight: 'normal',
                  fontSize: sizeMm, letterSpacing: p.tracking ?? 0, color: p.hex, opacity: p.opacity ?? 1,
                  textShadow: p.shadow ? `${p.shadow.dx}px ${p.shadow.dy}px 0 ${p.shadow.hex}` : undefined,
                  ...(FONT_CSS[p.font ?? 'j5'] ?? FONT_CSS.j5),
                }}>{p.text}</div>
              );
            }
            return null;
          })}
        </div>
        {gloss && <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg, transparent, transparent 6px, var(--color-text) 6px, var(--color-text) 7px)', opacity: 0.28, pointerEvents: 'none' }} />}
        <KeepOutRings w={sheet.w} h={sheet.h} scale={scale} keepOut={keepOut} />
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }} data-testid="poster-preview-caption">
        {theme.id} · {theme.title} · {theme.px ? (theme.size_label ?? `${theme.size} (${theme.px[0]} × ${theme.px[1]})`) : theme.size} ({VARIANT_CAPTION[theme.variant] ?? theme.variant})
      </p>
    </aside>
  );
}

function Photo({ piece, w, h }: { piece: PosterPiece; w: number; h: number }) {
  const pad = piece.contain ? Math.min(piece.w, piece.h) * 0.04 : 0;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, clipPath: piece.clip_d ? `path('${piece.clip_d}')` : undefined, background: piece.hex_behind, pointerEvents: 'none' }}>
      {piece.src && (
        <img
          src={piece.src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', left: piece.x + pad, top: piece.y + pad, width: piece.w - 2 * pad, height: piece.h - 2 * pad,
            objectFit: piece.contain ? 'contain' : 'cover',
            transform: piece.rotation ? `rotate(${piece.rotation}deg)` : undefined,
            transformOrigin: piece.centre ? `${piece.centre[0] - piece.x - pad}px ${piece.centre[1] - piece.y - pad}px` : 'center',
          }}
        />
      )}
    </div>
  );
}

/** Where the stand-offs or eyelets go: drawn faintly, kept clear by the layout (docs/POSTER_PLAN.md § 3). */
export function KeepOutRings({ w, h, scale, keepOut }: { w: number; h: number; scale: number; keepOut: number }) {
  if (keepOut <= 0) return null;
  const bleed = 3;
  const c = bleed + keepOut;
  return (
    <>
      {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([right, bottom]) => {
        const cx = right ? w - c : c;
        const cy = bottom ? h - c : c;
        return <div key={`${right}${bottom}`} data-testid="poster-keepout" style={{ position: 'absolute', left: (cx - keepOut / 2) * scale, top: (cy - keepOut / 2) * scale, width: keepOut * scale, height: keepOut * scale, borderRadius: '50%', border: '1px dashed var(--color-text-muted)', opacity: 0.8, pointerEvents: 'none', zIndex: 2 }} />;
      })}
    </>
  );
}
