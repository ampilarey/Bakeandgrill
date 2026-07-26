import { req } from './client';

export type ContentScope = 'shared' | 'website' | 'order_app';
/** App scopes used by the two Content Studio editors (excludes invisible seed `shared`). */
export type ContentApp = 'website' | 'order_app';
export type ContentLocale = 'en' | 'dv';

export type ContentEditorHint =
  | 'hero'
  | 'categories'
  | 'trust'
  | 'proof'
  | 'about_values'
  | 'preorder_steps'
  | 'footer_links'
  | 'business_hours';

export type ContentBlock = {
  key: string;
  label: string;
  group: string;
  type: string;
  editor?: ContentEditorHint | string | null;
  locale?: ContentLocale | string;
  apps: string[];
  shareable: boolean;
  public: boolean;
  rich?: boolean;
  /** Optional helper shown under the label (from content registry). */
  description?: string | null;
  default?: string | null;
  shared: string | null;
  website: string | null;
  order_app: string | null;
  resolved_website: string | null;
  resolved_order_app: string | null;
  state: 'shared' | 'split';
  link_state?: 'same' | 'different';
  brand_synced?: boolean;
  section_enable?: boolean;
  section_order?: boolean;
  deprecated?: boolean;
};

export type ContentRevision = {
  id: number;
  key: string;
  scope: ContentScope;
  locale: string;
  value: string | null;
  user_id: number | null;
  created_at: string;
  published_at?: string | null;
  is_draft?: boolean;
};

export type ContentScheduleRow = {
  id: number;
  key: string;
  scope: ContentScope;
  locale: string;
  value: string | null;
  publish_at: string;
  status: 'pending' | 'published' | 'cancelled';
  published_at?: string | null;
};

export type ContentExportBundle = {
  version: number;
  exported_at: string;
  locale: string;
  entries: Array<{ key: string; scope: ContentScope; locale: string; value: string }>;
};

export async function getContentBlocks(locale: ContentLocale = 'en'): Promise<{
  blocks: ContentBlock[];
  locale: string;
  locales: string[];
}> {
  return req(`/admin/content?locale=${encodeURIComponent(locale)}`);
}

export async function updateContent(
  changes: Array<{ key: string; scope: ContentScope; value: string | null; locale?: ContentLocale }>,
  locale: ContentLocale = 'en',
): Promise<{ blocks: ContentBlock[] }> {
  return req('/admin/content', {
    method: 'PUT',
    body: JSON.stringify({ locale, changes }),
  });
}

/** Load autosaved drafts for an app scope (never public). */
export async function getContentDrafts(
  scope: ContentScope,
  locale: ContentLocale = 'en',
): Promise<{ drafts: Record<string, string>; saved_at: string | null }> {
  const q = new URLSearchParams({ scope, locale });
  return req(`/admin/content/drafts?${q}`);
}

/** Autosave unpublished drafts — does not promote to live SiteSetting. */
export async function saveContentDrafts(
  changes: Array<{ key: string; scope: ContentScope; value: string | null; locale?: ContentLocale }>,
  locale: ContentLocale = 'en',
): Promise<{ drafts: Record<string, string>; saved_at: string }> {
  return req('/admin/content/drafts', {
    method: 'PUT',
    body: JSON.stringify({ locale, changes }),
  });
}

export async function shareContentBlock(key: string, locale: ContentLocale = 'en'): Promise<{ blocks: ContentBlock[] }> {
  return req(`/admin/content/${encodeURIComponent(key)}/share`, {
    method: 'POST',
    body: JSON.stringify({ locale }),
  });
}

export async function splitContentBlock(key: string, locale: ContentLocale = 'en'): Promise<{ blocks: ContentBlock[] }> {
  return req(`/admin/content/${encodeURIComponent(key)}/split`, {
    method: 'POST',
    body: JSON.stringify({ locale }),
  });
}

export async function copyContentBlock(
  key: string,
  from: ContentScope,
  to: ContentScope,
  locale: ContentLocale = 'en',
): Promise<{ blocks: ContentBlock[] }> {
  return req(`/admin/content/${encodeURIComponent(key)}/copy`, {
    method: 'POST',
    body: JSON.stringify({ from, to, locale }),
  });
}

