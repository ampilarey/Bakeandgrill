import heic2any from 'heic2any';

const HEIC_MIME = /image\/hei[cf]/i;
const HEIC_EXT = /\.hei[cf]$/i;

/** Matches MenuImageProcessor::MASTER_MAX_EDGE — client pre-cap before upload. */
export const MASTER_MAX_EDGE = 3200;

/** HEIC decode can hang in some browsers; fail instead of spinning forever. */
const HEIC_CONVERT_TIMEOUT_MS = 30_000;
const BITMAP_DECODE_TIMEOUT_MS = 8_000;
const IMAGE_ELEMENT_TIMEOUT_MS = 10_000;

export const IPHONE_HEIC_ERROR =
  "Couldn't read this iPhone photo — set iPhone Settings→Camera→Formats to 'Most Compatible', or retry.";

export function isHeicFile(file: File): boolean {
  if (HEIC_MIME.test(file.type || '')) return true;
  return HEIC_EXT.test(file.name || '');
}

/** True when client-side image prep (HEIC convert / downscale) should run. */
export function isImageLikeFile(file: File): boolean {
  if (isHeicFile(file)) return true;
  if ((file.type || '').startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|hei[cf])$/i.test(file.name || '');
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

type SizedSource = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  close: () => void;
};

async function loadViaImageElement(file: File): Promise<SizedSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load timed out.'));
    }, IMAGE_ELEMENT_TIMEOUT_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        close: () => undefined,
      });
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image for resize.'));
    };
    img.src = url;
  });
}

async function loadSizedSource(file: File): Promise<SizedSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await withTimeout(
        createImageBitmap(file),
        BITMAP_DECODE_TIMEOUT_MS,
        'Image decode timed out.',
      );
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to <img> — createImageBitmap can hang/fail on some HEIC leftovers.
    }
  }

  return loadViaImageElement(file);
}

/**
 * Downscale to MASTER_MAX_EDGE max edge when needed. Smaller images pass through.
 * Output is JPEG @ 0.9 — same quality budget the server uses for masters.
 */
export async function downscaleImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp)$/i.test(file.name || '')) {
    return file;
  }

  let source: SizedSource;
  try {
    source = await loadSizedSource(file);
  } catch {
    // If we can't decode (corrupt / test stubs), send the original — server will validate.
    return file;
  }

  try {
    const srcW = source.width;
    const srcH = source.height;
    if (srcW < 1 || srcH < 1) return file;

    const scale = Math.min(1, MASTER_MAX_EDGE / Math.max(srcW, srcH));
    if (scale >= 1) return file;

    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    source.draw(ctx, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
    });
    if (!blob) return file;

    const base = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } finally {
    source.close();
  }
}

/**
 * Converts HEIC/HEIF → JPEG, then downscales to the master bound when needed.
 * iOS often sends an empty MIME type, so extension checks are required.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!isImageLikeFile(file)) {
    return file;
  }

  let prepared = file;

  if (isHeicFile(file)) {
    try {
      const converted = await withTimeout(
        Promise.resolve(
          heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.9,
          }),
        ),
        HEIC_CONVERT_TIMEOUT_MS,
        'HEIC conversion timed out',
      );
      const blob = Array.isArray(converted) ? converted[0] : converted;
      if (!(blob instanceof Blob)) {
        throw new Error('empty conversion');
      }
      const base = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
      prepared = new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    } catch {
      throw new Error(IPHONE_HEIC_ERROR);
    }
  }

  return downscaleImageForUpload(prepared);
}
