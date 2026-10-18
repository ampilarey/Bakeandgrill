import { req, requestBlob } from './client';

/** Printed cards (backend App\Domains\Cards; CardController). */
export type CardKind = 'discount' | 'gift' | 'promo' | 'loyalty' | 'plain';

export type CardSettings = {
  kind: CardKind;
  template: 'classic' | 'photo' | 'minimal' | 'stamp';
  size: string;
  w: number;
  h: number;
  orientation: 'landscape' | 'portrait';
  accent: 'rust' | 'brown' | 'gold' | 'cream';
  lang: 'en' | 'dv' | 'both';
  title: string; title_dv: string;
  headline: string; headline_dv: string;
  note: string; note_dv: string;
  photo: string; photo_dim: number;
  show_logo: boolean; show_qr: boolean; show_code: boolean; show_expiry: boolean; show_number: boolean;
  back: boolean;
  back_title: string; back_title_dv: string;
  back_text: string; back_text_dv: string;
  back_contact: boolean;
  stamps: number; stamp_reward: string; stamp_reward_dv: string;
};

export type CardSourceRef =
  | { type: 'discount_batch'; id: number; start?: number; count?: number }
  | { type: 'promotion'; id: number; copies?: number }
  | { type: 'gift_card'; code: string; copies?: number }
  | { type: 'none'; copies?: number };

export type CardDesign = { id: number; name: string; settings: CardSettings; updated_at: string | null };

export type CardPrintRow = { id: number; design: string | null; source: string; source_id: number | null; cards: number; output: string; sides: string; by: string | null; at: string | null };

export type CardOutput = 'card' | 'a4';
export type CardSides = 'front' | 'both' | 'fronts_then_backs';

export function fetchCards(): Promise<{ designs: CardDesign[]; prints: CardPrintRow[]; defaults: Record<CardKind, CardSettings> }> {
  return req('/admin/cards');
}

export function saveCardDesign(design: { id?: number; name: string; settings: CardSettings }): Promise<{ design: CardDesign }> {
  return design.id
    ? req(`/admin/cards/designs/${design.id}`, { method: 'PUT', body: JSON.stringify({ name: design.name, settings: design.settings }) })
    : req('/admin/cards/designs', { method: 'POST', body: JSON.stringify({ name: design.name, settings: design.settings }) });
}

export function deleteCardDesign(id: number): Promise<{ ok: boolean }> {
  return req(`/admin/cards/designs/${id}`, { method: 'DELETE' });
}

export function previewCard(settings: CardSettings, source?: CardSourceRef): Promise<{ html: string; page: [number, number]; cards: number; a4_per_page: number }> {
  return req('/admin/cards/preview', { method: 'POST', body: JSON.stringify({ settings, ...(source ? { source } : {}) }) });
}

export function cardPdf(body: { settings: CardSettings; source: CardSourceRef; output: CardOutput; sides: CardSides; design_id?: number | null; note?: string }): Promise<Blob> {
  return requestBlob('/admin/cards/pdf', { method: 'POST', body: JSON.stringify(body), headers: { Accept: 'application/pdf' } });
}
