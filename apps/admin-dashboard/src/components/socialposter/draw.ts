import { motionOf, priceWords, type Fx, type Motion, type Palette, type PostSpec } from './types';

/**
 * The drawing of a social post on a canvas. Every length is a share of the
 * picture (`u`, a hundredth of its short side), so one layout draws a
 * thumbnail and the full 1080 px picture alike, and each layout places its
 * parts by the picture's shape (wide, square, tall), never by cropping.
 */

type Ctx = CanvasRenderingContext2D;
type Img = HTMLImageElement | HTMLCanvasElement;

export interface Rect { x: number; y: number; w: number; h: number }

export interface PostAssets {
  photo: Img | null;
  /** The logo for a pale ground and the one for a dark ground. */
  logoLight: Img | null;
  logoDark: Img | null;
  /** The brand flame, for a post without a photo. */
  flame: Img | null;
  qr: Img | null;
}

type FontKind = 'script' | 'caps' | 'serif' | 'sans' | 'body';

const FONT: Record<FontKind, [string, string, number]> = {
  script: ['400', '"SP Script"', 1.04],
  caps: ['400', '"SP Caps"', 1.08],
  serif: ['italic 900', '"SP Serif"', 1.06],
  sans: ['800', '"SP Sans"', 1.1],
  body: ['600', '"SP Sans"', 1.25],
};

function font(kind: FontKind, size: number): string {
  const [weight, family] = FONT[kind];
  return `${weight} ${Math.max(1, size)}px ${family}, "SP Thaana", system-ui, sans-serif`;
}

