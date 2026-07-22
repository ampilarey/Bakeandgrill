import type { Area } from 'react-easy-crop';

/** Menu cards / POS tiles use 4:3. */
export const MENU_IMAGE_ASPECT = 4 / 3;

/**
 * Canonical thumbnail size saved for POS + website.
 * Must stay in sync with App\Services\MenuImageProcessor.
 */
export const MENU_IMAGE_WIDTH = 1200;
export const MENU_IMAGE_HEIGHT = 900;

/** Category menu promo (ZUS-style). Matches order-app CSS aspect-ratio 7/3. */
export const CATEGORY_BANNER_ASPECT = 7 / 3;
export const CATEGORY_BANNER_WIDTH = 1400;
export const CATEGORY_BANNER_HEIGHT = 600;

const JPEG_QUALITY = 0.82;

export type CropOutputSize = {
  width: number;
  height: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('Could not load image for cropping.')));
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
 * Crop + optional rotate, then export as JPEG at the given size
 * (default 1200×900 for menu items).
 */
export async function getCroppedMenuImage(
  imageSrc: string,
  pixelCrop: Area,
  fileName = 'menu-image.jpg',
  rotation = 0,
  output: CropOutputSize = { width: MENU_IMAGE_WIDTH, height: MENU_IMAGE_HEIGHT },
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

  canvas.width = output.width;
  canvas.height = output.height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.drawImage(
    source,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    output.width,
    output.height,
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
