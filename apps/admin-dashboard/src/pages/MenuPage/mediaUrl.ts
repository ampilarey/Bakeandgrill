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

/** Cropper working size — keeps the editor snappy. */
const MAX_CROP_SOURCE_EDGE = 2048;
/** Master kept on server for re-crop (matches MenuImageProcessor::MASTER_MAX_EDGE). */
const MAX_MASTER_EDGE = 3200;
const PREP_JPEG_QUALITY = 0.9;
const MASTER_JPEG_QUALITY = 0.9;

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

function drawScaled(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
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
  return canvas;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare image.'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * First upload: one decode → cropper preview + master File to store on the server.
 */
export async function prepareUploadFromFile(file: File): Promise<{ cropSrc: string; masterFile: File }> {
  const { prepareImageForUpload } = await import('../../utils/prepareUpload');
  const prepared = await prepareImageForUpload(file);
  const tempUrl = URL.createObjectURL(prepared);
  try {
    const img = await loadHtmlImage(tempUrl);
    const cropCanvas = drawScaled(img, MAX_CROP_SOURCE_EDGE);
    const masterCanvas = drawScaled(img, MAX_MASTER_EDGE);
    const [cropBlob, masterBlob] = await Promise.all([
      canvasToJpegBlob(cropCanvas, PREP_JPEG_QUALITY),
      canvasToJpegBlob(masterCanvas, MASTER_JPEG_QUALITY),
    ]);
    const base = (prepared.name || file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return {
      cropSrc: URL.createObjectURL(cropBlob),
      masterFile: new File([masterBlob], `${base}-master.jpg`, { type: 'image/jpeg' }),
    };
  } finally {
    URL.revokeObjectURL(tempUrl);
  }
}

/**
 * Re-crop from an existing master (or crop fallback) URL.
 * Caller must revokeCropSrc() when done.
 */
export async function prepareImageForCrop(source: File | string): Promise<string> {
  const tempUrl = source instanceof File ? URL.createObjectURL(source) : null;
  const src = source instanceof File ? tempUrl! : resolveMediaUrl(source);

  try {
    const img = await loadHtmlImage(src);
    const canvas = drawScaled(img, MAX_CROP_SOURCE_EDGE);
    const blob = await canvasToJpegBlob(canvas, PREP_JPEG_QUALITY);
    return URL.createObjectURL(blob);
  } finally {
    if (tempUrl) URL.revokeObjectURL(tempUrl);
  }
}
