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
