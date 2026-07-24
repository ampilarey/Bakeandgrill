import { describe, it, expect, vi } from 'vitest';
import { MENU_VIDEO_LIMITS, prepareVideoClip } from '../pages/MenuPage/videoClip';

describe('prepareVideoClip', () => {
  it('rejects oversized files before loading video', async () => {
    const big = new File([new Uint8Array(MENU_VIDEO_LIMITS.maxBytes + 1)], 'big.mp4', { type: 'video/mp4' });
    await expect(prepareVideoClip(big)).rejects.toThrow(/too large/i);
  });

  it('rejects non-video mime types', async () => {
    const bad = new File([new Uint8Array(10)], 'x.txt', { type: 'text/plain' });
    await expect(prepareVideoClip(bad)).rejects.toThrow(/MP4, WebM, or MOV/i);
  });

  it('rejects long duration via mocked video element', async () => {
    const file = new File([new Uint8Array(100)], 'clip.mp4', { type: 'video/mp4' });
    const createEl = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        const video = createEl('video') as HTMLVideoElement;
        Object.defineProperty(video, 'duration', { get: () => 30, configurable: true });
        Object.defineProperty(video, 'videoWidth', { get: () => 640 });
        Object.defineProperty(video, 'videoHeight', { get: () => 360 });
        queueMicrotask(() => video.onloadedmetadata?.(new Event('loadedmetadata')));
        return video;
      }
      return createEl(tag);
    });

    await expect(prepareVideoClip(file)).rejects.toThrow(/too long/i);
    vi.restoreAllMocks();
  });
});
