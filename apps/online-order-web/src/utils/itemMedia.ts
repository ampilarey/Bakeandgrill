import { API_ORIGIN } from '../api';

/** Resolve relative storage paths against the API origin. */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

function mediaKey(url: string): string {
  try {
    const u = new URL(url, API_ORIGIN || 'http://local');
    return u.pathname.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

type PhotoLike = {
  url: string;
  thumb_url?: string | null;
  sort_order?: number;
  is_primary?: boolean;
};

/**
 * Main Image first, then Photos gallery (deduped). Used for menu card / sheet slideshows.
 * When preferThumb is true (menu cards), use thumb_url when present.
 */
export function buildItemSlideUrls(
  item: {
    image_url?: string | null;
    thumb_url?: string | null;
    photos?: PhotoLike[] | null;
  },
  options?: { preferThumb?: boolean },
): string[] {
  const preferThumb = options?.preferThumb === true;
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | null | undefined) => {
    const resolved = resolveMediaUrl(raw);
    if (!resolved) return;
    const key = mediaKey(resolved);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(resolved);
  };

  push(preferThumb ? (item.thumb_url || item.image_url) : item.image_url);

  const photos = [...(item.photos ?? [])].sort((a, b) => {
    if (!!a.is_primary !== !!b.is_primary) return a.is_primary ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  for (const photo of photos) {
    push(preferThumb ? (photo.thumb_url || photo.url) : photo.url);
  }

  return out;
}
