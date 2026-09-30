import { describe, expect, it, vi, beforeEach } from 'vitest';

/*
 * Owner, 2026-09-30: a PNG with a see-through background came out with black
 * around the dish. The crop source and master are JPEG, so the canvas must be
 * painted white before the photo is drawn onto it.
 */
describe('crop source preparation', () => {
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    const ctx = {
      set fillStyle(v: string) { calls.push(`fill:${v}`); },
      fillRect: () => calls.push('fillRect'),
      drawImage: () => calls.push('drawImage'),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/jpeg' }));
    });
    class FakeImage {
      naturalWidth = 1200; naturalHeight = 900; onload: (() => void) | null = null; onerror: (() => void) | null = null;
      decoding = ''; crossOrigin: string | null = null;
      set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
      decode() { return Promise.resolve(); }
    }
    vi.stubGlobal('Image', FakeImage);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });

  it('paints white under the photo before drawing it', async () => {
    const { prepareImageForCrop } = await import('../pages/MenuPage/mediaUrl');
    await prepareImageForCrop('/storage/menu/a.png');

    const fill = calls.indexOf('fill:#ffffff');
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('fillRect')).toBeGreaterThan(fill);
    expect(calls.indexOf('drawImage')).toBeGreaterThan(calls.indexOf('fillRect'));
  });
});
