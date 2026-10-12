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
  label_type_id: number | null;
  label_type_name: string | null;
  label_how_to_use: string | null;
  label_how_to_use_dv: string | null;
  /** 2026-10-12: the price prints when switched on (the menu price unless one is typed), a barcode (EAN-13 or EAN-8), a net weight. */
  label_price: number | null;
  label_show_price: boolean;
  label_barcode: string | null;
  label_net_weight: string | null;
  menu_price: number;
  /** From the item's Details tab, as words ("tree nuts"): printed bold and as "Contains …". */
  allergens: string[];
  /** What prints when the item's own box is empty: its type's wording, else the storage defaults. */
  defaults: { heading: string; heading_dv: string; storage_line: string; storage_line_dv: string; how_to_use: string; how_to_use_dv: string; note: string; note_dv: string; shelf_life_days: number | null; brand: string; unit: string };
  label_title_media_id: number | null;
  label_title_url: string | null;
  label_photo_media_id: number | null;
  label_photo_url: string | null;
  cutout_url: string | null;
  has_recipe: boolean;
  ingredients: { en: string; dv: string; from: 'recipe' | 'manual' | 'none'; recipe_en: string; recipe_dv: string };
};

/** Label Hub v2: who the label is from. The default brand is the business itself. */
export type LabelBrand = {
  id: number; name: string; name_dv: string | null; tagline: string | null; tagline_dv: string | null;
  logo_media_id: number | null; logo_url: string | null; is_default: boolean; sort: number; types_count: number | null;
};

/** Label Hub v2: what kind of food the label is for, with its wording. */
export type LabelType = {
  id: number; brand_id: number | null; brand_name: string | null; name: string;
  heading: string; heading_dv: string | null; storage: LabelStorage; storage_line: string | null; storage_line_dv: string | null;
  use_within: string | null; use_within_dv: string | null; mfg_label: string; exp_label: string;
  how_to_use: string | null; how_to_use_dv: string | null; note: string | null; note_dv: string | null;
  shelf_life_days: number | null; show_qr: boolean; is_active: boolean; sort: number; items_count: number | null;
  defaults: { storage_line: string; storage_line_dv: string };
};

export type LabelTypePayload = Partial<Omit<LabelType, 'id' | 'brand_name' | 'items_count' | 'defaults'>>;

export type LabelLayout = {
  key: string; label: string; hint: string;
  /** Null for "any size on A4": it depends on the size. */
  per_page: number | null;
  w: number; h: number; page_w: number; page_h: number; compact: boolean; shape: 'rect' | 'circle';
  /** Takes its label size from the request (w, and h for a rectangle). */
  sized?: boolean;
  /** As many as fit on A4. */
  grid?: boolean;
};

/** Where a label prints: plain A4 cut on the lines, a ready-cut sheet, two on landscape A4, or a label printer. */
export type LabelStock = 'sheet' | 'precut' | 'landscape' | 'printer';

/**
 * A size offered as one tap (owner, 2026-10-11: "Add label size. For example
 * rectangular 4 cm by 6 cm, circle 6 cm diameter"), with the layout that
 * prints it on each stock and how many fit a page.
 */
export type LabelPreset = {
  id: string; shape: 'rect' | 'circle'; w: number; h: number;
  /** "40 × 60 mm", "Round 60 mm". */
  name: string;
  /** "4 × 6 cm", "6 cm across". */
  cm: string;
  design: 'full' | 'mini' | 'small' | 'round';
  options: { on: LabelStock; layout: string; label: string; per_page: number; landscape: boolean }[];
};

export type LabelLimits = { min_short: number; min_long: number; max_w: number; max_h: number; min_round: number; max_round: number; sheet_margin: number };

export type LabelLayoutsResponse = { data: LabelLayout[]; presets: LabelPreset[]; limits: LabelLimits };

/**
 * A pack sticker for something that is not on the menu (owner, 2026-10-11:
 * "Add option to add custom labels using different brands logos and other
 * details. Not only from the menu list"). Its label fields are named as an
 * item's; empty ones print the type's wording (in `defaults`).
 */
