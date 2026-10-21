import { req, requestBlob } from './client';

export type PosterPurpose = {
  key: string;
  label: string;
  group: string;
  layout: string;
  bind: 'item' | 'promotion' | 'category' | 'table' | 'none' | string;
  landscape: boolean;
  external: string | null;
  slots: Record<string, string>;
  used: number;
};

export type PosterPiece = {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  hex?: string;
  align?: string;
  url?: string;
  colourway?: string;
  strike?: boolean;
  // A template's pieces (docs/POSTER_THEMES_HANDOFF.md). Text: where its baseline sits, its face and tracking.
  slot?: string;
  role?: string;
  font?: string;
  pt?: number;
  baseline?: number;
  ascent?: number;
  anchor?: number;
  tracking?: number;
  shadow?: { dx: number; dy: number; hex: string } | null;
  opacity?: number;
  auto?: boolean;
  dv?: boolean;
  // Photo: the picture's address, its clip in page mm, its tilt and how it sits.
  src?: string | null;
  source?: 'upload' | 'master' | 'crop' | 'cutout' | 'placeholder' | string;
  item_id?: number | null;
  clip_d?: string;
  rotation?: number;
  centre?: [number, number];
  contain?: boolean;
  hex_behind?: string;
  shape?: string;
  // Logo on its cream badge; a QR drawn bare in the design's ink.
  badge?: { cx: number; cy: number; r: number; hex: string } | null;
  bare?: boolean;
};

export type PosterCheck = { id: string; level: 'red' | 'amber' | 'ok' | string; message: string };

/** A template's photo slot choice: a dish's photo or cut-out, or a poster upload. */
export type PosterPhotoPick = { item_id?: number | null; use?: 'main' | 'cutout' | null; photo_path?: string | null };

/**
 * One entry of a poster's `slots`: a classic slot's words; for a template,
 * a text slot's words, `null` (or missing) for the design's own wording, or
 * `false` for a line the owner blanked (an empty string arrives as null on the
 * server); a photo slot's choice, or null for the design's placeholder.
 */
export type PosterSlotValue = string | false | null | PosterPhotoPick;
export type PosterSlots = Record<string, PosterSlotValue>;

/** The words a slot holds for an input box: a blanked or design line reads as empty. */
export const slotText = (slots: PosterSlots | undefined, key: string): string => {
  const v = slots?.[key];
  return typeof v === 'string' ? v : '';
};

export const slotPhoto = (slots: PosterSlots | undefined, key: string): PosterPhotoPick | null => {
  const v = slots?.[key];
  return v && typeof v === 'object' ? v : null;
};

export type PosterDraft = {
  name?: string;
  template_key: string;
  layout: string;
  /** A ready-made design's key; the server sets the purpose and layout from it. */
  theme?: string | null;
  mood: string;
  language: 'en' | 'dv' | 'both';
  landscape: boolean;
  sizes: string[];
  slots: PosterSlots;
  bindings: Record<string, number | null>;
  take_down_on?: string | null;
  place?: string | null;
  state?: string;
  pinned?: boolean;
};

export type PosterThemeCategory = { key: string; number: string; name: string; description: string; count: number };

export type PosterThemeSummary = {
  id: string;
  key: string;
  title: string;
  category: string;
  style: string;
  style_label: string;
  has_photo: boolean;
  photo_slots: number;
  text_slots: number;
  preview_url: string;
  preview_small_url: string;
};

export type PosterThemeCatalog = {
  categories: PosterThemeCategory[];
  styles: Record<string, string>;
  sizes: Record<string, 'large' | 'small'>;
  font_urls: Record<string, string>;
  themes: PosterThemeSummary[];
};

export type PosterThemeTextSlot = {
  id: string;
  default: string;
  role_hint: 'eyebrow' | 'headline' | 'headline_or_offer' | 'price_or_offer' | 'detail' | 'footer' | string;
  font: string;
  size_units: number;
  colour: string | { fallback: string };
  align: 'left' | 'center' | 'right' | string;
  max_width_mm: number;
};

export type PosterThemePhotoSlot = {
  id: string;
  shape: string;
  box: [number, number, number, number];
  rotation_deg: number;
  cutout_ok: boolean;
  fill_behind: string;
  placeholder_url: string;
  min_px_for_150ppi: [number, number];
};

