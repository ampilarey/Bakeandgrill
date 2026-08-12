import { describe, expect, it } from 'vitest';
import {
  buildRotateParams,
  cropParamsFromArea,
  isCropReady,
  isRotateReady,
  normalizeRotateDegrees,
  rotatePreviewTransforms,
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
