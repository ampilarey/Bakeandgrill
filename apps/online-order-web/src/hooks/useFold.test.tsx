import { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFold } from './useFold';

const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

function Panel({ open }: { open: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useFold(open, ref);
  return shown ? <div ref={ref} data-testid="panel">times</div> : null;
}

type Fake = { keyframes: Keyframe[]; onfinish: (() => void) | null; cancel: () => void };

/** Owner, 2026-10-07: "it hides suddenly. Cant u animate". */
describe('useFold', () => {
  const runs: Fake[] = [];
  const original = HTMLElement.prototype.animate;
  afterEach(() => {
    HTMLElement.prototype.animate = original;
    runs.length = 0;
  });

  it('unfolds on open, and keeps the panel until it has folded shut', async () => {
    HTMLElement.prototype.animate = vi.fn(function (keyframes: Keyframe[]) {
      const run: Fake = { keyframes, onfinish: null, cancel: vi.fn() };
      runs.push(run);
      return run as unknown as Animation;
    }) as unknown as typeof HTMLElement.prototype.animate;

    const { rerender } = render(<Panel open={false} />);
    expect(screen.queryByTestId('panel')).toBeNull();
    expect(runs).toHaveLength(0);

    rerender(<Panel open />);
    expect(screen.getByTestId('panel')).toBeInTheDocument();
    await frame();
    expect(runs).toHaveLength(1);
    expect(runs[0].keyframes[0]).toMatchObject({ height: '0px', opacity: 0 });

    rerender(<Panel open={false} />);
    // Still there, folding.
    expect(screen.getByTestId('panel')).toBeInTheDocument();
    await frame();
    expect(runs).toHaveLength(2);
    expect(runs[1].keyframes[1]).toMatchObject({ height: '0px', opacity: 0 });

    act(() => runs[1].onfinish?.());
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('does not move on first paint', async () => {
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    render(<Panel open />);
    await frame();
    expect(screen.getByTestId('panel')).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
  });
});
