import { renderPost, type PostAssets } from './draw';
import { paletteOf, type PostSize, type PostSpec } from './types';

/** A finished picture at the platform's own size. */
export async function pictureOf(spec: PostSpec, layout: string, palette: string, size: PostSize, assets: PostAssets, type: 'image/png' | 'image/jpeg'): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  renderPost(ctx, size.w, size.h, spec, layout, paletteOf(palette), assets);
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, 0.92);
    } catch {
      resolve(null);
    }
  });
}

/** "frozen-momo-story.png": the post's name and the shape, so four files are told apart in Photos or Files. */
export function fileName(spec: PostSpec, name: string, size: PostSize, ext = 'png'): string {
  const base = (name || spec.headline || 'post').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'post';
  return `${base}-${size.key}.${ext}`;
}

/** Hand a file to the browser's own download. */
export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Whether this device's share sheet takes these files (an iPhone's does: Save Image, WhatsApp, Instagram…). */
export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      && typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    return false;
  }
}
