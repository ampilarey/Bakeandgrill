import { describe, it, expect, vi, beforeEach } from 'vitest';

const request = vi.fn();
vi.mock('./client', () => ({
  request: (...a: unknown[]) => request(...a),
  API_ORIGIN: '',
  API_BASE_URL: '/api',
}));

import { fetchOnlineOrderingStatus, resetOnlineOrderingStatusShare } from './menu';

/*
 * Audit, 2026-09-17: the home page asked the server for the ordering status
 * four times on one load, once per component that mounted. One answer is
 * shared within a short window now.
 */
describe('fetchOnlineOrderingStatus', () => {
  beforeEach(() => {
    request.mockReset();
    resetOnlineOrderingStatusShare();
  });

  it('asks the server once for everyone who asks within the window', async () => {
    request.mockResolvedValue({ open: true, message: null });

    const [a, b, c] = await Promise.all([fetchOnlineOrderingStatus(), fetchOnlineOrderingStatus(), fetchOnlineOrderingStatus()]);

    expect(request).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ open: true, message: null });
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('does not remember a failure', async () => {
    request.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ open: false, message: 'Closed' });

    await expect(fetchOnlineOrderingStatus()).rejects.toThrow('down');
    await expect(fetchOnlineOrderingStatus()).resolves.toEqual({ open: false, message: 'Closed' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('asks again once the window has passed', async () => {
    vi.useFakeTimers();
    try {
      request.mockResolvedValue({ open: true, message: null });
      await fetchOnlineOrderingStatus();
      vi.setSystemTime(Date.now() + 16_000);
      await fetchOnlineOrderingStatus();
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
