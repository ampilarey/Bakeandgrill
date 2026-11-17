/**
 * Social Hub → Make a post (owner, 2026-11-14: "one click and change the
 * design and layout but information remains same"). One set of words and one
 * photo (`PostSpec`) is drawn by any layout in any colour style at any of the
 * platform sizes, so a design is a pair of keys and never a copy of the words.
 */

export type PartKey = 'kicker' | 'tagline' | 'price' | 'was' | 'badge' | 'cta' | 'cta2' | 'phone' | 'website' | 'logo' | 'qr';

/** How the main button is drawn: the design's own way, filled, outlined, or in the highlight colour. */
export type ButtonStyle = 'auto' | 'solid' | 'outline' | 'pop';

export const BUTTON_STYLES: Array<{ key: ButtonStyle; name: string }> = [
  { key: 'auto', name: 'As the design' },
  { key: 'solid', name: 'Filled' },
  { key: 'outline', name: 'Outline' },
  { key: 'pop', name: 'Highlight' },
];

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
  /** A second button beside the first ("Call 9120011"). */
  cta2: string;
  ctaStyle: ButtonStyle;
  /** The motion the post plays as a video; '' is a still picture only. */
  motion: string;
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
  { key: 'mint', name: 'Mint', bg: '#E8F6F0', ink: '#12332A', alt: '#1F8A70', altInk: '#FFFFFF', pop: '#FF7A59', popInk: '#FFFFFF' },
  { key: 'royal', name: 'Royal', bg: '#1B1464', ink: '#FFFFFF', alt: '#F9C80E', altInk: '#1B1464', pop: '#FF4D6D', popInk: '#FFFFFF' },
  { key: 'coral', name: 'Coral', bg: '#FF6B5B', ink: '#FFFFFF', alt: '#2B1B17', altInk: '#FFE8D6', pop: '#FFE066', popInk: '#2B1B17' },
  { key: 'sky', name: 'Sky', bg: '#EAF4FF', ink: '#102A43', alt: '#1F6FEB', altInk: '#FFFFFF', pop: '#FFB703', popInk: '#102A43' },
  { key: 'plum', name: 'Plum', bg: '#2D1B33', ink: '#FCEFF9', alt: '#C84B9B', altInk: '#FFFFFF', pop: '#FFD23F', popInk: '#2D1B33' },
  { key: 'olive', name: 'Olive', bg: '#F4F1DE', ink: '#2F3E1E', alt: '#606C38', altInk: '#FEFAE0', pop: '#BC6C25', popInk: '#FFFFFF' },
  { key: 'candy', name: 'Candy', bg: '#FFF0F5', ink: '#4A1230', alt: '#FF4F8B', altInk: '#FFFFFF', pop: '#2EC4B6', popInk: '#05312D' },
  { key: 'mono', name: 'Black and white', bg: '#FFFFFF', ink: '#111111', alt: '#111111', altInk: '#FFFFFF', pop: '#E63946', popInk: '#FFFFFF' },
  { key: 'gold', name: 'Black and gold', bg: '#0F0F0F', ink: '#F5E6C4', alt: '#C9A227', altInk: '#0F0F0F', pop: '#F5E6C4', popInk: '#0F0F0F' },
  { key: 'tangerine', name: 'Tangerine', bg: '#FF8C1A', ink: '#1C1408', alt: '#FFF3E0', altInk: '#1C1408', pop: '#1C1408', popInk: '#FFF3E0' },
  // The advanced set (owner, 2026-11-17).
  { key: 'terracotta', name: 'Terracotta', bg: '#F6E7DA', ink: '#3A1F12', alt: '#C0582E', altInk: '#FFF6EE', pop: '#2F4B3A', popInk: '#F6E7DA' },
  { key: 'saffron', name: 'Saffron', bg: '#FFF4D6', ink: '#3B2600', alt: '#E8900C', altInk: '#FFFFFF', pop: '#8C1C13', popInk: '#FFF4D6' },
  { key: 'matcha', name: 'Matcha', bg: '#EEF2E2', ink: '#24321C', alt: '#7A9A3A', altInk: '#FFFFFF', pop: '#3B2A1A', popInk: '#EEF2E2' },
  { key: 'espresso', name: 'Espresso', bg: '#241812', ink: '#F7E9D7', alt: '#8A5A3C', altInk: '#FFF4E6', pop: '#E9C46A', popInk: '#241812' },
  { key: 'berry', name: 'Berry', bg: '#3A0D2E', ink: '#FFEAF4', alt: '#D7266B', altInk: '#FFFFFF', pop: '#FFB4A2', popInk: '#3A0D2E' },
  { key: 'lagoon', name: 'Lagoon', bg: '#E6F7F7', ink: '#0B3B3C', alt: '#0E8C8F', altInk: '#FFFFFF', pop: '#FF8A5B', popInk: '#FFFFFF' },
  { key: 'sunset', name: 'Sunset', bg: '#2A1640', ink: '#FFF0E6', alt: '#FF6B3D', altInk: '#FFFFFF', pop: '#FFC94A', popInk: '#2A1640' },
  { key: 'charcoal', name: 'Charcoal and lime', bg: '#1E2124', ink: '#F2F4F3', alt: '#3A3F44', altInk: '#F2F4F3', pop: '#C6F432', popInk: '#1E2124' },
  { key: 'cream', name: 'Cream and teal', bg: '#FFF9EF', ink: '#173A3A', alt: '#1F6F6B', altInk: '#FFF9EF', pop: '#F28C28', popInk: '#FFFFFF' },
  { key: 'wine', name: 'Wine', bg: '#4A0E1A', ink: '#FBEFE8', alt: '#8E1B32', altInk: '#FBEFE8', pop: '#D4AF37', popInk: '#2A0810' },
  { key: 'peach', name: 'Peach', bg: '#FFE5D4', ink: '#4A2416', alt: '#FF8A65', altInk: '#FFFFFF', pop: '#4A2416', popInk: '#FFE5D4' },
  { key: 'ocean', name: 'Deep ocean', bg: '#0B1E33', ink: '#EAF6FF', alt: '#1A5E8A', altInk: '#EAF6FF', pop: '#5FE1D9', popInk: '#0B1E33' },
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
  { key: 'block', name: 'Half and half' },
  { key: 'bigcircle', name: 'Big circle' },
  { key: 'ticket', name: 'Ticket' },
  { key: 'glow', name: 'Glow' },
  { key: 'bands', name: 'Three bands' },
  { key: 'tilt', name: 'Tilted card' },
  { key: 'corners', name: 'Corners' },
  { key: 'editorial', name: 'Magazine' },
  { key: 'starburst', name: 'Starburst' },
  { key: 'ribbon', name: 'Ribbon' },
  { key: 'stamp', name: 'Stamp' },
  { key: 'picnic', name: 'Picnic' },
  { key: 'chalk', name: 'Chalkboard' },
  { key: 'neon', name: 'Neon' },
  { key: 'target', name: 'Rings' },
  { key: 'zigzag', name: 'Zigzag' },
  { key: 'confetti', name: 'Confetti' },
  { key: 'sunrise', name: 'Sunrise' },
  { key: 'capsule', name: 'Pill' },
  { key: 'popart', name: 'Pop art' },
  { key: 'waves', name: 'Waves' },
  { key: 'scallop', name: 'Doily' },
  // The advanced set (owner, 2026-11-17: "more advanced design").
  { key: 'aurora', name: 'Aurora glass' },
  { key: 'glass', name: 'Frosted photo' },
  { key: 'echo', name: 'Echo letters' },
  { key: 'swiss', name: 'Modern grid' },
  { key: 'polaroid', name: 'Photo prints' },
  { key: 'orbit', name: 'Orbit' },
  { key: 'bunting', name: 'Party flags' },
  { key: 'halftone', name: 'Halftone' },
  { key: 'stage', name: 'Stage lights' },
  { key: 'bistro', name: 'Bistro menu' },
  { key: 'steam', name: 'Hot and steamy' },
  { key: 'marquee', name: 'Marquee lights' },
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
export const CTA2_PRESETS = ['Call us', 'See the menu', 'Delivery available', 'Pick up today', 'Scan to order'];