function hasThaana(s: string): boolean {
  return /[ހ-޿]/.test(s);
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

export function isDark(hex: string): boolean {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/** The same "random" every time, so a design does not change between the preview and the download. */
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function spacing(ctx: Ctx, em: number, size: number): void {
  if ('letterSpacing' in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${(em * size).toFixed(2)}px`;
}

// ── Motion ──────────────────────────────────────────────────────────────────

type Role = 'photo' | 'text' | 'sticker' | 'price' | 'footer';

/**
 * The moment being drawn, when the post is animated; null draws the still
 * picture. Set by `renderPost` for the length of one frame: the helpers that
 * draw a part (the photo, each row of words, a sticker, the footer) read it
 * to arrive, and then to keep moving, by the motion template's rules. A
 * layout knows nothing of it, so every design animates with every motion.
 */
let ANIM: { t: number; dur: number; m: Motion; u: number; W: number; H: number; rows: number } | null = null;

/** When each part starts to arrive, in seconds, and how long the arrival takes. */
const STARTS: Record<Role, number> = { photo: 0.15, text: 0.4, price: 1.05, sticker: 1.3, footer: 1.55 };
const ARRIVE = 0.65;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeBack = (p: number) => 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2;
function bounce(p: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p - 1.5 / d) ** 2 + 0.75;
  if (p < 2.5 / d) return n * (p - 2.25 / d) ** 2 + 0.9375;
  return n * (p - 2.625 / d) ** 2 + 0.984375;
}

/**
 * Draw one part as the motion has it at this moment: not yet (nothing is
 * drawn), arriving (faded, moved, scaled, turned or wiped in about its own
 * centre), or arrived and idling (floating, breathing, wiggling, pulsing).
 */
function moved(ctx: Ctx, role: Role, index: number, cx: number, cy: number, box: Rect | null, pulse: boolean, draw: () => void): void {
  const a = ANIM;
  if (!a) { draw(); return; }
  const fx: Fx = a.m[role];
  const start = STARTS[role] * a.m.pace + (role === 'text' ? index * a.m.stagger : 0);
  const p = fx === 'none' ? 1 : clamp01((a.t - start) / (ARRIVE * a.m.pace));
  if (p <= 0) return;
  const { u, W, H } = a;
  const e = easeOut(p);
  ctx.save();
  const about = (scale: number, turn = 0) => {
    ctx.translate(cx, cy);
    if (turn) ctx.rotate(turn);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  };
  if (p < 1) {
    switch (fx) {
      case 'fade': ctx.globalAlpha *= e; break;
      case 'up': ctx.globalAlpha *= e; ctx.translate(0, (1 - e) * 9 * u); break;
      case 'down': ctx.globalAlpha *= e; ctx.translate(0, -(1 - e) * 9 * u); break;
      case 'left': ctx.globalAlpha *= e; ctx.translate(-(1 - e) * W * 0.5, 0); break;
      case 'right': ctx.globalAlpha *= e; ctx.translate((1 - e) * W * 0.5, 0); break;
      case 'zoom': ctx.globalAlpha *= e; about(0.55 + 0.45 * e); break;
      case 'shrink': ctx.globalAlpha *= e; about(1.7 - 0.7 * e); break;
      case 'pop': ctx.globalAlpha *= clamp01(p * 3); about(Math.max(0.01, easeBack(p))); break;
      case 'spin': ctx.globalAlpha *= e; about(Math.max(0.01, e), (1 - e) * -2.4); break;
      case 'drop': ctx.translate(0, -(1 - bounce(p)) * H * 0.7); break;
      case 'swing': ctx.globalAlpha *= clamp01(p * 2.5); about(1, Math.sin(p * Math.PI * 3) * (1 - p) * 0.5); break;
      case 'flip': ctx.globalAlpha *= clamp01(p * 2); ctx.translate(cx, cy); ctx.scale(Math.max(0.02, Math.sin((p * Math.PI) / 2)), 1); ctx.translate(-cx, -cy); break;
      case 'wipe':
        if (box) {
          ctx.beginPath();
          ctx.rect(box.x - 2 * u, box.y - 3 * u, (box.w + 4 * u) * e, box.h + 6 * u);
          ctx.clip();
        } else {
          ctx.globalAlpha *= e;
        }
        break;
      // The advanced set (owner, 2026-11-17).
      case 'glide': ctx.globalAlpha *= e; ctx.translate(-(1 - e) * W * 0.3, (1 - e) * H * 0.18); break;
      case 'slam': {
        ctx.globalAlpha *= clamp01(p * 4);
        about(p < 0.6 ? 2.4 - 1.5 * (p / 0.6) : 0.9 + 0.1 * easeOut((p - 0.6) / 0.4));
        break;
      }
      case 'unfold': ctx.globalAlpha *= clamp01(p * 3); ctx.translate(cx, cy); ctx.scale(1, Math.max(0.02, easeBack(p))); ctx.translate(-cx, -cy); break;
      case 'tilt': ctx.globalAlpha *= e; ctx.translate(0, (1 - e) * 6 * u); about(1, (1 - e) * 0.35); break;
      case 'elastic': ctx.globalAlpha *= clamp01(p * 4); about(Math.max(0.01, 1 - Math.cos(p * Math.PI * 4.5) * Math.exp(-p * 6))); break;
      case 'wipeup':
        if (box) {
          const hh = (box.h + 6 * u) * e;
          ctx.beginPath();
          ctx.rect(box.x - 2 * u, box.y + box.h + 3 * u - hh, box.w + 4 * u, hh);
          ctx.clip();
        } else {
          ctx.globalAlpha *= e;
        }
        break;
      default: break;
    }
  } else {
    // Arrived: the idle movement, eased in so nothing jumps as the arrival ends.
    const since = a.t - start - ARRIVE * a.m.pace;
    const k = clamp01(since / 0.6);
    if (role === 'photo') {
      if (a.m.idle === 'float') ctx.translate(0, Math.sin(since * 1.7) * 1.1 * u * k);
      else if (a.m.idle === 'breathe') about(1 + 0.03 * Math.sin(since * 1.5) * k);
      else if (a.m.idle === 'sway') about(1, Math.sin(since * 1.4) * 0.035 * k);
      else if (a.m.idle === 'grow') about(1 + 0.07 * clamp01(since / Math.max(1, a.dur - start)));
      else if (a.m.idle === 'orbit') ctx.translate(Math.cos(since * 1.3) * 0.9 * u * k, Math.sin(since * 1.3) * 0.9 * u * k);
      else if (a.m.idle === 'bob') { ctx.translate(0, Math.sin(since * 2.2) * 0.8 * u * k); about(1, Math.sin(since * 1.1) * 0.025 * k); }
    } else if (role === 'sticker') {
      if (a.m.accent === 'wiggle' || a.m.accent === 'both') about(1, Math.sin(since * 6) * 0.07 * k);
    } else if (role === 'price' || pulse) {
      if (a.m.accent === 'pulse' || a.m.accent === 'both') about(1 + 0.06 * Math.max(0, Math.sin(since * 4.2)) * k);
    }
  }
  draw();
  ctx.restore();
}

// ── Decoration ──────────────────────────────────────────────────────────────

/** A dry brush stroke: a band of bristle lines with ragged ends and a few flecks. */
function brush(ctx: Ctx, cx: number, cy: number, len: number, thick: number, angle: number, color: string, seed: number): void {
  const r = rng(seed);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  const n = 30;
  const row = thick / n;
  for (let i = 0; i < n; i++) {
    const y = -thick / 2 + row * i;
    const edge = 1 - Math.abs(i / (n - 1) - 0.5) * 0.5;
    const l = len * edge * (0.78 + 0.22 * r());
    const off = (r() - 0.5) * len * 0.1;
    ctx.beginPath();
    ctx.moveTo(-l / 2 + off, y);
    ctx.lineTo(l / 2 + off, y - row * 0.2);
    ctx.lineTo(l / 2 + off - len * 0.05 * r(), y + row * 1.2);
    ctx.lineTo(-l / 2 + off + len * 0.04 * r(), y + row * 1.2);
    ctx.fill();
  }
  for (let i = 0; i < 22; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * len * (0.42 + 0.2 * r());
    const y = (r() - 0.5) * thick * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, thick * (0.012 + 0.04 * r()), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function burstPath(ctx: Ctx, cx: number, cy: number, r: number, points: number, inner: number): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? r * inner : r;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function blobPath(ctx: Ctx, cx: number, cy: number, r: number, seed: number): void {
  const rand = rng(seed);
  const n = 9;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = r * (0.9 + 0.18 * rand());
    pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k]);
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0], p[1], mx, my);
  }
  const first = pts[0];
  const second = pts[1];
  ctx.quadraticCurveTo(first[0], first[1], (first[0] + second[0]) / 2, (first[1] + second[1]) / 2);
  ctx.closePath();
}

function dots(ctx: Ctx, W: number, H: number, step: number, r: number, color: string): void {
  ctx.fillStyle = color;
  for (let y = step / 2, row = 0; y < H; y += step, row++) {
    for (let x = (row % 2 ? step : step / 2); x < W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function stripes(ctx: Ctx, W: number, H: number, gap: number, width: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let x = -H; x < W + H; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function rays(ctx: Ctx, cx: number, cy: number, r: number, n: number, color: string): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = a + Math.PI / n;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r);
    ctx.fill();
  }
}

// ── Pictures ────────────────────────────────────────────────────────────────

function sizeOfImg(img: Img): [number, number] {
  const el = img as HTMLImageElement;
  return [el.naturalWidth || el.width || 1, el.naturalHeight || el.height || 1];
}

function cover(ctx: Ctx, img: Img, r: Rect): void {
  const [iw, ih] = sizeOfImg(img);
  const k = Math.max(r.w / iw, r.h / ih);
  ctx.drawImage(img, r.x + (r.w - iw * k) / 2, r.y + (r.h - ih * k) / 2, iw * k, ih * k);
}

function contain(ctx: Ctx, img: Img, r: Rect): void {
  const [iw, ih] = sizeOfImg(img);
  const k = Math.min(r.w / iw, r.h / ih);
  ctx.drawImage(img, r.x + (r.w - iw * k) / 2, r.y + (r.h - ih * k) / 2, iw * k, ih * k);
}

interface PhotoStyle {
  /** How a photo with a background is held: a circle, a rounded box, or the whole box. */
  shape: 'circle' | 'rounded' | 'cover';
  /** The colour behind a cut-out, or behind the flame when there is no photo. */
  disc: string | null;
  ring?: string;
  ringW?: number;
  radius?: number;
}

/** The photo in its box: a cut-out whole with a soft shadow, anything else cut to the shape. */
function photo(ctx: Ctx, box: Rect, spec: PostSpec, A: PostAssets, st: PhotoStyle, u: number): void {
  moved(ctx, 'photo', 0, box.x + box.w / 2, box.y + box.h / 2, box, false, () => photoStill(ctx, box, spec, A, st, u));
}

function photoStill(ctx: Ctx, box: Rect, spec: PostSpec, A: PostAssets, st: PhotoStyle, u: number): void {
  const d = Math.min(box.w, box.h);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const shapePath = () => {
    if (st.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.closePath();
    } else {
      rr(ctx, box.x, box.y, box.w, box.h, st.shape === 'rounded' ? (st.radius ?? 4 * u) : 0);
    }
  };
  const img = A.photo;
  const whole = img !== null && spec.cutout;
  if (st.disc && (whole || img === null)) {
    shapePath();
    ctx.fillStyle = st.disc;
    ctx.fill();
  }
  if (img === null) {
    if (A.flame) {
      ctx.save();
      ctx.globalAlpha *= 0.5;
      contain(ctx, A.flame, { x: cx - d * 0.22, y: cy - d * 0.28, w: d * 0.44, h: d * 0.56 });
      ctx.restore();
    }
  } else if (whole) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.38)';
    ctx.shadowBlur = 4 * u;
    ctx.shadowOffsetY = 2 * u;
    if (st.shape === 'circle') {
      // Inside the circle whatever its shape (owner, 2026-11-15: a tall can ran over the ring
      // and the price sticker): the picture's corners may pass the ring a little, as a round
      // plate's empty corners do, but neither its width nor its height ever does.
      const [iw, ih] = sizeOfImg(img);
      const k = Math.min((1.1 * d) / Math.hypot(iw, ih), (0.9 * d) / Math.max(iw, ih));
      ctx.drawImage(img, cx - (iw * k) / 2, cy - (ih * k) / 2, iw * k, ih * k);
    } else {
      contain(ctx, img, { x: box.x + box.w * 0.03, y: box.y + box.h * 0.03, w: box.w * 0.94, h: box.h * 0.94 });
    }
    ctx.restore();
  } else {
    ctx.save();
    shapePath();
    ctx.clip();
    cover(ctx, img, st.shape === 'circle' ? { x: cx - d / 2, y: cy - d / 2, w: d, h: d } : box);
    ctx.restore();
  }
  if (st.ring && !(whole && st.disc === null)) {
    shapePath();
    ctx.strokeStyle = st.ring;
    ctx.lineWidth = st.ringW ?? 1.2 * u;
    ctx.stroke();
  }
}

/** The logo without the empty margin its file carries. */
function logo(ctx: Ctx, img: Img, x: number, y: number, h: number): number {
  const [iw, ih] = sizeOfImg(img);
  const sx = iw * 0.2;
  const sy = ih * 0.05;
  const sw = iw * 0.6;
  const sh = ih * 0.9;
  const w = h * (sw / sh);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  return w;
}

// ── Words ───────────────────────────────────────────────────────────────────

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitLines(ctx: Ctx, text: string, kind: FontKind, maxW: number, maxLines: number, start: number, min: number): { size: number; lines: string[] } {
  let size = start;
  for (let i = 0; i < 40; i++) {
    ctx.font = font(kind, size);
    const lines = wrap(ctx, text, maxW);
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    if ((lines.length <= maxLines && widest <= maxW) || size <= min) return { size, lines: lines.slice(0, maxLines) };
    size *= 0.93;
  }
  ctx.font = font(kind, size);
  return { size, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
}

type Align = 'left' | 'center' | 'right';

function anchor(box: Rect, align: Align): number {
  return align === 'left' ? box.x : align === 'center' ? box.x + box.w / 2 : box.x + box.w;
}

type ButtonLook = 'solid' | 'outline' | 'pop';

type StackPart = 'kicker' | 'headline' | 'tagline' | 'price' | 'cta';

interface StackStyle {
  align: Align;
  valign: 'top' | 'middle' | 'bottom';
  head: FontKind;
  ink: string;
  /** The colour of the ground under the words, for a filled button's lettering. */
  ground: string;
  pop: string;
  popInk: string;
  headScale?: number;
  maxLines?: number;
  /** The headline's first word in this colour. */
  firstWord?: string;
  price?: 'pill' | 'plain';
  cta?: 'solid' | 'outline';
  kicker?: 'pill' | 'plain';
}

const HEAD_START: Record<FontKind, number> = { script: 21, caps: 22, serif: 15.5, sans: 14.5, body: 10 };

/**
 * The words, stacked in a box: small line, headline, line below, price and
 * button, each only when it is on and has something to say. Everything
 * shrinks together until the stack fits the box, so nothing is ever cut.
 */
function stack(ctx: Ctx, box: Rect, spec: PostSpec, st: StackStyle, parts: StackPart[], u: number): void {
  const want = (p: StackPart) => parts.includes(p);
  const kicker = want('kicker') && spec.show.kicker ? spec.kicker.trim() : '';
  const headline = want('headline') ? spec.headline.trim() : '';
  const tagline = want('tagline') && spec.show.tagline ? spec.tagline.trim() : '';
  const price = want('price') && spec.show.price ? priceWords(spec.price) : '';
  const was = price && spec.show.was ? priceWords(spec.was) : '';
  const cta = want('cta') && spec.show.cta ? spec.cta.trim() : '';
  const cta2 = want('cta') && spec.show.cta2 ? (spec.cta2 ?? '').trim() : '';
  if (!kicker && !headline && !tagline && !price && !cta && !cta2) return;

  type Row = { h: number; gap: number; draw: (y: number) => void; pulse?: boolean };
  const build = (s: number): { rows: Row[]; total: number } => {
    const rows: Row[] = [];
    const ax = anchor(box, st.align);
    ctx.textBaseline = 'alphabetic';

    if (kicker) {
      const size = 3.8 * u * s;
      const text = hasThaana(kicker) ? kicker : kicker.toUpperCase();
      if (st.kicker === 'plain') {
        rows.push({ h: size * 1.3, gap: 1.6 * u * s, draw: (y) => {
          ctx.font = font('body', size);
          spacing(ctx, 0.2, size);
          ctx.textAlign = st.align;
          ctx.fillStyle = st.ink;
          ctx.fillText(text, ax, y + size);
          spacing(ctx, 0, size);
        } });
      } else {
        const h = size * 2.1;
        rows.push({ h, gap: 2 * u * s, draw: (y) => {
          ctx.font = font('sans', size);
          spacing(ctx, 0.12, size);
          const w = Math.min(box.w, ctx.measureText(text).width + size * 2.2);
          const x = st.align === 'left' ? box.x : st.align === 'center' ? ax - w / 2 : ax - w;
          rr(ctx, x, y, w, h, h / 2);
          ctx.fillStyle = st.pop;
          ctx.fill();
          ctx.fillStyle = st.popInk;
          ctx.textAlign = 'center';
          ctx.fillText(text, x + w / 2 + size * 0.06, y + h / 2 + size * 0.36, w - size);
          spacing(ctx, 0, size);
        } });
      }
    }

    if (headline) {
      const text = st.head === 'caps' && !hasThaana(headline) ? headline.toUpperCase() : headline;
      const fit = fitLines(ctx, text, st.head, box.w, st.maxLines ?? 3, HEAD_START[st.head] * (st.headScale ?? 1) * u * s, 4.5 * u * s);
      const lh = fit.size * FONT[st.head][2];
      rows.push({ h: lh * fit.lines.length, gap: 2.4 * u * s, draw: (y) => {
        ctx.font = font(st.head, fit.size);
        fit.lines.forEach((line, i) => {
          const base = y + lh * i + fit.size * 0.86;
          const words = line.split(' ');
          if (st.firstWord && i === 0 && words.length > 0 && !hasThaana(line) && (fit.lines.length > 1 || words.length > 1)) {
            // The first word (or the whole first line of several) in the highlight.
            const lead = fit.lines.length > 1 ? line : words[0];
            const rest = fit.lines.length > 1 ? '' : line.slice(lead.length);
            const total = ctx.measureText(line).width;
            const x0 = st.align === 'left' ? box.x : st.align === 'center' ? ax - total / 2 : ax - total;
            ctx.textAlign = 'left';
            ctx.fillStyle = st.firstWord;
            ctx.fillText(lead, x0, base);
            if (rest) {
              ctx.fillStyle = st.ink;
              ctx.fillText(rest, x0 + ctx.measureText(lead).width, base);
            }
          } else {
            ctx.textAlign = st.align;
            ctx.fillStyle = st.ink;
            ctx.fillText(line, ax, base);
          }
        });
      } });
    }

    if (tagline) {
      const size = 4.3 * u * s;
      ctx.font = font('body', size);
      const lines = wrap(ctx, tagline, box.w).slice(0, 3);
      rows.push({ h: size * 1.3 * lines.length, gap: 3 * u * s, draw: (y) => {
        ctx.font = font('body', size);
        ctx.textAlign = st.align;
        ctx.fillStyle = alpha(st.ink, 0.86);
        lines.forEach((l, i) => ctx.fillText(l, ax, y + size * 1.3 * i + size));
      } });
    }

    if (price) {
      const pill = st.price !== 'plain';
      let big = (pill ? 9 : 12) * u * s;
      const widths = () => {
        ctx.font = font('caps', big);
        const num = ctx.measureText(price).width;
        ctx.font = font('sans', big * 0.36);
        const cur = ctx.measureText('MVR').width + big * 0.18;
        ctx.font = font('body', big * 0.5);
        const old = was ? ctx.measureText(was).width + big * 0.35 : 0;
        const pad = pill ? big * 0.5 : 0;
        return { num, cur, old, pad, whole: cur + num + pad * 2 + old };
      };
      let m = widths();
      if (m.whole > box.w) {
        big *= box.w / m.whole;
        m = widths();
      }
      const h = pill ? big * 1.5 : big * 1.05;
      rows.push({ h, gap: 3 * u * s, draw: (y) => {
        let x = st.align === 'left' ? box.x : st.align === 'center' ? ax - m.whole / 2 : ax - m.whole;
        const mid = y + h / 2;
        if (was) {
          ctx.font = font('body', big * 0.5);
          ctx.textAlign = 'left';
          ctx.fillStyle = alpha(st.ink, 0.75);
          ctx.fillText(was, x, mid + big * 0.18);
          ctx.strokeStyle = alpha(st.ink, 0.85);
          ctx.lineWidth = Math.max(1, big * 0.05);
          ctx.beginPath();
          ctx.moveTo(x - big * 0.04, mid + big * 0.06);
          ctx.lineTo(x + m.old - big * 0.3, mid - big * 0.1);
          ctx.stroke();
          x += m.old;
        }
        if (pill) {
          rr(ctx, x, y, m.cur + m.num + m.pad * 2, h, h / 2);
          ctx.fillStyle = st.pop;
          ctx.fill();
        }
        ctx.fillStyle = pill ? st.popInk : st.pop;
        ctx.textAlign = 'left';
        ctx.font = font('sans', big * 0.36);
        ctx.fillText('MVR', x + m.pad, mid - big * 0.08);
        ctx.font = font('caps', big);
        ctx.fillText(price, x + m.pad + m.cur, mid + big * 0.37);
      } });
    }

    if (cta || cta2) {
      const size = 4.2 * u * s;
      const h = size * 2.5;
      const arrow = size * 1.1;
      const gapX = size * 0.7;
      const first: ButtonLook = spec.ctaStyle && spec.ctaStyle !== 'auto' ? spec.ctaStyle : (st.cta ?? 'solid');
      // The second button never looks like the first: one to act on, one beside it.
      const second: ButtonLook = first === 'outline' ? 'solid' : 'outline';
      const list = [cta, cta2].filter(Boolean).map((words, i) => ({
        text: hasThaana(words) ? words : words.toUpperCase(),
        look: cta && i === 0 ? first : (cta ? second : first),
        arrow: i === 0,
      }));
      ctx.font = font('sans', size);
      spacing(ctx, 0.06, size);
      const widths = list.map((b) => Math.min(box.w, ctx.measureText(b.text).width + size * 2.2 + (b.arrow ? arrow + size * 0.2 : 0)));
      spacing(ctx, 0, size);
      const oneRow = list.length === 1 || widths[0] + gapX + widths[1] <= box.w;
      const rowsH = oneRow ? h : h * 2 + size * 0.7;
      rows.push({ h: rowsH, gap: 0, pulse: true, draw: (y) => {
        const place = (i: number, x: number, yy: number) => {
          const b = list[i];
          const w = widths[i];
          ctx.font = font('sans', size);
          rr(ctx, x, yy, w, h, h / 2);
          if (b.look === 'outline') {
            ctx.strokeStyle = st.ink;
            ctx.lineWidth = Math.max(1.5, size * 0.11);
            ctx.stroke();
            ctx.fillStyle = st.ink;
          } else if (b.look === 'pop') {
            ctx.fillStyle = st.pop;
            ctx.fill();
            ctx.fillStyle = st.popInk;
          } else {
            ctx.fillStyle = st.ink;
            ctx.fill();
            ctx.fillStyle = st.ground;
          }
          spacing(ctx, 0.06, size);
          if (b.arrow) {
            ctx.textAlign = 'left';
            ctx.fillText(b.text, x + size * 1.1, yy + h / 2 + size * 0.36, w - size * 2.4 - arrow);
          } else {
            ctx.textAlign = 'center';
            ctx.fillText(b.text, x + w / 2, yy + h / 2 + size * 0.36, w - size * 1.6);
          }
          spacing(ctx, 0, size);
          if (!b.arrow) return;
          const axr = x + w - size * 1.1 - arrow * 0.5;
          const ay = yy + h / 2;
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = Math.max(1.5, size * 0.14);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(axr - arrow * 0.35, ay);
          ctx.lineTo(axr + arrow * 0.4, ay);
          ctx.moveTo(axr + arrow * 0.1, ay - arrow * 0.28);
          ctx.lineTo(axr + arrow * 0.4, ay);
          ctx.lineTo(axr + arrow * 0.1, ay + arrow * 0.28);
          ctx.stroke();
        };
        const startOf = (w: number) => (st.align === 'left' ? box.x : st.align === 'center' ? ax - w / 2 : ax - w);
        if (oneRow) {
          const whole = list.length === 1 ? widths[0] : widths[0] + gapX + widths[1];
          let x = startOf(whole);
          list.forEach((_, i) => { place(i, x, y); x += widths[i] + gapX; });
        } else {
          list.forEach((_, i) => place(i, startOf(widths[i]), y + i * (h + size * 0.7)));
        }
      } });
    }

    const total = rows.reduce((sum, r, i) => sum + r.h + (i < rows.length - 1 ? r.gap : 0), 0);
    return { rows, total };
  };

  // The largest scale at which the whole stack fits the box's height.
  let built = build(1);
  if (built.total > box.h) {
    let lo = 0.2;
    let hi = 1;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (build(mid).total > box.h) hi = mid; else lo = mid;
    }
    built = build(lo);
  }
  let y = st.valign === 'top' ? box.y : st.valign === 'middle' ? box.y + (box.h - built.total) / 2 : box.y + box.h - built.total;
  y = Math.max(box.y, y);
  ctx.save();
  for (const row of built.rows) {
    const at = y;
    // Each row of words arrives after the one before it, across every stack on the picture.
    const index = ANIM ? ANIM.rows++ : 0;
    moved(ctx, 'text', index, anchor(box, st.align), at + row.h / 2, { x: box.x, y: at, w: box.w, h: row.h }, row.pulse === true, () => row.draw(at));
    y += row.h + row.gap;
  }
  ctx.restore();
}

/** A round or star sticker with a line or two of words, tilted. */
function sticker(ctx: Ctx, cx: number, cy: number, r: number, text: string, fill: string, ink: string, rot: number, shape: 'burst' | 'circle'): void {
  moved(ctx, 'sticker', 0, cx, cy, null, false, () => stickerStill(ctx, cx, cy, r, text, fill, ink, rot, shape));
}

function stickerStill(ctx: Ctx, cx: number, cy: number, r: number, text: string, fill: string, ink: string, rot: number, shape: 'burst' | 'circle'): void {
  if (!text.trim()) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = r * 0.18;
  ctx.shadowOffsetY = r * 0.06;
  if (shape === 'burst') burstPath(ctx, 0, 0, r, 16, 0.86); else { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  const words = hasThaana(text) ? text : text.toUpperCase();
  const maxW = r * 1.36;
  const fit = fitLines(ctx, words, 'caps', maxW, 3, r * 0.62, r * 0.16);
  const lh = fit.size * 1.06;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const top = -(lh * fit.lines.length) / 2;
  fit.lines.forEach((l, i) => ctx.fillText(l, 0, top + lh * i + fit.size * 0.84));
  ctx.restore();
}

/** The price as a sticker on the photo: "MVR" over the amount, the old price above it. */
function priceSticker(ctx: Ctx, cx: number, cy: number, r: number, spec: PostSpec, fill: string, ink: string, rot: number, shape: 'burst' | 'circle'): void {
  moved(ctx, 'price', 0, cx, cy, null, false, () => priceStickerStill(ctx, cx, cy, r, spec, fill, ink, rot, shape));
}

function priceStickerStill(ctx: Ctx, cx: number, cy: number, r: number, spec: PostSpec, fill: string, ink: string, rot: number, shape: 'burst' | 'circle'): void {
  const price = spec.show.price ? priceWords(spec.price) : '';
  if (!price) return;
  const was = spec.show.was ? priceWords(spec.was) : '';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = r * 0.2;
  ctx.shadowOffsetY = r * 0.06;
  if (shape === 'burst') burstPath(ctx, 0, 0, r, 18, 0.88); else { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const fit = fitLines(ctx, price, 'caps', r * 1.45, 1, r * 0.78, r * 0.2);
  ctx.font = font('sans', r * 0.24);
  ctx.fillText('MVR', 0, -fit.size * 0.42);
  ctx.font = font('caps', fit.size);
  ctx.fillText(price, 0, fit.size * 0.52);
  if (was) {
    const size = r * 0.24;
    ctx.font = font('body', size);
    const w = ctx.measureText(was).width;
    const y = fit.size * 0.52 + size * 1.25;
    ctx.globalAlpha *= 0.8;
    ctx.fillText(was, 0, y);
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, size * 0.1);
    ctx.beginPath();
    ctx.moveTo(-w / 2 - size * 0.1, y - size * 0.3);
    ctx.lineTo(w / 2 + size * 0.1, y - size * 0.42);
    ctx.stroke();
  }
  ctx.restore();
}

const PHONE_PATH = 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z';

/** A telephone handset (the lucide phone shape, filled), `size` across. */
function handset(ctx: Ctx, cx: number, cy: number, size: number, color: string): void {
  if (typeof Path2D === 'undefined') return;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(PHONE_PATH));
  ctx.restore();
}

/**
 * The bottom row: the logo, the phone number as a chip with the website
 * beneath, and the QR code at the far end; each only when it is on.
 */
function footer(ctx: Ctx, box: Rect, spec: PostSpec, A: PostAssets, ink: string, onDark: boolean, chip: string, chipInk: string): void {
  moved(ctx, 'footer', 0, box.x + box.w / 2, box.y + box.h / 2, box, false, () => footerStill(ctx, box, spec, A, ink, onDark, chip, chipInk));
}

function footerStill(ctx: Ctx, box: Rect, spec: PostSpec, A: PostAssets, ink: string, onDark: boolean, chip: string, chipInk: string): void {
  if (box.h <= 0) return;
  let x = box.x;
  let right = box.x + box.w;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (spec.show.qr && A.qr) {
    const s = box.h;
    rr(ctx, right - s, box.y, s, s, s * 0.1);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.drawImage(A.qr, right - s + s * 0.08, box.y + s * 0.08, s * 0.84, s * 0.84);
    right -= s + box.h * 0.25;
  }
  const mark = onDark ? A.logoDark : A.logoLight;
  if (spec.show.logo && mark) {
    x += logo(ctx, mark, x, box.y - box.h * 0.06, box.h * 1.12) + box.h * 0.22;
  }
  const phone = spec.show.phone ? spec.phone.trim() : '';
  const site = spec.show.website ? spec.website.trim() : '';
  const room = Math.max(0, right - x);
  if (phone && room > box.h) {
    const h = site ? box.h * 0.62 : box.h * 0.7;
    const y = site ? box.y : box.y + (box.h - h) / 2;
    let size = h * 0.58;
    ctx.font = font('caps', size);
    const icon = h * 0.62;
    let w = ctx.measureText(phone).width + icon + h * 0.75;
    if (w > room) {
      size *= room / w;
      ctx.font = font('caps', size);
      w = room;
    }
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = chip;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + h / 2, y + h / 2, icon / 2, 0, Math.PI * 2);
    ctx.fillStyle = chipInk;
    ctx.fill();
    handset(ctx, x + h / 2, y + h / 2, icon * 0.56, chip);
    ctx.fillStyle = chipInk;
    ctx.textAlign = 'left';
    ctx.fillText(phone, x + h * 0.5 + icon * 0.72, y + h / 2 + size * 0.37, w - icon - h * 0.6);
  }
  if (site && room > box.h) {
    const size = phone ? box.h * 0.24 : box.h * 0.32;
    ctx.font = font('sans', size);
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.fillText(site, x + (phone ? box.h * 0.08 : 0), phone ? box.y + box.h - size * 0.1 : box.y + box.h / 2 + size * 0.36, room);
  }
  ctx.restore();
}

// ── Layouts ─────────────────────────────────────────────────────────────────

interface Stage {
  ctx: Ctx;
  W: number;
  H: number;
  u: number;
  wide: boolean;
  tall: boolean;
  /** The area for words and the photo, clear of the edges and of the footer. */
  body: Rect;
  foot: Rect;
  spec: PostSpec;
  P: Palette;
  A: PostAssets;
}

type Layout = (s: Stage) => void;

const badgeOn = (s: Stage) => (s.spec.show.badge ? s.spec.badge.trim() : '');

function base(s: Stage, over: Partial<StackStyle> = {}): StackStyle {
  return { align: 'left', valign: 'top', head: 'sans', ink: s.P.ink, ground: s.P.bg, pop: s.P.pop, popInk: s.P.popInk, price: 'pill', cta: 'solid', kicker: 'pill', ...over };
}

const ALL: StackPart[] = ['kicker', 'headline', 'tagline', 'price', 'cta'];

/** Brush strokes at the corners, a script headline and the dish large below. */
const splash: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  brush(ctx, W * 0.9, H * 0.02, W * 0.75, (wide ? 0.34 : 0.16) * H, -0.42, P.alt, 11);
  brush(ctx, W * 0.86, H * 0.86, W * 0.95, (wide ? 0.5 : 0.24) * H, -0.42, P.alt, 23);
  brush(ctx, W * 0.02, H * 0.6, W * 0.4, (wide ? 0.16 : 0.07) * H, -0.42, alpha(P.alt, 0.85), 37);
  const T: Rect = wide ? { x: body.x, y: body.y, w: body.w * 0.5, h: body.h } : { x: body.x, y: body.y, w: body.w * 0.92, h: body.h * 0.45 };
  const Pb: Rect = wide ? { x: body.x + body.w * 0.52, y: body.y, w: body.w * 0.48, h: body.h } : { x: body.x, y: body.y + body.h * 0.46, w: body.w, h: body.h * 0.54 };
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: null, ring: P.bg, ringW: 1.6 * u }, u);
  stack(ctx, T, s.spec, base(s, { head: 'script', firstWord: isDark(P.bg) === isDark(P.alt) ? P.pop : P.alt, valign: wide ? 'middle' : 'top', cta: 'outline' }), ALL, u);
  const d = Math.min(Pb.w, Pb.h);
  sticker(ctx, Pb.x + Pb.w / 2 - d * 0.36, Pb.y + Pb.h / 2 - d * 0.36, d * 0.17, badgeOn(s), P.pop, P.popInk, -0.2, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.pop, P.popInk);
};

/** The dish in a ring under a glow, the name in tall capitals above. */
const spotlight: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  const cx = wide ? W * 0.72 : W / 2;
  const cy = wide ? H / 2 : body.y + body.h * 0.56;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
  g.addColorStop(0, mix(P.bg, P.alt, 0.5));
  g.addColorStop(1, P.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  rays(ctx, cx, cy, Math.max(W, H), 14, alpha(P.ink, 0.05));
  const d = wide ? Math.min(body.w * 0.42, body.h * 0.92) : Math.min(body.w * 0.8, body.h * 0.46);
  const Pb: Rect = { x: cx - d / 2, y: cy - d / 2, w: d, h: d };
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(P.alt, 0.9), ring: P.pop, ringW: 1.4 * u }, u);
  if (wide) {
    stack(ctx, { x: body.x, y: body.y, w: body.w * 0.46, h: body.h }, s.spec, base(s, { head: 'caps', valign: 'middle', price: 'plain' }), ALL, u);
  } else {
    stack(ctx, { x: body.x, y: body.y, w: body.w, h: Pb.y - body.y - 3 * u }, s.spec, base(s, { head: 'caps', align: 'center', valign: 'middle' }), ['kicker', 'headline', 'tagline'], u);
    stack(ctx, { x: body.x, y: Pb.y + d + 3 * u, w: body.w, h: body.y + body.h - (Pb.y + d + 3 * u) }, s.spec, base(s, { align: 'center', valign: 'middle' }), ['cta'], u);
    priceSticker(ctx, cx + d * 0.36, cy + d * 0.36, d * 0.2, s.spec, P.pop, P.popInk, 0.14, 'burst');
  }
  sticker(ctx, cx - d * 0.38, cy - d * 0.36, d * 0.16, badgeOn(s), P.ink, P.bg, -0.18, 'circle');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.pop, P.popInk);
};

/** Two colours meeting on a slant, the words on one and the dish on the other. */
const diagonal: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  if (wide) {
    ctx.moveTo(W * 0.5, H); ctx.lineTo(W * 0.64, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H);
  } else {
    ctx.moveTo(0, H * 0.66); ctx.lineTo(W, H * 0.4); ctx.lineTo(W, H); ctx.lineTo(0, H);
  }
  ctx.closePath();
  ctx.fillStyle = P.alt;
  ctx.fill();
  const T: Rect = wide ? { x: body.x, y: body.y, w: body.w * 0.47, h: body.h } : { x: body.x, y: body.y, w: body.w, h: body.h * 0.4 };
  const d = wide ? Math.min(body.w * 0.4, body.h * 0.95) : Math.min(body.w * 0.74, body.h * 0.5);
  const Pb: Rect = wide ? { x: body.x + body.w - d, y: body.y + (body.h - d) / 2, w: d, h: d } : { x: body.x + body.w - d, y: body.y + body.h - d, w: d, h: d };
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(P.bg, 0.16), ring: P.bg, ringW: 1.6 * u }, u);
  stack(ctx, T, s.spec, base(s, { head: 'sans', valign: wide ? 'middle' : 'top', firstWord: P.alt }), ALL, u);
  sticker(ctx, Pb.x + d * 0.12, Pb.y + d * 0.14, d * 0.17, badgeOn(s), P.bg, P.ink, -0.2, 'burst');
  if (wide) footer(ctx, { ...s.foot, w: s.foot.w * 0.5 }, s.spec, s.A, P.ink, isDark(P.bg), P.pop, P.popInk);
  else footer(ctx, s.foot, s.spec, s.A, P.altInk, isDark(P.alt), P.bg, P.ink);
};

/** The photo fills the picture; the words sit on a dark fade at the bottom. */
const fullPhoto: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  const whole = s.A.photo !== null && !s.spec.cutout;
  if (whole && s.A.photo) {
    cover(ctx, s.A.photo, { x: 0, y: 0, w: W, h: H });
  } else {
    const g = ctx.createRadialGradient(W * (wide ? 0.72 : 0.5), H * (wide ? 0.5 : 0.36), 0, W / 2, H / 2, Math.max(W, H) * 0.8);
    g.addColorStop(0, mix(P.alt, '#FFFFFF', 0.25));
    g.addColorStop(1, mix(P.alt, '#000000', 0.25));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const Pb: Rect = wide ? { x: body.x + body.w * 0.5, y: body.y, w: body.w * 0.5, h: body.h } : { x: body.x, y: body.y, w: body.w, h: body.h * 0.56 };
    photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: null }, u);
  }
  const fade = wide ? ctx.createLinearGradient(0, 0, W * 0.75, 0) : ctx.createLinearGradient(0, H * 0.28, 0, H);
  if (wide) { fade.addColorStop(0, 'rgba(0,0,0,0.86)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); }
  else { fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(0.55, 'rgba(0,0,0,0.72)'); fade.addColorStop(1, 'rgba(0,0,0,0.92)'); }
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  const T: Rect = wide ? { x: body.x, y: body.y, w: body.w * 0.52, h: body.h } : { x: body.x, y: body.y + body.h * 0.5, w: body.w, h: body.h * 0.5 };
  const pop = isDark(P.pop) ? P.alt : P.pop;
  const popInk = isDark(P.pop) ? P.altInk : P.popInk;
  stack(ctx, T, s.spec, { align: 'left', valign: 'bottom', head: 'caps', ink: '#FFFFFF', ground: '#111111', pop, popInk, price: 'pill', cta: 'outline', kicker: 'pill' }, ALL, u);
  const r = 10 * u;
  sticker(ctx, W - body.x - r, body.y + r, r, badgeOn(s), pop, popInk, 0.14, 'burst');
  footer(ctx, s.foot, s.spec, s.A, '#FFFFFF', true, pop, popInk);
};

/** A snapshot on a striped ground, a little askew, the name in script beneath. */
const frame: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  stripes(ctx, W, H, 9 * u, 2.6 * u, alpha(P.alt, 0.14));
  const C: Rect = wide ? { x: body.x + 2 * u, y: body.y + 2 * u, w: body.w * 0.44, h: body.h - 4 * u } : { x: body.x + body.w * 0.08, y: body.y + 2 * u, w: body.w * 0.84, h: body.h * 0.54 };
  ctx.save();
  ctx.translate(C.x + C.w / 2, C.y + C.h / 2);
  ctx.rotate(-0.035);
  ctx.translate(-(C.x + C.w / 2), -(C.y + C.h / 2));
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 5 * u;
  ctx.shadowOffsetY = 2 * u;
  rr(ctx, C.x, C.y, C.w, C.h, 1.6 * u);
  ctx.fillStyle = '#FFFDF8';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  const pad = 2.6 * u;
  photo(ctx, { x: C.x + pad, y: C.y + pad, w: C.w - pad * 2, h: C.h - pad * 2 }, s.spec, s.A, { shape: 'rounded', radius: 1 * u, disc: mix(P.alt, '#FFFFFF', 0.72) }, u);
  // A strip of tape.
  ctx.fillStyle = alpha(P.pop, 0.9);
  ctx.save();
  ctx.translate(C.x + C.w / 2, C.y);
  ctx.rotate(0.05);
  ctx.fillRect(-9 * u, -2.2 * u, 18 * u, 4.4 * u);
  ctx.restore();
  ctx.restore();
  priceSticker(ctx, wide ? C.x + 7 * u : C.x + C.w - 4 * u, C.y + C.h - 5 * u, 11 * u, s.spec, P.pop, P.popInk, wide ? -0.12 : 0.16, 'burst');
  sticker(ctx, C.x + 5 * u, C.y + 6 * u, 9 * u, badgeOn(s), P.alt, P.altInk, -0.22, 'circle');
  const T: Rect = wide
    ? { x: C.x + C.w + 5 * u, y: body.y, w: body.x + body.w - (C.x + C.w + 5 * u), h: body.h }
    : { x: body.x, y: C.y + C.h + 6 * u, w: body.w, h: body.y + body.h - (C.y + C.h + 6 * u) };
  stack(ctx, T, s.spec, base(s, { head: 'script', align: wide ? 'left' : 'center', valign: 'middle', kicker: 'plain' }), ['kicker', 'headline', 'tagline', 'cta'], u);
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** The name as large as the picture allows, on a ground of the second colour. */
const bigType: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, W, H);
  dots(ctx, W, H, 6 * u, 0.4 * u, alpha(P.altInk, 0.08));
  const st: StackStyle = { align: 'left', valign: 'top', head: 'caps', ink: P.altInk, ground: P.alt, pop: P.bg, popInk: P.ink, headScale: 1.5, price: 'plain', cta: 'solid', kicker: 'pill' };
  if (wide) {
    const d = Math.min(body.w * 0.42, body.h);
    const Pb: Rect = { x: body.x + body.w - d, y: body.y + (body.h - d) / 2, w: d, h: d };
    photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(P.bg, 0.2), ring: P.bg, ringW: 1.6 * u }, u);
    stack(ctx, { x: body.x, y: body.y, w: body.w * 0.52, h: body.h }, s.spec, { ...st, valign: 'middle', pop: P.altInk, headScale: 1.15 }, ALL, u);
    sticker(ctx, Pb.x + d * 0.86, Pb.y + d * 0.14, d * 0.16, badgeOn(s), P.bg, P.ink, 0.18, 'burst');
  } else {
    const d = Math.min(body.w * 0.64, body.h * 0.5);
    const Pb: Rect = { x: body.x + body.w - d, y: body.y + body.h - d, w: d, h: d };
    stack(ctx, { x: body.x, y: body.y, w: body.w, h: body.h - d - 2 * u }, s.spec, st, ['kicker', 'headline', 'tagline'], u);
    photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(P.bg, 0.2), ring: P.bg, ringW: 1.6 * u }, u);
    stack(ctx, { x: body.x, y: Pb.y + d * 0.3, w: body.w - d - 2 * u, h: d * 0.7 }, s.spec, { ...st, valign: 'bottom', pop: P.altInk, headScale: 1 }, ['price', 'cta'], u);
    sticker(ctx, Pb.x + d * 0.84, Pb.y + d * 0.1, d * 0.16, badgeOn(s), P.bg, P.ink, 0.18, 'burst');
  }
  footer(ctx, s.foot, s.spec, s.A, P.altInk, isDark(P.alt), P.bg, P.ink);
};

/** The photo above a curve, the words on the plain ground beneath. */
const band: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const edge = wide ? W * 0.46 : body.y + body.h * 0.5;
  ctx.save();
  ctx.beginPath();
  if (wide) {
    ctx.moveTo(0, 0); ctx.lineTo(edge - 5 * u, 0); ctx.quadraticCurveTo(edge + 9 * u, H / 2, edge - 5 * u, H); ctx.lineTo(0, H);
  } else {
    ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, edge - 5 * u); ctx.quadraticCurveTo(W / 2, edge + 9 * u, 0, edge - 5 * u);
  }
  ctx.closePath();
  ctx.fillStyle = P.alt;
  ctx.fill();
  ctx.clip();
  const area: Rect = wide ? { x: 0, y: 0, w: edge + 4 * u, h: H } : { x: 0, y: 0, w: W, h: edge + 4 * u };
  if (s.A.photo && !s.spec.cutout) {
    cover(ctx, s.A.photo, area);
  } else {
    const inset: Rect = wide
      ? { x: body.x, y: body.y, w: edge - body.x - 6 * u, h: body.h }
      : { x: body.x, y: body.y, w: body.w, h: edge - body.y - 7 * u };
    photo(ctx, inset, s.spec, s.A, { shape: 'circle', disc: null }, u);
  }
  ctx.restore();
  const T: Rect = wide
    ? { x: edge + 9 * u, y: body.y, w: body.x + body.w - (edge + 9 * u), h: body.h }
    : { x: body.x, y: edge + 8 * u, w: body.w, h: body.y + body.h - (edge + 8 * u) };
  stack(ctx, T, s.spec, base(s, { head: 'serif', valign: 'middle', kicker: 'plain', firstWord: P.alt }), ['kicker', 'headline', 'tagline', 'cta'], u);
  const r = 10.5 * u;
  if (wide) priceSticker(ctx, edge - 3 * u, H - body.y - r, r, s.spec, P.pop, P.popInk, 0.12, 'circle');
  else priceSticker(ctx, W - body.x - r, edge - 1 * u, r, s.spec, P.pop, P.popInk, 0.12, 'circle');
  sticker(ctx, body.x + 9 * u, body.y + 9 * u, 9 * u, badgeOn(s), P.pop, P.popInk, -0.2, 'burst');
  footer(ctx, wide ? { ...s.foot, x: T.x, w: T.w } : s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** The dish on a soft blob over dots, with tilted stickers around it. */
const stickers: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  dots(ctx, W, H, 5.2 * u, 0.42 * u, alpha(P.ink, 0.1));
  const r = wide ? Math.min(body.w * 0.22, body.h * 0.46) : Math.min(body.w * 0.4, body.h * 0.27);
  const cx = wide ? body.x + body.w * 0.73 : W / 2;
  const cy = wide ? body.y + body.h / 2 : body.y + r * 1.12;
  blobPath(ctx, cx, cy, r * 1.08, 7);
  ctx.fillStyle = P.alt;
  ctx.fill();
  const d = r * 1.72;
  photo(ctx, { x: cx - d / 2, y: cy - d / 2, w: d, h: d }, s.spec, s.A, { shape: 'circle', disc: null, ring: '#FFFFFF', ringW: 1.4 * u }, u);
  sticker(ctx, cx - r * 0.86, cy - r * 0.74, r * 0.36, badgeOn(s), P.pop, P.popInk, -0.24, 'burst');
  priceSticker(ctx, cx + r * 0.82, cy + r * 0.7, r * 0.42, s.spec, P.ink, P.bg, 0.16, 'circle');
  const T: Rect = wide
    ? { x: body.x, y: body.y, w: body.w * 0.46, h: body.h }
    : { x: body.x, y: cy + r * 1.22, w: body.w, h: body.y + body.h - (cy + r * 1.22) };
  stack(ctx, T, s.spec, base(s, { head: 'serif', align: wide ? 'left' : 'center', valign: 'middle', pop: P.alt, popInk: P.altInk }), ['kicker', 'headline', 'tagline', 'cta'], u);
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** An arched window on a quiet ground inside a fine line: the calm one. */
const arch: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = alpha(P.ink, 0.45);
  ctx.lineWidth = Math.max(1, 0.28 * u);
  ctx.strokeRect(body.x - 3 * u, body.y - 3 * u, body.w + 6 * u, s.foot.y + s.foot.h - body.y + 6 * u);
  const aw = wide ? Math.min(body.w * 0.34, body.h * 0.8) : Math.min(body.w * 0.64, body.h * 0.5 * 0.82);
  const ah = wide ? body.h : Math.min(body.h * 0.5, aw * 1.3);
  const ax = wide ? body.x + 2 * u : body.x + (body.w - aw) / 2;
  const ay = body.y + (wide ? 0 : 1 * u);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(ax, ay + ah);
    ctx.lineTo(ax, ay + aw / 2);
    ctx.arc(ax + aw / 2, ay + aw / 2, aw / 2, Math.PI, 0);
    ctx.lineTo(ax + aw, ay + ah);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = P.alt;
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  if (s.A.photo && !s.spec.cutout) cover(ctx, s.A.photo, { x: ax, y: ay, w: aw, h: ah });
  else photo(ctx, { x: ax + aw * 0.06, y: ay + ah - aw * 0.94, w: aw * 0.88, h: aw * 0.88 }, s.spec, s.A, { shape: 'circle', disc: null }, u);
  ctx.restore();
  path();
  ctx.strokeStyle = P.pop;
  ctx.lineWidth = 0.8 * u;
  ctx.stroke();
  sticker(ctx, wide ? ax + 2 * u : ax + aw - 2 * u, ay + aw * 0.2, aw * 0.17, badgeOn(s), P.pop, P.popInk, wide ? -0.16 : 0.16, 'circle');
  const T: Rect = wide
    ? { x: ax + aw + 6 * u, y: body.y, w: body.x + body.w - (ax + aw + 6 * u), h: body.h }
    : { x: body.x, y: ay + ah + 4 * u, w: body.w, h: body.y + body.h - (ay + ah + 4 * u) };
  stack(ctx, T, s.spec, base(s, { head: 'serif', align: wide ? 'left' : 'center', valign: 'middle', kicker: 'plain', price: 'plain', pop: isDark(P.bg) === isDark(P.pop) ? P.alt : P.pop, cta: 'outline' }), ALL, u);
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** A band down one side carrying the business's name, the rest in tidy rows. */
const side: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const bw = wide ? 11 * u : 13 * u;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, bw, H);
  ctx.save();
  ctx.translate(bw / 2, H / 2);
  ctx.rotate(-Math.PI / 2);
  const name = (s.spec.brand || 'Bake & Grill').toUpperCase();
  const size = bw * 0.42;
  ctx.font = font('caps', size);
  spacing(ctx, 0.2, size);
  ctx.fillStyle = P.altInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${name}   •   ${name}   •   ${name}`, 0, size * 0.36);
  spacing(ctx, 0, size);
  ctx.restore();
  const x0 = bw + 5 * u;
  const cw = body.x + body.w - x0;
  if (wide) {
    const pw = cw * 0.46;
    photo(ctx, { x: x0 + cw - pw, y: body.y, w: pw, h: body.h }, s.spec, s.A, { shape: 'rounded', radius: 4 * u, disc: mix(P.alt, P.bg, 0.78) }, u);
    stack(ctx, { x: x0, y: body.y, w: cw - pw - 5 * u, h: body.h }, s.spec, base(s, { valign: 'middle', firstWord: P.alt }), ALL, u);
    sticker(ctx, x0 + cw - 7 * u, body.y + 8 * u, 8.5 * u, badgeOn(s), P.pop, P.popInk, 0.16, 'burst');
  } else {
    const top = body.h * 0.26;
    const ph = body.h * 0.44;
    stack(ctx, { x: x0, y: body.y, w: cw, h: top }, s.spec, base(s, { valign: 'middle', firstWord: P.alt }), ['kicker', 'headline', 'tagline'], u);
    const Pb: Rect = { x: x0, y: body.y + top + 2 * u, w: cw, h: ph };
    photo(ctx, Pb, s.spec, s.A, { shape: 'rounded', radius: 4 * u, disc: mix(P.alt, P.bg, 0.78) }, u);
    sticker(ctx, Pb.x + Pb.w - 8 * u, Pb.y + 8 * u, 9 * u, badgeOn(s), P.pop, P.popInk, 0.16, 'burst');
    const by = Pb.y + ph + 3 * u;
    stack(ctx, { x: x0, y: by, w: cw, h: body.y + body.h - by }, s.spec, base(s, { valign: 'middle' }), ['price', 'cta'], u);
  }
  footer(ctx, { ...s.foot, x: x0, w: cw }, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** The photo on one half, a solid panel of words on the other. */
const block: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, W, H);
  const cut = wide ? W * 0.5 : body.y + body.h * 0.47;
  const area: Rect = wide ? { x: cut, y: 0, w: W - cut, h: H } : { x: 0, y: 0, w: W, h: cut };
  ctx.fillStyle = mix(P.alt, P.bg, 0.86);
  ctx.fillRect(area.x, area.y, area.w, area.h);
  if (s.A.photo && !s.spec.cutout) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    cover(ctx, s.A.photo, area);
    ctx.restore();
  } else {
    const top = Math.max(area.y + 3 * u, body.y);
    photo(ctx, { x: area.x + 4 * u, y: top, w: area.w - 8 * u, h: area.y + area.h - top - 4 * u }, s.spec, s.A, { shape: 'circle', disc: null }, u);
  }
  ctx.fillStyle = P.pop;
  if (wide) ctx.fillRect(cut - 0.7 * u, 0, 1.4 * u, H); else ctx.fillRect(0, cut - 0.7 * u, W, 1.4 * u);
  const T: Rect = wide
    ? { x: body.x, y: body.y, w: cut - body.x - 6 * u, h: body.h }
    : { x: body.x, y: cut + 5 * u, w: body.w, h: body.y + body.h - (cut + 5 * u) };
  stack(ctx, T, s.spec, { align: 'left', valign: 'middle', head: 'caps', ink: P.altInk, ground: P.alt, pop: P.pop, popInk: P.popInk, price: 'pill', cta: 'solid', kicker: 'pill' }, ALL, u);
  const r = 9.5 * u;
  sticker(ctx, area.x + area.w - body.x - r, Math.max(area.y, body.y - 2 * u) + r + 2 * u, r, badgeOn(s), P.pop, P.popInk, 0.14, 'burst');
  footer(ctx, wide ? { ...s.foot, w: cut - body.x - 6 * u } : s.foot, s.spec, s.A, P.altInk, isDark(P.alt), P.pop, P.popInk);
};

/** A great circle running off the edge holds the dish; the words keep the open side. */
const bigCircle: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const r = wide ? H * 0.5 : Math.min(W * 0.5, body.h * 0.36);
  const cx = wide ? W * 0.78 : W * 0.6;
  const cy = wide ? H * 0.5 : body.y + body.h - r * 0.78;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = P.alt;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2.4 * u, 0, Math.PI * 2);
  ctx.strokeStyle = P.pop;
  ctx.lineWidth = 0.8 * u;
  ctx.stroke();
  const d = r * 1.5;
  const px = Math.min(cx - d / 2, W - body.x - d);
  photo(ctx, { x: px, y: cy - d / 2, w: d, h: d }, s.spec, s.A, { shape: 'circle', disc: null, ring: P.bg, ringW: 1.4 * u }, u);
  const T: Rect = wide
    ? { x: body.x, y: body.y, w: body.w * 0.44, h: body.h }
    : { x: body.x, y: body.y, w: body.w, h: cy - r - body.y - 3 * u };
  stack(ctx, T, s.spec, base(s, { valign: wide ? 'middle' : 'top', firstWord: P.alt }), ALL, u);
  sticker(ctx, cx - r * 0.78, cy - r * 0.5, r * 0.3, badgeOn(s), P.pop, P.popInk, -0.2, 'burst');
  footer(ctx, wide ? { ...s.foot, w: s.foot.w * 0.46 } : s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.pop, P.popInk);
};

