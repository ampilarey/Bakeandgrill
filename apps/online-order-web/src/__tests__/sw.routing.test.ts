import { describe, expect, it, vi } from 'vitest';
import swSource from '../../public/sw.js?raw';

/**
 * Which requests the order app's service worker answers itself.
 *
 * Owner, 2026-10-06: "CSRF token mismatch" on sign-in, in private mode too.
 * /sanctum/csrf-cookie is not under /api/, so it fell through to the
 * catch-all stale-while-revalidate and was answered from cache after the
 * first visit. A cached reply sets no cookie; the app had just cleared the
 * old XSRF cookie; the OTP request went out with no token and got 419,
 * every time. These tests pin that session endpoints and any non-file
 * response reach the network untouched.
 */

type FetchEvent = { request: Request; respondWith: ReturnType<typeof vi.fn> };

function loadFetchHandler(): (e: FetchEvent) => void {
  const listeners: Record<string, (e: FetchEvent) => void> = {};
  const self = {
    addEventListener: (name: string, fn: (e: FetchEvent) => void) => { listeners[name] = fn; },
    navigator: { onLine: true },
    location: { origin: 'https://bakeandgrill.mv' },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll: vi.fn() },
    registration: { showNotification: vi.fn() },
  };
  const cache = { match: vi.fn().mockResolvedValue(undefined), put: vi.fn(), add: vi.fn() };
  const caches = { open: vi.fn().mockResolvedValue(cache), keys: vi.fn().mockResolvedValue([]), delete: vi.fn(), match: vi.fn() };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('self', 'caches', 'clients', 'fetch', swSource)(self, caches, self.clients, vi.fn().mockResolvedValue(new Response('')));
  return listeners.fetch;
}

function answeredByWorker(path: string, init: RequestInit = {}): boolean {
  const handler = loadFetchHandler();
  const event: FetchEvent = { request: new Request(`https://bakeandgrill.mv${path}`, init), respondWith: vi.fn() };
  handler(event);
  return event.respondWith.mock.calls.length > 0;
}

describe('service worker routing', () => {
  it('never answers the CSRF cookie or other session endpoints', () => {
    expect(answeredByWorker('/sanctum/csrf-cookie')).toBe(false);
    expect(answeredByWorker('/sanctum/csrf-cookie?_=abc123')).toBe(false);
    expect(answeredByWorker('/customer/logout')).toBe(false);
    expect(answeredByWorker('/broadcasting/auth')).toBe(false);
  });

  it('never answers API calls other than the cached menu, nor anything that is not a file', () => {
    expect(answeredByWorker('/api/auth/customer/check')).toBe(false);
    expect(answeredByWorker('/order/reset.js')).toBe(false);
    expect(answeredByWorker('/receipts/abc/pdf')).toBe(false);
    expect(answeredByWorker('/api/auth/customer/otp/request', { method: 'POST', body: '{}' })).toBe(false);
  });

  it('still serves the menu, the app bundle, images, fonts and pages', () => {
    expect(answeredByWorker('/api/categories')).toBe(true);
    expect(answeredByWorker('/order/assets/index-abc123.js')).toBe(true);
    expect(answeredByWorker('/storage/menu/bajiya.webp')).toBe(true);
    expect(answeredByWorker('/fonts/a_faruma.woff2')).toBe(true);
    expect(answeredByWorker('/css/dhivehi-font.css')).toBe(true);
    expect(answeredByWorker('/order/menu', { headers: { accept: 'text/html' } })).toBe(true);
  });
});
