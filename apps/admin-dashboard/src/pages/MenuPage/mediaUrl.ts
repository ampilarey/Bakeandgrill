/**
 * Resolve menu image URLs for admin preview / re-crop.
 * Prefer same-origin /storage paths so previews work even when APP_URL differs.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;

  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url);
      // Old uploads used absolute asset() URLs — rewrite storage paths to this host
      if (parsed.pathname.startsWith('/storage/')) {
        return `${window.location.origin}${parsed.pathname}${parsed.search}`;
      }
      return url;
    }
  } catch {
    /* fall through */
  }

  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Convert a File to a data: URL (allowed by CSP; blob: was blocked until CSP update). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read image file.'));
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Load an existing image as a data: URL for the cropper (avoids blob: CSP issues
 * and CORS tainting when reading from /storage).
 */
export async function loadImageAsDataUrl(url: string): Promise<string> {
  const resolved = resolveMediaUrl(url);
  const res = await fetch(resolved, { credentials: 'same-origin', cache: 'reload' });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? 'Image file is missing on the server (check storage link). Re-upload the photo.'
        : 'Could not load this image for editing. Try uploading it again.',
    );
  }
  const blob = await res.blob();
  if (!blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') {
    // Some servers omit image/* for /storage — still try to read as image
    if (blob.size === 0) throw new Error('That file is not a usable image.');
  }
  return fileToDataUrl(new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' }));
}