/** A ticket: the words on a card with notched sides and a dashed tear line. */
const ticket: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, W, H);
  dots(ctx, W, H, 6 * u, 0.4 * u, alpha(P.altInk, 0.08));
  const Pb: Rect = wide ? { x: body.x, y: body.y, w: body.w * 0.4, h: body.h } : { x: body.x, y: body.y, w: body.w, h: body.h * 0.43 };
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(P.bg, 0.18), ring: P.bg, ringW: 1.5 * u }, u);
  const C: Rect = wide
    ? { x: body.x + body.w * 0.44, y: body.y, w: body.w * 0.56, h: body.h }
    : { x: body.x, y: body.y + body.h * 0.46, w: body.w, h: body.h * 0.54 };
  const tear = C.y + C.h * 0.6;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 3 * u;
  ctx.shadowOffsetY = 1 * u;
  rr(ctx, C.x, C.y, C.w, C.h, 3 * u);
  ctx.fillStyle = P.bg;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = P.alt;
  for (const x of [C.x, C.x + C.w]) {
    ctx.beginPath();
    ctx.arc(x, tear, 2.8 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.setLineDash([1.6 * u, 1.6 * u]);
  ctx.strokeStyle = alpha(P.ink, 0.4);
  ctx.lineWidth = Math.max(1, 0.35 * u);
  ctx.beginPath();
  ctx.moveTo(C.x + 5 * u, tear);
  ctx.lineTo(C.x + C.w - 5 * u, tear);
  ctx.stroke();
  ctx.restore();
  const st = base(s, { align: 'center', valign: 'middle', head: 'serif', kicker: 'plain', pop: isDark(P.pop) === isDark(P.bg) ? P.alt : P.pop, popInk: isDark(P.pop) === isDark(P.bg) ? P.altInk : P.popInk });
  stack(ctx, { x: C.x + 5 * u, y: C.y + 4 * u, w: C.w - 10 * u, h: tear - C.y - 7 * u }, s.spec, st, ['kicker', 'headline', 'tagline'], u);
  stack(ctx, { x: C.x + 5 * u, y: tear + 3 * u, w: C.w - 10 * u, h: C.y + C.h - tear - 6 * u }, s.spec, st, ['price', 'cta'], u);
  const d = Math.min(Pb.w, Pb.h);
  sticker(ctx, Pb.x + Pb.w / 2 + d * 0.38, Pb.y + Pb.h / 2 - d * 0.34, d * 0.17, badgeOn(s), P.pop, P.popInk, 0.16, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.altInk, isDark(P.alt), P.bg, P.ink);
};

/** Rings of light round the dish. */
const glow: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  const d = wide ? Math.min(body.w * 0.36, body.h * 0.74) : Math.min(body.w * 0.6, body.h * 0.36);
  const cx = wide ? body.x + body.w * 0.76 : W / 2;
  const cy = wide ? body.y + body.h / 2 : body.y + body.h * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
  g.addColorStop(0, mix(P.bg, P.alt, 0.55));
  g.addColorStop(0.55, P.bg);
  g.addColorStop(1, mix(P.bg, '#000000', 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2 + i * 3 * u, 0, Math.PI * 2);
    ctx.strokeStyle = alpha(P.pop, 0.6 - i * 0.12);
    ctx.lineWidth = 0.7 * u;
    ctx.stroke();
  }
  photo(ctx, { x: cx - d / 2, y: cy - d / 2, w: d, h: d }, s.spec, s.A, { shape: 'circle', disc: alpha(P.alt, 0.9), ring: P.pop, ringW: 1.2 * u }, u);
  const reach = d / 2 + 13.5 * u;
  if (wide) {
    stack(ctx, { x: body.x, y: body.y, w: body.w * 0.46, h: body.h }, s.spec, base(s, { valign: 'middle', head: 'sans' }), ALL, u);
  } else {
    stack(ctx, { x: body.x, y: body.y, w: body.w, h: cy - reach - body.y }, s.spec, base(s, { align: 'center', valign: 'middle', head: 'sans' }), ['kicker', 'headline', 'tagline'], u);
    stack(ctx, { x: body.x, y: cy + reach, w: body.w, h: body.y + body.h - cy - reach }, s.spec, base(s, { align: 'center', valign: 'middle' }), ['price', 'cta'], u);
  }
  sticker(ctx, cx + d * 0.4, cy - d * 0.38, d * 0.17, badgeOn(s), P.pop, P.popInk, 0.16, 'circle');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.pop, P.popInk);
};

