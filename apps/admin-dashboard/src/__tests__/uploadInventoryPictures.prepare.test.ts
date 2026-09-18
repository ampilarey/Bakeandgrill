import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * Audit, 2026-09-18: the item and brand pictures were the only uploads in
 * the admin that skipped the client-side shrink, so a phone photo went up
 * as taken and hit the host's upload limit before the server saw it.
 */

const prepareImageForUpload = vi.hoisted(() =>
  vi.fn(async (f: File): Promise<File> => f),
);
const req = vi.hoisted(() =>
  vi.fn(async (_path?: string, _opts?: unknown): Promise<unknown> => ({})),
);

vi.mock('../utils/prepareUpload', () => ({
  prepareImageForUpload: (file: File) => prepareImageForUpload(file),
}));

vi.mock('../api/client', () => ({
  req: (path: string, opts?: unknown) => req(path, opts),
}));

const heic = new File([new Uint8Array([1])], 'shot.heic', { type: 'image/heic' });
const jpeg = new File([new Uint8Array([2])], 'shot.jpg', { type: 'image/jpeg' });

describe('inventory pictures are shrunk before they are sent', () => {
  beforeEach(() => {
    prepareImageForUpload.mockReset();
    prepareImageForUpload.mockResolvedValue(jpeg);
    req.mockReset();
    req.mockResolvedValue({});
  });

  it('the item picture', async () => {
    const { uploadInventoryPhoto } = await import('../api/operations');
    await uploadInventoryPhoto(5, heic);

    expect(prepareImageForUpload).toHaveBeenCalledWith(heic);
    const call = req.mock.calls[0] as unknown as [string, { body: FormData }];
    expect(call[0]).toBe('/inventory/5/photo');
    expect(call[1].body.get('photo')).toBe(jpeg);
  });

  it('the packet picture, and a brand without one still saves', async () => {
    const { uploadBrandPhoto } = await import('../api/operations');
    await uploadBrandPhoto(5, 'Sunrise', heic);

    expect(prepareImageForUpload).toHaveBeenCalledWith(heic);
    let call = req.mock.calls[0] as unknown as [string, { body: FormData }];
    expect(call[1].body.get('photo')).toBe(jpeg);
    expect(call[1].body.get('brand')).toBe('Sunrise');

    prepareImageForUpload.mockClear();
    await uploadBrandPhoto(5, 'Sunrise', null);
    expect(prepareImageForUpload).not.toHaveBeenCalled();
    call = req.mock.calls[1] as unknown as [string, { body: FormData }];
    expect(call[1].body.get('photo')).toBeNull();
  });
});
