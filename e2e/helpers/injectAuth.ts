/**
 * Shared authentication helpers for all Playwright specs.
 *
 * Consolidates the injectAdminToken / injectCustomerAuth helpers that were
 * previously copy-pasted across admin-auth, checkout, and apps-smoke specs.
 */
import { type Page, expect } from '@playwright/test';

import {
  ADMIN_PASSWORD,
  ADMIN_PHONE,
  ADMIN_PIN,
  staffPinLoginBody,
  TEST_PHONE,
  TEST_PASSWORD,
} from '../fixtures/auth';
import { waitForCustomerSession } from './wait';

export { ADMIN_PIN, TEST_PHONE, TEST_PASSWORD };

// ── Admin auth (Sanctum stateful session cookie) ───────────────────────────

async function waitForAdminAuth(page: Page): Promise<boolean> {
  const resp = await page
    .waitForResponse(
      (r) => r.url().includes('/api/auth/me') && r.status() === 200,
      { timeout: 20_000 },
    )
    .catch(() => null);
  return resp !== null;
}

/**
 * Establish an admin web session via the page's request context (shared cookie jar),
 * then navigate to the admin SPA.
 */
export async function gotoAdminAuthenticated(page: Page, path = '/admin/dashboard'): Promise<void> {
  let ok = false;

  // Sanctum stateful session auth only starts a session when Origin/Referer
  // match SANCTUM_STATEFUL_DOMAINS. Playwright's APIRequestContext omits them
  // unless we set them explicitly.
  const base = page.context().baseURL ?? 'http://127.0.0.1:8000';
  const statefulHeaders = {
    'X-Requested-With': 'XMLHttpRequest',
    Origin: base.replace(/\/$/, ''),
    Referer: `${base.replace(/\/$/, '')}/admin/`,
  };

  await page.request.get('/sanctum/csrf-cookie').catch(() => null);

  if (ADMIN_PHONE && ADMIN_PASSWORD) {
    const res = await page.request.post('/api/auth/staff/login', {
      data: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD },
      headers: statefulHeaders,
    });
    ok = res.ok();
  }

  if (!ok) {
    const res = await page.request.post('/api/auth/staff/pin-login', {
      data: { ...staffPinLoginBody(), intent: 'admin' },
      headers: statefulHeaders,
    });
    ok = res.ok();
    if (!ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`gotoAdminAuthenticated: admin login failed — ${JSON.stringify(body)}`);
    }
  }

  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  let authed = await waitForAdminAuth(page);
  if (!authed) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    authed = await waitForAdminAuth(page);
  }

  const body = (await page.textContent('body')) ?? '';
  if (/admin sign in|sign in →/i.test(body)) {
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForAdminAuth(page);
  }
}

/** @deprecated Use gotoAdminAuthenticated — admin no longer uses localStorage PATs. */
export async function gotoAdminWithToken(page: Page, _token: string, path = '/admin/dashboard'): Promise<void> {
  await gotoAdminAuthenticated(page, path);
}

/**
 * Obtain a staff Sanctum PAT via PIN (POS scope) — kept for specs that need Bearer.
 * For admin UI navigation, prefer gotoAdminAuthenticated.
 */
export async function injectAdminToken(page: Page, pin?: string): Promise<string> {
  await gotoAdminAuthenticated(page, '/admin/dashboard');
  return pin ?? ADMIN_PIN;
}

/**
 * Slower than injectAdminToken but tests the actual UI flow.
 */
export async function adminLoginViaUI(page: Page, pin?: string): Promise<void> {
  const usedPin = pin ?? ADMIN_PIN;
  await page.goto('/admin/');
  await page.waitForSelector('button', { timeout: 15_000 });

  for (const digit of usedPin.split('')) {
    await page
      .locator('button')
      .filter({ hasText: new RegExp(`^\\s*${digit}\\s*$`) })
      .first()
      .click();
  }

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

// ── Customer auth ──────────────────────────────────────────────────────────

/**
 * Establish a customer session via password login (Sanctum session cookie)
 * and open the order app. Returns a Bearer token when the API still issues
 * one (legacy); otherwise returns an empty string — cookies on `page.request`
 * / the page context are enough for current builds.
 */
export async function injectCustomerToken(
  page: Page,
  phone?: string,
  password?: string,
): Promise<string> {
  const usedPhone    = phone    ?? `+960${TEST_PHONE}`;
  const usedPassword = password ?? TEST_PASSWORD;
  const localPhone   = usedPhone.replace(/^\+960/, '');

  if (!usedPassword) {
    return '';
  }

  // Prime CSRF for stateful SPA login
  await page.request.get('/sanctum/csrf-cookie').catch(() => null);

  const response = await page.request.post('/api/auth/customer/login', {
    data: { phone: usedPhone, password: usedPassword },
  });
  if (!response.ok()) {
    return '';
  }
  const data = (await response.json().catch(() => ({}))) as { token?: string };
  const token: string = data.token ?? '';

  await page.goto('/order/', { waitUntil: 'domcontentloaded' });
  if (token) {
    await page.evaluate(
      ({ t, ph }: { t: string; ph: string }) => {
        localStorage.setItem('online_token', t);
        localStorage.setItem('online_customer_name', ph);
        window.dispatchEvent(new Event('auth_change'));
      },
      { t: token, ph: localPhone },
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await waitForCustomerSession(page, localPhone);

  return token;
}

/**
 * Mint a customer Bearer PAT for concurrent API races (session cookies cannot
 * be shared across two simultaneous request contexts cleanly). Uses the
 * password login session when a token is returned; otherwise falls back to
 * creating a PAT via the staff-owned test bootstrap endpoint is not available
 * — callers should pass `CUSTOMER_BEARER` from env when needed.
 */
export async function obtainCustomerBearer(
  request: import('@playwright/test').APIRequestContext,
  phone?: string,
  password?: string,
): Promise<string> {
  if (process.env.CUSTOMER_BEARER) return process.env.CUSTOMER_BEARER;
  const usedPhone = phone ?? `+960${TEST_PHONE}`;
  const usedPassword = password ?? TEST_PASSWORD;
  await request.get('/sanctum/csrf-cookie').catch(() => null);
  const response = await request.post('/api/auth/customer/login', {
    data: { phone: usedPhone, password: usedPassword },
  });
  if (!response.ok()) return '';
  const data = (await response.json().catch(() => ({}))) as { token?: string };
  return data.token ?? '';
}

/**
 * Load pre-saved customer storageState from disk (generated by customer-auth.spec.ts).
 * Prefer injectCustomerToken when a token is sufficient.
 */
export { STORAGE_STATE_PATH } from '../fixtures/auth';
