import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { blankSpec } from './types';

const made = vi.hoisted(() => ({ pictureOf: vi.fn(), saveFile: vi.fn(), canShare: true }));
vi.mock('./picture', async (orig) => ({
  ...(await orig<typeof import('./picture')>()),
  pictureOf: made.pictureOf,
  saveFile: made.saveFile,
  canShareFiles: () => made.canShare,
}));

import { SaveSheet } from './SaveSheet';

const ASSETS = { photo: null, logoLight: null, logoDark: null, flame: null, qr: null };
const SPEC = { ...blankSpec({ name: 'Bake & Grill' }), headline: 'Frozen Momo' };

describe('Save or share', () => {
  const share = vi.fn((_data: { files: File[]; text?: string }) => Promise.resolve());
  beforeEach(() => {
    made.pictureOf.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    made.saveFile.mockReset();
    made.canShare = true;
    share.mockClear();
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    URL.createObjectURL = vi.fn(() => 'blob:made');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('on a phone, shares one size or all four through the share sheet, straight from the tap', async () => {
    render(<SaveSheet spec={SPEC} layout="splash" palette="rust" assets={ASSETS} name="" caption="Frozen Momo" videoUrl={null} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share or save the Story picture' }));
    expect(share).toHaveBeenCalledTimes(1);
    const one = share.mock.calls[0][0];
    expect(one.files.map((f) => f.name)).toEqual(['frozen-momo-story.png']);
    expect(one.text).toBe('Frozen Momo');

    fireEvent.click(screen.getByRole('button', { name: /Share or save all 4/ }));
    const all = share.mock.calls[1][0];
    expect(all.files.map((f) => f.name)).toEqual(['frozen-momo-portrait.png', 'frozen-momo-square.png', 'frozen-momo-story.png', 'frozen-momo-wide.png']);
    expect(made.saveFile).not.toHaveBeenCalled();
  });

  it('on a computer, downloads each size or all four', async () => {
    made.canShare = false;
    render(<SaveSheet spec={SPEC} layout="splash" palette="rust" assets={ASSETS} name="Momo offer" caption="" videoUrl={null} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download the Square picture' }));
    expect(made.saveFile).toHaveBeenCalledTimes(1);
    expect(made.saveFile.mock.calls[0][1]).toBe('momo-offer-square.png');
    fireEvent.click(screen.getByRole('button', { name: /Download all 4/ }));
    await waitFor(() => expect(made.saveFile).toHaveBeenCalledTimes(5), { timeout: 4000 });
    expect(share).not.toHaveBeenCalled();
  });

  it('shows the video with its own share button once it is fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['v'], { type: 'video/mp4' })) })));
    render(<SaveSheet spec={SPEC} layout="splash" palette="rust" assets={ASSETS} name="" caption="" videoUrl="/storage/social-posters/video/a.mp4" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Share or save the video/ }));
    const sent = share.mock.calls[0][0];
    expect(sent.files[0].name).toBe('frozen-momo.mp4');
    expect(sent.files[0].type).toBe('video/mp4');
    vi.unstubAllGlobals();
  });
});