export type PosterThemeVariant = {
  variant: 'large' | 'small';
  canvas: { width: number; height: number; bleed_units: number; safe_inset_units: number; min_text_units: number };
  sizes: Record<string, { scale: number; page_mm: [number, number] }>;
  photo_slots: PosterThemePhotoSlot[];
  text_slots: PosterThemeTextSlot[];
  qr: { x: number; y: number; size_mm: number } | null;
  urls: { preview: string; backdrop: string };
};

export type PosterTheme = {
  id: string;
  key: string;
  title: string;
  category: { key: string; number: string; name: string };
  style: string;
  style_label: string;
  has_photo: boolean;
  size_to_variant: Record<string, 'large' | 'small'>;
  variants: { large: PosterThemeVariant; small: PosterThemeVariant };
  fonts: Record<string, string>;
};

/** What a themed preview sheet carries beside its pieces. */
export type PosterSheetTheme = {
  key: string;
  id: string;
  title: string;
  variant: 'large' | 'small';
  size: string;
  map: { s: number; dy: number; bleed_units: number; ox: number; oy: number };
  canvas: [number, number];
  safe: [number, number, number, number];
  min_pt: number;
  keepout: boolean;
  photo_order: string[];
  layers: number;
  backdrop_url: string;
  layer_urls: string[];
};

export type PosterSheet = { w: number; h: number; hex_bg: string; pieces: PosterPiece[]; theme?: PosterSheetTheme };

export type PosterRow = PosterDraft & {
  id: number;
  code: string;
  version: number;
  should_be_down: boolean;
  scans?: number;
  banner?: boolean;
  stale?: boolean;
  diff?: string;
  order?: { id: number; state: string; shop: string | null; quote_mvr: string | null } | null;
  updated_at?: string;
};

export type PrintShop = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  print_prefs: { layers: 'masks' | 'spots' | string; white_name: string; gloss_name: string; bleed_mm: number; crop_marks: boolean };
};

export type PosterOrderRow = {
  id: number;
  poster_id: number;
  code: string | null;
  poster_name: string | null;
  shop: string | null;
  state: string;
  material: string;
  quote_mvr: string | null;
  proof_url?: string;
  /** The print file: made on the queue, then the shop is emailed (or the proof asked for). */
  file?: 'queued' | 'ready' | 'failed' | string | null;
  file_error?: string | null;
};

export type PosterPreview = {
  content: Record<string, unknown>;
  sheet: PosterSheet;
  preflight: PosterCheck[];
  imposition: string;
};

export type PosterExportRow = {
  id: number;
  status: 'queued' | 'ready' | 'failed' | string;
  error?: string | null;
  bytes?: number | null;
};

export const fetchPosterCatalog = () => req<{
  purposes: PosterPurpose[];
  layouts: string[];
  moods: string[];
  sizes: string[];
  places: string[];
  materials: { key: string; label: string; white: boolean; mirror?: boolean }[];
  themes?: PosterThemeCatalog;
}>('/posters/catalog');

/** One ready-made design with both variants, its slots and the links the preview draws it from. */
export const fetchPosterTheme = (key: string) => req<PosterTheme>(`/posters/themes/${encodeURIComponent(key)}`);

export const fetchPosterLookups = (q = '') => req<{
  items: { id: number; name: string; name_dv: string | null; price: { price: number; from: boolean } }[];
  categories: { id: number; name: string }[];
  promotions: { id: number; name: string; code: string | null; type: string; discount_value: number }[];
  tables: { id: number; name: string }[];
}>(`/posters/lookups${q ? `?q=${encodeURIComponent(q)}` : ''}`);

export const previewPoster = (draft: PosterDraft & Record<string, unknown>) =>
  req<PosterPreview>('/posters/preview', { method: 'POST', body: JSON.stringify(draft) });

export const fetchPosters = () => req<{ posters: PosterRow[]; should_be_down: PosterRow[] }>('/posters');

export const createPoster = (draft: PosterDraft) => req<PosterRow>('/posters', { method: 'POST', body: JSON.stringify(draft) });

