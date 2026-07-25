import { req } from './client';

export type MediaType = 'image' | 'video' | 'audio' | 'document';

export interface MediaCollection {
  id: number;
  name: string;
  slug: string;
}

export interface MediaAsset {
  id: number;
  url: string;
  thumb_url: string | null;
  media_type: MediaType;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  title: string | null;
  alt_text: string | null;
  tags: string[];
  source: string;
  collections: MediaCollection[];
  usage_count: number;
  original_url: string | null;
  /** Used to cache-bust previews after in-place replace edits. */
  checksum?: string | null;
  updated_at?: string | null;
}

export interface MediaPaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface MediaUsageItem {
  type: string;
  label: string;
  id: number | string;
  field: string;
}

export type MediaEditOp = 'convert' | 'resize' | 'crop' | 'rotate' | 'thumbnail' | 'optimize';

export interface MediaEditResult {
  asset: MediaAsset;
  updated_references: number;
  mode: 'replace' | 'copy';
}

export async function getMedia(params?: {
  type?: MediaType | '';
  source?: string;
  q?: string;
  tag?: string;
  collection?: string;
  page?: number;
  per_page?: number;
}): Promise<{ data: MediaAsset[]; meta: MediaPaginationMeta }> {
  const q = new URLSearchParams();
  if (params?.type) q.set('type', params.type);
  if (params?.source) q.set('source', params.source);
  if (params?.q) q.set('q', params.q);
  if (params?.tag) q.set('tag', params.tag);
  if (params?.collection) q.set('collection', params.collection);
  if (params?.page != null) q.set('page', String(params.page));
  if (params?.per_page != null) q.set('per_page', String(params.per_page));
  const qs = q.toString();
  return req(`/admin/media${qs ? `?${qs}` : ''}`);
}

export async function uploadMedia(
  files: File[],
  options?: { title?: string; alt_text?: string; collection_ids?: number[] },
): Promise<{ data: Array<{ asset: MediaAsset; deduped: boolean }> }> {
  const { prepareImageForUpload } = await import('../utils/prepareUpload');
  const form = new FormData();
  for (const f of files) {
    form.append('files[]', await prepareImageForUpload(f));
  }
  if (options?.title) form.append('title', options.title);
  if (options?.alt_text) form.append('alt_text', options.alt_text);
  for (const id of options?.collection_ids ?? []) form.append('collection_ids[]', String(id));
  return req('/admin/media', { method: 'POST', body: form });
}

export async function updateMedia(
  id: number,
  data: { title?: string; alt_text?: string; tags?: string[] },
): Promise<{ data: MediaAsset }> {
  return req(`/admin/media/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteMedia(id: number, force = false): Promise<void> {
  return req(`/admin/media/${id}?force=${force ? 1 : 0}`, { method: 'DELETE' });
}

export async function reconcileMedia(): Promise<{ reconciled: number }> {
  return req('/admin/media/reconcile', { method: 'POST', body: '{}' });
}

export async function getMediaUsage(id: number): Promise<{ data: MediaUsageItem[] }> {
  return req(`/admin/media/${id}/usage`);
}

export async function editMedia(
  id: number,
  op: MediaEditOp,
  params: Record<string, unknown>,
  mode: 'replace' | 'copy' = 'replace',
): Promise<MediaEditResult> {
  return req(`/admin/media/${id}/edit`, {
    method: 'POST',
    body: JSON.stringify({ op, params, mode }),
  });
}

export async function restoreMedia(id: number): Promise<{ asset: MediaAsset }> {
  return req(`/admin/media/${id}/restore`, { method: 'POST', body: '{}' });
}

export async function getMediaCollections(): Promise<{ data: MediaCollection[] }> {
  return req('/admin/media/collections');
}

export async function createMediaCollection(name: string): Promise<{ data: MediaCollection }> {
  return req('/admin/media/collections', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function updateMediaCollection(
  id: number,
  name: string,
): Promise<{ data: MediaCollection }> {
  return req(`/admin/media/collections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteMediaCollection(id: number): Promise<void> {
  return req(`/admin/media/collections/${id}`, { method: 'DELETE' });
}

export async function assignMediaCollections(
  id: number,
  collection_ids: number[],
): Promise<{ data: MediaAsset }> {
  return req(`/admin/media/${id}/collections`, {
    method: 'POST',
    body: JSON.stringify({ collection_ids }),
  });
}

export type MediaUseAsKey =
  | 'default_item_image'
  | 'favicon'
  | 'logo'
  | 'logo_dark'
  | 'og_image';

export async function useMediaAs(
  id: number,
  key: MediaUseAsKey,
): Promise<{ message: string; key: string; url: string }> {
  return req(`/admin/media/${id}/use-as`, {
    method: 'POST',
    body: JSON.stringify({ key }),
  });
}
