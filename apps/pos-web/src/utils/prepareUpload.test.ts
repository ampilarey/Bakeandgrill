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

describe('prepareImageForUpload (pos-web)', () => {
  beforeEach(() => {
    heicTo.mockReset();
    vi.stubGlobal('createImageBitmap', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('converts HEIC and passes through JPEG', async () => {
    heicTo.mockResolvedValue(new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }));

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

    const heic = new File([new Uint8Array([1])], 'a.heic', { type: 'image/heic' });
    const out = await prepareImageForUpload(heic);
    expect(out.name).toBe('a.jpg');
    expect(isHeicFile(heic)).toBe(true);

    const jpeg = new File([new Uint8Array([1])], 'b.jpg', { type: 'image/jpeg' });
    await expect(prepareImageForUpload(jpeg)).resolves.toBe(jpeg);
  });

  it('surfaces friendly error', async () => {
    heicTo.mockRejectedValue(new Error('fail'));
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
    await expect(
      prepareImageForUpload(new File([new Uint8Array([1])], 'x.heic', { type: '' })),
    ).rejects.toThrow(IPHONE_HEIC_ERROR);
  });

  it('downscales images larger than MASTER_MAX_EDGE', async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'huge.jpg', { type: 'image/jpeg' });

    const drawImage = vi.fn();
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 6400,
      height: 4800,
      close,
    })));

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