export const updatePoster = (id: number, patch: Partial<PosterDraft>) =>
  req<PosterRow>(`/posters/${id}`, { method: 'PUT', body: JSON.stringify(patch) });

export const deletePoster = (id: number) => req(`/posters/${id}`, { method: 'DELETE' });

export const duplicatePoster = (id: number) => req<PosterRow>(`/posters/${id}/duplicate`, { method: 'POST' });

export const exportPoster = (id: number, job: Record<string, unknown>) =>
  req<PosterExportRow>(`/posters/${id}/export`, { method: 'POST', body: JSON.stringify(job) });

export const fetchPosterExport = (exportId: number) => req<PosterExportRow>(`/posters/exports/${exportId}`);

/** A photo kept for posters only, up to 4800 px; put the path in the poster's `photo_path` slot. */
export function uploadPosterPhoto(file: File) {
  const form = new FormData();
  form.append('photo', file);
  return req<{ photo_path: string; width: number; height: number }>('/posters/photo', { method: 'POST', body: form });
}

export const downloadPosterZip = (exportId: number) => requestBlob(`/posters/exports/${exportId}/download`);

export type PosterTemplateRow = {
  id: number;
  name: string;
  template_key: string;
  layout: string;
  theme?: string | null;
  mood: string;
  language: string;
  slots: PosterSlots;
  locked: boolean;
};

export const fetchPosterTemplates = () => req<PosterTemplateRow[]>('/posters/templates');

export const savePosterTemplate = (body: { name: string; template_key: string; layout: string; theme?: string | null; mood: string; language: string; slots: PosterSlots }) =>
  req<PosterTemplateRow>('/posters/templates', { method: 'POST', body: JSON.stringify(body) });

export const lockPosterTemplate = (id: number, locked: boolean) =>
  req(`/posters/templates/${id}`, { method: 'PUT', body: JSON.stringify({ locked }) });

export const deletePosterTemplate = (id: number) => req(`/posters/templates/${id}`, { method: 'DELETE' });

export const fetchPrintShops = () => req<{ shops: PrintShop[]; proof_approval: boolean }>('/posters/shops');

export const savePrintShop = (body: { name: string; email?: string; phone?: string; print_prefs?: PrintShop['print_prefs'] }) =>
  req<PrintShop>('/posters/shops', { method: 'POST', body: JSON.stringify(body) });

export const setPosterProofApproval = (on: boolean) =>
  req<{ proof_approval: boolean }>('/posters/proof-approval', { method: 'PUT', body: JSON.stringify({ on }) });

export const fetchPosterOrders = () => req<{ orders: PosterOrderRow[] }>('/posters/orders');

export const sendPosterToShop = (id: number, body: Record<string, unknown>) =>
  req<PosterOrderRow>(`/posters/${id}/orders`, { method: 'POST', body: JSON.stringify(body) });

export const quotePosterOrder = (id: number, quote_mvr: number, quote_note?: string) =>
  req<PosterOrderRow>(`/posters/orders/${id}/quote`, { method: 'POST', body: JSON.stringify({ quote_mvr, quote_note }) });

export const approvePosterQuote = (id: number) =>
  req<PosterOrderRow>(`/posters/orders/${id}/approve-quote`, { method: 'POST', body: JSON.stringify({}) });

export const advancePosterOrder = (id: number, state: 'received' | 'up' | 'down') =>
  req<PosterOrderRow>(`/posters/orders/${id}/state`, { method: 'POST', body: JSON.stringify({ state }) });

export type PosterSocialDraft = {
  post_id: number;
  status: string;
  image_url: string | null;
  sizes: Record<string, string>;
  best_time: string | null;
  whatsapp: string;
  viber: string;
  link: string;
};

export const sendPosterToTv = (id: number) =>
  req<{ slide_id: string; image_url: string; date_end: string | null }>(`/posters/${id}/tv`, { method: 'POST', body: JSON.stringify({}) });

export const draftPosterSocial = (id: number) =>
  req<PosterSocialDraft>(`/posters/${id}/social`, { method: 'POST', body: JSON.stringify({}) });

export const setPosterHomeBanner = (id: number, on: boolean) =>
  req<{ on: boolean; code: string }>(`/posters/${id}/banner`, { method: 'POST', body: JSON.stringify({ on }) });
