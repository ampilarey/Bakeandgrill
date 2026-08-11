/**
 * Guards for destructive go-live specs (stock / invoices / refunds / SMS).
 * These must never hit a remote host — especially the shared test server.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { obtainStaffToken } from '../fixtures/auth';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** True when URL (or hostname) is clearly local loopback. */
export function isLocalBaseUrl(urlOrHost: string): boolean {
  try {
    const u = urlOrHost.includes('://') ? new URL(urlOrHost) : new URL(`http://${urlOrHost}`);
    return LOCAL_HOSTS.has(u.hostname);
  } catch {
    return LOCAL_HOSTS.has(urlOrHost);
  }
}

/**
 * Fail loudly if the Playwright baseURL is not localhost.
 * Call from beforeAll / beforeEach of every destructive go-live spec.
 */
export function assertLocalOnlyBaseUrl(baseURL: string | undefined): void {
  const url = baseURL ?? '';
  if (!isLocalBaseUrl(url)) {
    throw new Error(
      `REFUSING to run destructive go-live specs against non-local baseURL "${url}". ` +
        'Set BASE_URL=http://127.0.0.1:8000 and use --project=local. ' +
        'These tests move stock, raise invoices, refund money, or touch SMS.',
    );
  }
}

/** Owner-only SMS kill switch — belt-and-braces on top of SMS_LIVE=false. */
export async function enableSmsGlobalKillSwitch(request: APIRequestContext): Promise<void> {
  const token = await obtainStaffToken(request);
  expect(token, 'staff token required to enable SMS kill switch').not.toBe('');

  const res = await request.patch('/api/admin/sms/global-kill-switch', {
    headers: { Authorization: `Bearer ${token}` },
    data: { enabled: true },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Failed to enable SMS global kill switch (${res.status()}): ${body}`);
  }
  const data = (await res.json()) as { global_kill_switch?: boolean };
  expect(data.global_kill_switch).toBe(true);
}

/** Convenience: guard + kill switch for a page's request context. */
export async function prepareDestructiveLocalRun(page: Page): Promise<void> {
  assertLocalOnlyBaseUrl(page.context().baseURL ?? process.env.BASE_URL);
  await enableSmsGlobalKillSwitch(page.request);
}