/** Client-side section copy — loops per-block copy (no batch endpoint). */
export async function copyContentSection(
  keys: string[],
  from: ContentScope,
  to: ContentScope,
  locale: ContentLocale = 'en',
): Promise<{ blocks: ContentBlock[] }> {
  let blocks: ContentBlock[] = [];
  for (const key of keys) {
    const res = await copyContentBlock(key, from, to, locale);
    blocks = res.blocks;
  }
  return { blocks };
}

export async function uploadContentImage(
  key: string,
  scope: ContentScope,
  file: File,
  original?: File,
  locale: ContentLocale = 'en',
): Promise<{ url: string; thumb_url?: string; original_url?: string | null }> {
  const { prepareImageForUpload } = await import('../utils/prepareUpload');
  const prepared = await prepareImageForUpload(file);
  const preparedOriginal = original ? await prepareImageForUpload(original) : undefined;
  const form = new FormData();
  form.append('key', key);
  form.append('scope', scope);
  form.append('locale', locale);
  form.append('file', prepared);
  if (preparedOriginal) form.append('original', preparedOriginal);
  return req('/admin/content/upload', { method: 'POST', body: form });
}

/** Hero video — reuses item video pipeline (raw clip + poster). */
export async function uploadContentVideo(
  key: string,
  scope: ContentScope,
  video: File,
  poster: File,
  locale: ContentLocale = 'en',
): Promise<{ url: string; poster_url: string; thumb_url?: string }> {
  const { prepareImageForUpload } = await import('../utils/prepareUpload');
  const preparedPoster = await prepareImageForUpload(poster);
  const form = new FormData();
  form.append('key', key);
  form.append('scope', scope);
  form.append('locale', locale);
  form.append('video', video);
  form.append('poster', preparedPoster);
  return req('/admin/content/upload-video', { method: 'POST', body: form });
}

export async function getContentRevisions(
  key: string,
  scope: ContentScope,
  locale: ContentLocale = 'en',
): Promise<{ revisions: ContentRevision[] }> {
  const q = new URLSearchParams({ scope, locale });
  return req(`/admin/content/${encodeURIComponent(key)}/revisions?${q}`);
}

export async function restoreContentRevision(
  key: string,
  id: number,
): Promise<{ blocks: ContentBlock[] }> {
  return req(`/admin/content/${encodeURIComponent(key)}/revisions/${id}/restore`, {
    method: 'POST',
    body: '{}',
  });
}

export async function scheduleContent(
  publishAt: string,
  changes: Array<{ key: string; scope: ContentScope; value: string | null; locale?: ContentLocale }>,
  locale: ContentLocale = 'en',
): Promise<{ schedules: ContentScheduleRow[] }> {
  return req('/admin/content/schedule', {
    method: 'POST',
    body: JSON.stringify({ publish_at: publishAt, locale, changes }),
  });
}

export async function getContentSchedules(
  status: string = 'pending',
): Promise<{ schedules: ContentScheduleRow[] }> {
  return req(`/admin/content/schedules?status=${encodeURIComponent(status)}`);
}

export async function cancelContentSchedule(id: number): Promise<{ schedule: ContentScheduleRow }> {
  return req(`/admin/content/schedules/${id}`, { method: 'DELETE' });
}

export async function exportContent(locale: ContentLocale = 'en'): Promise<ContentExportBundle> {
  return req(`/admin/content/export?locale=${encodeURIComponent(locale)}`);
}

export async function importContent(bundle: ContentExportBundle): Promise<{ applied: number; blocks: ContentBlock[] }> {
  return req('/admin/content/import', {
    method: 'POST',
    body: JSON.stringify(bundle),
  });
}

export async function createContentPreviewToken(
  app: ContentApp,
  overrides: Record<string, string>,
  locale: ContentLocale = 'en',
): Promise<{ token: string; website_url: string; order_app_url: string; expires_in: number }> {
  return req('/admin/content/preview-token', {
    method: 'POST',
    body: JSON.stringify({ app, locale, overrides }),
  });
}
