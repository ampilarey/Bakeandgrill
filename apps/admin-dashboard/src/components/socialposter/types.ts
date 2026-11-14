/**
 * Social Hub → Make a post (owner, 2026-11-14: "one click and change the
 * design and layout but information remains same"). One set of words and one
 * photo (`PostSpec`) is drawn by any layout in any colour style at any of the
 * platform sizes, so a design is a pair of keys and never a copy of the words.
 */

export type PartKey = 'kicker' | 'tagline' | 'price' | 'was' | 'badge' | 'cta' | 'phone' | 'website' | 'logo' | 'qr';

export interface PostSpec {
  headline: string;
  /** The small line above the headline ("New", "Today only"). */
  kicker: string;
  /** The line under the headline. */
  tagline: string;
  /** The amount alone, "45.00"; drawn as "MVR 45.00". */
  price: string;
  /** The price before the offer, struck through. */
  was: string;
  /** The sticker on the photo ("20% OFF", "Microwave & Eat"). */
  badge: string;
  /** The button's words ("Order now"). */
  cta: string;
  phone: string;
  website: string;
  /** Where the QR code and the caption's link go. */
  link: string;
  /** The photo's address, '' for none. */
  photo: string;
  /** The photo is a dish cut out of its background, so it is never cropped. */
  cutout: boolean;
  /** The business's name, for a design that writes it. */
  brand: string;
  itemId: number | null;
  show: Record<PartKey, boolean>;
}

export interface Palette {
  key: string;
  name: string;
  /** The ground and the words on it. */
  bg: string;
  ink: string;
  /** The second colour, for big shapes, and the words on it. */
  alt: string;
  altInk: string;
  /** The highlight, for the price and stickers, and the words on it. */
  pop: string;
  popInk: string;
}

export const PALETTES: Palette[] = [
  { key: 'rust', name: 'Bake & Grill', bg: '#FFF8EC', ink: '#1C1408', alt: '#B74B0C', altInk: '#FFF8EC', pop: '#E3A51B', popInk: '#1C1408' },
  { key: 'ember', name: 'Ember', bg: '#1C1408', ink: '#FFF8EC', alt: '#B74B0C', altInk: '#FFF8EC', pop: '#F2B632', popInk: '#1C1408' },
  { key: 'bee', name: 'Black and yellow', bg: '#0B0B0B', ink: '#FFFFFF', alt: '#FFD60A', altInk: '#0B0B0B', pop: '#FFD60A', popInk: '#0B0B0B' },
  { key: 'sunny', name: 'Sunny', bg: '#FFD60A', ink: '#0B0B0B', alt: '#0B0B0B', altInk: '#FFD60A', pop: '#FFFFFF', popInk: '#0B0B0B' },
  { key: 'chilli', name: 'Chilli', bg: '#B3171E', ink: '#FFFFFF', alt: '#FFC93C', altInk: '#5A0A0E', pop: '#FFC93C', popInk: '#5A0A0E' },
  { key: 'leaf', name: 'Fresh', bg: '#F3F7EC', ink: '#1D2B1F', alt: '#2F6B3A', altInk: '#FFFFFF', pop: '#F2A922', popInk: '#1D2B1F' },
  { key: 'cocoa', name: 'Cocoa', bg: '#3B2416', ink: '#FFF3E2', alt: '#F2D9B8', altInk: '#3B2416', pop: '#F2A65A', popInk: '#3B2416' },
  { key: 'blush', name: 'Blush', bg: '#FFE9E0', ink: '#3A1A10', alt: '#D9531E', altInk: '#FFFFFF', pop: '#3A1A10', popInk: '#FFE9E0' },
  { key: 'night', name: 'Night', bg: '#10131C', ink: '#FFFFFF', alt: '#FF7A1A', altInk: '#10131C', pop: '#FFD166', popInk: '#10131C' },
  { key: 'paper', name: 'Paper', bg: '#FBF6EA', ink: '#2B2117', alt: '#2B2117', altInk: '#FBF6EA', pop: '#B74B0C', popInk: '#FFFFFF' },
];

export interface LayoutInfo { key: string; name: string }

