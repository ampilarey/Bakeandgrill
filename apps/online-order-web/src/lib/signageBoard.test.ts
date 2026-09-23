import { describe, expect, it, vi } from 'vitest';
import { boardNeedsReload, currentBuild, isSignagePath, reloadBoard } from './signageBoard';

describe('isSignagePath', () => {
  it('matches the board routes only', () => {
    expect(isSignagePath('/order/tv')).toBe(true);
    expect(isSignagePath('/order/tv/')).toBe(true);
    expect(isSignagePath('/order/tv/counter')).toBe(true);
    expect(isSignagePath('/order/tv/counter/')).toBe(true);
    expect(isSignagePath('/order')).toBe(false);
    expect(isSignagePath('/order/menu')).toBe(false);
    expect(isSignagePath('/order/tvx')).toBe(false);
    expect(isSignagePath('/order/track/abc')).toBe(false);
  });
});

describe('currentBuild', () => {
  const docWith = (content: string | null) => ({
    querySelector: () => (content === null ? null : { getAttribute: () => content }),
  }) as unknown as Document;

  it('reads the stamped build id', () => {
    expect(currentBuild(docWith('abc123def456'))).toBe('abc123def456');
  });

  it('treats the unreplaced placeholder and a missing tag as no build', () => {
    expect(currentBuild(docWith('__SW_BUILD_ID__'))).toBeNull();
    expect(currentBuild(docWith(''))).toBeNull();
    expect(currentBuild(docWith(null))).toBeNull();
    expect(currentBuild(undefined)).toBeNull();
  });
});

describe('boardNeedsReload', () => {
  it('asks for a reload only when both sides are known and differ', () => {
    expect(boardNeedsReload('aaa', 'bbb')).toBe(true);
    expect(boardNeedsReload('aaa', 'aaa')).toBe(false);
    expect(boardNeedsReload(null, 'bbb')).toBe(false);
    expect(boardNeedsReload('aaa', null)).toBe(false);
    expect(boardNeedsReload('aaa', undefined)).toBe(false);
  });
});

describe('reloadBoard', () => {
  it('asks the service worker for an update, then reloads', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn();
    const win = {
      navigator: { serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ update }) } },
      location: { reload },
    } as unknown as Window;

    await reloadBoard(win);

    expect(update).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when there is no worker or the update fails', async () => {
    const reload = vi.fn();
    await reloadBoard({ navigator: {}, location: { reload } } as unknown as Window);
    expect(reload).toHaveBeenCalledTimes(1);

    const reload2 = vi.fn();
    await reloadBoard({
      navigator: { serviceWorker: { getRegistration: vi.fn().mockRejectedValue(new Error('offline')) } },
      location: { reload: reload2 },
    } as unknown as Window);
    expect(reload2).toHaveBeenCalledTimes(1);
  });
});
