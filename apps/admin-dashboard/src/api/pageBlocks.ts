import { req } from './client';

export type PageBlockApp = 'website' | 'order_app';

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
  app: PageBlockApp;
  page: string;
  block_type: string;
  position: number;
  is_enabled: boolean;
  content_mode: 'shared' | 'own';
  shared_content_id?: number | null;
  shared_content_uuid?: string | null;
  settings: Record<string, unknown>;
  /** Media resolved server-side for image/video blocks. */
  media?: PageBlockMedia;
  label: string;
  description: string;
  removable: boolean;
  non_removable_reason?: string | null;
  supports_shared_content: boolean;
  /** Generic content blocks may be added more than once per page. */
  allows_multiple?: boolean;
  unknown?: boolean;
};

export type PageBlockType = {
  type: string;
  label: string;
  description: string;
  apps: string[];
  removable: boolean;
  non_removable_reason?: string | null;
  supports_shared_content: boolean;
  allows_multiple?: boolean;
  /** Laravel rules keyed by settings field — drives the editor form. */
  settings_schema?: Record<string, string>;
  settings_defaults?: Record<string, unknown>;
};

export async function fetchAdminPageBlocks(app: PageBlockApp, page = 'home'): Promise<{
  app: string;
  page: string;
  blocks: PageBlockRow[];
  available_types: PageBlockType[];
  unknown_types: string[];
  draft: boolean;
  version: number;
  saved_at?: string | null;
}> {
  const qs = new URLSearchParams({ app, page });
  return req(`/admin/page-blocks?${qs}`);
}

export async function createPageBlock(payload: {
  app: PageBlockApp;
  page?: string;
  version: number;
  block_type: string;
  content_mode?: 'shared' | 'own';
  settings?: Record<string, unknown>;
}): Promise<{ block: PageBlockRow; version: number; draft: boolean }> {
  return req('/admin/page-blocks', {
    method: 'POST',
    body: JSON.stringify({ page: 'home', ...payload }),
  });
}

export async function updatePageBlock(
  id: number,
  payload: Partial<{
    position: number;
    is_enabled: boolean;
    content_mode: 'shared' | 'own';
    settings: Record<string, unknown>;
    share_source: 'website' | 'order_app' | 'shared';
    app: PageBlockApp;
    page: string;
    version: number;
  }>,
): Promise<{ block: PageBlockRow; version: number; draft: boolean }> {
  return req(`/admin/page-blocks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deletePageBlock(payload: {
  id: number;
  app: PageBlockApp;
  page?: string;
  version: number;
}): Promise<{ message: string; blocks: PageBlockRow[]; version: number; draft: boolean }> {
  return req(`/admin/page-blocks/${payload.id}`, {
    method: 'DELETE',
    body: JSON.stringify({ app: payload.app, page: payload.page ?? 'home', version: payload.version }),
  });
}

export async function reorderPageBlocks(payload: {
  app: PageBlockApp;
  page?: string;
  version: number;
  blocks: Array<{ id: number; position: number; is_enabled: boolean }>;
}): Promise<{ blocks: PageBlockRow[]; version: number; draft: boolean }> {
  return req('/admin/page-blocks/reorder', {
    method: 'PUT',
    body: JSON.stringify({ page: 'home', ...payload }),
  });
}

export async function createPageBlockPreviewToken(payload: {
  app: PageBlockApp;
  page?: string;
  version?: number;
}): Promise<{ token: string; expires_in: number; draft: boolean; website_url?: string; order_app_url?: string }> {
  return req('/admin/page-blocks/preview-token', {
    method: 'POST',
    body: JSON.stringify({ page: 'home', ...payload }),
  });
}

export async function publishPageBlocks(payload: {
  app: PageBlockApp;
  page?: string;
  version: number;
}): Promise<{ message: string; blocks: PageBlockRow[]; version: number; draft: boolean }> {
  return req('/admin/page-blocks/publish', {
    method: 'POST',
    body: JSON.stringify({ page: 'home', ...payload }),
  });
}

export async function discardPageBlockDraft(payload: {
  app: PageBlockApp;
  page?: string;
}): Promise<{ message: string; blocks: PageBlockRow[]; version: number; draft: boolean }> {
  return req('/admin/page-blocks/discard', {
    method: 'POST',
    body: JSON.stringify({ page: 'home', ...payload }),
  });
}