/**
 * A ready-made kind of post: a design, a colour, which parts show and the
 * usual words for it. Picking one never touches the headline, the price or
 * the photo, so the dish stays and the post changes around it.
 */
export interface PostTemplate {
  key: string;
  name: string;
  layout: string;
  palette: string;
  show: Partial<Record<PartKey, boolean>>;
  words: Partial<Pick<PostSpec, 'kicker' | 'tagline' | 'badge' | 'cta' | 'cta2'>>;
}

export const TEMPLATES: PostTemplate[] = [
  { key: 'new-dish', name: 'New dish', layout: 'spotlight', palette: 'rust', show: { kicker: true, badge: true, was: false }, words: { kicker: 'New on the menu', badge: 'New', cta: 'Order now' } },
  { key: 'todays-offer', name: "Today's offer", layout: 'starburst', palette: 'chilli', show: { badge: true, was: true, kicker: false }, words: { badge: 'Today only', cta: 'Order now' } },
  { key: 'price-drop', name: 'Price drop', layout: 'bigtype', palette: 'sunny', show: { kicker: true, was: true, badge: false }, words: { kicker: 'Price drop', cta: 'Order now' } },
  { key: 'best-seller', name: 'Best seller', layout: 'glow', palette: 'ember', show: { badge: true, kicker: false, was: false }, words: { badge: 'Best seller', cta: 'Order now' } },
  { key: 'back-in-stock', name: 'Back in stock', layout: 'band', palette: 'leaf', show: { kicker: true, badge: false, was: false }, words: { kicker: 'Back in stock', cta: 'Order now' } },
  { key: 'free-delivery', name: 'Free delivery', layout: 'block', palette: 'night', show: { badge: true, cta2: true, was: false }, words: { badge: 'Free delivery', cta: 'Order online', cta2: 'Call us' } },
  { key: 'call-to-order', name: 'Call to order', layout: 'corners', palette: 'blush', show: { phone: true, cta: true, qr: false, badge: false }, words: { cta: 'Call to order' } },
  { key: 'scan-to-order', name: 'Scan to order', layout: 'ticket', palette: 'paper', show: { qr: true, cta: true, badge: false }, words: { cta: 'Scan to order' } },
  { key: 'weekend', name: 'Weekend special', layout: 'editorial', palette: 'gold', show: { kicker: true, badge: false }, words: { kicker: 'Weekend special', cta: 'Order now' } },
  { key: 'frozen-pack', name: 'Frozen pack', layout: 'splash', palette: 'bee', show: { badge: true, tagline: true, kicker: false }, words: { badge: 'Microwave & Eat', tagline: 'Steamed, frozen, handmade', cta: 'Order now' } },
  { key: 'limited', name: 'Limited time', layout: 'tilt', palette: 'coral', show: { badge: true, cta2: true }, words: { badge: 'Limited time', cta: 'Order now', cta2: 'Pick up today' } },
  { key: 'simple', name: 'Simple and clean', layout: 'arch', palette: 'mono', show: { badge: false, kicker: false, was: false, cta2: false }, words: { cta: 'Order now' } },
  { key: 'todays-special', name: "Today's special board", layout: 'chalk', palette: 'cocoa', show: { kicker: true, badge: false }, words: { kicker: "Today's special", cta: 'Order now' } },
  { key: 'late-night', name: 'Late night', layout: 'neon', palette: 'night', show: { kicker: true, badge: false }, words: { kicker: 'Open late', cta: 'Order now' } },
  { key: 'grand-opening', name: 'Celebration', layout: 'confetti', palette: 'candy', show: { badge: true, kicker: true }, words: { kicker: "Let's celebrate", badge: 'New', cta: 'Order now' } },
  { key: 'breakfast', name: 'Breakfast', layout: 'sunrise', palette: 'rust', show: { kicker: true, badge: false }, words: { kicker: 'Good morning', cta: 'Order breakfast' } },
  { key: 'big-deal', name: 'Big deal', layout: 'popart', palette: 'sunny', show: { badge: true, was: true }, words: { badge: 'Deal', cta: 'Order now' } },
  { key: 'bakery', name: 'From the bakery', layout: 'scallop', palette: 'blush', show: { kicker: true, badge: false }, words: { kicker: 'Fresh from the oven', cta: 'Order now' } },
  { key: 'iftar', name: 'Iftar special', layout: 'stage', palette: 'gold', show: { kicker: true, badge: false, cta2: true }, words: { kicker: 'Iftar special', cta: 'Order now', cta2: 'Pick up today' } },
  { key: 'family-meal', name: 'Family meal', layout: 'bunting', palette: 'saffron', show: { kicker: true, tagline: true, badge: false }, words: { kicker: 'For the whole family', tagline: 'Enough for everyone', cta: 'Order now' } },
  { key: 'combo-deal', name: 'Combo deal', layout: 'halftone', palette: 'sunny', show: { badge: true, was: true }, words: { badge: 'Combo', cta: 'Order now' } },
  { key: 'chefs-pick', name: "Chef's pick", layout: 'bistro', palette: 'cream', show: { kicker: true, tagline: true, badge: false }, words: { kicker: "Chef's pick", tagline: 'Made fresh every day', cta: 'Order now' } },
  { key: 'hot-fresh', name: 'Hot and fresh', layout: 'steam', palette: 'espresso', show: { kicker: true, badge: false }, words: { kicker: 'Hot and fresh', cta: 'Order now' } },
  { key: 'happy-hour', name: 'Happy hour', layout: 'marquee', palette: 'wine', show: { badge: true, kicker: true, was: true }, words: { kicker: 'Happy hour', badge: 'Limited time', cta: 'Order now' } },
  { key: 'new-flavour', name: 'New flavour', layout: 'aurora', palette: 'berry', show: { kicker: true, badge: true }, words: { kicker: 'New flavour', badge: 'New', cta: 'Try it today' } },
  { key: 'photo-story', name: 'Photo story', layout: 'glass', palette: 'ember', show: { tagline: true, badge: false, kicker: false }, words: { tagline: 'Made with love in our kitchen', cta: 'Order now' } },
  { key: 'launch', name: 'Big launch', layout: 'orbit', palette: 'ocean', show: { kicker: true, badge: true }, words: { kicker: 'Just landed', badge: 'New', cta: 'Order now' } },
  { key: 'modern', name: 'Modern and minimal', layout: 'swiss', palette: 'charcoal', show: { kicker: true, badge: false, cta2: false }, words: { kicker: 'On the menu', cta: 'Order now' } },
  { key: 'trending', name: 'Everyone loves it', layout: 'echo', palette: 'sunset', show: { badge: true, kicker: false }, words: { badge: 'Trending', cta: 'Order now' } },
  { key: 'favourite', name: 'Customer favourite', layout: 'polaroid', palette: 'terracotta', show: { kicker: true, tagline: true, badge: false }, words: { kicker: 'Customer favourite', tagline: 'Ordered again and again', cta: 'Order now' } },
];

