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
 * Load an existing image as a data: URL for the cropper.
 * Uses <img> + canvas (img-src) instead of fetch (connect-src), so CSP cannot
 * block re-crop of same-origin /storage files.
 */
export function loadImageAsDataUrl(url: string): Promise<string> {
  const resolved = resolveMediaUrl(url);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const isRemoteHttp =
      (resolved.startsWith('http://') || resolved.startsWith('https://')) &&
      !resolved.startsWith(window.location.origin);

    if (isRemoteHttp) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('That file is not a usable image.'));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas is not supported in this browser.'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        reject(
          new Error(
            'Could not read this image for editing (blocked by the host). Re-upload the photo.',
          ),
        );
      }
    };

    img.onerror = () => {
      reject(
        new Error(
          'Could not load this image for editing. If previews are blank, on the server run: php artisan storage:link — then re-upload.',
        ),
      );
    };

    img.src = resolved;
  });
}
