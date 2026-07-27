/** Mirror of backend BrandPalette — derive order-app accent tokens from primary_color. */

const DARK_TEXT = '#1C1408';
const LIGHT_TEXT = '#FFFDF9';

export type BrandTokens = {
  primary: string;
  hover: string;
  light: string;
  glow: string;
  contrast: string;
  darkPrimary: string;
  darkHover: string;
  darkLight: string;
  darkGlow: string;
  darkContrast: string;
};

function normalizeHex(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return null;
  if (value.length === 4) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return value.toUpperCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function darken(rgb: { r: number; g: number; b: number }, amount: number) {
  const f = Math.max(0, 1 - amount);
  return {
    r: Math.round(rgb.r * f),
    g: Math.round(rgb.g * f),
    b: Math.round(rgb.b * f),
  };
}

function lighten(rgb: { r: number; g: number; b: number }, amount: number) {
  return {
    r: Math.round(rgb.r + (255 - rgb.r) * amount),
    g: Math.round(rgb.g + (255 - rgb.g) * amount),
    b: Math.round(rgb.b + (255 - rgb.b) * amount),
  };
}

function mixWithWhite(rgb: { r: number; g: number; b: number }, whiteAmount: number) {
  const t = Math.min(1, Math.max(0, whiteAmount));
  return {
    r: Math.round(rgb.r * (1 - t) + 255 * t),
    g: Math.round(rgb.g * (1 - t) + 255 * t),
    b: Math.round(rgb.b * (1 - t) + 255 * t),
  };
}

function rgba(rgb: { r: number; g: number; b: number }, alpha: number): string {
  const a = Number(alpha.toFixed(2));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const chan = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

function contrastRatio(rgb: { r: number; g: number; b: number }, hex: string): number {
  const fg = hexToRgb(normalizeHex(hex) ?? hex);
  const l1 = relativeLuminance(rgb);
  const l2 = relativeLuminance(fg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick the foreground with the higher WCAG contrast against the background. */
function contrastOn(rgb: { r: number; g: number; b: number }): string {
  return contrastRatio(rgb, DARK_TEXT) >= contrastRatio(rgb, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT;
}

export function deriveBrandPalette(raw: string | null | undefined): BrandTokens | null {
  const hex = normalizeHex(raw);
  if (!hex) return null;
  const rgb = hexToRgb(hex);
  const darkRgb = lighten(rgb, 0.1);
  return {
    primary: hex,
    hover: rgbToHex(darken(rgb, 0.12)),
    light: rgbToHex(mixWithWhite(rgb, 0.92)),
    glow: rgba(rgb, 0.22),
    contrast: contrastOn(rgb),
    darkPrimary: rgbToHex(darkRgb),
    darkHover: rgbToHex(darken(darkRgb, 0.12)),
    darkLight: rgba(darkRgb, 0.15),
    darkGlow: rgba(darkRgb, 0.22),
    darkContrast: contrastOn(darkRgb),
  };
}

/** Apply derived tokens to :root inline styles. Returns a cleanup fn. */
export function applyBrandPalette(tokens: BrandTokens | null): () => void {
  const root = document.documentElement;
  if (!tokens) return () => {};

  const pairs: Array<[string, string]> = [
    ['--color-primary', tokens.primary],
    ['--color-primary-hover', tokens.hover],
    ['--color-primary-light', tokens.light],
    ['--color-primary-glow', tokens.glow],
    ['--color-primary-contrast', tokens.contrast],
    ['--brand-dark-primary', tokens.darkPrimary],
    ['--brand-dark-hover', tokens.darkHover],
    ['--brand-dark-light', tokens.darkLight],
    ['--brand-dark-glow', tokens.darkGlow],
    ['--brand-dark-contrast', tokens.darkContrast],
  ];

  const prev = pairs.map(([k]) => [k, root.style.getPropertyValue(k)] as const);
  for (const [k, v] of pairs) root.style.setProperty(k, v);

  // Dark theme overrides via a style tag so [data-theme="dark"] wins over :root inline.
  const style = document.createElement('style');
  style.setAttribute('data-brand-palette', '1');
  style.textContent = `[data-theme="dark"]{
    --color-primary:${tokens.darkPrimary};
    --color-primary-hover:${tokens.darkHover};
    --color-primary-light:${tokens.darkLight};
    --color-primary-glow:${tokens.darkGlow};
    --color-primary-contrast:${tokens.darkContrast};
  }`;
  document.head.appendChild(style);

  return () => {
    for (const [k, v] of prev) {
      if (v) root.style.setProperty(k, v);
      else root.style.removeProperty(k);
    }
    style.remove();
  };
}
