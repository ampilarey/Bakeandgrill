import type { Area } from 'react-easy-crop';

/** Pixel crop params sent to MediaEditor::opCrop. */
export type MediaCropParams = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Round react-easy-crop pixel area into API crop params.
 * Pure — no DOM. Breakage-proof for Stage 1 tests.
 */
export function cropParamsFromArea(pixels: Area): MediaCropParams {
  return {
    x: Math.max(0, Math.round(pixels.x)),
    y: Math.max(0, Math.round(pixels.y)),
    width: Math.max(1, Math.round(pixels.width)),
    height: Math.max(1, Math.round(pixels.height)),
  };
}

export function isCropReady(params: Record<string, unknown>): boolean {
  return Number(params.width) > 0 && Number(params.height) > 0;
}

/** Normalize to 0–359 (clockwise UI). */
export function normalizeRotateDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  let n = Math.round(degrees) % 360;
  if (n < 0) n += 360;
  return n;
}

export type MediaFlip = '' | 'horizontal' | 'vertical' | 'both';

export function toggleFlipAxis(current: MediaFlip, axis: 'horizontal' | 'vertical'): MediaFlip {
  if (axis === 'horizontal') {
    if (current === 'horizontal') return '';
    if (current === 'vertical') return 'both';
    if (current === 'both') return 'vertical';
    return 'horizontal';
  }
  if (current === 'vertical') return '';
  if (current === 'horizontal') return 'both';
  if (current === 'both') return 'horizontal';
  return 'vertical';
}

/**
 * Build rotate API params. Flip and degrees travel together so the backend
 * can apply both (Stage 2c). Omits empty flip / zero degrees keys when alone
 * would be a no-op — callers still validate with isRotateReady.
 */
export function buildRotateParams(degrees: number, flip: MediaFlip): Record<string, unknown> {
  const d = normalizeRotateDegrees(degrees);
  const out: Record<string, unknown> = {};
  if (d !== 0) out.degrees = d;
  if (flip) out.flip = flip;
  return out;
}

export function isRotateReady(params: Record<string, unknown>): boolean {
  const degrees = normalizeRotateDegrees(Number(params.degrees) || 0);
  const flip = String(params.flip || '');
  return degrees !== 0 || flip === 'horizontal' || flip === 'vertical' || flip === 'both';
}

/** CSS transform list for live rotate preview (flip then rotate). */
export function rotatePreviewTransforms(degrees: number, flip: MediaFlip): string {
  const parts: string[] = [];
  if (flip === 'horizontal' || flip === 'both') parts.push('scaleX(-1)');
  if (flip === 'vertical' || flip === 'both') parts.push('scaleY(-1)');
  const d = normalizeRotateDegrees(degrees);
  if (d) parts.push(`rotate(${d}deg)`);
  return parts.join(' ');
}

function mimeExtension(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'application/pdf': 'pdf',
  };
  if (map[mime]) return map[mime];
  const sub = mime.split('/')[1];
  return (sub || 'bin').split('+')[0] || 'bin';
}

/** Filename for browser download / export. */
export function mediaExportFilename(asset: {
  url: string;
  title?: string | null;
  mime_type?: string | null;
  id: number;
}): string {
  const fromUrl = (asset.url.split('?')[0] || '').split('/').pop() || '';
  if (fromUrl.includes('.')) return fromUrl;
  const base = (asset.title || `media-${asset.id}`).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || `media-${asset.id}`;
  return `${base}.${mimeExtension(asset.mime_type || 'application/octet-stream')}`;
}

/** Fetch the asset and trigger a file download (export). */
export async function exportMediaAsset(
  asset: {
    url: string;
    title?: string | null;
    mime_type?: string | null;
    id: number;
    original_url?: string | null;
  },
  preferOriginal = false,
): Promise<void> {
  const raw = (preferOriginal && asset.original_url) ? asset.original_url : asset.url;
  if (!raw) throw new Error('No file URL to export');
  const filename = mediaExportFilename({ ...asset, url: raw });
  const res = await fetch(raw, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