/** The post with a template laid over it: its design, its parts and its usual words. */
export function withTemplate(spec: PostSpec, t: PostTemplate): PostSpec {
  return { ...spec, ...t.words, show: { ...spec.show, ...t.show } };
}

/** How one part arrives. */
export type Fx = 'none' | 'fade' | 'up' | 'down' | 'left' | 'right' | 'zoom' | 'shrink' | 'pop' | 'spin' | 'drop' | 'swing' | 'flip' | 'wipe'
  | 'glide' | 'slam' | 'unfold' | 'tilt' | 'elastic' | 'wipeup';

/**
 * A motion template: how each part of the post arrives, what it does once it
 * has, and what the camera does meanwhile. It names parts, never designs, so
 * every motion plays on every design in every colour and shape.
 */
export interface Motion {
  key: string;
  name: string;
  photo: Fx;
  text: Fx;
  price: Fx;
  sticker: Fx;
  footer: Fx;
  /** Seconds between one row of words and the next. */
  stagger: number;
  /** 1 is the usual speed of arrival; under 1 is snappier, over 1 slower. */
  pace: number;
  /** What the photo does once it has arrived. */
  idle: 'none' | 'float' | 'breathe' | 'sway' | 'grow' | 'orbit' | 'bob';
  /** What draws the eye afterwards: the sticker wiggles, the price and button pulse, or both. */
  accent: 'none' | 'wiggle' | 'pulse' | 'both';
  camera: 'none' | 'in' | 'out';
}