/** Three bands: the name on top, the dish in the middle, the price along the bottom. */
const bands: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  if (wide) {
    const cut = W * 0.46;
    ctx.fillStyle = P.alt;
    ctx.fillRect(0, 0, cut, H);
    ctx.fillStyle = P.pop;
    ctx.fillRect(cut, H - s.foot.h - 9 * u, W - cut, s.foot.h + 9 * u);
    stack(ctx, { x: body.x, y: body.y, w: cut - body.x - 5 * u, h: body.h }, s.spec, { align: 'left', valign: 'middle', head: 'caps', ink: P.altInk, ground: P.alt, pop: P.pop, popInk: P.popInk, price: 'pill', cta: 'solid', kicker: 'pill' }, ALL, u);
    const Pb: Rect = { x: cut + 4 * u, y: body.y, w: W - cut - 4 * u - body.x, h: H - s.foot.h - 12 * u - body.y };
    photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: null, ring: P.alt, ringW: 1.4 * u }, u);
    sticker(ctx, Pb.x + Pb.w - 8 * u, Pb.y + 8 * u, 8.5 * u, badgeOn(s), P.alt, P.altInk, 0.16, 'burst');
    footer(ctx, { ...s.foot, w: cut - body.x - 5 * u }, s.spec, s.A, P.altInk, isDark(P.alt), P.pop, P.popInk);
    return;
  }
  const tb = body.y + body.h * 0.26;
  const by = body.y + body.h * 0.74;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, W, tb);
  ctx.fillStyle = P.pop;
  ctx.fillRect(0, by, W, H - by);
  stack(ctx, { x: body.x, y: body.y, w: body.w, h: tb - body.y - 3 * u }, s.spec, { align: 'center', valign: 'middle', head: 'caps', ink: P.altInk, ground: P.alt, pop: P.pop, popInk: P.popInk, kicker: 'pill' }, ['kicker', 'headline', 'tagline'], u);
  const Pb: Rect = { x: body.x, y: tb - 3 * u, w: body.w, h: by - tb + 6 * u };
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: null, ring: P.bg, ringW: 1.6 * u }, u);
  const d = Math.min(Pb.w, Pb.h);
  sticker(ctx, Pb.x + Pb.w / 2 + d * 0.42, Pb.y + Pb.h / 2 - d * 0.3, d * 0.17, badgeOn(s), P.alt, P.altInk, 0.16, 'burst');
  stack(ctx, { x: body.x, y: by + 4.5 * u, w: body.w, h: body.y + body.h - by - 4.5 * u }, s.spec, { align: 'center', valign: 'middle', head: 'caps', ink: P.popInk, ground: P.pop, pop: P.popInk, popInk: P.pop, price: 'plain', cta: 'solid' }, ['price', 'cta'], u);
  footer(ctx, s.foot, s.spec, s.A, P.popInk, isDark(P.pop), P.bg, P.ink);
};

/** Two cards set at a tilt behind the dish. */
const tilt: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const cw = wide ? body.w * 0.4 : body.w * 0.8;
  const ch = wide ? body.h * 0.82 : body.h * 0.44;
  const cx = wide ? body.x + body.w - cw / 2 - 3 * u : W / 2;
  const cy = wide ? body.y + body.h / 2 : body.y + body.h - ch / 2 - 3 * u;
  const card = (angle: number, fill: string) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    rr(ctx, -cw / 2, -ch / 2, cw, ch, 4 * u);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  };
  card(0.1, P.pop);
  card(-0.07, P.alt);
  const d = Math.min(cw, ch) * 0.94;
  photo(ctx, { x: cx - d / 2, y: cy - d / 2, w: d, h: d }, s.spec, s.A, { shape: 'circle', disc: null, ring: P.bg, ringW: 1.5 * u }, u);
  const T: Rect = wide
    ? { x: body.x, y: body.y, w: body.w - cw - 13 * u, h: body.h }
    : { x: body.x, y: body.y, w: body.w, h: cy - ch / 2 - body.y - 6 * u };
  stack(ctx, T, s.spec, base(s, { head: 'script', valign: wide ? 'middle' : 'top', firstWord: P.alt, pop: isDark(P.pop) === isDark(P.bg) ? P.alt : P.pop, popInk: isDark(P.pop) === isDark(P.bg) ? P.altInk : P.popInk }), ALL, u);
  sticker(ctx, cx + cw * 0.4, cy - ch * 0.42, 8.5 * u, badgeOn(s), P.bg, P.ink, 0.18, 'burst');
  footer(ctx, wide ? { ...s.foot, w: T.w } : s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** Rounded corners of colour, the dish above the name. */
const corners: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const R = Math.min(W, H) * (wide ? 0.62 : 0.46);
  ctx.beginPath();
  ctx.arc(W, 0, R, 0, Math.PI * 2);
  ctx.fillStyle = P.alt;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W, 0, R + 3 * u, 0, Math.PI * 2);
  ctx.strokeStyle = P.pop;
  ctx.lineWidth = 0.9 * u;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, H, Math.min(W, H) * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = alpha(P.alt, 0.16);
  ctx.fill();
  const d = wide ? Math.min(body.w * 0.4, body.h * 0.94) : Math.min(body.w * 0.68, body.h * 0.44);
  const Pb: Rect = wide ? { x: body.x + body.w - d, y: body.y + (body.h - d) / 2, w: d, h: d } : { x: W / 2 - d / 2, y: body.y + 1 * u, w: d, h: d };
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(P.bg, 0.2), ring: P.bg, ringW: 1.6 * u }, u);
  const T: Rect = wide
    ? { x: body.x, y: body.y, w: body.w - d - 7 * u, h: body.h }
    : { x: body.x, y: Pb.y + d + 4 * u, w: body.w, h: body.y + body.h - (Pb.y + d + 4 * u) };
  stack(ctx, T, s.spec, base(s, { head: 'script', align: wide ? 'left' : 'center', valign: 'middle', pop: isDark(P.pop) === isDark(P.bg) ? P.alt : P.pop, popInk: isDark(P.pop) === isDark(P.bg) ? P.altInk : P.popInk }), ALL, u);
  sticker(ctx, Pb.x + d * 0.1, Pb.y + d * 0.16, d * 0.17, badgeOn(s), P.pop, P.popInk, -0.2, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** A magazine page: the business's name over a fine rule, a large serif headline, the photo on an offset block. */
const editorial: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const name = (s.spec.brand || 'Bake & Grill').toUpperCase();
  const size = 2.9 * u;
  ctx.font = font('sans', size);
  spacing(ctx, 0.28, size);
  ctx.fillStyle = P.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, body.x, body.y + size);
  spacing(ctx, 0, size);
  ctx.fillStyle = alpha(P.ink, 0.6);
  ctx.fillRect(body.x, body.y + size + 2 * u, body.w, Math.max(1, 0.3 * u));
  const top = body.y + size + 6 * u;
  const T: Rect = wide ? { x: body.x, y: top, w: body.w * 0.5, h: body.y + body.h - top } : { x: body.x, y: top, w: body.w, h: body.h * 0.42 - (top - body.y) };
  const Pb: Rect = wide
    ? { x: body.x + body.w * 0.56, y: top, w: body.w * 0.44, h: body.y + body.h - top }
    : { x: body.x + body.w * 0.12, y: body.y + body.h * 0.45, w: body.w * 0.88, h: body.h * 0.55 };
  const off = 3 * u;
  ctx.fillStyle = P.alt;
  ctx.fillRect(Pb.x + off, Pb.y + off, Pb.w - off, Pb.h - off);
  photo(ctx, { x: Pb.x, y: Pb.y, w: Pb.w - off, h: Pb.h - off }, s.spec, s.A, { shape: 'cover', disc: mix(P.alt, P.bg, 0.72) }, u);
  const pop = isDark(P.pop) === isDark(P.bg) ? P.alt : P.pop;
  stack(ctx, T, s.spec, base(s, { head: 'serif', valign: wide ? 'middle' : 'top', headScale: 1.1, kicker: 'plain', price: 'plain', pop, cta: 'outline' }), ALL, u);
  sticker(ctx, Pb.x + 2 * u, Pb.y + Pb.h - off - 8 * u, 8.5 * u, badgeOn(s), P.pop, P.popInk, -0.16, 'circle');
  footer(ctx, wide ? { ...s.foot, w: T.w } : s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** A starburst behind the dish, for an offer that should shout. */
const starburst: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, W, H);
  const R = wide ? Math.min(body.w * 0.2, body.h * 0.44) : Math.min(body.w * 0.4, body.h * 0.22);
  const cx = wide ? body.x + body.w * 0.76 : W / 2;
  const cy = wide ? body.y + body.h / 2 : body.y + body.h * 0.5;
  rays(ctx, cx, cy, Math.max(W, H), 16, alpha(P.altInk, 0.07));
  burstPath(ctx, cx, cy, R * 1.2, 22, 0.88);
  ctx.fillStyle = P.bg;
  ctx.fill();
  const d = R * 1.66;
  photo(ctx, { x: cx - d / 2, y: cy - d / 2, w: d, h: d }, s.spec, s.A, { shape: 'circle', disc: null, ring: P.pop, ringW: 1.3 * u }, u);
  const st: StackStyle = { align: 'center', valign: 'middle', head: 'caps', ink: P.altInk, ground: P.alt, pop: P.pop, popInk: P.popInk, price: 'pill', cta: 'solid', kicker: 'pill' };
  if (wide) {
    stack(ctx, { x: body.x, y: body.y, w: body.w * 0.46, h: body.h }, s.spec, { ...st, align: 'left' }, ALL, u);
  } else {
    stack(ctx, { x: body.x, y: body.y, w: body.w, h: cy - R * 1.24 - body.y - 2 * u }, s.spec, st, ['kicker', 'headline', 'tagline'], u);
    stack(ctx, { x: body.x, y: cy + R * 1.24 + 2 * u, w: body.w, h: body.y + body.h - cy - R * 1.24 - 2 * u }, s.spec, st, ['price', 'cta'], u);
  }
  sticker(ctx, cx + R * 0.92, cy - R * 0.86, R * 0.36, badgeOn(s), P.pop, P.popInk, 0.18, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.altInk, isDark(P.alt), P.bg, P.ink);
};

/** A ribbon across the top carries the small line; the price hangs by the dish. */
const ribbon: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const rh = 9 * u;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, body.y, W, rh);
  ctx.fillStyle = alpha(P.pop, 0.9);
  ctx.fillRect(0, body.y + rh, W, 0.8 * u);
  const line = (s.spec.show.kicker && s.spec.kicker.trim() ? s.spec.kicker.trim() : (s.spec.brand || 'Bake & Grill'));
  const words = hasThaana(line) ? line : line.toUpperCase();
  const size = 3.8 * u;
  ctx.font = font('sans', size);
  spacing(ctx, 0.24, size);
  ctx.fillStyle = P.altInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(words, W / 2, body.y + rh / 2 + size * 0.36, body.w);
  spacing(ctx, 0, size);
  const top = body.y + rh + 4 * u;
  const pop = isDark(P.pop) === isDark(P.bg) ? P.alt : P.pop;
  const popInk = isDark(P.pop) === isDark(P.bg) ? P.altInk : P.popInk;
  if (wide) {
    const d = Math.min(body.w * 0.4, body.y + body.h - top);
    const Pb: Rect = { x: body.x + body.w - d, y: top, w: d, h: d };
    photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: mix(P.alt, P.bg, 0.82), ring: P.alt, ringW: 1.3 * u }, u);
    stack(ctx, { x: body.x, y: top, w: body.w - d - 7 * u, h: body.y + body.h - top }, s.spec, base(s, { head: 'serif', valign: 'middle', pop, popInk }), ['headline', 'tagline', 'price', 'cta'], u);
    sticker(ctx, Pb.x + d * 0.1, Pb.y + d * 0.16, d * 0.17, badgeOn(s), P.pop, P.popInk, -0.2, 'burst');
  } else {
    const rest = body.y + body.h - top;
    const d = Math.min(body.w * 0.7, rest * 0.5);
    stack(ctx, { x: body.x, y: top, w: body.w, h: rest * 0.26 }, s.spec, base(s, { head: 'serif', align: 'center', valign: 'middle' }), ['headline', 'tagline'], u);
    const Pb: Rect = { x: W / 2 - d / 2, y: top + rest * 0.28, w: d, h: d };
    photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: mix(P.alt, P.bg, 0.82), ring: P.alt, ringW: 1.3 * u }, u);
    priceSticker(ctx, Pb.x + d * 0.92, Pb.y + d * 0.74, d * 0.22, s.spec, pop, popInk, 0.14, 'burst');
    sticker(ctx, Pb.x + d * 0.08, Pb.y + d * 0.16, d * 0.17, badgeOn(s), P.alt, P.altInk, -0.2, 'circle');
    const by = Pb.y + d + 3 * u;
    stack(ctx, { x: body.x, y: by, w: body.w, h: body.y + body.h - by }, s.spec, base(s, { align: 'center', valign: 'middle' }), ['cta'], u);
  }
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

// ── More designs (owner, 2026-11-16: "Can u add more designs to social hub") ──

