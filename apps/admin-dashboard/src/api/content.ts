import { req } from './client';

export type ContentScope = 'shared' | 'website' | 'order_app';

export type ContentBlock = {
  key: string;
  label: string;
  group: string;
  type: string;
  apps: string[];
  shareable: boolean;
  public: boolean;
  rich?: boolean;
  default?: string | null;
  shared: string | null;
  website: string | null;
  order_app: string | null;
  resolved_website: string | null;
  resolved_order_app: string | null;
  state: 'shared' | 'split';
};

export async function getContentBlocks(): Promise<{ blocks: ContentBlock[] }> {
  return req('/admin/content');
}

export async function updateContent(
  changes: Array<{ key: string; scope: ContentScope; value: string | null }>,
): Promise<{ blocks: ContentBlock[] }> {
  return req('/admin/content', { method: 'PUT', body: JSON.stringify({ changes }) });
}

export async function shareContentBlock(key: string): Promise<{ blocks: ContentBlock[] }> {
  return req(`/admin/content/${encodeURIComponent(key)}/share`, { method: 'POST', body: '{}' });
}

export async function splitContentBlock(key: string): Promise<{ blocks: ContentBlock[] }> {
  return req(`/admin/content/${encodeURIComponent(key)}/split`, { method: 'POST', body: '{}' });
}

export async function copyContentBlock(
  key: string,
  from: ContentScope,
  to: ContentScope,
): Promise<{ blocks: ContentBlock[] }> {
  return req(`/admin/content/${encodeURIComponent(key)}/copy`, {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  });
}

export async function uploadContentImage(
  key: string,
  scope: ContentScope,
  file: File,
  original?: File,
): Promise<{ url: string; thumb_url?: string; original_url?: string | null }> {
  const form = new FormData();
  form.append('key', key);
  form.append('scope', scope);
  form.append('file', file);
  if (original) form.append('original', original);
  return req('/admin/content/upload', { method: 'POST', body: form });
}
