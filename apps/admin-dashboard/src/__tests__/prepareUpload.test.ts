import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPHONE_HEIC_ERROR, isHeicFile, prepareImageForUpload } from '../utils/prepareUpload';

const heic2any = vi.hoisted(() => vi.fn());

vi.mock('heic2any', () => ({
  default: (...args: unknown[]) => heic2any(...args),
}));

describe('prepareImageForUpload', () => {
  beforeEach(() => {
    heic2any.mockReset();
  });

  it('detects HEIC by mime or extension', () => {
    expect(isHeicFile(new File([new Uint8Array([1])], 'a.heic', { type: '' }))).toBe(true);
    expect(isHeicFile(new File([new Uint8Array([1])], 'a.HEIF', { type: '' }))).toBe(true);
    expect(isHeicFile(new File([new Uint8Array([1])], 'a.jpg', { type: 'image/heic' }))).toBe(true);
    expect(isHeicFile(new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }))).toBe(false);
  });

  it('converts HEIC to JPEG via heic2any', async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff]);
    heic2any.mockResolvedValue(new Blob([jpegBytes], { type: 'image/jpeg' }));

    const input = new File([new Uint8Array([1, 2, 3])], 'IMG_0001.heic', { type: '' });
    const out = await prepareImageForUpload(input);

    expect(heic2any).toHaveBeenCalledOnce();
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.jpg');
  });

  it('passes JPEG/PNG through unchanged', async () => {
    const jpeg = new File([new Uint8Array([1])], 'photo.jpg', { type: 'image/jpeg' });
    const png = new File([new Uint8Array([2])], 'photo.png', { type: 'image/png' });

    await expect(prepareImageForUpload(jpeg)).resolves.toBe(jpeg);
    await expect(prepareImageForUpload(png)).resolves.toBe(png);
    expect(heic2any).not.toHaveBeenCalled();
  });

  it('throws a friendly error when conversion fails', async () => {
    heic2any.mockRejectedValue(new Error('decode failed'));
    const input = new File([new Uint8Array([1])], 'bad.heic', { type: 'image/heic' });

    await expect(prepareImageForUpload(input)).rejects.toThrow(IPHONE_HEIC_ERROR);
  });
});
