import { afterEach, describe, expect, it, vi } from 'vitest';
import { fold } from './fold';

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

type Fake = { onfinish: (() => void) | null; cancel: ReturnType<typeof vi.fn>; ready: Promise<void>; opts: KeyframeAnimationOptions };

/** Owner, 2026-10-07: "it hides and reappears for a millisecond like a flash". */
describe('fold', () => {
  const original = HTMLElement.prototype.animate;
  const runs: Fake[] = [];
  afterEach(() => {
    HTMLElement.prototype.animate = original;
    runs.length = 0;
  });
  const fake = () => {
    HTMLElement.prototype.animate = vi.fn(function (_k: Keyframe[], opts: KeyframeAnimationOptions) {
      const run: Fake = { onfinish: null, cancel: vi.fn(), ready: Promise.resolve(), opts };
      runs.push(run);
      return run as unknown as Animation;
    }) as unknown as typeof HTMLElement.prototype.animate;
  };

  it('holds a closed panel shut after it ends, until the next fold lets go', async () => {
    fake();
    const el = document.createElement('div');
    const done = vi.fn();
    fold(el, false, done);
    // Starts on the next frame, after the work of the tap that asked for it.
    expect(runs).toHaveLength(0);
    await frame();
    expect(runs[0].opts.fill).toBe('forwards');
    runs[0].onfinish?.();
    expect(done).toHaveBeenCalled();
    // Not let go here: letting go before the panel is hidden is the flash.
    expect(runs[0].cancel).not.toHaveBeenCalled();
    fold(el, true);
    expect(runs[0].cancel).toHaveBeenCalled();
  });

  it('pins an opening panel shut until its animation is running', async () => {
    fake();
    const el = document.createElement('div');
    fold(el, true);
    expect(el.style.height).toBe('0px');
    expect(el.style.opacity).toBe('0');
    await frame();
    await runs[0].ready;
    await Promise.resolve();
    expect(el.style.height).toBe('');
    expect(el.style.opacity).toBe('');
  });

  it('a stale stop does not undo the fold that replaced it', async () => {
    fake();
    const el = document.createElement('div');
    const stopClose = fold(el, false);
    await frame();
    fold(el, true);
    stopClose();
    expect(el.style.overflow).toBe('hidden');
    expect(el.style.height).toBe('0px');
  });
});
