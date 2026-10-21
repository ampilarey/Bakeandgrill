import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '../components/ui';

/*
 * A toast takes itself down after four seconds. The timer belongs to the
 * provider: dismissed by hand it is cleared, and an unmounted provider leaves
 * none behind (CI, 2026-10-21: a timer that outlived a test file's window set
 * state on a gone tree and threw "window is not defined").
 */

function Fire() {
  const { success } = useToast();
  return <button type="button" onClick={() => success('Saved')}>Fire</button>;
}

describe('ToastProvider', () => {
  it('shows a toast and takes it down after four seconds', () => {
    vi.useFakeTimers();
    try {
      render(<ToastProvider><Fire /></ToastProvider>);
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      expect(screen.getByText('Saved')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(4000); });
      expect(screen.queryByText('Saved')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the timer of a toast dismissed by hand, and every timer when it unmounts', () => {
    vi.useFakeTimers();
    try {
      const view = render(<ToastProvider><Fire /></ToastProvider>);
      const idle = vi.getTimerCount();
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      expect(vi.getTimerCount()).toBe(idle + 2);
      fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);
      expect(vi.getTimerCount()).toBe(idle + 1);
      view.unmount();
      expect(vi.getTimerCount()).toBe(idle);
    } finally {
      vi.useRealTimers();
    }
  });
});
