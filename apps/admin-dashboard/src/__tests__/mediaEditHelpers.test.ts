import { describe, expect, it } from 'vitest';
import {
  buildRotateParams,
  computeResizeOutputSize,
  cropParamsFromArea,
  cropSourceUrl,
  isCropReady,
  isRotateReady,
  mediaExportFilename,
  normalizeRotateDegrees,
  rotatePreviewTransforms,
  scaleSizeToPreview,
  toggleFlipAxis,
} from '../utils/mediaEditHelpers';

describe('mediaEditHelpers — crop', () => {
  it('rounds pixel area into API crop params', () => {
    expect(cropParamsFromArea({ x: 10.4, y: 20.6, width: 100.2, height: 80.9 })).toEqual({
      x: 10,
      y: 21,
      width: 100,
      height: 81,
    });
  });

  it('prefers master URL for crop source so coords match the server', () => {
    expect(cropSourceUrl({
      url: '/storage/library/images/display.jpg',
      original_url: '/storage/library/images/masters/full.jpg',
    })).toBe('/storage/library/images/masters/full.jpg');
    expect(cropSourceUrl({
      url: '/storage/library/images/display.jpg',
      original_url: null,
    })).toBe('/storage/library/images/display.jpg');
  });

  it('requires positive width and height', () => {
    expect(isCropReady({})).toBe(false);
    expect(isCropReady({ width: 0, height: 40 })).toBe(false);
    expect(isCropReady({ width: 40, height: 40, x: 0, y: 0 })).toBe(true);
  });
});

describe('mediaEditHelpers — rotate', () => {
  it('normalizes degrees to 0–359', () => {
    expect(normalizeRotateDegrees(90)).toBe(90);
    expect(normalizeRotateDegrees(360)).toBe(0);
    expect(normalizeRotateDegrees(-90)).toBe(270);
    expect(normalizeRotateDegrees(450)).toBe(90);
  });

  it('builds params carrying flip AND degrees together', () => {
    expect(buildRotateParams(45, 'horizontal')).toEqual({ degrees: 45, flip: 'horizontal' });
    expect(buildRotateParams(0, 'vertical')).toEqual({ flip: 'vertical' });
    expect(buildRotateParams(90, '')).toEqual({ degrees: 90 });
  });

  it('toggles flip axes including both', () => {
    expect(toggleFlipAxis('', 'horizontal')).toBe('horizontal');
    expect(toggleFlipAxis('horizontal', 'vertical')).toBe('both');
    expect(toggleFlipAxis('both', 'horizontal')).toBe('vertical');
  });

  it('is ready when either flip or degrees is set', () => {
    expect(isRotateReady({})).toBe(false);
    expect(isRotateReady({ degrees: 0 })).toBe(false);
    expect(isRotateReady({ degrees: 45 })).toBe(true);
    expect(isRotateReady({ flip: 'horizontal' })).toBe(true);
    expect(isRotateReady({ degrees: 45, flip: 'both' })).toBe(true);
  });

  it('preview transform applies flip then rotate', () => {
    expect(rotatePreviewTransforms(90, 'horizontal')).toBe('scaleX(-1) rotate(90deg)');
    expect(rotatePreviewTransforms(0, 'both')).toBe('scaleX(-1) scaleY(-1)');
  });
});

describe('mediaEditHelpers — export', () => {
  it('prefers filename from URL path when present', () => {
    expect(mediaExportFilename({
      id: 1,
      url: 'https://cdn.example.com/media/hero-shot.jpg?v=abc',
      title: 'Ignored',
      mime_type: 'image/jpeg',
    })).toBe('hero-shot.jpg');
  });

  it('builds filename from title + mime when URL has no extension', () => {
    expect(mediaExportFilename({
      id: 9,
      url: 'https://cdn.example.com/media/9',
      title: 'Café Banner!',
      mime_type: 'image/png',
    })).toBe('Caf_Banner.png');
  });
});

describe('mediaEditHelpers — resize preview', () => {
  it('fits inside target box when keep_aspect and both sides set', () => {
    // 400×300 into 200×75 → ratio min(0.5, 0.25) = 0.25 → 100×75
    expect(computeResizeOutputSize(400, 300, { width: 200, height: 75, keepAspect: true }))
      .toEqual({ width: 100, height: 75 });
  });

  it('scales from width alone when keep_aspect (height defaults to source)', () => {
    expect(computeResizeOutputSize(400, 300, { width: 200, keepAspect: true }))
      .toEqual({ width: 200, height: 150 });
  });

  it('stretches to exact size when keep_aspect is false', () => {
    expect(computeResizeOutputSize(400, 300, { width: 200, height: 50, keepAspect: false }))
      .toEqual({ width: 200, height: 50 });
  });

  it('scales preview box to max edge without inventing layout metrics', () => {
    expect(scaleSizeToPreview(400, 300, 200)).toEqual({ width: 200, height: 150 });
    expect(scaleSizeToPreview(50, 40, 200)).toEqual({ width: 50, height: 40 });
  });
});
