import type { Area } from 'react-easy-crop';

/** Menu cards / POS tiles use 4:3. */
export const MENU_IMAGE_ASPECT = 4 / 3;

/**
 * Canonical thumbnail size saved for POS + website.
 * ~2× typical card width — sharp on retina, small enough for fast grids.
 * Must stay in sync with App\Services\MenuImageProcessor.
 */
export const MENU_IMAGE_WIDTH = 1200;
export const MENU_IMAGE_HEIGHT = 900;
const JPEG_QUALITY = 0.82;

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
 * Crop + optional rotate, then always export as 1200×900 JPEG.
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

  canvas.width = MENU_IMAGE_WIDTH;
  canvas.height = MENU_IMAGE_HEIGHT;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, MENU_IMAGE_WIDTH, MENU_IMAGE_HEIGHT);
  ctx.drawImage(
    source,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    MENU_IMAGE_WIDTH,
    MENU_IMAGE_HEIGHT,
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
