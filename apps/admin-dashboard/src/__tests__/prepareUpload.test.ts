import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IPHONE_HEIC_ERROR,
  MASTER_MAX_EDGE,
  isHeicFile,
  prepareImageForUpload,
} from '../utils/prepareUpload';

const heicTo = vi.hoisted(() => vi.fn());

vi.mock('heic-to/csp', () => ({
  heicTo: (...args: unknown[]) => heicTo(...args),
}));

describe('prepareImageForUpload', () => {
  beforeEach(() => {
    heicTo.mockReset();
    // Force the Image fallback path with a fast reject for undecodable stubs.
    vi.stubGlobal('createImageBitmap', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('detects HEIC by mime or extension', () => {
    expect(isHeicFile(new File([new Uint8Array([1])], 'a.heic', { type: '' }))).toBe(true);
    expect(isHeicFile(new File([new Uint8Array([1])], 'a.HEIF', { type: '' }))).toBe(true);
    expect(isHeicFile(new File([new Uint8Array([1])], 'a.jpg', { type: 'image/heic' }))).toBe(true);
    expect(isHeicFile(new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }))).toBe(false);
  });

  it('converts HEIC to JPEG via heic-to when native decode is unavailable', async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff]);
    heicTo.mockResolvedValue(new Blob([jpegBytes], { type: 'image/jpeg' }));

    class FailImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailImage as unknown as typeof Image);
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => undefined,
    });

    const input = new File([new Uint8Array([1, 2, 3])], 'IMG_0001.heic', { type: '' });
    const out = await prepareImageForUpload(input);

    expect(heicTo).toHaveBeenCalledOnce();
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.jpg');
  });

  it('uses native createImageBitmap for HEIC when available (Safari path)', async () => {
    const drawImage = vi.fn();
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 100,
      height: 80,
      close,
    })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => {
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }));
    });

    const input = new File([new Uint8Array([1])], 'shot.heic', { type: 'image/heic' });
    const out = await prepareImageForUpload(input);

    expect(heicTo).not.toHaveBeenCalled();
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('shot.jpg');
    expect(close).toHaveBeenCalled();
  });

  it('passes small JPEG/PNG through when decode fails or already within bound', async () => {
    class FailImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailImage as unknown as typeof Image);
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => undefined,
    });

    const jpeg = new File([new Uint8Array([1])], 'photo.jpg', { type: 'image/jpeg' });
    const png = new File([new Uint8Array([2])], 'photo.png', { type: 'image/png' });

    await expect(prepareImageForUpload(jpeg)).resolves.toBe(jpeg);
    await expect(prepareImageForUpload(png)).resolves.toBe(png);
    expect(heicTo).not.toHaveBeenCalled();
  });

  it('throws a friendly error when conversion fails', async () => {
    heicTo.mockRejectedValue(new Error('decode failed'));
    class FailImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailImage as unknown as typeof Image);
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => undefined,
    });
    const input = new File([new Uint8Array([1])], 'bad.heic', { type: 'image/heic' });

    await expect(prepareImageForUpload(input)).rejects.toThrow(IPHONE_HEIC_ERROR);
  });

  it('throws a friendly error when HEIC conversion hangs past timeout', async () => {
    vi.useFakeTimers();
    heicTo.mockImplementation(() => new Promise(() => { /* never settles */ }));
    class FailImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailImage as unknown as typeof Image);
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => undefined,
    });
    const input = new File([new Uint8Array([1])], 'slow.heic', { type: 'image/heic' });

    const pending = prepareImageForUpload(input);
    const assertion = expect(pending).rejects.toThrow(IPHONE_HEIC_ERROR);
    // Native path times out first (~13s), then WASM path at 45s.
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    vi.useRealTimers();
  });

  it('skips non-image files without calling heic-to', async () => {
    const pdf = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
    const out = await prepareImageForUpload(pdf);
    expect(out).toBe(pdf);
    expect(heicTo).not.toHaveBeenCalled();
  });

  it('downscales images larger than MASTER_MAX_EDGE', async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'huge.jpg', { type: 'image/jpeg' });

    const drawImage = vi.fn();
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 6400,
      height: 4800,
      close,
      // drawImage on canvas uses the bitmap as the source argument
    })));

    // Patch CanvasRenderingContext2D.drawImage via getContext mock
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => {
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }));
    });

    const out = await prepareImageForUpload(file);

    expect(out).not.toBe(file);
    expect(out.type).toBe('image/jpeg');
    expect(drawImage).toHaveBeenCalled();
    const drawn = drawImage.mock.calls[0];
    expect(drawn[3]).toBe(MASTER_MAX_EDGE);
    expect(drawn[4]).toBe(2400);
    expect(close).toHaveBeenCalled();
  });
});
