import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPHONE_HEIC_ERROR, isHeicFile, prepareImageForUpload } from '../utils/prepareUpload';

const heic2any = vi.hoisted(() => vi.fn());

vi.mock('heic2any', () => ({
  default: (...args: unknown[]) => heic2any(...args),
}));

describe('prepareImageForUpload (pos-web)', () => {
  beforeEach(() => {
    heic2any.mockReset();
  });

  it('converts HEIC and passes through JPEG', async () => {
    heic2any.mockResolvedValue(new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' }));
    const heic = new File([new Uint8Array([1])], 'a.heic', { type: 'image/heic' });
    const out = await prepareImageForUpload(heic);
    expect(out.name).toBe('a.jpg');
    expect(isHeicFile(heic)).toBe(true);

    const jpeg = new File([new Uint8Array([1])], 'b.jpg', { type: 'image/jpeg' });
    await expect(prepareImageForUpload(jpeg)).resolves.toBe(jpeg);
  });

  it('surfaces friendly error', async () => {
    heic2any.mockRejectedValue(new Error('fail'));
    await expect(
      prepareImageForUpload(new File([new Uint8Array([1])], 'x.heic', { type: '' })),
    ).rejects.toThrow(IPHONE_HEIC_ERROR);
  });
});
