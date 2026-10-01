import { req } from './client';

/**
 * Cut-out thumbnails (owner, 2026-10-01, after the ZUS screenshots): one
 * see-through PNG per item for the small cards, over a circle the apps draw.
 * The circle is a colour and a strength, set for the whole menu (Business
 * Details → Menu), a category, a subcategory, or one item; the most specific
 * one that says something wins, field by field.
 */

/** What one level sets; null fields inherit. */
export type CutoutBackdrop = { color: string | null; strength: number | null };

/** What a card actually draws, and which level decided it. */
export type CutoutBackdropEffective = {
  color: string;
  strength: number;
  source: 'default' | 'parent' | 'category' | 'item';
};

export type ItemCutoutState = {
  cutout_url: string | null;
  cutout_webp_url: string | null;
  /** The item's own backdrop; null when it inherits everything. */
  backdrop: CutoutBackdrop | null;
  effective: CutoutBackdropEffective;
};

export const CUTOUT_ACCEPT = 'image/png,image/webp,.png,.webp';

export async function getItemCutout(itemId: number): Promise<ItemCutoutState> {
  return req(`/items/${itemId}/cutout`);
}

export async function uploadItemCutout(itemId: number, file: File): Promise<ItemCutoutState> {
  const form = new FormData();
  form.append('cutout', file);
  return req(`/items/${itemId}/cutout`, { method: 'POST', body: form });
}

export async function deleteItemCutout(itemId: number): Promise<ItemCutoutState> {
  return req(`/items/${itemId}/cutout`, { method: 'DELETE' });
}

export async function updateItemCutoutBackdrop(itemId: number, backdrop: CutoutBackdrop | null): Promise<ItemCutoutState> {
  return req(`/items/${itemId}/cutout/backdrop`, { method: 'PATCH', body: JSON.stringify({ backdrop }) });
}

/** Drop a backdrop that sets nothing, and tidy what is left. */
export function normalizeBackdrop(value: CutoutBackdrop | null | undefined): CutoutBackdrop | null {
  if (!value) return null;
  const color = typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color.trim())
    ? value.color.trim().toUpperCase()
    : null;
  const strength = value.strength == null || Number.isNaN(Number(value.strength))
    ? null
    : Math.max(0, Math.min(100, Math.round(Number(value.strength))));
  if (color === null && strength === null) return null;
  return { color, strength };
}

export const sourceLabel: Record<CutoutBackdropEffective['source'], string> = {
  default: 'the menu default',
  parent: 'the parent category',
  category: 'the category',
  item: 'this item',
};
