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

export type BuildItemSlidesOptions = {
  preferThumb?: boolean;
  fallbackAlt?: string;
  /** Customer default: gallery only (main image as empty-gallery fallback). Staff/legacy: `'all'`. */
  source?: 'gallery' | 'all';
  /** When source is gallery and photos are empty, emit no slides (no main-image fallback). */
  strict?: boolean;
  /**
   * Site default item photo — used when the item has no gallery/main image.
   * Rendered as a normal cover slide (fills the circle). Logo/monogram is last resort only.
   */
  defaultImageUrl?: string | null;
};

/**
 * Typed slides for item sheet / cards.
 * Default `source:'gallery'` — customers see gallery only (main image only if gallery empty).
 * Pass `source:'all'` for legacy main-image-first behaviour.
 */
export function buildItemSlides(
  item: {
    image_url?: string | null;
    thumb_url?: string | null;
    name?: string | null;
    photos?: PhotoLike[] | null;
  },
  options?: BuildItemSlidesOptions,
): MediaSlide[] {
  const preferThumb = options?.preferThumb === true;
  const fallbackAlt = options?.fallbackAlt || item.name || '';
  const source = options?.source ?? 'gallery';
  const strict = options?.strict === true;
  const out: MediaSlide[] = [];
  const seen = new Set<string>();

  const push = (slide: MediaSlide) => {
    const key = mediaKey(slide.url);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(slide);
  };

  const pushMain = () => {
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
  };

  const photos = [...(item.photos ?? [])].sort((a, b) => {
    if (!!a.is_primary !== !!b.is_primary) return a.is_primary ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  if (source === 'all') {
    pushMain();
  } else if (photos.length === 0) {
    if (!strict) pushMain();
    if (out.length === 0 && !strict) {
      const fallback = resolveMediaUrl(options?.defaultImageUrl);
      if (fallback) {
        push({ type: 'image', url: fallback, alt: fallbackAlt });
      }
    }
    return out;
  }

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

  if (out.length === 0 && !strict) {
    const fallback = resolveMediaUrl(options?.defaultImageUrl);
    if (fallback) {
      push({ type: 'image', url: fallback, alt: fallbackAlt });
    }
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
  options?: BuildItemSlidesOptions,
): string[] {
  return buildItemSlides(item, options).map((s) => {
    if (options?.preferThumb && s.type === 'video') {
      return s.poster || s.thumbUrl || s.url;
    }
    if (s.type === 'video') return s.poster || s.url;
    return s.url;
  });
}