export const MOTIONS: Motion[] = [
  { key: 'calm', name: 'Calm fade', photo: 'fade', text: 'fade', price: 'fade', sticker: 'fade', footer: 'fade', stagger: 0.16, pace: 1.3, idle: 'none', accent: 'none', camera: 'in' },
  { key: 'rise', name: 'Rise', photo: 'zoom', text: 'up', price: 'pop', sticker: 'pop', footer: 'up', stagger: 0.14, pace: 1, idle: 'float', accent: 'pulse', camera: 'none' },
  { key: 'pop', name: 'Pop', photo: 'pop', text: 'pop', price: 'pop', sticker: 'pop', footer: 'fade', stagger: 0.12, pace: 0.85, idle: 'breathe', accent: 'both', camera: 'none' },
  { key: 'slide', name: 'Slide in', photo: 'right', text: 'left', price: 'left', sticker: 'pop', footer: 'up', stagger: 0.12, pace: 1, idle: 'none', accent: 'pulse', camera: 'in' },
  { key: 'cross', name: 'Crossing', photo: 'left', text: 'right', price: 'right', sticker: 'spin', footer: 'fade', stagger: 0.12, pace: 1, idle: 'float', accent: 'wiggle', camera: 'none' },
  { key: 'drop', name: 'Drop and bounce', photo: 'drop', text: 'fade', price: 'pop', sticker: 'drop', footer: 'fade', stagger: 0.14, pace: 1.2, idle: 'none', accent: 'pulse', camera: 'none' },
  { key: 'spin', name: 'Spin', photo: 'spin', text: 'up', price: 'spin', sticker: 'spin', footer: 'fade', stagger: 0.12, pace: 1.1, idle: 'sway', accent: 'pulse', camera: 'none' },
  { key: 'type', name: 'Typewriter', photo: 'fade', text: 'wipe', price: 'wipe', sticker: 'pop', footer: 'wipe', stagger: 0.3, pace: 1.3, idle: 'breathe', accent: 'none', camera: 'in' },
  { key: 'punch', name: 'Zoom punch', photo: 'shrink', text: 'pop', price: 'shrink', sticker: 'shrink', footer: 'fade', stagger: 0.1, pace: 0.8, idle: 'none', accent: 'both', camera: 'out' },
  { key: 'float', name: 'Floating', photo: 'up', text: 'fade', price: 'fade', sticker: 'fade', footer: 'fade', stagger: 0.16, pace: 1.2, idle: 'float', accent: 'wiggle', camera: 'none' },
  { key: 'bounce', name: 'Bouncy words', photo: 'pop', text: 'drop', price: 'drop', sticker: 'pop', footer: 'up', stagger: 0.16, pace: 1.1, idle: 'breathe', accent: 'pulse', camera: 'none' },
  { key: 'swing', name: 'Swing', photo: 'up', text: 'up', price: 'swing', sticker: 'swing', footer: 'fade', stagger: 0.12, pace: 1.2, idle: 'sway', accent: 'wiggle', camera: 'none' },
  { key: 'beat', name: 'Heartbeat', photo: 'zoom', text: 'fade', price: 'pop', sticker: 'pop', footer: 'fade', stagger: 0.1, pace: 0.9, idle: 'breathe', accent: 'both', camera: 'none' },
  { key: 'flip', name: 'Flip', photo: 'flip', text: 'flip', price: 'flip', sticker: 'flip', footer: 'fade', stagger: 0.14, pace: 1, idle: 'none', accent: 'pulse', camera: 'in' },
  { key: 'whip', name: 'Whip', photo: 'right', text: 'right', price: 'right', sticker: 'right', footer: 'right', stagger: 0.07, pace: 0.6, idle: 'none', accent: 'both', camera: 'none' },
  { key: 'cascade', name: 'Cascade', photo: 'down', text: 'down', price: 'down', sticker: 'down', footer: 'down', stagger: 0.2, pace: 1, idle: 'float', accent: 'none', camera: 'none' },
  { key: 'closeup', name: 'Slow close-up', photo: 'fade', text: 'up', price: 'fade', sticker: 'fade', footer: 'fade', stagger: 0.18, pace: 1.4, idle: 'grow', accent: 'none', camera: 'in' },
  { key: 'reveal', name: 'Photo first', photo: 'zoom', text: 'wipe', price: 'pop', sticker: 'spin', footer: 'up', stagger: 0.22, pace: 1.1, idle: 'sway', accent: 'pulse', camera: 'out' },
  { key: 'party', name: 'Party', photo: 'spin', text: 'pop', price: 'drop', sticker: 'swing', footer: 'up', stagger: 0.1, pace: 0.9, idle: 'float', accent: 'both', camera: 'none' },
  { key: 'elegant', name: 'Elegant', photo: 'fade', text: 'wipe', price: 'fade', sticker: 'fade', footer: 'fade', stagger: 0.34, pace: 1.6, idle: 'grow', accent: 'none', camera: 'out' },
  { key: 'stamp', name: 'Stamp', photo: 'up', text: 'fade', price: 'shrink', sticker: 'shrink', footer: 'fade', stagger: 0.12, pace: 0.8, idle: 'none', accent: 'wiggle', camera: 'none' },
  { key: 'tumble', name: 'Tumble', photo: 'swing', text: 'left', price: 'spin', sticker: 'drop', footer: 'fade', stagger: 0.14, pace: 1.1, idle: 'sway', accent: 'pulse', camera: 'none' },
  { key: 'curtain', name: 'Curtain', photo: 'down', text: 'up', price: 'up', sticker: 'pop', footer: 'up', stagger: 0.12, pace: 1.1, idle: 'breathe', accent: 'pulse', camera: 'in' },
  { key: 'burst', name: 'Burst', photo: 'pop', text: 'zoom', price: 'pop', sticker: 'spin', footer: 'zoom', stagger: 0.08, pace: 0.7, idle: 'breathe', accent: 'both', camera: 'out' },
  // The advanced set (owner, 2026-11-17).
  { key: 'glide', name: 'Glide', photo: 'glide', text: 'glide', price: 'glide', sticker: 'pop', footer: 'fade', stagger: 0.12, pace: 1, idle: 'orbit', accent: 'pulse', camera: 'in' },
  { key: 'slam', name: 'Slam', photo: 'slam', text: 'slam', price: 'slam', sticker: 'slam', footer: 'fade', stagger: 0.14, pace: 0.9, idle: 'none', accent: 'both', camera: 'none' },
  { key: 'unfold', name: 'Unfold', photo: 'unfold', text: 'unfold', price: 'unfold', sticker: 'pop', footer: 'unfold', stagger: 0.12, pace: 1, idle: 'breathe', accent: 'pulse', camera: 'none' },
  { key: 'tilt', name: 'Tilt in', photo: 'tilt', text: 'tilt', price: 'tilt', sticker: 'swing', footer: 'up', stagger: 0.12, pace: 1.1, idle: 'bob', accent: 'wiggle', camera: 'none' },
  { key: 'jelly', name: 'Jelly', photo: 'elastic', text: 'elastic', price: 'elastic', sticker: 'elastic', footer: 'fade', stagger: 0.12, pace: 1.2, idle: 'breathe', accent: 'both', camera: 'none' },
  { key: 'rise-up', name: 'Rise up', photo: 'wipeup', text: 'wipeup', price: 'wipeup', sticker: 'pop', footer: 'wipeup', stagger: 0.18, pace: 1.1, idle: 'float', accent: 'none', camera: 'in' },
  { key: 'showtime', name: 'Showtime', photo: 'slam', text: 'unfold', price: 'elastic', sticker: 'spin', footer: 'up', stagger: 0.14, pace: 1, idle: 'bob', accent: 'both', camera: 'out' },
  { key: 'gentle', name: 'Gentle drift', photo: 'glide', text: 'wipeup', price: 'fade', sticker: 'fade', footer: 'fade', stagger: 0.24, pace: 1.4, idle: 'orbit', accent: 'none', camera: 'in' },
  { key: 'magazine', name: 'Magazine', photo: 'unfold', text: 'wipeup', price: 'wipe', sticker: 'tilt', footer: 'fade', stagger: 0.26, pace: 1.3, idle: 'grow', accent: 'none', camera: 'out' },
  { key: 'rocket', name: 'Rocket', photo: 'up', text: 'glide', price: 'slam', sticker: 'elastic', footer: 'up', stagger: 0.08, pace: 0.7, idle: 'float', accent: 'pulse', camera: 'out' },
  { key: 'grand', name: 'Grand reveal', photo: 'zoom', text: 'unfold', price: 'slam', sticker: 'spin', footer: 'wipeup', stagger: 0.2, pace: 1.2, idle: 'grow', accent: 'pulse', camera: 'in' },
  { key: 'playful', name: 'Playful', photo: 'elastic', text: 'tilt', price: 'drop', sticker: 'swing', footer: 'glide', stagger: 0.12, pace: 1, idle: 'bob', accent: 'wiggle', camera: 'none' },
];