export type CustomLabel = {
  id: number; kind: 'custom'; name: string; name_dv: string | null;
  brand_id: number | null; brand_name: string; brand_logo_url: string | null;
  label_type_id: number | null; label_type_name: string | null;
  /** Its own storage; null follows the type. `storage` is what prints. */
  label_storage: LabelStorage | null; storage: LabelStorage;
  label_heading: string | null; label_heading_dv: string | null;
  label_storage_line: string | null; label_storage_line_dv: string | null;
  label_ingredients: string | null; label_ingredients_dv: string | null;
  label_how_to_use: string | null; label_how_to_use_dv: string | null;
  label_note: string | null; label_note_dv: string | null;
  /** Its own footer line (2026-10-12), where the brand's tagline or the website would print; the phone stays. */
  label_footer: string | null; label_footer_dv: string | null;
  /** Which footer: its brand's, the standard main-brand one, or its own words (owner, 2026-10-12). */
  label_footer_style: 'brand' | 'standard' | 'own';
  /** The complaints QR: null follows the label type. */
  label_show_qr: boolean | null;
  /** The language it usually prints in; null means English, or both when it has a Dhivehi name. */
  label_lang: StickerLang | null;
  /** From the print log; the list carries them. */
  print_count: number; last_printed_at: string | null;
  label_shelf_life_days: number | null; label_pack_qty: number | null; label_pack_unit: string | null;
  /** 2026-10-12: price, barcode, net weight and the allergens (a comma list, printed bold and as "Contains …"). */
  label_price: number | null; label_barcode: string | null; label_net_weight: string | null; label_allergens: string | null;
  label_photo_media_id: number | null; label_photo_url: string | null;
  label_title_media_id: number | null; label_title_url: string | null;
  defaults: { heading: string; heading_dv: string; storage_line: string; storage_line_dv: string; how_to_use: string; how_to_use_dv: string; note: string; note_dv: string; shelf_life_days: number | null; brand: string; unit: string };
  ingredients: { en: string; dv: string; from: 'manual' | 'none' };
  created_by: string | null; updated_at: string | null;
};

export type CustomLabelPayload = Partial<Pick<CustomLabel,
  'name' | 'name_dv' | 'brand_id' | 'label_type_id' | 'label_storage' | 'label_heading' | 'label_heading_dv'
  | 'label_storage_line' | 'label_storage_line_dv' | 'label_ingredients' | 'label_ingredients_dv'
  | 'label_how_to_use' | 'label_how_to_use_dv' | 'label_note' | 'label_note_dv' | 'label_footer' | 'label_footer_dv'
  | 'label_footer_style' | 'label_show_qr' | 'label_lang'
  | 'label_shelf_life_days' | 'label_pack_qty' | 'label_pack_unit' | 'label_photo_media_id' | 'label_title_media_id'
  | 'label_price' | 'label_barcode' | 'label_net_weight' | 'label_allergens'>>;

/** The sticker's languages: English, Dhivehi, or both on one sticker (2026-10-12). */
export type StickerLang = 'en' | 'dv' | 'both';

export type StickerRequest = {
  /** A menu item, or a custom label when `kind` says so. */
  items: { id: number; copies: number; kind?: 'item' | 'custom' }[];
  lang?: StickerLang;
  layout?: string;
  w?: number | null;
  h?: number | null;
  fill?: boolean;
  mfg?: string | null;
  exp?: string | null;
  batch?: string | null;
  qty?: number | null;
  pi?: number | null;
  /** Print the whole sheet as this label type. */
  type?: number | null;
  /** Rounded corners on a rectangle's cut line. */
  rounded?: boolean;
  preview?: boolean;
};

export type StickerSummary = {
  layout: string;
  label: string;
  design: 'full' | 'mini' | 'small' | 'round';
  shape?: 'rect' | 'circle';
  w?: number;
  h?: number;
  stickers: number;
  pages: number;
  per_page: number;
  products: { id: number; kind?: 'item' | 'custom'; key?: string; name: string; copies: number; mfg: string | null; exp: string | null; shelf_life_days: number | null; ingredients_from: string }[];
};

export type SheetLinks = {
  url: string;
  /** A preview only: the first sticker alone, at its own size. */
  one_url?: string | null;
  view_url: string;
  pdf_url: string;
  expires_in_minutes: number;
  job?: { id: number; name: string };
};

/** A saved label (v2 point 10): a prepared print kept with its request. */
export type LabelJob = {
  id: number; kind: 'stickers' | 'box'; name: string;
  /** A favourite (2026-10-12): leads Saved labels and Print again. */
  pinned: boolean;
  summary: (StickerSummary | { label: string; customer: string; when: string; lines: { name: string; qty: number }[] }) | null;
  print_count: number; last_printed_at: string | null; created_at: string; created_by: string | null;
};
export type LabelJobFull = LabelJob & { request: Record<string, unknown> };

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
  /** A look only: nothing is logged or saved. */
  preview?: boolean;
};

/** A box label line as the server fills it: the shop's article name, and the usual one to fall back on. */
export type BoxLine = { id: number; qty: number; name: string; article: string; default_article: string };

export type BoxPrefill = { trade_account_id: number; saved: boolean; fields: BoxFields; lines: BoxLine[] };

export type LabelShop = { id: number; shop_name: string; saved: boolean };

export type LabelPrintRow = {
  id: number;
  kind: 'sticker_en' | 'sticker_dv' | 'sticker_both' | 'box_label';
  layout: string;
  /** The stock in words, with the size it printed at ("40 × 60 mm, 21 on A4"). */
  stock?: string;
  /** A custom label rather than a menu item. */
  custom?: boolean;
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
  return req<LabelLayoutsResponse>('/labels/layouts');
}

export function fetchCustomLabels() {
  return req<{ data: CustomLabel[] }>('/labels/custom');
}

