import { req } from './client';

/**
 * The assistant (owner, 2026-11-24: "Build all. But add admin settings to on/off"):
 * Claude drafts and suggestions, each behind a switch on System → Integrations →
 * Assistant. Every call answers with a draft; nothing is saved or sent by it.
 */
export type AiFeature = 'po_scans' | 'reply_drafts' | 'glossary' | 'dhivehi' | 'nutrition' | 'captions' | 'newsletter' | 'telegram_ask' | 'auto_menu' | 'auto_inventory' | 'auto_labels' | 'auto_photos' | 'photo_generate' | 'review_photos';

export type AiStatus = { ready: boolean; enabled: boolean; features: Record<AiFeature, boolean> };

export type AiSettings = {
  ready: boolean;
  enabled: boolean;
  features: Array<{ key: AiFeature; label: string; about: string; where: string; on: boolean }>;
  /** Making pictures is Google's job, whichever service does the rest: whether it has a key, and its model. */
  images?: { ready: boolean; model: string; default_model: string };
};

/** An answer is written, not looked up: it takes longer than the 20 seconds other calls get. */
export const AI_TIMEOUT_MS = 90_000;

const post = <T,>(path: string, body?: unknown, timeoutMs = AI_TIMEOUT_MS): Promise<T> =>
  req(`/admin/ai${path}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), timeoutMs });

export const fetchAiStatus = (): Promise<AiStatus> => req('/admin/ai/status');
export const fetchAiSettings = (): Promise<AiSettings> => req('/admin/ai/settings');
export const saveAiSettings = (patch: { enabled?: boolean; features?: Partial<Record<AiFeature, boolean>>; image_model?: string }): Promise<AiSettings> =>
  req('/admin/ai/settings', { method: 'PUT', body: JSON.stringify(patch) });

export type ReplyKind = 'review' | 'question' | 'complaint' | 'comment';
export const draftReply = (kind: ReplyKind, id: number): Promise<{ text: string }> => post(`/draft-reply/${kind}/${id}`);

export type DhivehiKind = 'text' | 'name' | 'sms' | 'label';
export const draftDhivehi = (text: string, kind: DhivehiKind = 'text'): Promise<{ dv: string }> => post('/dhivehi', { text, kind });

export const suggestGlossary = (): Promise<{ words: Array<{ word: string; dv: string; sure: boolean }> }> => post('/glossary');

export const suggestNutrition = (ids: number[]): Promise<{ items: Array<{ id: number; nutrition: Record<string, number> }> }> => post('/nutrition', { ids });

export type CaptionWords = { headline: string; kicker?: string; tagline?: string; price?: string; was?: string; sticker?: string; cta?: string; phone?: string; link?: string };
export const draftCaption = (words: CaptionWords): Promise<{ en: string; dv: string }> => post('/caption', words);

export const draftNewsletter = (issue: { sections: unknown; removed_item_ids: number[] }, hint: string): Promise<{ subject_en: string; subject_dv: string; body_en: string; body_dv: string }> =>
  post('/newsletter', { ...issue, hint });

/** A scanned or photographed PO, read on the server. The draft is the invoice form's own shape. */
export async function readPoScan<T>(file: File): Promise<{ draft: T }> {
  const body = new FormData();
  body.append('file', file);
  return req('/admin/ai/po-read', { method: 'POST', body, timeoutMs: 150_000 });
}

/** What the assistant proposed by itself and nobody has decided yet (System → Integrations → Suggestions). */
export type AiSuggestionRow = {
  id: number; subject_id: number | null; subject: string;
  before: Record<string, unknown> | null; proposed: Record<string, unknown>;
  reason: string | null; made: string | null;
};
export type AiSuggestionKind = { key: string; label: string; about: string; can_approve: boolean; on: boolean; rows: AiSuggestionRow[] };

export type NoPhotoDish = { id: number; name: string; sold: number };
export const fetchAiSuggestions = (): Promise<{ kinds: AiSuggestionKind[]; ready: boolean; no_photo?: NoPhotoDish[] }> => req('/admin/ai/suggestions');
/** Ask the assistant now, for one kind. Takes up to a couple of minutes. */
export const lookForSuggestions = (kind: string): Promise<{ made: number }> => post('/suggestions/look', { kind }, 170_000);
export const decideSuggestions = (body: { approve?: number[]; reject?: number[]; edits?: Record<number, Record<string, string>> }): Promise<{ approved: number; rejected: number; stale: number }> =>
  post('/suggestions/decide', body, 60_000);
