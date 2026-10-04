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
  /** The item's own wording; null prints the default for its storage (in `defaults`). */
  label_heading: string | null;
  label_heading_dv: string | null;
  label_storage_line: string | null;
  label_storage_line_dv: string | null;
  label_note: string | null;
  label_note_dv: string | null;
  label_pack_unit: string | null;
  defaults: { heading: string; heading_dv: string; storage_line: string; storage_line_dv: string; unit: string };
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
  /** Picks the badge and the default heading and strip; heading and strip override them. */
  storage?: LabelStorage; heading?: string; strip?: string;
};

export type BoxRequest = BoxFields & {
  delivery?: number | null;
  /** article: the shop's own name for the line; empty prints the usual one. */
  lines?: { id: number; qty: number; article?: string }[];
  articles?: boolean;
};

/** A box label line as the server fills it: the shop's article name, and the usual one to fall back on. */
export type BoxLine = { id: number; qty: number; name: string; article: string; default_article: string };

export type BoxPrefill = { trade_account_id: number; saved: boolean; fields: BoxFields; lines: BoxLine[] };

export type LabelShop = { id: number; shop_name: string; saved: boolean };

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
  return req<{ data: BoxPrefill & { delivery: number; delivery_number: string } }>(`/labels/deliveries/${deliveryId}/box-label`);
}

export function fetchLabelShops() {
  return req<{ data: LabelShop[] }>('/labels/shops');
}

export function fetchShopBoxLabel(accountId: number) {
  return req<{ data: BoxPrefill }>(`/labels/shops/${accountId}/box-label`);
}

/** Keep the label as the shop's box label: who, boat, pick-up, window, and its items with their article names. */
export function saveShopBoxLabel(accountId: number, body: BoxFields & { items: { id: number; article?: string }[] }) {
  return req<{ data: BoxPrefill }>(`/labels/shops/${accountId}/box-label`, { method: 'PUT', body: JSON.stringify(body) });
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
/**
 * Owner, 2026-10-04: "Its not printing the correct amount in the A4" from
 * an iPhone. A phone's print dialog does not keep the sheet's exact page
 * size: iOS adds its own paper margins, so the last row of stickers spills
 * onto a second page. Phones and tablets print the PDF instead, which the
 * OS prints at true size.
 */
export function printsViaPdf(ua: string = navigator.userAgent, touchPoints: number = navigator.maxTouchPoints ?? 0): boolean {
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  return /Macintosh/.test(ua) && touchPoints > 1;
}

/** Open the sheet to print: the web sheet with its print dialog, or the PDF on a phone or tablet. */
export function openLabelSheet(url: string, pdfUrl?: string) {
  const target = pdfUrl && printsViaPdf() ? pdfUrl : url;
  window.open(`${window.location.origin}${target}`, '_blank', 'noopener');
}

/** Download a signed PDF link. */
export function downloadLabelSheet(url: string) {
  window.location.href = `${window.location.origin}${url}`;
}
