import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBusyError, request } from './client';

/**
 * UI audit, 2026-10-10: a refused menu read (429, "too many requests")
 * showed "Couldn't load the menu. Check your connection", and Retry made it
 * worse. A refused read now waits as long as the server asks, once, and
 * tries again; the page can tell "busy" from "no connection".
 */

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a read the server refuses as too frequent', () => {
  it('waits as long as the server asked and tries once more', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(429, { message: 'Too Many Attempts.' }, { 'Retry-After': '3' }))
      .mockResolvedValueOnce(reply(200, { data: ['Bajiya'] }));

    const pending = request<{ data: string[] }>('/items');
    await vi.advanceTimersByTimeAsync(2900);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);

    await expect(pending).resolves.toEqual({ data: ['Bajiya'] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry and says it was busy, not offline', async () => {
    fetchMock.mockResolvedValue(reply(429, { message: 'Too Many Attempts.' }, { 'Retry-After': '1' }));

    const pending = request('/items').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1100);
    const error = await pending;

    expect(isBusyError(error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not sit waiting when the server asks for a long pause', async () => {
    fetchMock.mockResolvedValue(reply(429, { message: 'Too Many Attempts.' }, { 'Retry-After': '45' }));

    const error = await request('/items').catch((e: unknown) => e);

    expect(isBusyError(error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never repeats an order or a payment', async () => {
    fetchMock.mockResolvedValue(reply(429, { message: 'Too Many Attempts.' }, { 'Retry-After': '1' }));

    const error = await request('/orders', { method: 'POST', body: '{}' }).catch((e: unknown) => e);

    expect(isBusyError(error)).toBe(true);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/orders'))).toHaveLength(1);
  });
});