/** Words beside the dish on a wide picture, else above or below it: the share most designs use. */
function twoUp(s: Stage, photoFirst: boolean, share: number, room = 0): { T: Rect; Pb: Rect; d: number } {
  const { body, u, wide } = s;
  // `room`: what a design draws round the photo (rings, a frame), kept inside the picture.
  const inset = (box: Rect): Rect => ({ x: box.x + room, y: box.y + room, w: box.w - 2 * room, h: box.h - 2 * room });
  if (wide) {
    const d = Math.min(body.w * 0.42, body.h * 0.94);
    const Pb = inset({ x: body.x + body.w - d, y: body.y + (body.h - d) / 2, w: d, h: d });
    return { d: Pb.w, Pb, T: { x: body.x, y: body.y, w: body.w - d - 6 * u, h: body.h } };
  }
  const d = Math.min(body.w * 0.78, body.h * share);
  const gap = 4 * u;
  if (photoFirst) {
    const Pb = inset({ x: body.x + (body.w - d) / 2, y: body.y, w: d, h: d });
    return { d: Pb.w, Pb, T: { x: body.x, y: body.y + d + gap, w: body.w, h: body.h - d - gap } };
  }
  const Pb = inset({ x: body.x + (body.w - d) / 2, y: body.y + body.h - d, w: d, h: d });
  return { d: Pb.w, Pb, T: { x: body.x, y: body.y, w: body.w, h: body.h - d - gap } };
}

/** A wavy edge across the picture at `y`, filled down to the bottom. */
function wavePath(ctx: Ctx, W: number, H: number, y: number, amp: number, len: number, phase: number): void {
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W + 1; x += Math.max(2, len / 24)) ctx.lineTo(x, y + Math.sin((x / len) * Math.PI * 2 + phase) * amp);
  ctx.lineTo(W, H);
  ctx.closePath();
}

/** A scalloped disc, like a paper doily or a seal. */
function scallopPath(ctx: Ctx, cx: number, cy: number, r: number, n: number, depth: number): void {
  ctx.beginPath();
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const rr2 = r * (1 - depth + depth * Math.abs(Math.cos((a * n) / 2)));
    const x = cx + Math.cos(a) * rr2;
    const y = cy + Math.sin(a) * rr2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** The colour that stands out on `ground`: the highlight, else the second colour. */
function popOn(P: Palette, ground: string): [string, string] {
  return isDark(P.pop) === isDark(ground) ? [P.alt, P.altInk] : [P.pop, P.popInk];
}

/** A postage stamp with a perforated edge holds the dish. */
const stamp: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, W, H);
  stripes(ctx, W, H, 12 * u, 0.5 * u, alpha(P.altInk, 0.08));
  const pad = 3 * u;
  const { T, Pb, d } = twoUp(s, false, 0.56, pad + 1 * u);
  const C: Rect = { x: Pb.x - pad, y: Pb.y - pad, w: d + 2 * pad, h: d + 2 * pad };
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 4 * u;
  ctx.fillStyle = P.bg;
  ctx.fillRect(C.x, C.y, C.w, C.h);
  ctx.restore();
  // The perforations: half circles bitten out of every edge.
  const step = 3.4 * u;
  ctx.fillStyle = P.alt;
  for (let x = C.x + step / 2; x < C.x + C.w; x += step) {
    ctx.beginPath(); ctx.arc(x, C.y, step * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, C.y + C.h, step * 0.32, 0, Math.PI * 2); ctx.fill();
  }
  for (let y = C.y + step / 2; y < C.y + C.h; y += step) {
    ctx.beginPath(); ctx.arc(C.x, y, step * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(C.x + C.w, y, step * 0.32, 0, Math.PI * 2); ctx.fill();
  }
  photo(ctx, { x: Pb.x + pad * 0.6, y: Pb.y + pad * 0.6, w: d - pad * 1.2, h: d - pad * 1.2 }, s.spec, s.A, { shape: 'rounded', radius: 0.6 * u, disc: mix(P.alt, P.bg, 0.8) }, u);
  priceSticker(ctx, C.x + 4 * u, C.y + C.h - 4 * u, d * 0.2, s.spec, P.pop, P.popInk, -0.12, 'circle');
  sticker(ctx, C.x + C.w - 4 * u, C.y + 4 * u, d * 0.15, badgeOn(s), P.ink, P.bg, 0.2, 'burst');
  const [pop, popInk] = popOn(P, P.alt);
  stack(ctx, T, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: 'serif', ink: P.altInk, ground: P.alt, pop, popInk, price: 'plain', cta: 'solid', kicker: 'plain' }, ['kicker', 'headline', 'tagline', 'cta'], u);
  footer(ctx, s.foot, s.spec, s.A, P.altInk, isDark(P.alt), P.bg, P.ink);
};

/** A picnic cloth, the dish on a white plate and the words on a card. */
const picnic: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const band = 9 * u;
  ctx.fillStyle = alpha(P.alt, 0.16);
  for (let x = 0; x < W; x += band * 2) ctx.fillRect(x, 0, band, H);
  for (let y = 0; y < H; y += band * 2) ctx.fillRect(0, y, W, band);
  const { T, Pb } = twoUp(s, true, s.tall ? 0.5 : 0.44, 2 * u);
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: '#FFFFFF', ring: '#FFFFFF', ringW: 3 * u }, u);
  const card: Rect = { x: T.x, y: T.y + 1 * u, w: T.w, h: T.h - 2 * u };
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 4 * u;
  rr(ctx, card.x, card.y, card.w, card.h, 3 * u);
  ctx.fillStyle = P.bg;
  ctx.fill();
  ctx.restore();
  const pad = 3 * u;
  stack(ctx, { x: card.x + pad, y: card.y + pad, w: card.w - 2 * pad, h: card.h - 2 * pad }, s.spec, base(s, { head: 'script', align: wide ? 'left' : 'center', valign: 'middle', firstWord: P.alt }), ALL, u);
  sticker(ctx, Pb.x + Pb.w * 0.14, Pb.y + Pb.h * 0.16, Math.min(Pb.w, Pb.h) * 0.16, badgeOn(s), P.pop, P.popInk, -0.2, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** A chalkboard with a drawn frame: the café's specials board. */
const chalk: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  const board = isDark(P.bg) ? P.bg : mix(P.alt, '#000000', 0.78);
  const chalkInk = '#F4F0E6';
  ctx.fillStyle = board;
  ctx.fillRect(0, 0, W, H);
  // Chalk dust.
  const r = rng(91);
  ctx.fillStyle = alpha(chalkInk, 0.035);
  for (let i = 0; i < 260; i++) ctx.fillRect(r() * W, r() * H, (0.3 + r() * 1.2) * u, (0.3 + r() * 1.2) * u);
  const m = 3 * u;
  ctx.strokeStyle = alpha(chalkInk, 0.75);
  ctx.lineWidth = 0.5 * u;
  ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  ctx.strokeStyle = alpha(P.pop, 0.85);
  ctx.strokeRect(m + 1.6 * u, m + 1.6 * u, W - 2 * m - 3.2 * u, H - 2 * m - 3.2 * u);
  const { T, Pb, d } = twoUp(s, false, 0.5);
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(chalkInk, 0.08), ring: alpha(chalkInk, 0.85), ringW: 0.6 * u }, u);
  const [pop, popInk] = popOn(P, board);
  stack(ctx, T, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: 'script', ink: chalkInk, ground: board, pop, popInk, price: 'plain', cta: 'outline', kicker: 'plain' }, ['kicker', 'headline', 'tagline', 'cta'], u);
  priceSticker(ctx, Pb.x + d * 0.88, Pb.y + d * 0.82, d * 0.2, s.spec, pop, popInk, 0.1, 'circle');
  sticker(ctx, Pb.x + d * 0.12, Pb.y + d * 0.14, d * 0.15, badgeOn(s), chalkInk, board, -0.18, 'burst');
  footer(ctx, s.foot, s.spec, s.A, chalkInk, true, pop, popInk);
};

/** Glowing tubes of light round the dish on a dark ground: the late-night one. */
const neon: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  const dark = mix(isDark(P.bg) ? P.bg : P.alt, '#000000', 0.82);
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, W, H);
  // The tubes are always light, whatever the colours: a dark colour is lifted towards white.
  const lit = (c: string) => (isDark(c) ? mix(c, '#FFFFFF', 0.5) : c);
  const glowA = lit(isDark(P.pop) && !isDark(P.alt) ? P.alt : P.pop);
  const glowB = lit(glowA === lit(P.alt) ? P.pop : P.alt);
  const { T, Pb, d } = twoUp(s, false, 0.5);
  const cx = Pb.x + d / 2;
  const cy = Pb.y + d / 2;
  const tube = (rad: number, color: string, w: number) => {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 4 * u;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.stroke();
    ctx.restore();
  };
  tube(d / 2 + 2.6 * u, glowA, 0.9 * u);
  tube(d / 2 + 5.4 * u, glowB, 0.5 * u);
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(glowB, 0.12) }, u);
  stack(ctx, T, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: 'caps', ink: '#FFFFFF', ground: dark, pop: glowA, popInk: isDark(glowA) ? '#FFFFFF' : '#111111', price: 'pill', cta: 'outline', kicker: 'plain', firstWord: glowA }, ALL, u);
  sticker(ctx, Pb.x + d * 0.88, Pb.y + d * 0.12, d * 0.16, badgeOn(s), glowA, isDark(glowA) ? '#FFFFFF' : '#111111', 0.18, 'burst');
  footer(ctx, s.foot, s.spec, s.A, '#FFFFFF', true, glowA, isDark(glowA) ? '#FFFFFF' : '#111111');
};

/** Bold rings round the dish like a target. */
const target: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const { T, Pb, d } = twoUp(s, true, 0.54, 6 * u);
  const cx = Pb.x + d / 2;
  const cy = Pb.y + d / 2;
  const colours = [P.alt, P.bg, P.pop, P.bg, P.alt];
  for (let i = colours.length - 1; i >= 0; i--) {
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2 + (i + 1) * 2.2 * u, 0, Math.PI * 2);
    ctx.fillStyle = colours[i];
    ctx.fill();
  }
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: mix(P.alt, P.bg, 0.8), ring: P.bg, ringW: 1 * u }, u);
  const [pop, popInk] = popOn(P, P.bg);
  stack(ctx, T, s.spec, base(s, { head: 'caps', align: wide ? 'left' : 'center', valign: 'middle', pop, popInk }), ['kicker', 'headline', 'tagline', 'cta'], u);
  priceSticker(ctx, cx + d * 0.42, cy + d * 0.4, d * 0.2, s.spec, P.ink, P.bg, 0.12, 'burst');
  sticker(ctx, cx - d * 0.42, cy - d * 0.38, d * 0.16, badgeOn(s), P.pop, P.popInk, -0.2, 'circle');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** Zigzag borders top and bottom, the dish between them. */
const zigzag: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, W, H);
  const tooth = 4 * u;
  const edge = (y: number, down: boolean) => {
    ctx.beginPath();
    ctx.moveTo(0, down ? 0 : H);
    for (let x = 0, i = 0; x <= W + tooth; x += tooth, i++) ctx.lineTo(x, y + (i % 2 ? (down ? tooth : -tooth) : 0));
    ctx.lineTo(W, down ? 0 : H);
    ctx.closePath();
    ctx.fillStyle = P.pop;
    ctx.fill();
  };
  edge(s.body.y - 2 * u, true);
  // Below the footer, its teeth clear of the footer's last line.
  edge(Math.min(H - 1 * u, s.foot.y + s.foot.h + tooth + 1.5 * u), false);
  const { T, Pb, d } = twoUp(s, false, 0.5);
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(P.bg, 0.18), ring: P.bg, ringW: 1.5 * u }, u);
  const [pop, popInk] = isDark(P.pop) === isDark(P.alt) ? [P.bg, P.ink] : [P.pop, P.popInk];
  stack(ctx, T, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: 'sans', ink: P.altInk, ground: P.alt, pop, popInk, price: 'pill', cta: 'solid', kicker: 'pill' }, ALL, u);
  sticker(ctx, Pb.x + d * 0.86, Pb.y + d * 0.14, d * 0.16, badgeOn(s), P.bg, P.ink, 0.2, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.altInk, isDark(P.alt), P.bg, P.ink);
};

/** Confetti scattered over a light ground: for an opening, a birthday or a launch. */
const confetti: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const r = rng(53);
  const colours = [P.alt, P.pop, mix(P.alt, P.pop, 0.5), P.ink];
  for (let i = 0; i < 70; i++) {
    ctx.save();
    ctx.translate(r() * W, r() * H);
    ctx.rotate(r() * Math.PI);
    ctx.fillStyle = alpha(colours[i % colours.length], 0.55);
    if (i % 3 === 0) { ctx.beginPath(); ctx.arc(0, 0, (0.6 + r()) * u, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(-1.6 * u, -0.5 * u, 3.2 * u, 1 * u);
    ctx.restore();
  }
  const { T, Pb, d } = twoUp(s, true, 0.52, 3 * u);
  blobPath(ctx, Pb.x + d / 2, Pb.y + d / 2, d * 0.56, 19);
  ctx.fillStyle = alpha(P.alt, 0.9);
  ctx.fill();
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: null, ring: P.bg, ringW: 1.4 * u }, u);
  const [pop, popInk] = popOn(P, P.bg);
  stack(ctx, T, s.spec, base(s, { head: 'script', align: wide ? 'left' : 'center', valign: 'middle', pop, popInk, firstWord: P.alt }), ALL, u);
  sticker(ctx, Pb.x + d * 0.1, Pb.y + d * 0.14, d * 0.17, badgeOn(s), P.pop, P.popInk, -0.22, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** A sun rising behind the dish with its rays. */
const sunrise: Layout = (s) => {
  const { ctx, W, H, u, P, wide, body } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const { T, Pb, d } = twoUp(s, false, 0.52);
  const cx = Pb.x + d / 2;
  const cy = wide ? Pb.y + d / 2 : Pb.y + d * 0.62;
  rays(ctx, cx, cy, Math.max(W, H), 18, alpha(P.alt, 0.12));
  ctx.beginPath();
  ctx.arc(cx, cy, d * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = alpha(P.pop, 0.85);
  ctx.fill();
  if (!wide) {
    // The horizon: the ground under the sun, where the price and the footer sit.
    ctx.fillStyle = P.alt;
    ctx.fillRect(0, body.y + body.h - d * 0.22, W, H);
  }
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: null, ring: P.bg, ringW: 1.4 * u }, u);
  const [pop, popInk] = popOn(P, P.bg);
  stack(ctx, T, s.spec, base(s, { head: 'serif', align: wide ? 'left' : 'center', valign: 'middle', pop, popInk, firstWord: P.alt }), ALL, u);
  sticker(ctx, Pb.x + d * 0.88, Pb.y + d * 0.12, d * 0.16, badgeOn(s), P.alt, P.altInk, 0.2, 'burst');
  if (wide) footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
  else footer(ctx, s.foot, s.spec, s.A, P.altInk, isDark(P.alt), P.bg, P.ink);
};

/** The dish in a tall rounded pill beside the words. */
const capsule: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  dots(ctx, W, H, 5 * u, 0.36 * u, alpha(P.ink, 0.08));
  const pw = wide ? body.w * 0.34 : body.w * 0.46;
  const ph = body.h;
  const Pb: Rect = { x: body.x + body.w - pw, y: body.y, w: pw, h: ph };
  rr(ctx, Pb.x + 2.4 * u, Pb.y + 2.4 * u, pw, ph, pw / 2);
  ctx.fillStyle = P.alt;
  ctx.fill();
  photo(ctx, Pb, s.spec, s.A, { shape: 'rounded', radius: pw / 2, disc: mix(P.alt, P.bg, 0.75) }, u);
  const T: Rect = { x: body.x, y: body.y, w: body.w - pw - 5 * u, h: body.h };
  const [pop, popInk] = popOn(P, P.bg);
  stack(ctx, T, s.spec, base(s, { head: 'caps', valign: 'middle', pop, popInk, firstWord: P.alt }), ALL, u);
  sticker(ctx, Pb.x + pw * 0.72, Pb.y + pw * 0.32, Math.min(pw * 0.24, 9 * u), badgeOn(s), P.pop, P.popInk, 0.2, 'burst');
  footer(ctx, { ...s.foot, w: T.w }, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** Comic-book halftone dots and a hard shadow under the photo. */
const popart: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.pop;
  ctx.fillRect(0, 0, W, H);
  // Halftone: dots that grow towards one corner.
  const step = 3.2 * u;
  ctx.fillStyle = alpha(P.alt, 0.35);
  for (let y = 0; y < H + step; y += step) {
    for (let x = 0; x < W + step; x += step) {
      const k = (x / W + y / H) / 2;
      ctx.beginPath();
      ctx.arc(x + ((y / step) % 2 ? step / 2 : 0), y, step * 0.45 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const { T, Pb, d } = twoUp(s, false, 0.52, 3 * u);
  const off = 2.4 * u;
  ctx.fillStyle = P.popInk;
  ctx.fillRect(Pb.x + off, Pb.y + off, d, d);
  ctx.fillStyle = P.popInk;
  ctx.fillRect(Pb.x - 0.8 * u, Pb.y - 0.8 * u, d + 1.6 * u, d + 1.6 * u);
  photo(ctx, Pb, s.spec, s.A, { shape: 'cover', disc: P.bg }, u);
  stack(ctx, T, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: 'caps', ink: P.popInk, ground: P.pop, pop: P.alt, popInk: P.altInk, price: 'pill', cta: 'solid', kicker: 'pill', headScale: 1.1 }, ['kicker', 'headline', 'tagline', 'cta'], u);
  priceSticker(ctx, Pb.x + 3 * u, Pb.y + d - 3 * u, d * 0.2, s.spec, P.alt, P.altInk, -0.14, 'burst');
  sticker(ctx, Pb.x + d - 3 * u, Pb.y + 3 * u, d * 0.15, badgeOn(s), P.bg, P.ink, 0.2, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.popInk, isDark(P.pop), P.alt, P.altInk);
};

/** Waves rolling in along the bottom: the island one. */
const waves: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const footTop = s.foot.h > 0 ? s.foot.y - 4 * u : H - 10 * u;
  const len = W / 2.2;
  wavePath(ctx, W, H, footTop - 6 * u, 2.2 * u, len, 0.4);
  ctx.fillStyle = alpha(P.alt, 0.35);
  ctx.fill();
  wavePath(ctx, W, H, footTop - 2.5 * u, 2.4 * u, len * 0.9, 2.1);
  ctx.fillStyle = alpha(P.alt, 0.65);
  ctx.fill();
  wavePath(ctx, W, H, footTop + 1 * u, 2 * u, len * 1.1, 3.8);
  ctx.fillStyle = P.alt;
  ctx.fill();
  const body: Rect = { ...s.body, h: Math.min(s.body.h, footTop - 7 * u - s.body.y) };
  const { T, Pb, d } = twoUp({ ...s, body }, true, 0.54);
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: mix(P.alt, P.bg, 0.82), ring: P.alt, ringW: 1.2 * u }, u);
  const [pop, popInk] = popOn(P, P.bg);
  stack(ctx, T, s.spec, base(s, { head: 'script', align: wide ? 'left' : 'center', valign: 'middle', pop, popInk, firstWord: P.alt }), ['kicker', 'headline', 'tagline', 'cta'], u);
  priceSticker(ctx, Pb.x + d * 0.88, Pb.y + d * 0.8, d * 0.2, s.spec, P.pop, P.popInk, 0.12, 'circle');
  sticker(ctx, Pb.x + d * 0.1, Pb.y + d * 0.14, d * 0.16, badgeOn(s), P.alt, P.altInk, -0.2, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.altInk, isDark(P.alt), P.bg, P.ink);
};

