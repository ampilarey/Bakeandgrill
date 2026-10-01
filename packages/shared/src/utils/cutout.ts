import type { CutoutBackdrop } from '../types/product';

/**
 * The CSS custom properties a card sets on its circle frame so the
 * stylesheet can draw the backdrop behind a cut-out thumbnail. One place for
 * the order app; the POS shows the cut-out with no circle.
 */
export function cutoutBackdropVars(backdrop: CutoutBackdrop | null | undefined): Record<string, string> {
  const color = backdrop?.color && /^#[0-9a-fA-F]{6}$/.test(backdrop.color) ? backdrop.color : '#F3EAE1';
  const strength = backdrop?.strength == null ? 100 : Math.max(0, Math.min(100, Number(backdrop.strength)));
  return {
    '--cutout-color': color,
    '--cutout-alpha': (strength / 100).toFixed(2),
  };
}

/** True when a card should draw the cut-out instead of the photo. */
export function hasCutout(item: { cutout_url?: string | null }): item is { cutout_url: string } {
  return typeof item.cutout_url === 'string' && item.cutout_url.trim() !== '';
}
