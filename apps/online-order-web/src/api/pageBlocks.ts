import { request } from './client';

export type PageBlockMedia = {
  image?: {
    url: string;
    webp?: string | null;
    thumb?: string | null;
    thumb_webp?: string | null;
    alt?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
  video?: {
    url: string;
    poster_url?: string | null;
    alt?: string | null;
  } | null;
} | null;

export type PageBlockRow = {
  id: number;
  app: string;
  page: string;
  block_type: string;
  position: number;
  is_enabled: boolean;
  content_mode: 'shared' | 'own';
  settings: Record<string, unknown>;
  /** Media resolved server-side for image/video blocks. */
  media?: PageBlockMedia;
  label?: string;
  unknown?: boolean;
};

export async function fetchPageBlocks(params: {
  app: 'website' | 'order_app';
  page?: string;
  previewToken?: string | null;
}): Promise<{ app: string; page: string; blocks: PageBlockRow[]; preview?: boolean }> {
  const qs = new URLSearchParams({ app: params.app, page: params.page ?? 'home' });
  if (params.previewToken) qs.set('preview_token', params.previewToken);
  return request(`/page-blocks?${qs.toString()}`);
}
