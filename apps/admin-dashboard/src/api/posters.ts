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
};

export type PosterCheck = { id: string; level: 'red' | 'amber' | 'ok' | string; message: string };

export type PosterDraft = {
  name?: string;
  template_key: string;
  layout: string;
  mood: string;
  language: 'en' | 'dv' | 'both';
  landscape: boolean;
  sizes: string[];
  slots: Record<string, string>;
  bindings: Record<string, number | null>;
  take_down_on?: string | null;
  place?: string | null;
  state?: string;
  pinned?: boolean;
};

export type PosterRow = PosterDraft & {
  id: number;
  code: string;
  version: number;
  should_be_down: boolean;
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
};

export type PosterPreview = {
  content: Record<string, unknown>;
  sheet: { w: number; h: number; hex_bg: string; pieces: PosterPiece[] };
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
}>('/posters/catalog');

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

export const downloadPosterZip = (exportId: number) => requestBlob(`/posters/exports/${exportId}/download`);

export type PosterTemplateRow = {
  id: number;
  name: string;
  template_key: string;
  layout: string;
  mood: string;
  language: string;
  slots: Record<string, string>;
  locked: boolean;
};

export const fetchPosterTemplates = () => req<PosterTemplateRow[]>('/posters/templates');

export const savePosterTemplate = (body: { name: string; template_key: string; layout: string; mood: string; language: string; slots: Record<string, string> }) =>
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
