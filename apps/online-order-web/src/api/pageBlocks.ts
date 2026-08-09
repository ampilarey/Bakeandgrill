import { request } from './client';

export type PageBlockRow = {
  id: number;
  app: string;
  page: string;
  block_type: string;
  position: number;
  is_enabled: boolean;
  content_mode: 'shared' | 'own';
  settings: Record<string, unknown>;
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
