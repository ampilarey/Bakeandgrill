import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary, SIGNAGE_RESTART_MS, signageRestartDelay } from './ErrorBoundary';

/*
 * Signage audit, 2026-09-23: a crashed board showed "Something went wrong"
 * with a Reload button, on a TV with no mouse. It restarts itself now.
 */

const reloadBoard = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/signageBoard', () => ({ reloadBoard: (...a: unknown[]) => reloadBoard(...a) }));

function Boom(): never {
  throw new Error('render failed');
}

beforeEach(() => {
  vi.useFakeTimers();
  reloadBoard.mockClear();
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ErrorBoundary — signage variant', () => {
  it('shows a dark restart notice, with no button, and reloads by itself', () => {
    render(<ErrorBoundary variant="signage"><Boom /></ErrorBoundary>);

    expect(screen.getByTestId('signage-crash')).toHaveTextContent(/Restarting the board/);
    expect(screen.queryByRole('button')).toBeNull();
    expect(reloadBoard).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(SIGNAGE_RESTART_MS); });
    expect(reloadBoard).toHaveBeenCalledTimes(1);
  });

  it('keeps the old buttons for the customer pages', () => {
    render(<ErrorBoundary inline><Boom /></ErrorBoundary>);
    expect(screen.queryByTestId('signage-crash')).toBeNull();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(reloadBoard).not.toHaveBeenCalled();
  });
});

describe('signageRestartDelay', () => {
  it('restarts quickly the first time and backs off when it is crashing in a loop', () => {
    const now = 1_000_000;
    expect(signageRestartDelay(now)).toBe(SIGNAGE_RESTART_MS);
    // Crashed again 30 s later — this is a loop, wait a minute.
    expect(signageRestartDelay(now + 30_000)).toBe(60_000);
    // Long after, it is a fresh crash again.
    expect(signageRestartDelay(now + 30_000 + 10 * 60_000)).toBe(SIGNAGE_RESTART_MS);
  });

  it('copes with no storage at all', () => {
    expect(signageRestartDelay(Date.now(), null)).toBe(SIGNAGE_RESTART_MS);
  });
});
