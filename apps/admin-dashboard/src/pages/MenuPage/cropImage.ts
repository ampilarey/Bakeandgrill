import type { Area } from 'react-easy-crop';

/** Menu cards use 4:3 — crop everything to this before upload. */
export const MENU_IMAGE_ASPECT = 4 / 3;

/** Longest edge after crop (keeps files light without looking soft on retina). */
const MAX_OUTPUT_EDGE = 1400;
const JPEG_QUALITY = 0.86;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('Could not load image for cropping.')));
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

/**
 * Crop + normalize to JPEG at a consistent size for menu/POS/website.
 */
export async function getCroppedMenuImage(
  imageSrc: string,
  pixelCrop: Area,
  fileName = 'menu-image.jpg',
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');

  let { width, height } = pixelCrop;
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  canvas.width = outW;
  canvas.height = outH;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode cropped image.'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });

  const base = fileName.replace(/\.[^.]+$/, '') || 'menu-image';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
