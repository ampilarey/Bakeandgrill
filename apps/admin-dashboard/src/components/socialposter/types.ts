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
  /** The words that go under the post when it is shared, when someone wrote their own (or the assistant drafted them); '' is the plain one made from the picture's words. Never drawn on the picture. */
  caption?: string;
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
  /** Which group of colours it is shown in (`COLOUR_GROUPS`). */
  group?: string;
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


/** A colour from three: the ground, the second colour and the highlight, each with words that read on it. */
function pal(key: string, name: string, group: string, bg: string, alt: string, pop: string): Palette {
  const on = (c: string) => (darkHex(c) ? '#FFF8F0' : '#1A1410');
  return { key, name, group, bg, ink: on(bg), alt, altInk: on(alt), pop, popInk: on(pop) };
}

function darkHex(hex: string): boolean {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/** The groups the colours are shown in, in order. */
export const COLOUR_GROUPS: Array<{ key: string; name: string }> = [
  { key: 'warm', name: 'Warm' },
  { key: 'bright', name: 'Bright and bold' },
  { key: 'soft', name: 'Soft and pastel' },
  { key: 'dark', name: 'Dark and rich' },
  { key: 'fresh', name: 'Fresh and natural' },
  { key: 'cool', name: 'Cool and calm' },
  { key: 'mono', name: 'Black, white and gold' },
];

/** The hundred colours (owner, 2026-11-17: "Make it 100 each. And group for easy use"). */
const MORE_PALETTES: Palette[] = [
  pal('mango', 'Mango', 'warm', '#FFF1D6', '#F28C1E', '#7A1F0E'),
  pal('paprika', 'Paprika', 'warm', '#FBE9DF', '#C2391B', '#F2B134'),
  pal('cinnamon', 'Cinnamon', 'warm', '#F3E3D3', '#9C4A1A', '#2E1A0F'),
  pal('apricot', 'Apricot', 'warm', '#FFE8CC', '#F08A4B', '#4A2511'),
  pal('chai', 'Chai', 'warm', '#EFE0CC', '#A5672E', '#3A2414'),
  pal('pumpkin', 'Pumpkin', 'warm', '#FFF0E0', '#E2611B', '#2B1A12'),
  pal('amber', 'Amber', 'warm', '#FFF6E0', '#D98E04', '#6B2D0A'),
  pal('brick', 'Brick', 'warm', '#F5E6DC', '#A23B24', '#E9B949'),
  pal('caramel', 'Caramel', 'warm', '#F6E7D2', '#C07A2C', '#3B2414'),
  pal('sandstone', 'Sandstone', 'warm', '#EADBC8', '#B5652B', '#2F4858'),
  pal('lemon', 'Lemon', 'bright', '#FFF35C', '#1A1A1A', '#FF3D7F'),
  pal('tomato', 'Tomato', 'bright', '#FF4B3A', '#FFE9D6', '#1F1F1F'),
  pal('electric', 'Electric blue', 'bright', '#2B2BFF', '#FFE600', '#FF5FA2'),
  pal('lime', 'Lime', 'bright', '#D7FF3A', '#121212', '#FF5A1F'),
  pal('magenta', 'Magenta', 'bright', '#E6007E', '#FFE14D', '#1A0A12'),
  pal('cyan', 'Cyan', 'bright', '#00C2D1', '#102A30', '#FFD23F'),
  pal('flame', 'Flame', 'bright', '#FF5A00', '#FFF2E0', '#2A0E00'),
  pal('grape', 'Grape', 'bright', '#6A1B9A', '#FFC93C', '#FF6F91'),
  pal('watermelon', 'Watermelon', 'bright', '#FF5E78', '#1E6B3A', '#FFF1F3'),
  pal('cobalt', 'Cobalt', 'bright', '#0047AB', '#FFB627', '#FFFFFF'),
  pal('rose', 'Rose', 'soft', '#FDE8EC', '#E07A8B', '#5A2330'),
  pal('lavender', 'Lavender', 'soft', '#EFEAFB', '#8C7AE6', '#2E2350'),
  pal('butter', 'Butter', 'soft', '#FFF7D1', '#E6B800', '#4A3B00'),
  pal('seafoam', 'Seafoam', 'soft', '#E3F6EF', '#5FBF9F', '#1E4A3D'),
  pal('powder', 'Powder blue', 'soft', '#E8F1FB', '#6FA3D8', '#1C3550'),
  pal('lilac', 'Lilac', 'soft', '#F5E9F7', '#B57BC4', '#3E1F48'),
  pal('creamsicle', 'Creamsicle', 'soft', '#FFF1E6', '#FF9F6B', '#4A2A18'),
  pal('pistachio', 'Pistachio', 'soft', '#EFF6E4', '#9CC36B', '#33441C'),
  pal('blossom', 'Blossom', 'soft', '#FFF0F3', '#F49AB0', '#6A2236'),
  pal('sorbet', 'Sorbet', 'soft', '#FFEDE1', '#FF8C94', '#3E7C6E'),
  pal('obsidian', 'Obsidian', 'dark', '#0E0E10', '#E63946', '#F1FAEE'),
  pal('forest', 'Forest', 'dark', '#102A1E', '#3F7D4E', '#F2C94C'),
  pal('navy', 'Navy', 'dark', '#0F1C3F', '#E9C46A', '#F4A261'),
  pal('burgundy', 'Burgundy', 'dark', '#3B0A1A', '#C9A227', '#F5E6C4'),
  pal('slate', 'Slate', 'dark', '#1F2933', '#F0B429', '#E12D39'),
  pal('mocha', 'Mocha', 'dark', '#2C1B12', '#D9A066', '#FFF1E0'),
  pal('emerald', 'Emerald', 'dark', '#06302B', '#10B981', '#FDE68A'),
  pal('aubergine', 'Aubergine', 'dark', '#2A0F2E', '#E86A92', '#FFD166'),
  pal('ink', 'Ink', 'dark', '#111827', '#60A5FA', '#FBBF24'),
  pal('truffle', 'Truffle', 'dark', '#1E1410', '#B08D57', '#F3E9DC'),
  pal('herb', 'Herb', 'fresh', '#F1F7EA', '#4C8C3A', '#E85D2A'),
  pal('avocado', 'Avocado', 'fresh', '#EEF3E0', '#6B8E23', '#3D2B1F'),
  pal('citrus', 'Citrus', 'fresh', '#FFFBE6', '#F2A900', '#2F7A3D'),
  pal('garden', 'Garden', 'fresh', '#EAF4E4', '#2E7D32', '#FFB300'),
  pal('coconut', 'Coconut', 'fresh', '#FBF8F1', '#6D4C41', '#43A047'),
  pal('basil', 'Basil', 'fresh', '#F4F9F2', '#1B5E20', '#E53935'),
  pal('cucumber', 'Cucumber', 'fresh', '#E8F5E9', '#66BB6A', '#1B3A1F'),
  pal('papaya', 'Papaya', 'fresh', '#FFF3E8', '#FF7F50', '#2E7D32'),
  pal('kiwi', 'Kiwi', 'fresh', '#F3F9E3', '#8BC34A', '#4E342E'),
  pal('tropical', 'Tropical', 'fresh', '#E6FAF5', '#00A884', '#FF6B4A'),
  pal('ice', 'Ice', 'cool', '#F0F7FF', '#3A86FF', '#FF006E'),
  pal('harbour', 'Harbour', 'cool', '#E8F0F2', '#2A6F97', '#F4A259'),
  pal('teal', 'Teal', 'cool', '#E0F2F1', '#00796B', '#FFB74D'),
  pal('denim', 'Denim', 'cool', '#E7EEF7', '#3B5B92', '#F2C14E'),
  pal('glacier', 'Glacier', 'cool', '#EEF7FA', '#48A9C5', '#20323A'),
  pal('aqua', 'Aqua', 'cool', '#E0F7FA', '#00ACC1', '#FF7043'),
  pal('storm', 'Storm', 'cool', '#DDE3EA', '#3D5A80', '#EE6C4D'),
  pal('maldives', 'Maldives blue', 'cool', '#E6F9FB', '#0096C7', '#FFD166'),
  pal('mist', 'Mist', 'cool', '#F1F4F8', '#6C8EAD', '#2B2D42'),
  pal('graphite', 'Graphite', 'mono', '#2B2B2B', '#F5F5F5', '#FF4D2E'),
  pal('newsprint', 'Newsprint', 'mono', '#F4F1EA', '#1C1C1C', '#D62828'),
  pal('silver', 'Silver', 'mono', '#E9ECEF', '#343A40', '#F77F00'),
  pal('noir', 'Noir and gold', 'mono', '#000000', '#FFFFFF', '#D4AF37'),
  pal('smoke', 'Smoke', 'mono', '#D9D9D9', '#1A1A1A', '#E4572E'),
  pal('ivory', 'Ivory', 'mono', '#FFFFF0', '#2B2B2B', '#B74B0C'),
  pal('carbon', 'Carbon', 'mono', '#161616', '#444444', '#00E0A4'),
  pal('pearl', 'Pearl', 'mono', '#F8F6F2', '#8A8178', '#1E1E1E'),
  pal('ash', 'Ash', 'mono', '#CFCFCF', '#2E2E2E', '#FFD60A'),
];

export const PALETTES: Palette[] = [
  { key: 'rust', name: 'Bake & Grill', group: 'warm', bg: '#FFF8EC', ink: '#1C1408', alt: '#B74B0C', altInk: '#FFF8EC', pop: '#E3A51B', popInk: '#1C1408' },
  { key: 'ember', name: 'Ember', group: 'dark', bg: '#1C1408', ink: '#FFF8EC', alt: '#B74B0C', altInk: '#FFF8EC', pop: '#F2B632', popInk: '#1C1408' },
  { key: 'bee', name: 'Black and yellow', group: 'bright', bg: '#0B0B0B', ink: '#FFFFFF', alt: '#FFD60A', altInk: '#0B0B0B', pop: '#FFD60A', popInk: '#0B0B0B' },
  { key: 'sunny', name: 'Sunny', group: 'bright', bg: '#FFD60A', ink: '#0B0B0B', alt: '#0B0B0B', altInk: '#FFD60A', pop: '#FFFFFF', popInk: '#0B0B0B' },
  { key: 'chilli', name: 'Chilli', group: 'bright', bg: '#B3171E', ink: '#FFFFFF', alt: '#FFC93C', altInk: '#5A0A0E', pop: '#FFC93C', popInk: '#5A0A0E' },
  { key: 'leaf', name: 'Fresh', group: 'fresh', bg: '#F3F7EC', ink: '#1D2B1F', alt: '#2F6B3A', altInk: '#FFFFFF', pop: '#F2A922', popInk: '#1D2B1F' },
  { key: 'cocoa', name: 'Cocoa', group: 'dark', bg: '#3B2416', ink: '#FFF3E2', alt: '#F2D9B8', altInk: '#3B2416', pop: '#F2A65A', popInk: '#3B2416' },
  { key: 'blush', name: 'Blush', group: 'soft', bg: '#FFE9E0', ink: '#3A1A10', alt: '#D9531E', altInk: '#FFFFFF', pop: '#3A1A10', popInk: '#FFE9E0' },
  { key: 'night', name: 'Night', group: 'dark', bg: '#10131C', ink: '#FFFFFF', alt: '#FF7A1A', altInk: '#10131C', pop: '#FFD166', popInk: '#10131C' },
  { key: 'paper', name: 'Paper', group: 'mono', bg: '#FBF6EA', ink: '#2B2117', alt: '#2B2117', altInk: '#FBF6EA', pop: '#B74B0C', popInk: '#FFFFFF' },
  { key: 'mint', name: 'Mint', group: 'fresh', bg: '#E8F6F0', ink: '#12332A', alt: '#1F8A70', altInk: '#FFFFFF', pop: '#FF7A59', popInk: '#FFFFFF' },
  { key: 'royal', name: 'Royal', group: 'bright', bg: '#1B1464', ink: '#FFFFFF', alt: '#F9C80E', altInk: '#1B1464', pop: '#FF4D6D', popInk: '#FFFFFF' },
  { key: 'coral', name: 'Coral', group: 'warm', bg: '#FF6B5B', ink: '#FFFFFF', alt: '#2B1B17', altInk: '#FFE8D6', pop: '#FFE066', popInk: '#2B1B17' },
  { key: 'sky', name: 'Sky', group: 'cool', bg: '#EAF4FF', ink: '#102A43', alt: '#1F6FEB', altInk: '#FFFFFF', pop: '#FFB703', popInk: '#102A43' },
  { key: 'plum', name: 'Plum', group: 'dark', bg: '#2D1B33', ink: '#FCEFF9', alt: '#C84B9B', altInk: '#FFFFFF', pop: '#FFD23F', popInk: '#2D1B33' },
  { key: 'olive', name: 'Olive', group: 'fresh', bg: '#F4F1DE', ink: '#2F3E1E', alt: '#606C38', altInk: '#FEFAE0', pop: '#BC6C25', popInk: '#FFFFFF' },
  { key: 'candy', name: 'Candy', group: 'soft', bg: '#FFF0F5', ink: '#4A1230', alt: '#FF4F8B', altInk: '#FFFFFF', pop: '#2EC4B6', popInk: '#05312D' },
  { key: 'mono', name: 'Black and white', group: 'mono', bg: '#FFFFFF', ink: '#111111', alt: '#111111', altInk: '#FFFFFF', pop: '#E63946', popInk: '#FFFFFF' },
  { key: 'gold', name: 'Black and gold', group: 'mono', bg: '#0F0F0F', ink: '#F5E6C4', alt: '#C9A227', altInk: '#0F0F0F', pop: '#F5E6C4', popInk: '#0F0F0F' },
  { key: 'tangerine', name: 'Tangerine', group: 'warm', bg: '#FF8C1A', ink: '#1C1408', alt: '#FFF3E0', altInk: '#1C1408', pop: '#1C1408', popInk: '#FFF3E0' },
  // The advanced set (owner, 2026-11-17).
  { key: 'terracotta', name: 'Terracotta', group: 'warm', bg: '#F6E7DA', ink: '#3A1F12', alt: '#C0582E', altInk: '#FFF6EE', pop: '#2F4B3A', popInk: '#F6E7DA' },
  { key: 'saffron', name: 'Saffron', group: 'warm', bg: '#FFF4D6', ink: '#3B2600', alt: '#E8900C', altInk: '#FFFFFF', pop: '#8C1C13', popInk: '#FFF4D6' },
  { key: 'matcha', name: 'Matcha', group: 'fresh', bg: '#EEF2E2', ink: '#24321C', alt: '#7A9A3A', altInk: '#FFFFFF', pop: '#3B2A1A', popInk: '#EEF2E2' },
  { key: 'espresso', name: 'Espresso', group: 'dark', bg: '#241812', ink: '#F7E9D7', alt: '#8A5A3C', altInk: '#FFF4E6', pop: '#E9C46A', popInk: '#241812' },
  { key: 'berry', name: 'Berry', group: 'dark', bg: '#3A0D2E', ink: '#FFEAF4', alt: '#D7266B', altInk: '#FFFFFF', pop: '#FFB4A2', popInk: '#3A0D2E' },
  { key: 'lagoon', name: 'Lagoon', group: 'cool', bg: '#E6F7F7', ink: '#0B3B3C', alt: '#0E8C8F', altInk: '#FFFFFF', pop: '#FF8A5B', popInk: '#FFFFFF' },
  { key: 'sunset', name: 'Sunset', group: 'bright', bg: '#2A1640', ink: '#FFF0E6', alt: '#FF6B3D', altInk: '#FFFFFF', pop: '#FFC94A', popInk: '#2A1640' },
  { key: 'charcoal', name: 'Charcoal and lime', group: 'mono', bg: '#1E2124', ink: '#F2F4F3', alt: '#3A3F44', altInk: '#F2F4F3', pop: '#C6F432', popInk: '#1E2124' },
  { key: 'cream', name: 'Cream and teal', group: 'cool', bg: '#FFF9EF', ink: '#173A3A', alt: '#1F6F6B', altInk: '#FFF9EF', pop: '#F28C28', popInk: '#FFFFFF' },
  { key: 'wine', name: 'Wine', group: 'dark', bg: '#4A0E1A', ink: '#FBEFE8', alt: '#8E1B32', altInk: '#FBEFE8', pop: '#D4AF37', popInk: '#2A0810' },
  { key: 'peach', name: 'Peach', group: 'soft', bg: '#FFE5D4', ink: '#4A2416', alt: '#FF8A65', altInk: '#FFFFFF', pop: '#4A2416', popInk: '#FFE5D4' },
  { key: 'ocean', name: 'Deep ocean', group: 'cool', bg: '#0B1E33', ink: '#EAF6FF', alt: '#1A5E8A', altInk: '#EAF6FF', pop: '#5FE1D9', popInk: '#0B1E33' },
  ...MORE_PALETTES,
];

export interface LayoutInfo { key: string; name: string; group?: string }

/** The groups the designs are shown in, in order. */
export const DESIGN_GROUPS: Array<{ key: string; name: string }> = [
  { key: 'classic', name: 'Classic' },
  { key: 'bold', name: 'Bold and loud' },
  { key: 'photo', name: 'Photo first' },
  { key: 'fun', name: 'Fun and party' },
  { key: 'night', name: 'Night and glow' },
  { key: 'modern', name: 'Modern and clean' },
  { key: 'pattern', name: 'Patterns' },
];

/** The layouts, in the order they are offered; each is drawn by `LAYOUT_DRAW` in draw.ts. */
export const LAYOUTS: LayoutInfo[] = [
  { key: 'splash', name: 'Splash', group: 'classic' },
  { key: 'spotlight', name: 'Spotlight', group: 'classic' },
  { key: 'diagonal', name: 'Diagonal', group: 'bold' },
  { key: 'photo', name: 'Full photo', group: 'photo' },
  { key: 'frame', name: 'Snapshot', group: 'classic' },
  { key: 'bigtype', name: 'Big words', group: 'bold' },
  { key: 'band', name: 'Wave', group: 'modern' },
  { key: 'sticker', name: 'Stickers', group: 'bold' },
  { key: 'arch', name: 'Arch', group: 'classic' },
  { key: 'side', name: 'Side band', group: 'classic' },
  { key: 'block', name: 'Half and half', group: 'classic' },
  { key: 'bigcircle', name: 'Big circle', group: 'photo' },
  { key: 'ticket', name: 'Ticket', group: 'fun' },
  { key: 'glow', name: 'Glow', group: 'night' },
  { key: 'bands', name: 'Three bands', group: 'modern' },
  { key: 'tilt', name: 'Tilted card', group: 'photo' },
  { key: 'corners', name: 'Corners', group: 'photo' },
  { key: 'editorial', name: 'Magazine', group: 'classic' },
  { key: 'starburst', name: 'Starburst', group: 'bold' },
  { key: 'ribbon', name: 'Ribbon', group: 'modern' },
  { key: 'stamp', name: 'Stamp', group: 'fun' },
  { key: 'picnic', name: 'Picnic', group: 'fun' },
  { key: 'chalk', name: 'Chalkboard', group: 'night' },
  { key: 'neon', name: 'Neon', group: 'night' },
  { key: 'target', name: 'Rings', group: 'modern' },
  { key: 'zigzag', name: 'Zigzag', group: 'bold' },
  { key: 'confetti', name: 'Confetti', group: 'fun' },
  { key: 'sunrise', name: 'Sunrise', group: 'modern' },
  { key: 'capsule', name: 'Pill', group: 'fun' },
  { key: 'popart', name: 'Pop art', group: 'bold' },
  { key: 'waves', name: 'Waves', group: 'modern' },
  { key: 'scallop', name: 'Doily', group: 'fun' },
  // The advanced set (owner, 2026-11-17: "more advanced design").
  { key: 'aurora', name: 'Aurora glass', group: 'modern' },
  { key: 'glass', name: 'Frosted photo', group: 'photo' },
  { key: 'echo', name: 'Echo letters', group: 'bold' },
  { key: 'swiss', name: 'Modern grid', group: 'modern' },
  { key: 'polaroid', name: 'Photo prints', group: 'photo' },
  { key: 'orbit', name: 'Orbit', group: 'night' },
  { key: 'bunting', name: 'Party flags', group: 'fun' },
  { key: 'halftone', name: 'Halftone', group: 'bold' },
  { key: 'stage', name: 'Stage lights', group: 'night' },
  { key: 'bistro', name: 'Bistro menu', group: 'classic' },
  { key: 'steam', name: 'Hot and steamy', group: 'night' },
  { key: 'marquee', name: 'Marquee lights', group: 'night' },
  // Built from parts (owner, 2026-11-17: "Make it 100 each"); drawn by `RECIPES` in draw.ts.
  { key: 'cafe-ring', name: 'Café ring', group: 'classic' },
  { key: 'plate', name: 'On the plate', group: 'classic' },
  { key: 'framed', name: 'Framed', group: 'classic' },
  { key: 'arch-window', name: 'Arch window', group: 'classic' },
  { key: 'menu-board', name: 'Menu board', group: 'classic' },
  { key: 'heritage', name: 'Heritage', group: 'classic' },
  { key: 'homestyle', name: 'Homestyle', group: 'classic' },
  { key: 'linen', name: 'Linen', group: 'classic' },
  { key: 'seal-burst', name: 'Big seal', group: 'bold' },
  { key: 'split-pop', name: 'Split pop', group: 'bold' },
  { key: 'loud-band', name: 'Loud band', group: 'bold' },
  { key: 'big-blob', name: 'Big blob', group: 'bold' },
  { key: 'corner-pop', name: 'Corner pop', group: 'bold' },
  { key: 'shout', name: 'Shout', group: 'bold' },
  { key: 'triangle-pop', name: 'Sharp shapes', group: 'bold' },
  { key: 'brush-bold', name: 'Brush bold', group: 'bold' },
  { key: 'photo-square', name: 'Square photo', group: 'photo' },
  { key: 'photo-card', name: 'Photo card', group: 'photo' },
  { key: 'photo-tilt', name: 'Tilted photo', group: 'photo' },
  { key: 'photo-arch', name: 'Photo arch', group: 'photo' },
  { key: 'photo-glow', name: 'Glowing photo', group: 'photo' },
  { key: 'photo-shadow', name: 'Shadow photo', group: 'photo' },
  { key: 'photo-plate', name: 'Big plate', group: 'photo' },
  { key: 'photo-frame', name: 'Gallery frame', group: 'photo' },
  { key: 'confetti-seal', name: 'Party seal', group: 'fun' },
  { key: 'bubbles', name: 'Bubbles', group: 'fun' },
  { key: 'sweet-scallop', name: 'Sweet scallop', group: 'fun' },
  { key: 'gingham-fun', name: 'Gingham', group: 'fun' },
  { key: 'wavy-fun', name: 'Wavy', group: 'fun' },
  { key: 'blob-party', name: 'Blob party', group: 'fun' },
  { key: 'sprinkles', name: 'Sprinkles', group: 'fun' },
  { key: 'happy-tilt', name: 'Happy tilt', group: 'fun' },
  { key: 'night-ring', name: 'Night ring', group: 'night' },
  { key: 'night-glow', name: 'Night glow', group: 'night' },
  { key: 'midnight-grid', name: 'Midnight grid', group: 'night' },
  { key: 'starry', name: 'Night stars', group: 'night' },
  { key: 'night-arch', name: 'Night arch', group: 'night' },
  { key: 'ember-glow', name: 'Ember', group: 'night' },
  { key: 'night-blob', name: 'Lava', group: 'night' },
  { key: 'velvet', name: 'Velvet', group: 'night' },
  { key: 'clean-split', name: 'Clean split', group: 'modern' },
  { key: 'mono-grid', name: 'Mono grid', group: 'modern' },
  { key: 'soft-blob', name: 'Soft shapes', group: 'modern' },
  { key: 'hex-modern', name: 'Hexagon', group: 'modern' },
  { key: 'arcs-modern', name: 'Arcs', group: 'modern' },
  { key: 'minimal', name: 'Minimal', group: 'modern' },
  { key: 'gradient-glow', name: 'Soft glow', group: 'modern' },
  { key: 'card-stack', name: 'Card stack', group: 'modern' },
  { key: 'polka', name: 'Polka dots', group: 'pattern' },
  { key: 'pinstripe', name: 'Pinstripe', group: 'pattern' },
  { key: 'checkered', name: 'Checks', group: 'pattern' },
  { key: 'honeycomb', name: 'Honeycomb', group: 'pattern' },
  { key: 'ripple', name: 'Ripple', group: 'pattern' },
  { key: 'terrazzo', name: 'Terrazzo', group: 'pattern' },
  { key: 'sunburst', name: 'Sunburst', group: 'pattern' },
  { key: 'brushwork', name: 'Brushwork', group: 'pattern' },
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
  /** Which group of ready-made posts it is shown in (`TEMPLATE_GROUPS`). */
  group?: string;
  layout: string;
  palette: string;
  show: Partial<Record<PartKey, boolean>>;
  words: Partial<Pick<PostSpec, 'kicker' | 'tagline' | 'badge' | 'cta' | 'cta2'>>;
}

/** The groups the ready-made posts are shown in, in order. */
export const TEMPLATE_GROUPS: Array<{ key: string; name: string }> = [
  { key: 'offers', name: 'Offers and deals' },
  { key: 'new', name: 'New and launches' },
  { key: 'food', name: 'Food and drinks' },
  { key: 'time', name: 'Times of day' },
  { key: 'occasions', name: 'Occasions' },
  { key: 'service', name: 'Ordering and service' },
  { key: 'brand', name: 'About us' },
];

type Words = PostTemplate['words'];
type Show = PostTemplate['show'];
function tpl(key: string, name: string, group: string, layout: string, palette: string, show: Show, words: Words): PostTemplate {
  return { key, name, group, layout, palette, show, words: { cta: 'Order now', ...words } };
}

/** Seventy more (owner, 2026-11-17: "Make it 100 each"). The words are a start; every one is changed on the post. */
const MORE_TEMPLATES: PostTemplate[] = [
  tpl('bogo', 'Buy 1 get 1', 'offers', 'seal-burst', 'chilli', { badge: true, was: false }, { badge: 'Buy 1 Get 1' }),
  tpl('half-price', 'Half price', 'offers', 'shout', 'sunny', { badge: true, was: true }, { badge: '50% OFF' }),
  tpl('flash-sale', 'Flash sale', 'offers', 'split-pop', 'electric', { kicker: true, badge: true }, { kicker: 'Flash sale', badge: 'Today only' }),
  tpl('student', 'Student deal', 'offers', 'polka', 'lemon', { kicker: true, badge: true }, { kicker: 'Student deal', badge: 'Show your ID' }),
  tpl('lunch-deal', 'Lunch deal', 'offers', 'loud-band', 'tomato', { kicker: true, was: true }, { kicker: 'Lunch deal' }),
  tpl('free-drink', 'Free drink', 'offers', 'corner-pop', 'cobalt', { badge: true }, { badge: 'Free drink' }),
  tpl('loyalty', 'Collect points', 'offers', 'mono-grid', 'mango', { kicker: true, tagline: true }, { kicker: 'Earn points', tagline: 'Every order earns you rewards' }),
  tpl('bundle', 'Bundle', 'offers', 'checkered', 'saffron', { badge: true, was: true }, { badge: 'Bundle' }),
  tpl('last-chance', 'Last chance', 'offers', 'brush-bold', 'flame', { kicker: true, badge: true }, { kicker: 'Last chance', badge: 'Limited stock' }),
  tpl('two-for-one', 'Two for one', 'offers', 'triangle-pop', 'magenta', { badge: true }, { badge: '2 for 1' }),
  tpl('coming-soon', 'Coming soon', 'new', 'night-glow', 'aubergine', { kicker: true, price: false }, { kicker: 'Coming soon', cta: 'Follow us' }),
  tpl('now-open', 'Now open', 'new', 'confetti-seal', 'candy', { kicker: true }, { kicker: 'Now open' }),
  tpl('new-look', 'New look', 'new', 'minimal', 'ice', { kicker: true }, { kicker: 'Same taste, new look' }),
  tpl('just-arrived', 'Just arrived', 'new', 'photo-card', 'citrus', { kicker: true, badge: true }, { kicker: 'Just arrived', badge: 'New' }),
  tpl('limited-edition', 'Limited edition', 'new', 'velvet', 'burgundy', { kicker: true }, { kicker: 'Limited edition' }),
  tpl('seasonal', 'Seasonal special', 'new', 'ripple', 'papaya', { kicker: true }, { kicker: 'Seasonal special' }),
  tpl('new-size', 'New size', 'new', 'photo-square', 'harbour', { kicker: true }, { kicker: 'Now in a new size' }),
  tpl('its-back', "It's back", 'new', 'sunburst', 'amber', { kicker: true }, { kicker: "It's back" }),
  tpl('sneak-peek', 'Sneak peek', 'new', 'photo-glow', 'obsidian', { kicker: true, price: false }, { kicker: 'Sneak peek', cta: 'Follow us' }),
  tpl('new-menu', 'New menu', 'new', 'framed', 'cream', { kicker: true }, { kicker: 'Our new menu', cta: 'See the menu' }),
  tpl('burger', 'Burgers', 'food', 'big-blob', 'brick', { kicker: true }, { kicker: 'Juicy and grilled' }),
  tpl('pizza', 'Pizza', 'food', 'homestyle', 'paprika', { kicker: true }, { kicker: 'Hot from the oven' }),
  tpl('short-eats', 'Short eats', 'food', 'gingham-fun', 'mango', { kicker: true, tagline: true }, { kicker: 'Short eats', tagline: 'Hedhikaa for every craving' }),
  tpl('drinks', 'Cool drinks', 'food', 'wavy-fun', 'aqua', { kicker: true }, { kicker: 'Cool drinks' }),
  tpl('dessert', 'Dessert', 'food', 'sweet-scallop', 'blossom', { kicker: true }, { kicker: 'Something sweet' }),
  tpl('coffee', 'Coffee', 'food', 'plate', 'mocha', { kicker: true }, { kicker: 'Freshly brewed' }),
  tpl('grill', 'From the grill', 'food', 'ember-glow', 'truffle', { kicker: true }, { kicker: 'From the grill' }),
  tpl('healthy', 'Healthy choice', 'food', 'soft-blob', 'herb', { kicker: true }, { kicker: 'Fresh and light' }),
  tpl('seafood', 'Seafood', 'food', 'honeycomb', 'maldives', { kicker: true }, { kicker: 'Fresh from the sea' }),
  tpl('cakes', 'Cakes', 'food', 'sprinkles', 'rose', { kicker: true }, { kicker: 'Cakes for every day' }),
  tpl('morning-coffee', 'Morning coffee', 'time', 'cafe-ring', 'butter', { kicker: true }, { kicker: 'Good morning' }),
  tpl('lunch-time', 'Lunch time', 'time', 'clean-split', 'lime', { kicker: true }, { kicker: "It's lunch time" }),
  tpl('tea-time', 'Tea time', 'time', 'heritage', 'chai', { kicker: true, tagline: true }, { kicker: 'Tea time', tagline: 'Short eats and hot tea' }),
  tpl('dinner', 'Dinner', 'time', 'night-arch', 'navy', { kicker: true }, { kicker: 'Dinner is served' }),
  tpl('midnight', 'Midnight snack', 'time', 'midnight-grid', 'ink', { kicker: true }, { kicker: 'Midnight snack' }),
  tpl('weekday', 'Weekday special', 'time', 'arcs-modern', 'denim', { kicker: true }, { kicker: 'Weekday special' }),
  tpl('friday', 'Friday special', 'time', 'starry', 'emerald', { kicker: true }, { kicker: 'Friday special' }),
  tpl('early-bird', 'Early bird', 'time', 'gradient-glow', 'apricot', { kicker: true, badge: true }, { kicker: 'Early bird', badge: '10% OFF' }),
  tpl('sunset-hour', 'Sunset hour', 'time', 'photo-arch', 'sunset', { kicker: true }, { kicker: 'Sunset hour' }),
  tpl('open-now', 'Open now', 'time', 'night-ring', 'forest', { kicker: true }, { kicker: 'Open now' }),
  tpl('eid', 'Eid Mubarak', 'occasions', 'framed', 'noir', { kicker: true, tagline: true, price: false }, { kicker: 'Eid Mubarak', tagline: 'Wishing you a blessed Eid' }),
  tpl('ramadan', 'Ramadan Kareem', 'occasions', 'night-arch', 'aubergine', { kicker: true }, { kicker: 'Ramadan Kareem' }),
  tpl('independence', 'Independence Day', 'occasions', 'loud-band', 'basil', { kicker: true }, { kicker: 'Happy Independence Day' }),
  tpl('national-day', 'National Day', 'occasions', 'heritage', 'basil', { kicker: true }, { kicker: 'Happy National Day' }),
  tpl('new-year', 'New Year', 'occasions', 'confetti-seal', 'noir', { kicker: true }, { kicker: 'Happy New Year' }),
  tpl('valentine', "Valentine's", 'occasions', 'bubbles', 'rose', { kicker: true }, { kicker: 'For someone special' }),
  tpl('mothers-day', "Mother's Day", 'occasions', 'sweet-scallop', 'lilac', { kicker: true }, { kicker: 'For Mum, with love' }),
  tpl('birthday', 'Birthday', 'occasions', 'sprinkles', 'candy', { kicker: true }, { kicker: 'Celebrate with us', cta: 'Order a cake' }),
  tpl('party-orders', 'Party orders', 'occasions', 'blob-party', 'watermelon', { kicker: true }, { kicker: 'Planning a party?', cta: 'Call to order' }),
  tpl('teachers-day', "Teachers' Day", 'occasions', 'pinstripe', 'powder', { kicker: true }, { kicker: "Happy Teachers' Day" }),
  tpl('we-deliver', 'We deliver', 'service', 'photo-tilt', 'cobalt', { kicker: true, cta2: true }, { kicker: 'We deliver', cta: 'Order online', cta2: 'Call us' }),
  tpl('pick-up', 'Order and pick up', 'service', 'photo-shadow', 'teal', { kicker: true }, { kicker: 'Order ahead, pick up' }),
  tpl('catering', 'Catering', 'service', 'photo-frame', 'ivory', { kicker: true, price: false }, { kicker: 'Catering for events', cta: 'Message us' }),
  tpl('book-table', 'Book a table', 'service', 'arch-window', 'wine', { kicker: true, price: false }, { kicker: 'Book your table', cta: 'Call us' }),
  tpl('order-app', 'Order on the app', 'service', 'card-stack', 'electric', { kicker: true, qr: true }, { kicker: 'Order on our app', cta: 'Scan to order' }),
  tpl('wholesale', 'Wholesale', 'service', 'mono-grid', 'silver', { kicker: true, price: false }, { kicker: 'For shops and cafés', cta: 'Message us' }),
  tpl('gift-cards', 'Gift cards', 'service', 'seal-burst', 'gold', { kicker: true, price: false }, { kicker: 'Gift cards', cta: 'Ask at the counter' }),
  tpl('message-order', 'Message to order', 'service', 'hex-modern', 'glacier', { kicker: true }, { kicker: 'Message us to order', cta: 'Message us' }),
  tpl('we-are-open', "We're open", 'service', 'menu-board', 'slate', { kicker: true, tagline: true }, { kicker: "We're open", tagline: 'See you soon' }),
  tpl('frozen-delivered', 'Frozen packs delivered', 'service', 'terrazzo', 'mist', { kicker: true }, { kicker: 'Frozen packs, delivered' }),
  tpl('thank-you', 'Thank you', 'brand', 'linen', 'pearl', { kicker: true, price: false }, { kicker: 'Thank you for choosing us' }),
  tpl('leave-review', 'Leave a review', 'brand', 'arcs-modern', 'sky', { kicker: true, price: false }, { kicker: 'Loved it? Tell us', cta: 'Leave a review' }),
  tpl('behind-scenes', 'Behind the scenes', 'brand', 'photo-glow', 'carbon', { kicker: true, price: false }, { kicker: 'Behind the scenes', cta: 'Follow us' }),
  tpl('our-story', 'Our story', 'brand', 'heritage', 'sandstone', { kicker: true, price: false }, { kicker: 'Our story' }),
  tpl('meet-team', 'Meet the team', 'brand', 'happy-tilt', 'peach', { kicker: true, price: false }, { kicker: 'Meet the team', cta: 'Follow us' }),
  tpl('made-fresh', 'Made fresh daily', 'brand', 'plate', 'coconut', { kicker: true }, { kicker: 'Made fresh every day' }),
  tpl('proudly-local', 'Proudly local', 'brand', 'brushwork', 'tropical', { kicker: true }, { kicker: 'Proudly Maldivian' }),
  tpl('hiring', "We're hiring", 'brand', 'clean-split', 'newsprint', { kicker: true, price: false }, { kicker: "We're hiring", cta: 'Message us' }),
  tpl('customer-words', 'What customers say', 'brand', 'framed', 'cream', { kicker: true, tagline: true, price: false }, { kicker: 'What customers say', tagline: 'Your words mean a lot to us' }),
  tpl('follow-us', 'Follow us', 'brand', 'polka', 'berry', { kicker: true, price: false }, { kicker: 'Follow us for more', cta: 'Follow us' }),
];

export const TEMPLATES: PostTemplate[] = [
  { key: 'new-dish', name: 'New dish', group: 'new', layout: 'spotlight', palette: 'rust', show: { kicker: true, badge: true, was: false }, words: { kicker: 'New on the menu', badge: 'New', cta: 'Order now' } },
  { key: 'todays-offer', name: "Today's offer", group: 'offers', layout: 'starburst', palette: 'chilli', show: { badge: true, was: true, kicker: false }, words: { badge: 'Today only', cta: 'Order now' } },
  { key: 'price-drop', name: 'Price drop', group: 'offers', layout: 'bigtype', palette: 'sunny', show: { kicker: true, was: true, badge: false }, words: { kicker: 'Price drop', cta: 'Order now' } },
  { key: 'best-seller', name: 'Best seller', group: 'brand', layout: 'glow', palette: 'ember', show: { badge: true, kicker: false, was: false }, words: { badge: 'Best seller', cta: 'Order now' } },
  { key: 'back-in-stock', name: 'Back in stock', group: 'new', layout: 'band', palette: 'leaf', show: { kicker: true, badge: false, was: false }, words: { kicker: 'Back in stock', cta: 'Order now' } },
  { key: 'free-delivery', name: 'Free delivery', group: 'service', layout: 'block', palette: 'night', show: { badge: true, cta2: true, was: false }, words: { badge: 'Free delivery', cta: 'Order online', cta2: 'Call us' } },
  { key: 'call-to-order', name: 'Call to order', group: 'service', layout: 'corners', palette: 'blush', show: { phone: true, cta: true, qr: false, badge: false }, words: { cta: 'Call to order' } },
  { key: 'scan-to-order', name: 'Scan to order', group: 'service', layout: 'ticket', palette: 'paper', show: { qr: true, cta: true, badge: false }, words: { cta: 'Scan to order' } },
  { key: 'weekend', name: 'Weekend special', group: 'time', layout: 'editorial', palette: 'gold', show: { kicker: true, badge: false }, words: { kicker: 'Weekend special', cta: 'Order now' } },
  { key: 'frozen-pack', name: 'Frozen pack', group: 'food', layout: 'splash', palette: 'bee', show: { badge: true, tagline: true, kicker: false }, words: { badge: 'Microwave & Eat', tagline: 'Steamed, frozen, handmade', cta: 'Order now' } },
  { key: 'limited', name: 'Limited time', group: 'offers', layout: 'tilt', palette: 'coral', show: { badge: true, cta2: true }, words: { badge: 'Limited time', cta: 'Order now', cta2: 'Pick up today' } },
  { key: 'simple', name: 'Simple and clean', group: 'brand', layout: 'arch', palette: 'mono', show: { badge: false, kicker: false, was: false, cta2: false }, words: { cta: 'Order now' } },
  { key: 'todays-special', name: "Today's special board", group: 'food', layout: 'chalk', palette: 'cocoa', show: { kicker: true, badge: false }, words: { kicker: "Today's special", cta: 'Order now' } },
  { key: 'late-night', name: 'Late night', group: 'time', layout: 'neon', palette: 'night', show: { kicker: true, badge: false }, words: { kicker: 'Open late', cta: 'Order now' } },
  { key: 'grand-opening', name: 'Celebration', group: 'occasions', layout: 'confetti', palette: 'candy', show: { badge: true, kicker: true }, words: { kicker: "Let's celebrate", badge: 'New', cta: 'Order now' } },
  { key: 'breakfast', name: 'Breakfast', group: 'time', layout: 'sunrise', palette: 'rust', show: { kicker: true, badge: false }, words: { kicker: 'Good morning', cta: 'Order breakfast' } },
  { key: 'big-deal', name: 'Big deal', group: 'offers', layout: 'popart', palette: 'sunny', show: { badge: true, was: true }, words: { badge: 'Deal', cta: 'Order now' } },
  { key: 'bakery', name: 'From the bakery', group: 'food', layout: 'scallop', palette: 'blush', show: { kicker: true, badge: false }, words: { kicker: 'Fresh from the oven', cta: 'Order now' } },
  { key: 'iftar', name: 'Iftar special', group: 'occasions', layout: 'stage', palette: 'gold', show: { kicker: true, badge: false, cta2: true }, words: { kicker: 'Iftar special', cta: 'Order now', cta2: 'Pick up today' } },
  { key: 'family-meal', name: 'Family meal', group: 'food', layout: 'bunting', palette: 'saffron', show: { kicker: true, tagline: true, badge: false }, words: { kicker: 'For the whole family', tagline: 'Enough for everyone', cta: 'Order now' } },
  { key: 'combo-deal', name: 'Combo deal', group: 'offers', layout: 'halftone', palette: 'sunny', show: { badge: true, was: true }, words: { badge: 'Combo', cta: 'Order now' } },
  { key: 'chefs-pick', name: "Chef's pick", group: 'brand', layout: 'bistro', palette: 'cream', show: { kicker: true, tagline: true, badge: false }, words: { kicker: "Chef's pick", tagline: 'Made fresh every day', cta: 'Order now' } },
  { key: 'hot-fresh', name: 'Hot and fresh', group: 'food', layout: 'steam', palette: 'espresso', show: { kicker: true, badge: false }, words: { kicker: 'Hot and fresh', cta: 'Order now' } },
  { key: 'happy-hour', name: 'Happy hour', group: 'time', layout: 'marquee', palette: 'wine', show: { badge: true, kicker: true, was: true }, words: { kicker: 'Happy hour', badge: 'Limited time', cta: 'Order now' } },
  { key: 'new-flavour', name: 'New flavour', group: 'new', layout: 'aurora', palette: 'berry', show: { kicker: true, badge: true }, words: { kicker: 'New flavour', badge: 'New', cta: 'Try it today' } },
  { key: 'photo-story', name: 'Photo story', group: 'brand', layout: 'glass', palette: 'ember', show: { tagline: true, badge: false, kicker: false }, words: { tagline: 'Made with love in our kitchen', cta: 'Order now' } },
  { key: 'launch', name: 'Big launch', group: 'new', layout: 'orbit', palette: 'ocean', show: { kicker: true, badge: true }, words: { kicker: 'Just landed', badge: 'New', cta: 'Order now' } },
  { key: 'modern', name: 'Modern and minimal', group: 'brand', layout: 'swiss', palette: 'charcoal', show: { kicker: true, badge: false, cta2: false }, words: { kicker: 'On the menu', cta: 'Order now' } },
  { key: 'trending', name: 'Everyone loves it', group: 'brand', layout: 'echo', palette: 'sunset', show: { badge: true, kicker: false }, words: { badge: 'Trending', cta: 'Order now' } },
  { key: 'favourite', name: 'Customer favourite', group: 'brand', layout: 'polaroid', palette: 'terracotta', show: { kicker: true, tagline: true, badge: false }, words: { kicker: 'Customer favourite', tagline: 'Ordered again and again', cta: 'Order now' } },
  ...MORE_TEMPLATES,
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
  /** Which group of motions it is shown in (`MOTION_GROUPS`). */
  group?: string;
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

/** The groups the motions are shown in, in order. */
export const MOTION_GROUPS: Array<{ key: string; name: string }> = [
  { key: 'calm', name: 'Calm and elegant' },
  { key: 'lively', name: 'Lively' },
  { key: 'bold', name: 'Bold and fast' },
  { key: 'playful', name: 'Playful' },
];

/** How a family of motions brings each part in. */
const FAMILIES: Array<{ key: string; name: string; photo: Fx; text: Fx; price: Fx; sticker: Fx; footer: Fx }> = [
  { key: 'fade', name: 'Fade', photo: 'fade', text: 'fade', price: 'fade', sticker: 'fade', footer: 'fade' },
  { key: 'lift', name: 'Lift', photo: 'up', text: 'up', price: 'pop', sticker: 'pop', footer: 'up' },
  { key: 'fall', name: 'Fall', photo: 'down', text: 'down', price: 'down', sticker: 'pop', footer: 'down' },
  { key: 'sweep', name: 'Sweep', photo: 'right', text: 'left', price: 'left', sticker: 'pop', footer: 'up' },
  { key: 'zoom', name: 'Zoom', photo: 'zoom', text: 'zoom', price: 'pop', sticker: 'zoom', footer: 'fade' },
  { key: 'popin', name: 'Pop in', photo: 'pop', text: 'pop', price: 'pop', sticker: 'pop', footer: 'fade' },
  { key: 'twirl', name: 'Twirl', photo: 'spin', text: 'up', price: 'spin', sticker: 'spin', footer: 'fade' },
  { key: 'bounce', name: 'Bounce', photo: 'drop', text: 'drop', price: 'drop', sticker: 'drop', footer: 'up' },
  { key: 'sway', name: 'Sway', photo: 'swing', text: 'up', price: 'swing', sticker: 'swing', footer: 'fade' },
  { key: 'turn', name: 'Turn', photo: 'flip', text: 'flip', price: 'flip', sticker: 'flip', footer: 'fade' },
  { key: 'write', name: 'Write on', photo: 'fade', text: 'wipe', price: 'wipe', sticker: 'pop', footer: 'wipe' },
  { key: 'drift', name: 'Drift', photo: 'glide', text: 'glide', price: 'glide', sticker: 'pop', footer: 'fade' },
  { key: 'thump', name: 'Thump', photo: 'slam', text: 'slam', price: 'slam', sticker: 'slam', footer: 'fade' },
  { key: 'open', name: 'Open up', photo: 'unfold', text: 'unfold', price: 'unfold', sticker: 'pop', footer: 'unfold' },
  { key: 'lean', name: 'Lean in', photo: 'tilt', text: 'tilt', price: 'tilt', sticker: 'swing', footer: 'up' },
  { key: 'wobble', name: 'Wobble', photo: 'elastic', text: 'elastic', price: 'elastic', sticker: 'elastic', footer: 'fade' },
];

/** The moods each family plays in: how fast, what the photo does after, what draws the eye. */
const MOODS: Array<{ key: string; name: string; group: string; stagger: number; pace: number; idle: Motion['idle']; accent: Motion['accent']; camera: Motion['camera'] }> = [
  { key: 'soft', name: 'soft', group: 'calm', stagger: 0.22, pace: 1.45, idle: 'float', accent: 'none', camera: 'in' },
  { key: 'lively', name: 'lively', group: 'lively', stagger: 0.13, pace: 1, idle: 'breathe', accent: 'pulse', camera: 'none' },
  { key: 'snappy', name: 'snappy', group: 'bold', stagger: 0.08, pace: 0.7, idle: 'none', accent: 'both', camera: 'out' },
  { key: 'bouncy', name: 'bouncy', group: 'playful', stagger: 0.14, pace: 1.1, idle: 'bob', accent: 'wiggle', camera: 'none' },
];

/** Sixty-four more: every family in every mood (owner, 2026-11-17: "Make it 100 each"). */
const MORE_MOTIONS: Motion[] = FAMILIES.flatMap((f) => MOODS.map((m) => ({
  key: `${f.key}-${m.key}`,
  name: `${f.name}, ${m.name}`,
  group: m.group,
  photo: f.photo, text: f.text, price: f.price, sticker: f.sticker, footer: f.footer,
  stagger: m.stagger, pace: m.pace, idle: m.idle, accent: m.accent, camera: m.camera,
})));

export const MOTIONS: Motion[] = [
  { key: 'calm', name: 'Calm fade', group: 'calm', photo: 'fade', text: 'fade', price: 'fade', sticker: 'fade', footer: 'fade', stagger: 0.16, pace: 1.3, idle: 'none', accent: 'none', camera: 'in' },
  { key: 'rise', name: 'Rise', group: 'lively', photo: 'zoom', text: 'up', price: 'pop', sticker: 'pop', footer: 'up', stagger: 0.14, pace: 1, idle: 'float', accent: 'pulse', camera: 'none' },
  { key: 'pop', name: 'Pop', group: 'playful', photo: 'pop', text: 'pop', price: 'pop', sticker: 'pop', footer: 'fade', stagger: 0.12, pace: 0.85, idle: 'breathe', accent: 'both', camera: 'none' },
  { key: 'slide', name: 'Slide in', group: 'lively', photo: 'right', text: 'left', price: 'left', sticker: 'pop', footer: 'up', stagger: 0.12, pace: 1, idle: 'none', accent: 'pulse', camera: 'in' },
  { key: 'cross', name: 'Crossing', group: 'lively', photo: 'left', text: 'right', price: 'right', sticker: 'spin', footer: 'fade', stagger: 0.12, pace: 1, idle: 'float', accent: 'wiggle', camera: 'none' },
  { key: 'drop', name: 'Drop and bounce', group: 'playful', photo: 'drop', text: 'fade', price: 'pop', sticker: 'drop', footer: 'fade', stagger: 0.14, pace: 1.2, idle: 'none', accent: 'pulse', camera: 'none' },
  { key: 'spin', name: 'Spin', group: 'bold', photo: 'spin', text: 'up', price: 'spin', sticker: 'spin', footer: 'fade', stagger: 0.12, pace: 1.1, idle: 'sway', accent: 'pulse', camera: 'none' },
  { key: 'type', name: 'Typewriter', group: 'calm', photo: 'fade', text: 'wipe', price: 'wipe', sticker: 'pop', footer: 'wipe', stagger: 0.3, pace: 1.3, idle: 'breathe', accent: 'none', camera: 'in' },
  { key: 'punch', name: 'Zoom punch', group: 'bold', photo: 'shrink', text: 'pop', price: 'shrink', sticker: 'shrink', footer: 'fade', stagger: 0.1, pace: 0.8, idle: 'none', accent: 'both', camera: 'out' },
  { key: 'float', name: 'Floating', group: 'calm', photo: 'up', text: 'fade', price: 'fade', sticker: 'fade', footer: 'fade', stagger: 0.16, pace: 1.2, idle: 'float', accent: 'wiggle', camera: 'none' },
  { key: 'bounce', name: 'Bouncy words', group: 'playful', photo: 'pop', text: 'drop', price: 'drop', sticker: 'pop', footer: 'up', stagger: 0.16, pace: 1.1, idle: 'breathe', accent: 'pulse', camera: 'none' },
  { key: 'swing', name: 'Swing', group: 'playful', photo: 'up', text: 'up', price: 'swing', sticker: 'swing', footer: 'fade', stagger: 0.12, pace: 1.2, idle: 'sway', accent: 'wiggle', camera: 'none' },
  { key: 'beat', name: 'Heartbeat', group: 'lively', photo: 'zoom', text: 'fade', price: 'pop', sticker: 'pop', footer: 'fade', stagger: 0.1, pace: 0.9, idle: 'breathe', accent: 'both', camera: 'none' },
  { key: 'flip', name: 'Flip', group: 'lively', photo: 'flip', text: 'flip', price: 'flip', sticker: 'flip', footer: 'fade', stagger: 0.14, pace: 1, idle: 'none', accent: 'pulse', camera: 'in' },
  { key: 'whip', name: 'Whip', group: 'bold', photo: 'right', text: 'right', price: 'right', sticker: 'right', footer: 'right', stagger: 0.07, pace: 0.6, idle: 'none', accent: 'both', camera: 'none' },
  { key: 'cascade', name: 'Cascade', group: 'calm', photo: 'down', text: 'down', price: 'down', sticker: 'down', footer: 'down', stagger: 0.2, pace: 1, idle: 'float', accent: 'none', camera: 'none' },
  { key: 'closeup', name: 'Slow close-up', group: 'calm', photo: 'fade', text: 'up', price: 'fade', sticker: 'fade', footer: 'fade', stagger: 0.18, pace: 1.4, idle: 'grow', accent: 'none', camera: 'in' },
  { key: 'reveal', name: 'Photo first', group: 'lively', photo: 'zoom', text: 'wipe', price: 'pop', sticker: 'spin', footer: 'up', stagger: 0.22, pace: 1.1, idle: 'sway', accent: 'pulse', camera: 'out' },
  { key: 'party', name: 'Party', group: 'playful', photo: 'spin', text: 'pop', price: 'drop', sticker: 'swing', footer: 'up', stagger: 0.1, pace: 0.9, idle: 'float', accent: 'both', camera: 'none' },
  { key: 'elegant', name: 'Elegant', group: 'calm', photo: 'fade', text: 'wipe', price: 'fade', sticker: 'fade', footer: 'fade', stagger: 0.34, pace: 1.6, idle: 'grow', accent: 'none', camera: 'out' },
  { key: 'stamp', name: 'Stamp', group: 'bold', photo: 'up', text: 'fade', price: 'shrink', sticker: 'shrink', footer: 'fade', stagger: 0.12, pace: 0.8, idle: 'none', accent: 'wiggle', camera: 'none' },
  { key: 'tumble', name: 'Tumble', group: 'playful', photo: 'swing', text: 'left', price: 'spin', sticker: 'drop', footer: 'fade', stagger: 0.14, pace: 1.1, idle: 'sway', accent: 'pulse', camera: 'none' },
  { key: 'curtain', name: 'Curtain', group: 'calm', photo: 'down', text: 'up', price: 'up', sticker: 'pop', footer: 'up', stagger: 0.12, pace: 1.1, idle: 'breathe', accent: 'pulse', camera: 'in' },
  { key: 'burst', name: 'Burst', group: 'bold', photo: 'pop', text: 'zoom', price: 'pop', sticker: 'spin', footer: 'zoom', stagger: 0.08, pace: 0.7, idle: 'breathe', accent: 'both', camera: 'out' },
  // The advanced set (owner, 2026-11-17).
  { key: 'glide', name: 'Glide', group: 'calm', photo: 'glide', text: 'glide', price: 'glide', sticker: 'pop', footer: 'fade', stagger: 0.12, pace: 1, idle: 'orbit', accent: 'pulse', camera: 'in' },
  { key: 'slam', name: 'Slam', group: 'bold', photo: 'slam', text: 'slam', price: 'slam', sticker: 'slam', footer: 'fade', stagger: 0.14, pace: 0.9, idle: 'none', accent: 'both', camera: 'none' },
  { key: 'unfold', name: 'Unfold', group: 'lively', photo: 'unfold', text: 'unfold', price: 'unfold', sticker: 'pop', footer: 'unfold', stagger: 0.12, pace: 1, idle: 'breathe', accent: 'pulse', camera: 'none' },
  { key: 'tilt', name: 'Tilt in', group: 'lively', photo: 'tilt', text: 'tilt', price: 'tilt', sticker: 'swing', footer: 'up', stagger: 0.12, pace: 1.1, idle: 'bob', accent: 'wiggle', camera: 'none' },
  { key: 'jelly', name: 'Jelly', group: 'playful', photo: 'elastic', text: 'elastic', price: 'elastic', sticker: 'elastic', footer: 'fade', stagger: 0.12, pace: 1.2, idle: 'breathe', accent: 'both', camera: 'none' },
  { key: 'rise-up', name: 'Rise up', group: 'calm', photo: 'wipeup', text: 'wipeup', price: 'wipeup', sticker: 'pop', footer: 'wipeup', stagger: 0.18, pace: 1.1, idle: 'float', accent: 'none', camera: 'in' },
  { key: 'showtime', name: 'Showtime', group: 'bold', photo: 'slam', text: 'unfold', price: 'elastic', sticker: 'spin', footer: 'up', stagger: 0.14, pace: 1, idle: 'bob', accent: 'both', camera: 'out' },
  { key: 'gentle', name: 'Gentle drift', group: 'calm', photo: 'glide', text: 'wipeup', price: 'fade', sticker: 'fade', footer: 'fade', stagger: 0.24, pace: 1.4, idle: 'orbit', accent: 'none', camera: 'in' },
  { key: 'magazine', name: 'Magazine', group: 'calm', photo: 'unfold', text: 'wipeup', price: 'wipe', sticker: 'tilt', footer: 'fade', stagger: 0.26, pace: 1.3, idle: 'grow', accent: 'none', camera: 'out' },
  { key: 'rocket', name: 'Rocket', group: 'bold', photo: 'up', text: 'glide', price: 'slam', sticker: 'elastic', footer: 'up', stagger: 0.08, pace: 0.7, idle: 'float', accent: 'pulse', camera: 'out' },
  { key: 'grand', name: 'Grand reveal', group: 'lively', photo: 'zoom', text: 'unfold', price: 'slam', sticker: 'spin', footer: 'wipeup', stagger: 0.2, pace: 1.2, idle: 'grow', accent: 'pulse', camera: 'in' },
  { key: 'playful', name: 'Playful', group: 'playful', photo: 'elastic', text: 'tilt', price: 'drop', sticker: 'swing', footer: 'glide', stagger: 0.12, pace: 1, idle: 'bob', accent: 'wiggle', camera: 'none' },
  ...MORE_MOTIONS,
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
    headline: '', kicker: '', tagline: '', price: '', was: '', badge: '', cta: 'Order now', cta2: '', ctaStyle: 'auto', motion: '', caption: '',
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
  if ((spec.caption ?? '').trim()) return (spec.caption ?? '').trim();
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
