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
    // data: / blob: must not set crossOrigin; only remote http(s) need it
    if (src.startsWith('http://') || src.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = src;
  });
}

function createRotatedSource(
  image: HTMLImageElement,
  rotation: number,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const width = Math.round(image.naturalWidth * cos + image.naturalHeight * sin);
  const height = Math.round(image.naturalWidth * sin + image.naturalHeight * cos);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rad);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return { canvas, width, height };
}

/**
 * Crop + optional rotate, then normalize to JPEG for menu/POS/website thumbnails.
 */
export async function getCroppedMenuImage(
  imageSrc: string,
  pixelCrop: Area,
  fileName = 'menu-image.jpg',
  rotation = 0,
): Promise<File> {
  const image = await loadImage(imageSrc);
  const rot = ((rotation % 360) + 360) % 360;

  let source: CanvasImageSource = image;
  if (rot !== 0) {
    source = createRotatedSource(image, rot).canvas;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');

  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(pixelCrop.width, pixelCrop.height));
  const outW = Math.max(1, Math.round(pixelCrop.width * scale));
  const outH = Math.max(1, Math.round(pixelCrop.height * scale));

  canvas.width = outW;
  canvas.height = outH;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    source,
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
