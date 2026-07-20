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

export function revokeCropSrc(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

/** Longest edge fed into the cropper — phone photos are often 12MP+ and freeze the UI. */
const MAX_CROP_SOURCE_EDGE = 2048;
const PREP_JPEG_QUALITY = 0.9;

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const isRemoteHttp =
      (src.startsWith('http://') || src.startsWith('https://')) &&
      !src.startsWith(window.location.origin);

    if (isRemoteHttp) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('That file is not a usable image.'));
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      reject(
        new Error(
          'Could not load this image. If previews are blank, on the server run: php artisan storage:link — then re-upload.',
        ),
      );
    };
    img.src = src;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare image for cropping.'))),
      'image/jpeg',
      PREP_JPEG_QUALITY,
    );
  });
}

/**
 * Decode a File or existing media URL, downscale huge photos, return a blob: URL
 * for the cropper. Caller must revokeCropSrc() when done.
 */
export async function prepareImageForCrop(source: File | string): Promise<string> {
  const tempUrl = source instanceof File ? URL.createObjectURL(source) : null;
  const src = source instanceof File ? tempUrl! : resolveMediaUrl(source);

  try {
    const img = await loadHtmlImage(src);
    const scale = Math.min(1, MAX_CROP_SOURCE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToJpegBlob(canvas);
    return URL.createObjectURL(blob);
  } finally {
    if (tempUrl) URL.revokeObjectURL(tempUrl);
  }
}
