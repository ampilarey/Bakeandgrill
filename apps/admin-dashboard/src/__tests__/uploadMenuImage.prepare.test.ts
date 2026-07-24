import { describe, it, expect, vi, beforeEach } from 'vitest';

const prepareImageForUpload = vi.hoisted(() =>
  vi.fn(async (f: File): Promise<File> => f),
);
const req = vi.hoisted(() =>
  vi.fn(async (_path?: string, _opts?: unknown): Promise<{ url: string }> => ({
    url: '/storage/x.jpg',
  })),
);

vi.mock('../utils/prepareUpload', () => ({
  prepareImageForUpload: (file: File) => prepareImageForUpload(file),
}));

vi.mock('../api/client', () => ({
  req: (path: string, opts?: unknown) => req(path, opts),
}));

describe('uploadMenuImage prepares HEIC before send', () => {
  beforeEach(() => {
    prepareImageForUpload.mockReset();
    prepareImageForUpload.mockImplementation(async (f: File) => f);
    req.mockReset();
    req.mockResolvedValue({ url: '/storage/x.jpg' });
  });

  it('calls prepareImageForUpload before building FormData', async () => {
    const { uploadMenuImage } = await import('../api/menu');
    const heic = new File([new Uint8Array([1])], 'shot.heic', { type: 'image/heic' });
    const jpeg = new File([new Uint8Array([2])], 'shot.jpg', { type: 'image/jpeg' });
    prepareImageForUpload.mockResolvedValue(jpeg);

    await uploadMenuImage(heic);

    expect(prepareImageForUpload).toHaveBeenCalledWith(heic);
    expect(req).toHaveBeenCalled();
    const call = req.mock.calls[0] as unknown as [string, { body: FormData }];
    const sent = call[1].body.get('image') as File;
    expect(sent).toBe(jpeg);
    expect(sent.name).toBe('shot.jpg');
  });
});
