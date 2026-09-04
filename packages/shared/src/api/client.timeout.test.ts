import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, DEFAULT_REQUEST_TIMEOUT_MS } from './client';

/**
 * No request may hang forever.
 *
 * Owner, 2026-09-04: "still it freez after updating and its ok after
 * sometime". Every call in all three apps was a bare fetch() with no
 * AbortController, so on a weak signal a request sat open for as long as the
 * OS allowed. Browsers cap concurrent connections per host at six, so a few
 * stalled polls queued everything behind them — including whatever the
 * cashier pressed next — and it came back on its own once the OS dropped the
 * sockets. That is the freeze, and the recovery.
 */
describe('API client request deadline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const client = () => createApiClient({ baseUrl: 'https://example.test/api' });

  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers();
    // A socket that is open but silent — exactly the phone-on-one-bar case.
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })));

    const pending = client().request('/anything');
    const assertion = expect(pending).rejects.toThrow(/took too long/i);

    await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS + 100);
    await assertion;
  });

  it('lets a normal answer through untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })));

    await expect(client().request<{ ok: boolean }>('/anything')).resolves.toEqual({ ok: true });
  });

  it('passes an abort signal to fetch so the socket is actually released', async () => {
    const spy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', spy);

    await client().request('/anything');

    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('leaves uploads unbounded — a photo on a slow link is not a fault', async () => {
    const spy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', spy);

    const body = new FormData();
    body.append('file', new Blob(['x']), 'a.png');
    await client().request('/upload', { method: 'POST', body });

    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal, 'FormData bodies opt out of the deadline').toBeUndefined();
  });

  it('honours a caller-supplied deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })));

    const pending = client().request('/slow', { timeoutMs: 500 });
    const assertion = expect(pending).rejects.toThrow(/took too long/i);

    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });
});
