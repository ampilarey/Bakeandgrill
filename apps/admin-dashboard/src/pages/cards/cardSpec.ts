import type { CardKind, CardSettings, CardSides, CardOutput } from '../../api/cards';

/** Mirrors backend App\Domains\Cards\CardSpec (SIZES, TEMPLATES, ACCENTS). */
export const CARD_SIZES: { value: string; label: string; w: number; h: number }[] = [
  { value: 'cr80', label: 'CR80 · bank card size (85.6 × 54 mm)', w: 85.6, h: 53.98 },
  { value: 'cr79', label: 'CR79 · adhesive back (83.9 × 52.1 mm)', w: 83.9, h: 52.1 },
  { value: 'cr100', label: 'CR100 · oversized (98.5 × 67 mm)', w: 98.5, h: 67 },
  { value: 'business', label: 'Business card (85 × 55 mm)', w: 85, h: 55 },
  { value: 'custom', label: 'Another size…', w: 85.6, h: 53.98 },
];

export const CARD_TEMPLATES: { value: CardSettings['template']; label: string; hint: string }[] = [
  { value: 'classic', label: 'Classic', hint: 'Colour background, big value, QR' },
  { value: 'photo', label: 'Photo', hint: 'A food photo behind the words' },
  { value: 'minimal', label: 'Minimal', hint: 'Cream card, serif headline, rust edge' },
  { value: 'stamp', label: 'Stamp card', hint: 'Stamps on the back, the last one free' },
];

/** [label, swatch]: the brand palette (docs/brand/PALETTE.md). */
export const CARD_ACCENTS: { value: CardSettings['accent']; label: string; swatch: string }[] = [
  { value: 'rust', label: 'Rust', swatch: '#B74B0C' },
  { value: 'brown', label: 'Dark brown', swatch: '#1C1408' },
  { value: 'gold', label: 'Golden amber', swatch: '#CA7D1C' },
  { value: 'cream', label: 'Cream', swatch: '#F7F5F2' },
];

export const CARD_KINDS: { value: CardKind; label: string }[] = [
  { value: 'discount', label: 'Discount card' },
  { value: 'gift', label: 'Gift card' },
  { value: 'promo', label: 'Promo code card' },
  { value: 'loyalty', label: 'Loyalty stamp card' },
  { value: 'plain', label: 'Handout (no code)' },
];

export const CARD_OUTPUTS: { value: CardOutput; label: string; hint: string }[] = [
  { value: 'card', label: 'Card printer', hint: 'One card per page at the card’s exact size. Works with any card printer (Matica, Evolis, Zebra, Fargo…).' },
  { value: 'a4', label: 'A4 sheet', hint: 'Cards side by side on A4 with cut marks, for an office printer.' },
];

export const CARD_SIDES: { value: CardSides; label: string; hint: string }[] = [
  { value: 'both', label: 'Both sides', hint: 'Front then back of each card, for a printer that prints both sides.' },
  { value: 'fronts_then_backs', label: 'Fronts, then backs', hint: 'All fronts first, then all backs: print the fronts, turn the stack over, feed it again.' },
  { value: 'front', label: 'Front only', hint: '' },
];

/** The settings a card prints from: a saved design's, or the defaults for its kind. */
export function settingsFor(kind: CardKind, defaults: Partial<Record<CardKind, CardSettings>>, saved?: CardSettings): CardSettings | null {
  return saved ?? defaults[kind] ?? null;
}

/** A media library URL as the path the server can read (it never fetches other hosts). */
export function localPath(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin ? u.pathname : '';
  } catch {
    return '';
  }
}
