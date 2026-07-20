import { getAdminApiOrigin } from '../../api/client';

/** Resolve relative /storage/… paths so admin previews work on any host. */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (
    url.startsWith('blob:')
    || url.startsWith('data:')
    || url.startsWith('http://')
    || url.startsWith('https://')
  ) {
    return url;
  }
  const origin = getAdminApiOrigin() || window.location.origin;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Fetch an existing image into a blob: URL so the cropper + canvas can edit
 * it without CORS tainting (works for same-origin /storage paths).
 */
export async function loadImageAsObjectUrl(url: string): Promise<string> {
  const resolved = resolveMediaUrl(url);
  const res = await fetch(resolved, { credentials: 'same-origin', cache: 'reload' });
  if (!res.ok) {
    throw new Error('Could not load this image for editing. Try uploading it again.');
  }
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('That file is not a usable image.');
  }
  return URL.createObjectURL(blob);
}