/** The dish on a scalloped doily, like a bakery window. */
const scallop: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, W, H);
  dots(ctx, W, H, 6 * u, 0.4 * u, alpha(P.altInk, 0.1));
  const { T, Pb, d } = twoUp(s, true, 0.56, 6 * u);
  const cx = Pb.x + d / 2;
  const cy = Pb.y + d / 2;
  scallopPath(ctx, cx, cy, d * 0.62, 18, 0.07);
  ctx.fillStyle = P.bg;
  ctx.fill();
  ctx.setLineDash([0.8 * u, 1.2 * u]);
  ctx.beginPath();
  ctx.arc(cx, cy, d * 0.55, 0, Math.PI * 2);
  ctx.strokeStyle = alpha(P.alt, 0.6);
  ctx.lineWidth = 0.4 * u;
  ctx.stroke();
  ctx.setLineDash([]);
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: null }, u);
  const [pop, popInk] = isDark(P.pop) === isDark(P.alt) ? [P.bg, P.ink] : [P.pop, P.popInk];
  stack(ctx, T, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: 'serif', ink: P.altInk, ground: P.alt, pop, popInk, price: 'pill', cta: 'solid', kicker: 'plain' }, ALL, u);
  sticker(ctx, cx + d * 0.42, cy - d * 0.4, d * 0.16, badgeOn(s), P.pop, P.popInk, 0.2, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.altInk, isDark(P.alt), P.bg, P.ink);
};

// ── The advanced set (owner, 2026-11-17: "more advanced design for layouts") ──

/** The colour that stands out on `ground` for a word or a line: the second colour, else the highlight, else the ink. */
function accentOn(P: Palette, ground: string): string {
  if (contrast(P.alt, ground) >= 70) return P.alt;
  if (contrast(P.pop, ground) >= 70) return P.pop;
  return lum(ground) < 140 ? '#FFFFFF' : '#111111';
}

/** How bright a colour looks, 0 to 255. */
function lum(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function contrast(a: string, b: string): number {
  return Math.abs(lum(a) - lum(b));
}

/** The pill colour and its words that stand out most on `ground`, never the ground itself. */
function popFor(P: Palette, ground: string): [string, string] {
  const pairs: Array<[string, string]> = [[P.pop, P.popInk], [P.alt, P.altInk], [P.bg, P.ink], [P.ink, P.bg]];
  const fine = pairs.find(([c]) => c.toLowerCase() !== ground.toLowerCase() && contrast(c, ground) >= 70);
  return fine ?? pairs.reduce((best, p) => (contrast(p[0], ground) > contrast(best[0], ground) ? p : best));
}

/** The ink and ground for words on a frosted panel over `under`. */
function frosted(under: string): { fill: string; edge: string; ink: string; ground: string } {
  return isDark(under)
    ? { fill: 'rgba(255,255,255,0.10)', edge: 'rgba(255,255,255,0.28)', ink: '#FFFFFF', ground: '#1A1A1A' }
    : { fill: 'rgba(255,255,255,0.62)', edge: 'rgba(255,255,255,0.9)', ink: '#1C1408', ground: '#FFFFFF' };
}

/** Soft glowing blobs of colour drifting behind a frosted card. */
const aurora: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const blob = (x: number, y: number, r: number, c: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, alpha(c, 0.85));
    g.addColorStop(1, alpha(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  const R = Math.max(W, H);
  blob(W * 0.12, H * 0.1, R * 0.55, P.alt);
  blob(W * 0.95, H * 0.35, R * 0.5, P.pop);
  blob(W * 0.3, H * 0.95, R * 0.55, mix(P.alt, P.pop, 0.5));
  const { T, Pb, d } = twoUp(s, true, s.tall ? 0.5 : 0.46, 2 * u);
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: 'rgba(255,255,255,0.18)', ring: 'rgba(255,255,255,0.75)', ringW: 0.8 * u }, u);
  const f = frosted(mix(P.bg, P.alt, 0.35));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.16)';
  ctx.shadowBlur = 6 * u;
  rr(ctx, T.x, T.y, T.w, T.h, 5 * u);
  ctx.fillStyle = f.fill;
  ctx.fill();
  ctx.restore();
  rr(ctx, T.x, T.y, T.w, T.h, 5 * u);
  ctx.strokeStyle = f.edge;
  ctx.lineWidth = 0.4 * u;
  ctx.stroke();
  const pad = 4 * u;
  const [pop, popInk] = popOn(P, f.ground);
  stack(ctx, { x: T.x + pad, y: T.y + pad, w: T.w - 2 * pad, h: T.h - 2 * pad }, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: 'sans', ink: f.ink, ground: f.ground, pop, popInk, price: 'pill', cta: 'solid', kicker: 'pill', firstWord: isDark(f.ground) ? P.pop : P.alt }, ALL, u);
  sticker(ctx, Pb.x + d * 0.88, Pb.y + d * 0.14, d * 0.16, badgeOn(s), P.pop, P.popInk, 0.18, 'circle');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), pop, popInk);
};

/** The photo fills the picture and the words sit on a pane of frosted glass. */
const glass: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  const full = s.A.photo !== null && !s.spec.cutout;
  if (full && s.A.photo) {
    cover(ctx, s.A.photo, { x: 0, y: 0, w: W, h: H });
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, mix(P.alt, '#FFFFFF', 0.15));
    g.addColorStop(1, mix(P.alt, '#000000', 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    rays(ctx, W / 2, H * 0.3, Math.max(W, H), 18, 'rgba(255,255,255,0.05)');
  }
  const pane: Rect = wide
    ? { x: body.x, y: body.y, w: body.w * 0.5, h: body.h }
    : { x: body.x, y: body.y + body.h * 0.52, w: body.w, h: body.h * 0.48 };
  if (!full) {
    const Pb: Rect = wide ? { x: body.x + body.w * 0.54, y: body.y, w: body.w * 0.46, h: body.h } : { x: body.x, y: body.y, w: body.w, h: body.h * 0.49 };
    photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: null }, u);
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 8 * u;
  rr(ctx, pane.x, pane.y, pane.w, pane.h, 5 * u);
  ctx.fillStyle = 'rgba(14,10,6,0.55)';
  ctx.fill();
  ctx.restore();
  const sheen = ctx.createLinearGradient(pane.x, pane.y, pane.x, pane.y + pane.h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(0.4, 'rgba(255,255,255,0.03)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  rr(ctx, pane.x, pane.y, pane.w, pane.h, 5 * u);
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.4 * u;
  ctx.stroke();
  const pad = 4 * u;
  const pop = isDark(P.pop) ? mix(P.alt, '#FFFFFF', 0.2) : P.pop;
  const popInk = isDark(pop) ? '#FFFFFF' : '#111111';
  stack(ctx, { x: pane.x + pad, y: pane.y + pad, w: pane.w - 2 * pad, h: pane.h - 2 * pad }, s.spec, { align: 'left', valign: 'middle', head: 'sans', ink: '#FFFFFF', ground: '#141414', pop, popInk, price: 'pill', cta: 'solid', kicker: 'pill', firstWord: pop }, ALL, u);
  const r = 9 * u;
  sticker(ctx, W - body.x - r, body.y + r, r, badgeOn(s), pop, popInk, 0.14, 'burst');
  footer(ctx, s.foot, s.spec, s.A, '#FFFFFF', true, pop, popInk);
};

/** The name repeated in huge outlined letters behind the dish. */
const echo: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const word = (s.spec.headline.trim().split(/\s+/)[0] || s.spec.brand || 'Bake').toUpperCase();
  const size = (wide ? 30 : 24) * u;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.12);
  ctx.font = font('caps', size);
  ctx.textAlign = 'center';
  ctx.lineWidth = 0.35 * u;
  const rows = Math.ceil((Math.hypot(W, H) / size) * 1.05);
  for (let i = -rows; i <= rows; i++) {
    const line = `${word} ${word} ${word} ${word}`;
    ctx.strokeStyle = alpha(i % 2 === 0 ? accentOn(P, P.bg) : P.ink, i === 0 ? 0.5 : 0.16);
    ctx.strokeText(line, (i % 2) * size * 0.8, i * size * 0.95);
  }
  ctx.restore();
  const { T, Pb, d } = twoUp(s, true, s.tall ? 0.52 : 0.5, 1 * u);
  ctx.beginPath();
  ctx.arc(Pb.x + d / 2, Pb.y + d / 2, d * 0.52, 0, Math.PI * 2);
  ctx.fillStyle = P.alt;
  ctx.fill();
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: null, ring: P.bg, ringW: 1.2 * u }, u);
  const [pop, popInk] = popOn(P, P.bg);
  stack(ctx, T, s.spec, base(s, { head: 'caps', align: wide ? 'left' : 'center', valign: 'middle', pop, popInk, firstWord: accentOn(P, P.bg) }), ALL, u);
  sticker(ctx, Pb.x + d * 0.1, Pb.y + d * 0.14, d * 0.16, badgeOn(s), P.pop, P.popInk, -0.2, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** A clean modern grid: thin lines, a big number and a square photo. */
const swiss: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = alpha(P.ink, 0.08);
  ctx.lineWidth = 0.2 * u;
  for (let x = body.x; x <= body.x + body.w + 1; x += body.w / 6) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = body.y; y <= H; y += body.w / 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const Pb: Rect = wide
    ? { x: body.x + body.w * 0.5, y: body.y, w: body.w * 0.5, h: body.h }
    : { x: body.x, y: body.y, w: body.w, h: body.h * 0.52 };
  ctx.fillStyle = P.alt;
  ctx.fillRect(Pb.x + 2 * u, Pb.y + 2 * u, Pb.w, Pb.h);
  photo(ctx, Pb, s.spec, s.A, { shape: 'cover', disc: mix(P.alt, P.bg, 0.7) }, u);
  ctx.save();
  ctx.font = font('caps', (wide ? 16 : 13) * u);
  ctx.fillStyle = alpha(accentOn(P, P.bg), 0.9);
  ctx.textAlign = 'right';
  ctx.fillText('01', Pb.x + Pb.w - 2 * u, Pb.y + Pb.h + (wide ? -2 : 13) * u);
  ctx.restore();
  const T: Rect = wide
    ? { x: body.x, y: body.y, w: body.w * 0.46, h: body.h }
    : { x: body.x, y: Pb.y + Pb.h + 5 * u, w: body.w * 0.82, h: body.y + body.h - (Pb.y + Pb.h + 5 * u) };
  ctx.fillStyle = P.ink;
  ctx.fillRect(T.x, T.y, 12 * u, 1.1 * u);
  stack(ctx, { x: T.x, y: T.y + 3 * u, w: T.w, h: T.h - 3 * u }, s.spec, base(s, { head: 'sans', valign: wide ? 'middle' : 'top', kicker: 'plain', firstWord: accentOn(P, P.bg) }), ALL, u);
  sticker(ctx, Pb.x + 9 * u, Pb.y + 9 * u, 8 * u, badgeOn(s), P.pop, P.popInk, -0.12, 'circle');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** A pile of photo prints, the dish on the top one. */
const polaroid: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, W, H);
  dots(ctx, W, H, 5 * u, 0.35 * u, alpha(P.altInk, 0.12));
  // The print keeps room under it for the words: at most 56% of the height on a feed or square post.
  const cw = wide ? Math.min(body.w * 0.4, (body.h * 0.92) / 1.16) : Math.min(body.w * 0.74, (body.h * (s.tall ? 0.6 : 0.56)) / 1.16);
  const ch = cw * 1.16;
  const cx = wide ? body.x + body.w - cw / 2 - 4 * u : W / 2;
  const cy = wide ? H / 2 : body.y + ch / 2 + 2 * u;
  const print = (angle: number, dx: number, fill: string) => {
    ctx.save();
    ctx.translate(cx + dx, cy);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 5 * u;
    ctx.shadowOffsetY = 1.5 * u;
    ctx.fillStyle = fill;
    ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    ctx.restore();
  };
  print(0.14, 3 * u, mix(P.pop, '#FFFFFF', 0.3));
  print(-0.1, -3 * u, mix(P.bg, '#FFFFFF', 0.4));
  print(0.02, 0, '#FFFDF8');
  const pad = cw * 0.07;
  const pw = cw - 2 * pad;
  const Pb: Rect = { x: cx - pw / 2, y: cy - ch / 2 + pad, w: pw, h: pw };
  photo(ctx, Pb, s.spec, s.A, { shape: 'cover', disc: mix(P.alt, '#FFFFFF', 0.75) }, u);
  // The name handwritten on the print's white strip.
  const strip = ch - pw - pad * 2;
  const name = s.spec.headline.trim();
  if (name) {
    const fit = fitLines(ctx, name, 'script', pw, 1, strip * 0.62, strip * 0.25);
    ctx.font = font('script', fit.size);
    ctx.fillStyle = '#2B2117';
    ctx.textAlign = 'center';
    ctx.fillText(fit.lines[0] ?? '', cx, Pb.y + pw + pad * 0.5 + strip * 0.62);
  }
  const T: Rect = wide
    ? { x: body.x, y: body.y, w: body.w - cw - 12 * u, h: body.h }
    : { x: body.x, y: cy + ch / 2 + 6 * u, w: body.w, h: body.y + body.h - (cy + ch / 2 + 6 * u) };
  const [pop, popInk] = popOn(P, P.alt);
  stack(ctx, T, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: 'serif', ink: P.altInk, ground: P.alt, pop, popInk, price: 'pill', cta: 'solid', kicker: 'plain' }, wide ? ALL : ['kicker', 'tagline', 'price', 'cta'], u);
  sticker(ctx, cx + cw * 0.44, cy - ch * 0.44, 8.5 * u, badgeOn(s), P.pop, P.popInk, 0.2, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.altInk, isDark(P.alt), pop, popInk);
};

