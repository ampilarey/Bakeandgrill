import { req } from './client';

/*
 * Label Hub (owner, 2026-10-04: "I want to print labels like this … accessible
 * to all staff who have the authority"). Pack stickers and box labels are
 * drawn by the server; these calls get signed links to them and the settings
 * behind them. docs/LABEL_HUB_PLAN.md.
 */

export type LabelStorage = 'frozen' | 'chilled' | 'ambient';
export type IngredientsSource = 'auto' | 'recipe' | 'manual';

export type LabelProduct = {
  id: number;
  name: string;
  name_dv: string | null;
  label_enabled: boolean;
  label_ingredients_source: IngredientsSource;
  label_ingredients: string | null;
  label_ingredients_dv: string | null;
  label_shelf_life_days: number | null;
  label_storage: LabelStorage;
  label_pack_qty: number | null;
  label_title_media_id: number | null;
  label_title_url: string | null;
  label_photo_media_id: number | null;
  label_photo_url: string | null;
  cutout_url: string | null;
  allergens: string[];
  has_recipe: boolean;
  ingredients: { en: string; dv: string; from: 'recipe' | 'manual' | 'none'; recipe_en: string; recipe_dv: string };
};

export type LabelLayout = { key: string; label: string; hint: string; per_page: number; w: number; h: number; compact: boolean };

export type StickerRequest = {
  items: { id: number; copies: number }[];
  lang?: 'en' | 'dv';
  layout?: string;
  w?: number | null;
  h?: number | null;
  fill?: boolean;
  mfg?: string | null;
  exp?: string | null;
  batch?: string | null;
  qty?: number | null;
  pi?: number | null;
  preview?: boolean;
};

export type StickerSummary = {
  layout: string;
  label: string;
  design: 'full' | 'mini';
  stickers: number;
  pages: number;
  per_page: number;
  products: { id: number; name: string; copies: number; mfg: string | null; exp: string | null; shelf_life_days: number | null; ingredients_from: string }[];
};

export type SheetLinks = { url: string; view_url: string; pdf_url: string; expires_in_minutes: number };

export type BoxFields = {
  customer?: string; attn?: string; contact?: string;
  boat?: string; boat2?: string; pickup?: string; pickup2?: string; when?: string; when2?: string;
  po?: string; box?: string; of?: string;
};

export type BoxRequest = BoxFields & {
  delivery?: number | null;
  lines?: { id: number; qty: number }[];
  articles?: boolean;
};

export type LabelPrintRow = {
  id: number;
  kind: 'sticker_en' | 'sticker_dv' | 'box_label';
  layout: string;
  item: string | null;
  delivery: string | null;
  copies: number;
  mfg_date: string | null;
  exp_date: string | null;
  batch_code: string | null;
  pack_qty: number | null;
  details: Record<string, unknown> | null;
  printed_by: string | null;
  created_at: string;
};

export type LabelSettingsMap = Record<string, string>;

export function fetchLabelProducts(all = false) {
  return req<{ data: LabelProduct[] }>(`/labels/products${all ? '?all=1' : ''}`);
}

export function fetchLabelItem(id: number) {
  return req<{ data: LabelProduct }>(`/labels/items/${id}`);
}

export function updateItemLabel(id: number, body: Partial<Omit<LabelProduct, 'id' | 'name' | 'name_dv' | 'ingredients' | 'has_recipe' | 'allergens' | 'cutout_url' | 'label_title_url' | 'label_photo_url'>>) {
  return req<{ data: LabelProduct }>(`/items/${id}/label`, { method: 'PUT', body: JSON.stringify(body) });
}

export function fetchLabelLayouts() {
  return req<{ data: LabelLayout[] }>('/labels/layouts');
}

export function stickerLinks(body: StickerRequest) {
  return req<SheetLinks & { summary: StickerSummary }>('/labels/stickers/url', { method: 'POST', body: JSON.stringify(body) });
}

export function boxLabelLinks(body: BoxRequest) {
  return req<SheetLinks>('/labels/box/url', { method: 'POST', body: JSON.stringify(body) });
}

export function fetchDeliveryBoxLabel(deliveryId: number) {
  return req<{ data: { delivery: number; delivery_number: string; trade_account_id: number; fields: BoxFields; lines: { id: number; qty: number; name: string }[] } }>(`/labels/deliveries/${deliveryId}/box-label`);
}

export function fetchProductionStickers(productionItemId: number) {
  return req<{ data: { pi: number; item: { id: number; name: string; label_enabled: boolean; label_shelf_life_days: number | null } | null; batch: string; exp: string | null; mfg: string | null; qty: number } }>(`/labels/production-items/${productionItemId}`);
}

export function fetchLabelPrints(params: { page?: number; kind?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.kind) qs.set('kind', params.kind);
  return req<{ data: LabelPrintRow[]; current_page: number; last_page: number; total: number }>(`/labels/prints${qs.toString() ? `?${qs}` : ''}`);
}

export function fetchLabelSettings() {
  return req<{ data: LabelSettingsMap; defaults: LabelSettingsMap }>('/labels/settings');
}

export function saveLabelSettings(body: LabelSettingsMap) {
  return req<{ data: LabelSettingsMap }>('/labels/settings', { method: 'PUT', body: JSON.stringify(body) });
}

/** Open a signed sheet link (relative to this site) in a new tab. */
export function openLabelSheet(url: string) {
  window.open(`${window.location.origin}${url}`, '_blank', 'noopener');
}

/** Download a signed PDF link. */
export function downloadLabelSheet(url: string) {
  window.location.href = `${window.location.origin}${url}`;
}
