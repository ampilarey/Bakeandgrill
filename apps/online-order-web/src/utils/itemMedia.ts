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

export type MediaSlide = {
  type: 'image' | 'video';
  url: string;
  poster?: string | null;
  alt?: string;
  thumbUrl?: string | null;
};

type PhotoLike = {
  url: string;
  thumb_url?: string | null;
  poster_url?: string | null;
  media_type?: 'image' | 'video' | string | null;
  alt_text?: string | null;
  sort_order?: number;
  is_primary?: boolean;
};

/**
 * Typed slides for item sheet / cards. Main image first, then gallery.
 */
export function buildItemSlides(
  item: {
    image_url?: string | null;
    thumb_url?: string | null;
    name?: string | null;
    photos?: PhotoLike[] | null;
  },
  options?: { preferThumb?: boolean; fallbackAlt?: string },
): MediaSlide[] {
  const preferThumb = options?.preferThumb === true;
  const fallbackAlt = options?.fallbackAlt || item.name || '';
  const out: MediaSlide[] = [];
  const seen = new Set<string>();

  const push = (slide: MediaSlide) => {
    const key = mediaKey(slide.url);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(slide);
  };

  const main = preferThumb ? (item.thumb_url || item.image_url) : item.image_url;
  const mainResolved = resolveMediaUrl(main);
  if (mainResolved) {
    push({
      type: 'image',
      url: mainResolved,
      thumbUrl: resolveMediaUrl(item.thumb_url),
      alt: fallbackAlt,
    });
  }

  const photos = [...(item.photos ?? [])].sort((a, b) => {
    if (!!a.is_primary !== !!b.is_primary) return a.is_primary ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  for (const photo of photos) {
    const isVideo = (photo.media_type || 'image') === 'video';
    if (isVideo) {
      const videoUrl = resolveMediaUrl(photo.url);
      if (!videoUrl) continue;
      push({
        type: 'video',
        url: videoUrl,
        poster: resolveMediaUrl(photo.poster_url || photo.thumb_url),
        alt: photo.alt_text || fallbackAlt,
        thumbUrl: resolveMediaUrl(photo.thumb_url || photo.poster_url),
      });
      continue;
    }
    const img = preferThumb ? (photo.thumb_url || photo.url) : photo.url;
    const resolved = resolveMediaUrl(img);
    if (!resolved) continue;
    push({
      type: 'image',
      url: resolved,
      thumbUrl: resolveMediaUrl(photo.thumb_url),
      alt: photo.alt_text || fallbackAlt,
    });
  }

  return out;
}

/**
 * @deprecated Prefer buildItemSlides. Kept for older call sites.
 */
export function buildItemSlideUrls(
  item: {
    image_url?: string | null;
    thumb_url?: string | null;
    photos?: PhotoLike[] | null;
  },
  options?: { preferThumb?: boolean },
): string[] {
  return buildItemSlides(item, options).map((s) => {
    if (options?.preferThumb && s.type === 'video') {
      return s.poster || s.thumbUrl || s.url;
    }
    if (s.type === 'video') return s.poster || s.url;
    return s.url;
  });
}