/** The layouts, in the order they are offered; each is drawn by `LAYOUT_DRAW` in draw.ts. */
export const LAYOUTS: LayoutInfo[] = [
  { key: 'splash', name: 'Splash' },
  { key: 'spotlight', name: 'Spotlight' },
  { key: 'diagonal', name: 'Diagonal' },
  { key: 'photo', name: 'Full photo' },
  { key: 'frame', name: 'Snapshot' },
  { key: 'bigtype', name: 'Big words' },
  { key: 'band', name: 'Wave' },
  { key: 'sticker', name: 'Stickers' },
  { key: 'arch', name: 'Arch' },
  { key: 'side', name: 'Side band' },
];

export interface PostSize { key: string; name: string; hint: string; w: number; h: number }

/** One post, every platform: the shapes that between them cover the feeds, stories and link previews. */
export const SIZES: PostSize[] = [
  { key: 'portrait', name: 'Feed post', hint: 'Instagram and Facebook', w: 1080, h: 1350 },
  { key: 'square', name: 'Square', hint: 'Viber, Telegram, any feed', w: 1080, h: 1080 },
  { key: 'story', name: 'Story', hint: 'Stories, WhatsApp status, TikTok', w: 1080, h: 1920 },
  { key: 'wide', name: 'Wide', hint: 'Facebook link, a website banner', w: 1200, h: 630 },
];

export const BADGE_PRESETS = ['New', 'Today only', 'Limited time', 'Best seller', '20% OFF', 'Buy 1 Get 1', 'Free delivery', 'Back in stock'];
export const CTA_PRESETS = ['Order now', 'Order online', 'Call to order', 'Message us to order', 'Visit us today'];

export const PART_NAMES: Record<PartKey, string> = {
  kicker: 'Small line above',
  tagline: 'Line below',
  price: 'Price',
  was: 'Old price',
  badge: 'Sticker',
  cta: 'Order button',
  phone: 'Phone number',
  website: 'Website',
  logo: 'Logo',
  qr: 'QR code',
};

export const PART_ORDER: PartKey[] = ['price', 'was', 'badge', 'cta', 'phone', 'website', 'logo', 'qr', 'kicker', 'tagline'];

export function blankSpec(brand?: { name?: string; phone?: string; website?: string; order_url?: string }): PostSpec {
  return {
    headline: '', kicker: '', tagline: '', price: '', was: '', badge: '', cta: 'Order now',
    phone: brand?.phone ?? '', website: brand?.website ?? '', link: brand?.order_url ?? '',
    photo: '', cutout: false, brand: brand?.name ?? 'Bake & Grill', itemId: null,
    show: { kicker: false, tagline: false, price: true, was: false, badge: false, cta: true, phone: true, website: false, logo: true, qr: false },
  };
}

/** A saved spec with every key present, so an old or partial one still draws. */
export function fullSpec(raw: Partial<PostSpec> | null | undefined, brand?: Parameters<typeof blankSpec>[0]): PostSpec {
  const base = blankSpec(brand);
  const r = raw ?? {};
  return { ...base, ...r, show: { ...base.show, ...(r.show ?? {}) } };
}

/** The amount as it is drawn: "45" → "45.00"; words are left alone. */
export function priceWords(raw: string): string {
  const t = raw.trim();
  if (t === '') return '';
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n.toFixed(2) : t;
}

/** A caption for the composer, from the same words the picture carries. */
export function captionOf(spec: PostSpec): string {
  const lines: string[] = [];
  const price = spec.show.price && spec.price.trim() ? ` · MVR ${priceWords(spec.price)}` : '';
  if (spec.headline.trim()) lines.push(`${spec.headline.trim()}${price}`);
  if (spec.show.tagline && spec.tagline.trim()) lines.push(spec.tagline.trim());
  const how: string[] = [];
  if (spec.link.trim()) how.push(spec.link.trim());
  if (spec.show.phone && spec.phone.trim()) how.push(`Call ${spec.phone.trim()}`);
  if (how.length) lines.push(`${spec.cta.trim() || 'Order now'}: ${how.join(' · ')}`);
  return lines.join('\n');
}

export function paletteOf(key: string): Palette {
  return PALETTES.find((p) => p.key === key) ?? PALETTES[0];
}

export function sizeOf(key: string): PostSize {
  return SIZES.find((s) => s.key === key) ?? SIZES[0];
}