export function createCustomLabel(body: CustomLabelPayload) {
  return req<{ data: CustomLabel }>('/labels/custom', { method: 'POST', body: JSON.stringify(body) });
}

export function updateCustomLabel(id: number, body: CustomLabelPayload) {
  return req<{ data: CustomLabel }>(`/labels/custom/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

/** The picture (slot photo) or the hand-lettered name (slot title): a PNG kept exactly as uploaded. */
export function uploadCustomLabelPicture(id: number, file: File, slot: 'photo' | 'title' = 'photo') {
  const form = new FormData();
  form.append('file', file);
  form.append('slot', slot);
  return req<{ data: CustomLabel }>(`/labels/custom/${id}/picture`, { method: 'POST', body: form });
}

export function duplicateCustomLabel(id: number) {
  return req<{ data: CustomLabel }>(`/labels/custom/${id}/duplicate`, { method: 'POST' });
}

export function deleteCustomLabel(id: number) {
  return req<{ ok: true }>(`/labels/custom/${id}`, { method: 'DELETE' });
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

export function fetchLabelJobs(params: { page?: number; kind?: string; q?: string; pinned?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.kind) qs.set('kind', params.kind);
  if (params.q) qs.set('q', params.q);
  if (params.pinned) qs.set('pinned', '1');
  return req<{ data: LabelJob[]; current_page: number; last_page: number; total: number }>(`/labels/jobs${qs.toString() ? `?${qs}` : ''}`);
}

export function fetchLabelJob(id: number) {
  return req<{ data: LabelJobFull }>(`/labels/jobs/${id}`);
}

export function renameLabelJob(id: number, name: string) {
  return req<{ data: LabelJob }>(`/labels/jobs/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
}

/** Pin (favourite) a saved label so it leads the list and Print again (2026-10-12). */
export function pinLabelJob(id: number, pinned: boolean) {
  return req<{ data: LabelJob }>(`/labels/jobs/${id}`, { method: 'PUT', body: JSON.stringify({ pinned }) });
}

/**
 * A custom label as it is being written, drawn before it is saved
 * (2026-10-12): the server keeps the draft for half an hour and the link
 * names it. Nothing is saved or logged.
 */
export function previewCustomDraft(body: CustomLabelPayload & { layout?: string; w?: number | null; h?: number | null; lang?: StickerLang }) {
  return req<{ one_url: string; url: string; expires_in_minutes: number }>('/labels/custom/preview', { method: 'POST', body: JSON.stringify(body) });
}

/** Print a saved label again: stickers with dates get today's made-on date. */
export function printLabelJob(id: number) {
  return req<SheetLinks & { summary: unknown }>(`/labels/jobs/${id}/print`, { method: 'POST' });
}

export function duplicateLabelJob(id: number) {
  return req<{ data: LabelJobFull }>(`/labels/jobs/${id}/duplicate`, { method: 'POST' });
}

export function deleteLabelJob(id: number) {
  return req<{ ok: true }>(`/labels/jobs/${id}`, { method: 'DELETE' });
}

export function fetchLabelPrints(params: { page?: number; kind?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.kind) qs.set('kind', params.kind);
  return req<{ data: LabelPrintRow[]; current_page: number; last_page: number; total: number }>(`/labels/prints${qs.toString() ? `?${qs}` : ''}`);
}

export function fetchLabelTypes() {
  return req<{ data: LabelType[] }>('/labels/types');
}

export function createLabelType(body: LabelTypePayload) {
  return req<{ data: LabelType }>('/labels/types', { method: 'POST', body: JSON.stringify(body) });
}

export function updateLabelType(id: number, body: LabelTypePayload) {
  return req<{ data: LabelType }>(`/labels/types/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteLabelType(id: number) {
  return req<{ ok: true }>(`/labels/types/${id}`, { method: 'DELETE' });
}

export function fetchLabelBrands() {
  return req<{ data: LabelBrand[] }>('/labels/brands');
}

export function createLabelBrand(body: Partial<Pick<LabelBrand, 'name' | 'name_dv' | 'tagline' | 'tagline_dv' | 'sort'>>) {
  return req<{ data: LabelBrand }>('/labels/brands', { method: 'POST', body: JSON.stringify(body) });
}

export function updateLabelBrand(id: number, body: Partial<Pick<LabelBrand, 'name' | 'name_dv' | 'tagline' | 'tagline_dv' | 'sort' | 'logo_media_id'>>) {
  return req<{ data: LabelBrand }>(`/labels/brands/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

/** A PNG with a clear background, kept exactly as uploaded. */
export function uploadLabelBrandLogo(id: number, file: File) {
  const form = new FormData();
  form.append('file', file);
  return req<{ data: LabelBrand }>(`/labels/brands/${id}/logo`, { method: 'POST', body: form });
}

export function deleteLabelBrand(id: number) {
  return req<{ ok: true }>(`/labels/brands/${id}`, { method: 'DELETE' });
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