/** The dish as a planet with rings and little moons going round it. */
const orbit: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  const ground = mix(isDark(P.bg) ? P.bg : P.alt, '#000000', 0.7);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, W, H);
  const r0 = rng(17);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + r0() * 0.5})`;
    ctx.beginPath();
    ctx.arc(r0() * W, r0() * H, (0.1 + r0() * 0.3) * u, 0, Math.PI * 2);
    ctx.fill();
  }
  const { T, Pb, d } = twoUp(s, true, s.tall ? 0.56 : 0.52, 6.5 * u);
  const cx = Pb.x + d / 2;
  const cy = Pb.y + d / 2;
  const lit = (c: string) => (isDark(c) ? mix(c, '#FFFFFF', 0.5) : c);
  const moonA = lit(P.pop);
  const moonB = lit(P.alt);
  const ring = (rad: number, a0: number, c: string, moonR: number) => {
    ctx.save();
    ctx.setLineDash([0.6 * u, 1.4 * u]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.25 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const spin = ANIM ? ANIM.t * 0.5 : 0;
    ctx.save();
    ctx.shadowColor = c;
    ctx.shadowBlur = 3 * u;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a0 + spin) * rad, cy + Math.sin(a0 + spin) * rad, moonR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const glowG = ctx.createRadialGradient(cx, cy, d * 0.3, cx, cy, d * 0.85);
  glowG.addColorStop(0, alpha(moonB, 0.35));
  glowG.addColorStop(1, alpha(moonB, 0));
  ctx.fillStyle = glowG;
  ctx.fillRect(0, 0, W, H);
  ring(d / 2 + 3 * u, -0.6, moonA, 1.2 * u);
  ring(d / 2 + 6 * u, 2.3, moonB, 0.85 * u);
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(moonB, 0.2) }, u);
  stack(ctx, T, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: 'caps', ink: '#FFFFFF', ground, pop: moonA, popInk: isDark(moonA) ? '#FFFFFF' : '#111111', price: 'pill', cta: 'solid', kicker: 'plain', firstWord: moonA }, ALL, u);
  sticker(ctx, cx + d * 0.42, cy - d * 0.42, d * 0.15, badgeOn(s), moonA, isDark(moonA) ? '#FFFFFF' : '#111111', 0.18, 'burst');
  footer(ctx, s.foot, s.spec, s.A, '#FFFFFF', true, moonA, isDark(moonA) ? '#FFFFFF' : '#111111');
};

/** Strings of party flags across the top, for an occasion. */
const bunting: Layout = (s) => {
  const { ctx, W, H, u, P, body, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const flags = (y0: number, sag: number, n: number, seed: number) => {
    const at = (x: number) => y0 + Math.sin((x / W) * Math.PI) * sag;
    ctx.strokeStyle = alpha(P.ink, 0.5);
    ctx.lineWidth = 0.25 * u;
    ctx.beginPath();
    for (let x = 0; x <= W; x += W / 40) { if (x === 0) ctx.moveTo(x, at(x)); else ctx.lineTo(x, at(x)); }
    ctx.stroke();
    const colours = [P.alt, P.pop, mix(P.alt, P.bg, 0.45), P.ink];
    const fw = W / n;
    for (let i = 0; i < n; i++) {
      const x1 = i * fw + fw * 0.12;
      const x2 = (i + 1) * fw - fw * 0.12;
      const tipX = (x1 + x2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, at(x1));
      ctx.lineTo(x2, at(x2));
      ctx.lineTo(tipX, at(tipX) + fw * 0.9);
      ctx.closePath();
      ctx.fillStyle = colours[(i + seed) % colours.length];
      ctx.fill();
    }
  };
  flags(-1 * u, (wide ? 6 : 9) * u, wide ? 12 : 9, 0);
  flags(5 * u, (wide ? 9 : 13) * u, wide ? 10 : 7, 2);
  const top = (wide ? 24 : 22) * u;
  const inner: Stage = { ...s, body: { x: body.x, y: Math.max(body.y, top), w: body.w, h: body.y + body.h - Math.max(body.y, top) } };
  const { T, Pb, d } = twoUp(inner, true, s.tall ? 0.5 : 0.46, 2 * u);
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: mix(P.alt, P.bg, 0.8), ring: P.alt, ringW: 1.4 * u }, u);
  const [pop, popInk] = popOn(P, P.bg);
  stack(ctx, T, s.spec, base(s, { head: 'script', align: wide ? 'left' : 'center', valign: 'middle', firstWord: accentOn(P, P.bg), pop, popInk }), ALL, u);
  sticker(ctx, Pb.x + d * 0.88, Pb.y + d * 0.84, d * 0.16, badgeOn(s), P.pop, P.popInk, 0.18, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** Print-style halftone dots fading in from the corners, a bold circle behind the dish. */
const halftone: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const step = 3.2 * u;
  const R = Math.hypot(W, H) * 0.55;
  ctx.fillStyle = alpha(accentOn(P, P.bg), 0.85);
  for (let y = 0; y < H + step; y += step) {
    for (let x = (Math.round(y / step) % 2) * step / 2; x < W + step; x += step) {
      const k = Math.max(1 - Math.hypot(x, y) / R, 1 - Math.hypot(W - x, H - y) / R, 0);
      if (k <= 0.02) continue;
      ctx.beginPath();
      ctx.arc(x, y, step * 0.5 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const { T, Pb, d } = twoUp(s, true, s.tall ? 0.52 : 0.48, 3 * u);
  ctx.beginPath();
  ctx.arc(Pb.x + d / 2 + 2 * u, Pb.y + d / 2 + 2 * u, d / 2 + 2 * u, 0, Math.PI * 2);
  ctx.fillStyle = P.ink;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(Pb.x + d / 2, Pb.y + d / 2, d / 2 + 2 * u, 0, Math.PI * 2);
  ctx.fillStyle = P.pop;
  ctx.fill();
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: null, ring: P.ink, ringW: 0.8 * u }, u);
  const card: Rect = { x: T.x, y: T.y + 1 * u, w: T.w, h: T.h - 2 * u };
  ctx.fillStyle = P.ink;
  ctx.fillRect(card.x + 1.4 * u, card.y + 1.4 * u, card.w, card.h);
  ctx.fillStyle = P.bg;
  ctx.fillRect(card.x, card.y, card.w, card.h);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 0.6 * u;
  ctx.strokeRect(card.x, card.y, card.w, card.h);
  const pad = 3 * u;
  const [pop, popInk] = popOn(P, P.bg);
  stack(ctx, { x: card.x + pad, y: card.y + pad, w: card.w - 2 * pad, h: card.h - 2 * pad }, s.spec, base(s, { head: 'caps', align: wide ? 'left' : 'center', valign: 'middle', pop, popInk, firstWord: accentOn(P, P.bg) }), ALL, u);
  sticker(ctx, Pb.x + d * 0.1, Pb.y + d * 0.12, d * 0.16, badgeOn(s), P.alt, P.altInk, -0.2, 'burst');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** Two spotlights from above meet on the dish, as on a stage. */
const stage: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  const ground = mix(isDark(P.bg) ? P.bg : P.alt, '#000000', 0.84);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, W, H);
  const { T, Pb, d } = twoUp(s, !wide, s.tall ? 0.5 : 0.46, 3 * u);
  const cx = Pb.x + d / 2;
  const cy = Pb.y + d / 2;
  const light = isDark(P.pop) ? mix(P.alt, '#FFFFFF', 0.6) : P.pop;
  const cone = (fromX: number) => {
    const g = ctx.createLinearGradient(fromX, 0, cx, cy + d / 2);
    g.addColorStop(0, alpha(light, 0.5));
    g.addColorStop(1, alpha(light, 0.04));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(fromX - 2 * u, 0);
    ctx.lineTo(fromX + 2 * u, 0);
    ctx.lineTo(cx + d * 0.62, cy + d / 2);
    ctx.lineTo(cx - d * 0.62, cy + d / 2);
    ctx.closePath();
    ctx.fill();
  };
  cone(W * 0.18);
  cone(W * 0.82);
  // The pool of light the dish stands in.
  ctx.save();
  ctx.translate(cx, cy + d * 0.48);
  ctx.scale(1, 0.22);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, d * 0.7);
  pool.addColorStop(0, alpha(light, 0.55));
  pool.addColorStop(1, alpha(light, 0));
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(0, 0, d * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(light, 0.12) }, u);
  stack(ctx, T, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: 'caps', ink: '#FFFFFF', ground, pop: light, popInk: isDark(light) ? '#FFFFFF' : '#111111', price: 'pill', cta: 'outline', kicker: 'plain', firstWord: light }, ALL, u);
  sticker(ctx, cx + d * 0.42, cy - d * 0.36, d * 0.15, badgeOn(s), light, isDark(light) ? '#FFFFFF' : '#111111', 0.16, 'circle');
  footer(ctx, s.foot, s.spec, s.A, '#FFFFFF', true, light, isDark(light) ? '#FFFFFF' : '#111111');
};

/** An elegant menu card: a double border, small ornaments and a serif name. */
const bistro: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const m = 3.2 * u;
  ctx.strokeStyle = P.alt;
  ctx.lineWidth = 0.6 * u;
  ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  ctx.lineWidth = 0.2 * u;
  ctx.strokeRect(m + 1.4 * u, m + 1.4 * u, W - 2 * m - 2.8 * u, H - 2 * m - 2.8 * u);
  // A small diamond at each corner.
  ctx.fillStyle = P.alt;
  for (const [x, y] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-1.2 * u, -1.2 * u, 2.4 * u, 2.4 * u);
    ctx.restore();
  }
  const { T, Pb, d } = twoUp(s, true, s.tall ? 0.48 : 0.44, 3 * u);
  ctx.beginPath();
  ctx.arc(Pb.x + d / 2, Pb.y + d / 2, d / 2 + 1.6 * u, 0, Math.PI * 2);
  ctx.strokeStyle = alpha(P.alt, 0.7);
  ctx.lineWidth = 0.25 * u;
  ctx.stroke();
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: mix(P.alt, P.bg, 0.86), ring: P.alt, ringW: 0.5 * u }, u);
  // An ornament line between the dish and the words.
  const oy = T.y + 1 * u;
  const ox = wide ? T.x + 14 * u : W / 2;
  ctx.strokeStyle = P.alt;
  ctx.lineWidth = 0.25 * u;
  ctx.beginPath();
  ctx.moveTo(ox - 12 * u, oy);
  ctx.lineTo(ox - 2 * u, oy);
  ctx.moveTo(ox + 2 * u, oy);
  ctx.lineTo(ox + 12 * u, oy);
  ctx.stroke();
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-0.9 * u, -0.9 * u, 1.8 * u, 1.8 * u);
  ctx.restore();
  stack(ctx, { x: T.x, y: T.y + 3 * u, w: T.w, h: T.h - 3 * u }, s.spec, base(s, { head: 'serif', align: wide ? 'left' : 'center', valign: 'middle', kicker: 'plain', price: 'plain', cta: 'outline' }), ALL, u);
  sticker(ctx, Pb.x + d * 0.88, Pb.y + d * 0.12, d * 0.14, badgeOn(s), P.alt, P.altInk, 0.16, 'circle');
  footer(ctx, s.foot, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

/** Steam curling up from a hot dish on a warm dark ground. */
const steam: Layout = (s) => {
  const { ctx, W, H, u, P, wide } = s;
  const ground = mix(isDark(P.bg) ? P.bg : P.alt, '#000000', 0.72);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mix(ground, '#000000', 0.3));
  g.addColorStop(1, ground);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const { T, Pb, d } = twoUp(s, false, s.tall ? 0.5 : 0.46, 2 * u);
  const cx = Pb.x + d / 2;
  const warm = isDark(P.pop) ? mix(P.alt, '#FFFFFF', 0.4) : P.pop;
  const glowG = ctx.createRadialGradient(cx, Pb.y + d * 0.6, 0, cx, Pb.y + d * 0.6, d * 0.9);
  glowG.addColorStop(0, alpha(warm, 0.35));
  glowG.addColorStop(1, alpha(warm, 0));
  ctx.fillStyle = glowG;
  ctx.fillRect(0, 0, W, H);
  // Wisps rise from the top of the dish; in a video they drift.
  const drift = ANIM ? ANIM.t * 0.9 : 0;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const x0 = cx + (i - 1) * d * 0.18;
    // Up to the words above the dish, never into them.
    const yTop = wide ? Pb.y - d * 0.05 : Math.max(T.y + T.h + 1 * u, Pb.y - d * 0.3);
    ctx.strokeStyle = `rgba(255,255,255,${0.22 - i * 0.04})`;
    ctx.lineWidth = (1.2 - i * 0.25) * u;
    ctx.beginPath();
    for (let k = 0; k <= 30; k++) {
      const t = k / 30;
      const y = Pb.y + d * 0.2 - t * (Pb.y + d * 0.2 - yTop);
      const x = x0 + Math.sin(t * 6 + i * 2 + drift) * d * 0.05 * (0.4 + t);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: alpha(warm, 0.12) }, u);
  stack(ctx, T, s.spec, { align: wide ? 'left' : 'center', valign: wide ? 'middle' : 'top', head: 'script', ink: '#FFF8EC', ground, pop: warm, popInk: isDark(warm) ? '#FFFFFF' : '#1C1408', price: 'pill', cta: 'solid', kicker: 'plain', firstWord: warm }, ALL, u);
  sticker(ctx, cx + d * 0.42, Pb.y + d * 0.82, d * 0.16, badgeOn(s), warm, isDark(warm) ? '#FFFFFF' : '#1C1408', 0.16, 'burst');
  footer(ctx, s.foot, s.spec, s.A, '#FFF8EC', true, warm, isDark(warm) ? '#FFFFFF' : '#1C1408');
};

/** A theatre sign: light bulbs round a panel that holds the dish and the name. */
const marquee: Layout = (s) => {
  const { ctx, W, H, u, P } = s;
  ctx.fillStyle = P.alt;
  ctx.fillRect(0, 0, W, H);
  stripes(ctx, W, H, 6 * u, 3 * u, alpha(P.altInk, 0.06));
  const m = 3.5 * u;
  const panel: Rect = { x: m, y: m, w: W - 2 * m, h: H - 2 * m };
  rr(ctx, panel.x, panel.y, panel.w, panel.h, 4 * u);
  ctx.fillStyle = P.bg;
  ctx.fill();
  const bulb = isDark(P.pop) ? '#FFE9A8' : P.pop;
  const gap = 5 * u;
  const blink = ANIM ? Math.floor(ANIM.t * 3) % 2 : 0;
  const lamp = (x: number, y: number, i: number) => {
    ctx.save();
    const on = (i + blink) % 2 === 0;
    ctx.shadowColor = bulb;
    ctx.shadowBlur = on ? 2.5 * u : 0;
    ctx.fillStyle = on ? bulb : mix(bulb, P.alt, 0.5);
    ctx.beginPath();
    ctx.arc(x, y, 0.85 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  let i = 0;
  const inset = m + 2.2 * u;
  for (let x = inset; x <= W - inset + 0.1; x += (W - 2 * inset) / Math.max(1, Math.round((W - 2 * inset) / gap))) { lamp(x, inset, i++); lamp(x, H - inset, i++); }
  for (let y = inset + gap; y <= H - inset - gap + 0.1; y += (H - 2 * inset) / Math.max(1, Math.round((H - 2 * inset) / gap))) { lamp(inset, y, i++); lamp(W - inset, y, i++); }
  const inner: Stage = { ...s, body: { x: s.body.x + 2 * u, y: s.body.y + 2 * u, w: s.body.w - 4 * u, h: s.body.h - 4 * u } };
  const { T, Pb, d } = twoUp(inner, true, s.tall ? 0.5 : 0.46, 2 * u);
  photo(ctx, Pb, s.spec, s.A, { shape: 'circle', disc: mix(P.alt, P.bg, 0.8), ring: P.alt, ringW: 1.2 * u }, u);
  const [pop, popInk] = popOn(P, P.bg);
  stack(ctx, T, s.spec, base(s, { head: 'caps', align: s.wide ? 'left' : 'center', valign: 'middle', pop, popInk, firstWord: accentOn(P, P.bg) }), ALL, u);
  sticker(ctx, Pb.x + d * 0.88, Pb.y + d * 0.14, d * 0.16, badgeOn(s), P.alt, P.altInk, 0.18, 'burst');
  footer(ctx, { ...s.foot, x: s.foot.x + 2 * u, y: s.foot.y - 2 * u, w: s.foot.w - 4 * u }, s.spec, s.A, P.ink, isDark(P.bg), P.alt, P.altInk);
};

// ── Designs built from parts (owner, 2026-11-17: "Make it 100 each") ─────────
// A recipe names a ground, a pattern over it, a frame round the photo, a font
// and how the words sit. Every one still lays out by the picture's shape
// through `twoUp()`, so each works in every size and colour.

type Ground = 'bg' | 'alt' | 'dark' | 'light';
type Pattern = 'plain' | 'dots' | 'stripes' | 'grid' | 'rays' | 'gingham' | 'split' | 'blobs' | 'waves' | 'confetti'
  | 'halftone' | 'brush' | 'arcs' | 'triangles' | 'hex' | 'circles' | 'grain' | 'glow' | 'frame' | 'corner';
type Frame = 'ring' | 'double' | 'square' | 'arch' | 'blob' | 'scallop' | 'hex' | 'tilt' | 'shadow' | 'seal' | 'plate' | 'bare';

interface Recipe {
  ground: Ground;
  pattern: Pattern;
  frame: Frame;
  head: FontKind;
  /** Words on a panel of their own, on a band across the picture, or straight on the ground. */
  box?: 'plain' | 'card' | 'band';
  /** The photo above the words (else below), on a feed, square or story post. */
  photoFirst?: boolean;
}

function groundOf(P: Palette, g: Ground): { fill: string; ink: string } {
  if (g === 'alt') return { fill: P.alt, ink: P.altInk };
  if (g === 'dark') return { fill: mix(isDark(P.bg) ? P.bg : P.alt, '#000000', 0.8), ink: '#FFFFFF' };
  if (g === 'light') return { fill: mix(isDark(P.bg) ? P.alt : P.bg, '#FFFFFF', 0.82), ink: '#1C1408' };
  return { fill: P.bg, ink: P.ink };
}

function hexPath(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

function drawPattern(s: Stage, kind: Pattern, fill: string, c: string): void {
  const { ctx, W, H, u, P } = s;
  const r = rng(kind.length * 31 + 7);
  switch (kind) {
    case 'dots': dots(ctx, W, H, 5.5 * u, 0.55 * u, alpha(c, 0.22)); break;
    case 'stripes': stripes(ctx, W, H, 9 * u, 2.4 * u, alpha(c, 0.1)); break;
    case 'grid':
      ctx.strokeStyle = alpha(c, 0.12);
      ctx.lineWidth = 0.2 * u;
      for (let x = 0; x <= W; x += 8 * u) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 8 * u) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      break;
    case 'rays': rays(ctx, W / 2, H * 0.4, Math.max(W, H), 22, alpha(c, 0.1)); break;
    case 'gingham': {
      const b = 7 * u;
      ctx.fillStyle = alpha(c, 0.12);
      for (let x = 0; x < W; x += b * 2) ctx.fillRect(x, 0, b, H);
      for (let y = 0; y < H; y += b * 2) ctx.fillRect(0, y, W, b);
      break;
    }
    case 'split':
      ctx.fillStyle = mix(fill, c, 0.16);
      if (s.wide) ctx.fillRect(W * 0.55, 0, W * 0.45, H); else ctx.fillRect(0, 0, W, H * 0.5);
      break;
    case 'blobs':
      ctx.fillStyle = alpha(c, 0.18);
      blobPath(ctx, W * 0.05, H * 0.08, Math.max(W, H) * 0.24, 3); ctx.fill();
      blobPath(ctx, W * 0.98, H * 0.9, Math.max(W, H) * 0.3, 9); ctx.fill();
      break;
    case 'waves':
      ctx.fillStyle = alpha(c, 0.14);
      wavePath(ctx, W, H, H * 0.78, 2.5 * u, W / 2.2, 0); ctx.fill();
      ctx.fillStyle = alpha(c, 0.12);
      wavePath(ctx, W, H, H * 0.86, 2 * u, W / 3, 1.4); ctx.fill();
      break;
    case 'confetti': {
      const colours = [P.alt, P.pop, c];
      for (let i = 0; i < 70; i++) {
        ctx.save();
        ctx.translate(r() * W, r() * H);
        ctx.rotate(r() * Math.PI);
        ctx.fillStyle = alpha(colours[i % 3], 0.45);
        ctx.fillRect(-0.9 * u, -0.35 * u, 1.8 * u, 0.7 * u);
        ctx.restore();
      }
      break;
    }
    case 'halftone': {
      const step = 3.2 * u;
      const R = Math.hypot(W, H) * 0.5;
      ctx.fillStyle = alpha(c, 0.55);
      for (let y = 0; y < H + step; y += step) {
        for (let x = (Math.round(y / step) % 2) * step / 2; x < W + step; x += step) {
          const k = Math.max(1 - Math.hypot(x, y) / R, 1 - Math.hypot(W - x, H - y) / R, 0);
          if (k <= 0.02) continue;
          ctx.beginPath();
          ctx.arc(x, y, step * 0.5 * k, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'brush':
      brush(ctx, W * 0.92, H * 0.04, W * 0.6, (s.wide ? 0.3 : 0.12) * H, -0.4, alpha(c, 0.5), 5);
      brush(ctx, W * 0.96, H * 0.97, W * 0.5, (s.wide ? 0.24 : 0.1) * H, -0.4, alpha(c, 0.4), 13);
      break;
    case 'arcs':
      ctx.strokeStyle = alpha(c, 0.16);
      ctx.lineWidth = 0.6 * u;
      for (let i = 1; i <= 7; i++) { ctx.beginPath(); ctx.arc(0, H, i * 9 * u, -Math.PI / 2, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(W, 0, i * 9 * u, Math.PI / 2, Math.PI); ctx.stroke(); }
      break;
    case 'triangles':
      for (let i = 0; i < 26; i++) {
        const x = r() * W;
        const y = r() * H;
        const k = (1.5 + r() * 2.5) * u;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r() * Math.PI);
        ctx.fillStyle = alpha(i % 2 ? c : P.pop, 0.16);
        ctx.beginPath(); ctx.moveTo(0, -k); ctx.lineTo(k, k); ctx.lineTo(-k, k); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    case 'hex': {
      const k = 6 * u;
      ctx.strokeStyle = alpha(c, 0.13);
      ctx.lineWidth = 0.3 * u;
      for (let row = 0, y = 0; y < H + k; row++, y += k * 1.5) {
        for (let x = (row % 2) * k * 0.866; x < W + k; x += k * 1.732) { hexPath(ctx, x, y, k); ctx.stroke(); }
      }
      break;
    }
    case 'circles':
      ctx.fillStyle = alpha(c, 0.12);
      for (const [x, y, rr2] of [[0.1, 0.12, 0.28], [0.95, 0.3, 0.2], [0.2, 0.92, 0.22], [0.85, 0.85, 0.3]]) {
        ctx.beginPath(); ctx.arc(W * x, H * y, Math.max(W, H) * rr2, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'grain': {
      ctx.fillStyle = alpha(c, 0.05);
      for (let i = 0; i < 300; i++) ctx.fillRect(r() * W, r() * H, (0.3 + r()) * u, (0.3 + r()) * u);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'glow': {
      const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.7);
      g.addColorStop(0, alpha(c, 0.35));
      g.addColorStop(1, alpha(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'frame': {
      const m = 3 * u;
      ctx.strokeStyle = alpha(c, 0.8);
      ctx.lineWidth = 0.5 * u;
      ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
      ctx.lineWidth = 0.2 * u;
      ctx.strokeRect(m + 1.3 * u, m + 1.3 * u, W - 2 * m - 2.6 * u, H - 2 * m - 2.6 * u);
      break;
    }
    case 'corner':
      ctx.fillStyle = alpha(c, 0.22);
      ctx.beginPath(); ctx.arc(0, 0, Math.min(W, H) * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W, H, Math.min(W, H) * 0.5, 0, Math.PI * 2); ctx.fill();
      break;
    default: break;
  }
}

/** What a frame draws outside the photo's circle, so `twoUp` keeps room for it. */
const FRAME_ROOM: Record<Frame, number> = { ring: 1, double: 2.5, square: 1, arch: 3, blob: 3.5, scallop: 3.5, hex: 3.5, tilt: 3.5, shadow: 2, seal: 4, plate: 2.5, bare: 0 };

function drawFrame(s: Stage, kind: Frame, Pb: Rect, d: number, fill: string, c: string): void {
  const { ctx, u, P, spec, A } = s;
  const cx = Pb.x + d / 2;
  const cy = Pb.y + d / 2;
  const back = (path: () => void, colour: string) => { path(); ctx.fillStyle = colour; ctx.fill(); };
  const discSoft = alpha(c, 0.14);
  // The highlight, unless it is the ground itself (a yellow seal on yellow vanishes).
  const popFill = P.pop.toLowerCase() === fill.toLowerCase() ? c : P.pop;
  switch (kind) {
    case 'ring': photo(ctx, Pb, spec, A, { shape: 'circle', disc: discSoft, ring: c, ringW: 1.1 * u }, u); return;
    case 'double':
      ctx.beginPath(); ctx.arc(cx, cy, d / 2 + 2.2 * u, 0, Math.PI * 2); ctx.strokeStyle = popFill; ctx.lineWidth = 0.5 * u; ctx.stroke();
      photo(ctx, Pb, spec, A, { shape: 'circle', disc: discSoft, ring: c, ringW: 0.8 * u }, u); return;
    case 'square': photo(ctx, Pb, spec, A, { shape: 'rounded', radius: 4 * u, disc: mix(fill, c, 0.18) }, u); return;
    case 'arch': {
      const w = d * 1.08;
      const h = d * 1.16;
      const x = cx - w / 2;
      const y = cy - h * 0.56;
      back(() => { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(cx, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); }, alpha(c, 0.24));
      photo(ctx, Pb, spec, A, { shape: 'circle', disc: null }, u); return;
    }
    case 'blob': back(() => blobPath(ctx, cx, cy, d * 0.6, 21), alpha(c, 0.85)); photo(ctx, Pb, spec, A, { shape: 'circle', disc: null }, u); return;
    case 'scallop': back(() => scallopPath(ctx, cx, cy, d * 0.62, 16, 0.08), popFill); photo(ctx, Pb, spec, A, { shape: 'circle', disc: fill, ring: fill, ringW: 0.8 * u }, u); return;
    case 'hex': back(() => hexPath(ctx, cx, cy, d * 0.62), alpha(c, 0.9)); photo(ctx, Pb, spec, A, { shape: 'circle', disc: null }, u); return;
    case 'tilt': {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.12);
      rr(ctx, -d * 0.56, -d * 0.56, d * 1.12, d * 1.12, 4 * u);
      ctx.fillStyle = popFill;
      ctx.fill();
      ctx.rotate(-0.22);
      rr(ctx, -d * 0.53, -d * 0.53, d * 1.06, d * 1.06, 4 * u);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.restore();
      photo(ctx, Pb, spec, A, { shape: 'circle', disc: null, ring: fill, ringW: 1 * u }, u); return;
    }
    case 'shadow':
      back(() => { ctx.beginPath(); ctx.arc(cx + 2 * u, cy + 2 * u, d / 2, 0, Math.PI * 2); }, alpha(isDark(fill) ? '#000000' : P.ink, 0.85));
      photo(ctx, Pb, spec, A, { shape: 'circle', disc: mix(fill, c, 0.2), ring: P.ink === fill ? c : P.ink, ringW: 0.6 * u }, u); return;
    case 'seal': back(() => burstPath(ctx, cx, cy, d * 0.64, 22, 0.88), popFill); photo(ctx, Pb, spec, A, { shape: 'circle', disc: fill }, u); return;
    case 'plate':
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 4 * u;
      ctx.shadowOffsetY = 1.5 * u;
      ctx.beginPath(); ctx.arc(cx, cy, d * 0.56, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, d * 0.47, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 0.4 * u; ctx.stroke();
      photo(ctx, Pb, spec, A, { shape: 'circle', disc: null }, u); return;
    default: photo(ctx, Pb, spec, A, { shape: 'circle', disc: null }, u);
  }
}

function compose(r: Recipe): Layout {
  return (s) => {
    const { ctx, W, H, u, P, wide } = s;
    const G = groundOf(P, r.ground);
    ctx.fillStyle = G.fill;
    ctx.fillRect(0, 0, W, H);
    const c = accentOn(P, G.fill);
    drawPattern(s, r.pattern, G.fill, c);
    const { T, Pb, d } = twoUp(s, r.photoFirst ?? true, s.tall ? 0.56 : 0.52, FRAME_ROOM[r.frame] * u);
    drawFrame(s, r.frame, Pb, d, G.fill, c);
    let ground = G.fill;
    let ink = G.ink;
    let box = T;
    if (r.box === 'card') {
      // A deep ground keeps a dark panel with white words; anything else a near-white one with dark words.
      const deep = lum(G.fill) < 80;
      const panel = deep ? mix(G.fill, '#FFFFFF', 0.1) : mix(G.fill, '#FFFFFF', 0.86);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = 4 * u;
      rr(ctx, T.x, T.y, T.w, T.h, 4 * u);
      ctx.fillStyle = panel;
      ctx.fill();
      ctx.restore();
      ground = panel;
      ink = deep ? '#FFFFFF' : '#1C1408';
      const pad = 3.5 * u;
      box = { x: T.x + pad, y: T.y + pad, w: T.w - 2 * pad, h: T.h - 2 * pad };
    } else if (r.box === 'band') {
      const band = c;
      ctx.fillStyle = band;
      if (wide) ctx.fillRect(0, T.y - 2 * u, T.x + T.w + 2 * u, T.h + 4 * u);
      else ctx.fillRect(0, T.y - 2 * u, W, T.h + 4 * u);
      ground = band;
      ink = lum(band) < 140 ? '#FFFFFF' : '#111111';
    }
    const [pop, popInk] = popFor(P, ground);
    const first = accentOn(P, ground);
    stack(ctx, box, s.spec, { align: wide ? 'left' : 'center', valign: 'middle', head: r.head, ink, ground, pop, popInk, price: 'pill', cta: 'solid', kicker: 'pill', firstWord: first === ink ? undefined : first }, ALL, u);
    sticker(ctx, Pb.x + d * 0.88, Pb.y + d * 0.12, d * 0.16, badgeOn(s), P.pop, P.popInk, 0.18, r.frame === 'seal' ? 'circle' : 'burst');
    footer(ctx, s.foot, s.spec, s.A, G.ink, isDark(G.fill), pop, popInk);
  };
}

/** The recipes: key, name, group and the parts. */
export const RECIPES: Array<{ key: string; name: string; group: string; r: Recipe }> = [
  { key: 'cafe-ring', name: 'Café ring', group: 'classic', r: { ground: 'bg', pattern: 'plain', frame: 'ring', head: 'script' } },
  { key: 'plate', name: 'On the plate', group: 'classic', r: { ground: 'light', pattern: 'grain', frame: 'plate', head: 'serif' } },
  { key: 'framed', name: 'Framed', group: 'classic', r: { ground: 'bg', pattern: 'frame', frame: 'double', head: 'serif' } },
  { key: 'arch-window', name: 'Arch window', group: 'classic', r: { ground: 'bg', pattern: 'plain', frame: 'arch', head: 'serif', box: 'card' } },
  { key: 'menu-board', name: 'Menu board', group: 'classic', r: { ground: 'dark', pattern: 'grain', frame: 'ring', head: 'serif' } },
  { key: 'heritage', name: 'Heritage', group: 'classic', r: { ground: 'bg', pattern: 'arcs', frame: 'double', head: 'serif' } },
  { key: 'homestyle', name: 'Homestyle', group: 'classic', r: { ground: 'light', pattern: 'gingham', frame: 'plate', head: 'script' } },
  { key: 'linen', name: 'Linen', group: 'classic', r: { ground: 'light', pattern: 'stripes', frame: 'square', head: 'serif' } },
  { key: 'seal-burst', name: 'Big seal', group: 'bold', r: { ground: 'alt', pattern: 'rays', frame: 'seal', head: 'caps' } },
  { key: 'split-pop', name: 'Split pop', group: 'bold', r: { ground: 'bg', pattern: 'split', frame: 'shadow', head: 'caps', box: 'band' } },
  { key: 'loud-band', name: 'Loud band', group: 'bold', r: { ground: 'bg', pattern: 'stripes', frame: 'ring', head: 'caps', box: 'band' } },
  { key: 'big-blob', name: 'Big blob', group: 'bold', r: { ground: 'bg', pattern: 'plain', frame: 'blob', head: 'caps' } },
  { key: 'corner-pop', name: 'Corner pop', group: 'bold', r: { ground: 'alt', pattern: 'corner', frame: 'ring', head: 'caps' } },
  { key: 'shout', name: 'Shout', group: 'bold', r: { ground: 'alt', pattern: 'halftone', frame: 'shadow', head: 'caps' } },
  { key: 'triangle-pop', name: 'Sharp shapes', group: 'bold', r: { ground: 'bg', pattern: 'triangles', frame: 'hex', head: 'caps' } },
  { key: 'brush-bold', name: 'Brush bold', group: 'bold', r: { ground: 'bg', pattern: 'brush', frame: 'bare', head: 'caps' } },
  { key: 'photo-square', name: 'Square photo', group: 'photo', r: { ground: 'bg', pattern: 'plain', frame: 'square', head: 'sans' } },
  { key: 'photo-card', name: 'Photo card', group: 'photo', r: { ground: 'light', pattern: 'dots', frame: 'square', head: 'sans', box: 'card' } },
  { key: 'photo-tilt', name: 'Tilted photo', group: 'photo', r: { ground: 'bg', pattern: 'grid', frame: 'tilt', head: 'sans' } },
  { key: 'photo-arch', name: 'Photo arch', group: 'photo', r: { ground: 'alt', pattern: 'plain', frame: 'arch', head: 'serif' } },
  { key: 'photo-glow', name: 'Glowing photo', group: 'photo', r: { ground: 'dark', pattern: 'glow', frame: 'bare', head: 'sans' } },
  { key: 'photo-shadow', name: 'Shadow photo', group: 'photo', r: { ground: 'bg', pattern: 'plain', frame: 'shadow', head: 'sans' } },
  { key: 'photo-plate', name: 'Big plate', group: 'photo', r: { ground: 'alt', pattern: 'circles', frame: 'plate', head: 'caps' } },
  { key: 'photo-frame', name: 'Gallery frame', group: 'photo', r: { ground: 'light', pattern: 'frame', frame: 'square', head: 'serif' } },
  { key: 'confetti-seal', name: 'Party seal', group: 'fun', r: { ground: 'bg', pattern: 'confetti', frame: 'seal', head: 'script' } },
  { key: 'bubbles', name: 'Bubbles', group: 'fun', r: { ground: 'bg', pattern: 'circles', frame: 'blob', head: 'script' } },
  { key: 'sweet-scallop', name: 'Sweet scallop', group: 'fun', r: { ground: 'light', pattern: 'dots', frame: 'scallop', head: 'script' } },
  { key: 'gingham-fun', name: 'Gingham', group: 'fun', r: { ground: 'bg', pattern: 'gingham', frame: 'ring', head: 'script', box: 'card' } },
  { key: 'wavy-fun', name: 'Wavy', group: 'fun', r: { ground: 'alt', pattern: 'waves', frame: 'ring', head: 'script' } },
  { key: 'blob-party', name: 'Blob party', group: 'fun', r: { ground: 'alt', pattern: 'blobs', frame: 'blob', head: 'caps' } },
  { key: 'sprinkles', name: 'Sprinkles', group: 'fun', r: { ground: 'light', pattern: 'confetti', frame: 'plate', head: 'caps' } },
  { key: 'happy-tilt', name: 'Happy tilt', group: 'fun', r: { ground: 'bg', pattern: 'dots', frame: 'tilt', head: 'script' } },
  { key: 'night-ring', name: 'Night ring', group: 'night', r: { ground: 'dark', pattern: 'plain', frame: 'double', head: 'caps' } },
  { key: 'night-glow', name: 'Night glow', group: 'night', r: { ground: 'dark', pattern: 'glow', frame: 'ring', head: 'script' } },
  { key: 'midnight-grid', name: 'Midnight grid', group: 'night', r: { ground: 'dark', pattern: 'grid', frame: 'square', head: 'sans' } },
  { key: 'starry', name: 'Night stars', group: 'night', r: { ground: 'dark', pattern: 'triangles', frame: 'seal', head: 'caps' } },
  { key: 'night-arch', name: 'Night arch', group: 'night', r: { ground: 'dark', pattern: 'arcs', frame: 'arch', head: 'serif' } },
  { key: 'ember-glow', name: 'Ember', group: 'night', r: { ground: 'dark', pattern: 'rays', frame: 'plate', head: 'script' } },
  { key: 'night-blob', name: 'Lava', group: 'night', r: { ground: 'dark', pattern: 'blobs', frame: 'blob', head: 'caps' } },
  { key: 'velvet', name: 'Velvet', group: 'night', r: { ground: 'dark', pattern: 'grain', frame: 'double', head: 'serif', box: 'card' } },
  { key: 'clean-split', name: 'Clean split', group: 'modern', r: { ground: 'bg', pattern: 'split', frame: 'square', head: 'sans' } },
  { key: 'mono-grid', name: 'Mono grid', group: 'modern', r: { ground: 'light', pattern: 'grid', frame: 'ring', head: 'sans' } },
  { key: 'soft-blob', name: 'Soft shapes', group: 'modern', r: { ground: 'light', pattern: 'blobs', frame: 'bare', head: 'sans', box: 'card' } },
  { key: 'hex-modern', name: 'Hexagon', group: 'modern', r: { ground: 'bg', pattern: 'hex', frame: 'hex', head: 'sans' } },
  { key: 'arcs-modern', name: 'Arcs', group: 'modern', r: { ground: 'bg', pattern: 'arcs', frame: 'ring', head: 'sans' } },
  { key: 'minimal', name: 'Minimal', group: 'modern', r: { ground: 'bg', pattern: 'plain', frame: 'bare', head: 'sans' } },
  { key: 'gradient-glow', name: 'Soft glow', group: 'modern', r: { ground: 'bg', pattern: 'glow', frame: 'ring', head: 'sans' } },
  { key: 'card-stack', name: 'Card stack', group: 'modern', r: { ground: 'alt', pattern: 'plain', frame: 'tilt', head: 'sans', box: 'card' } },
  { key: 'polka', name: 'Polka dots', group: 'pattern', r: { ground: 'alt', pattern: 'dots', frame: 'ring', head: 'caps' } },
  { key: 'pinstripe', name: 'Pinstripe', group: 'pattern', r: { ground: 'bg', pattern: 'stripes', frame: 'double', head: 'serif' } },
  { key: 'checkered', name: 'Checks', group: 'pattern', r: { ground: 'alt', pattern: 'gingham', frame: 'plate', head: 'caps' } },
  { key: 'honeycomb', name: 'Honeycomb', group: 'pattern', r: { ground: 'light', pattern: 'hex', frame: 'hex', head: 'caps' } },
  { key: 'ripple', name: 'Ripple', group: 'pattern', r: { ground: 'bg', pattern: 'arcs', frame: 'scallop', head: 'script' } },
  { key: 'terrazzo', name: 'Terrazzo', group: 'pattern', r: { ground: 'light', pattern: 'triangles', frame: 'ring', head: 'sans' } },
  { key: 'sunburst', name: 'Sunburst', group: 'pattern', r: { ground: 'alt', pattern: 'rays', frame: 'plate', head: 'script' } },
  { key: 'brushwork', name: 'Brushwork', group: 'pattern', r: { ground: 'light', pattern: 'brush', frame: 'ring', head: 'script' } },
];

export const LAYOUT_DRAW: Record<string, Layout> = {
  splash, spotlight, diagonal, photo: fullPhoto, frame, bigtype: bigType, band, sticker: stickers, arch, side,
  block, bigcircle: bigCircle, ticket, glow, bands, tilt, corners, editorial, starburst, ribbon,
  stamp, picnic, chalk, neon, target, zigzag, confetti, sunrise, capsule, popart, waves, scallop,
  aurora, glass, echo, swiss, polaroid, orbit, bunting, halftone, stage, bistro, steam, marquee,
  ...Object.fromEntries(RECIPES.map((x) => [x.key, compose(x.r)])),
};

/** A moment of an animated post: which motion, how far in (seconds) and how long the whole clip is. */
export interface PostMoment { motion: string; t: number; dur: number }

/** Draw one post onto `ctx` at W × H: the still picture, or one frame of it in motion. */
export function renderPost(ctx: Ctx, W: number, H: number, spec: PostSpec, layout: string, P: Palette, A: PostAssets, moment?: PostMoment | null): void {
  const u = Math.min(W, H) / 100;
  const wide = W / H > 1.3;
  const tall = H / W > 1.6;
  const m = 6 * u;
  // A story's top and bottom are covered by the app's own buttons.
  const lift = tall ? H * 0.075 : 0;
  const hasFoot = spec.show.logo || (spec.show.phone && spec.phone.trim() !== '') || (spec.show.website && spec.website.trim() !== '') || spec.show.qr;
  const fh = hasFoot ? (wide ? 15 : 13) * u : 0;
  const top = m + lift;
  const bottom = H - m - lift;
  const foot: Rect = { x: m, y: bottom - fh, w: W - 2 * m, h: fh };
  const body: Rect = { x: m, y: top, w: W - 2 * m, h: bottom - top - fh - (hasFoot ? 3.5 * u : 0) };
  const motion = moment ? motionOf(moment.motion) : null;
  ANIM = motion && moment ? { t: Math.max(0, moment.t), dur: Math.max(1, moment.dur), m: motion, u, W, H, rows: 0 } : null;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  try {
    if (ANIM && motion && motion.camera !== 'none') {
      // The whole picture drifts slowly in or out, as a camera would.
      const p = clamp01(ANIM.t / ANIM.dur);
      const z = motion.camera === 'in' ? 1 + 0.06 * p : 1.06 - 0.06 * p;
      ctx.translate(W / 2, H / 2);
      ctx.scale(z, z);
      ctx.translate(-W / 2, -H / 2);
    }
    (LAYOUT_DRAW[layout] ?? splash)({ ctx, W, H, u, wide, tall, body, foot, spec, P, A });
  } finally {
    ANIM = null;
    ctx.restore();
  }
}