export const MOTION_SECONDS = [4, 6, 8];

export function motionOf(key: string): Motion | null {
  return MOTIONS.find((m) => m.key === key) ?? null;
}

export const PART_NAMES: Record<PartKey, string> = {
  kicker: 'Small line above',
  tagline: 'Line below',
  price: 'Price',
  was: 'Old price',
  badge: 'Sticker',
  cta: 'Order button',
  cta2: 'Second button',
  phone: 'Phone number',
  website: 'Website',
  logo: 'Logo',
  qr: 'QR code',
};

export const PART_ORDER: PartKey[] = ['price', 'was', 'badge', 'cta', 'cta2', 'phone', 'website', 'logo', 'qr', 'kicker', 'tagline'];

export function blankSpec(brand?: { name?: string; phone?: string; website?: string; order_url?: string }): PostSpec {
  return {
    headline: '', kicker: '', tagline: '', price: '', was: '', badge: '', cta: 'Order now', cta2: '', ctaStyle: 'auto', motion: '',
    phone: brand?.phone ?? '', website: brand?.website ?? '', link: brand?.order_url ?? '',
    photo: '', cutout: false, brand: brand?.name ?? 'Bake & Grill', itemId: null,
    show: { kicker: false, tagline: false, price: true, was: false, badge: false, cta: true, cta2: false, phone: true, website: false, logo: true, qr: false },
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
