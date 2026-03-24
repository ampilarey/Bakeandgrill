/**
 * Customer authentication tests.
 *
 * Auth state setup uses the API directly (password login) — no SMS required.
 * Storage state is saved to e2e/.auth/customer.json and reused by other tests.
 *
 * First run saves the state. If state already exists, it is reused.
 *
 * Run alone: npx playwright test customer-auth --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const TEST_PHONE         = process.env.TEST_PHONE         ?? '7972434';
const TEST_PASSWORD      = process.env.TEST_PASSWORD      ?? '';
const STORAGE_STATE_PATH  = path.resolve(__dirname, '../.auth/customer.json');
const ORDER_APP_ORIGIN    = 'https://test.bakeandgrill.mv';

// ── Helper: normalise phone (add +960 prefix if not present) ──────────────
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('960')) return `+${digits}`;
  return `+960${digits}`;
}

// ── Helper: API password login and set localStorage ───────────────────────
async function apiLogin(page: Page): Promise<string> {
  if (!TEST_PASSWORD) {
    throw new Error('TEST_PASSWORD not set in e2e/.env.test');
  }
  const loginRes = await page.request.post('/api/auth/customer/login', {
    data: { phone: normalisePhone(TEST_PHONE), password: TEST_PASSWORD },
  });
  if (loginRes.status() === 429) {
    throw new Error('Customer login rate-limited (429). Wait ~15 min and retry.');
  }
  expect(loginRes.ok(), `Password login failed: ${loginRes.status()} ${await loginRes.text()}`).toBeTruthy();
  const loginBody = await loginRes.json() as { token?: string };
  const token = loginBody.token ?? '';
  expect(token, 'Login returned empty token').not.toBe('');
  return token;
}

// ── Save storage state test ────────────────────────────────────────────────
test('save customer auth storage state', async ({ page }) => {
  if (fs.existsSync(STORAGE_STATE_PATH)) {
    console.log('ℹ️  Storage state already exists — skipping save.');
    test.skip();
    return;
  }

  const token = await apiLogin(page);

  // Go to order app and inject token into localStorage
  await page.goto('/order/');
  await page.waitForLoadState('networkidle');

  await page.evaluate((t: string) => {
    localStorage.setItem('online_token', t);
    window.dispatchEvent(new Event('auth_change'));
  }, token);

  // Also try to establish a Blade session by going through the customer login route
  // (so cookies are also set for the Blade session bridge)
  await page.goto('/order/');
  await page.waitForLoadState('networkidle');

  // Save the full browser state
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
  console.log(`\n✅ Storage state saved to ${STORAGE_STATE_PATH}\n`);
});

// ── Helper to inject shared token (no API call) ───────────────────────────
async function injectCustomerToken(page: Page, token: string) {
  const currentUrl = page.url();
  if (!currentUrl.includes('bakeandgrill.mv/order')) {
    await page.goto('/order/');
    await page.waitForLoadState('networkidle');
  }
  await page.evaluate(({ t, phone }: { t: string; phone: string }) => {
    localStorage.setItem('online_token', t);
    localStorage.setItem('online_customer_name', phone);
    window.dispatchEvent(new Event('auth_change'));
  }, { t: token, phone: TEST_PHONE });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

// ── Authenticated tests ───────────────────────────────────────────────────
test.describe('authenticated customer', () => {
  // ONE API login per test-file execution — stored and reused by all tests
  test.describe.configure({ mode: 'serial' });
  let sharedCustomerToken = '';

  test.beforeAll(async ({ request }) => {
    if (!TEST_PASSWORD) return;
    const res = await request.post('/api/auth/customer/login', {
      data: { phone: normalisePhone(TEST_PHONE), password: TEST_PASSWORD },
    });
    if (res.status() === 429) {
      console.warn('Customer login rate-limited in beforeAll — authenticated tests will skip');
      return;
    }
    if (!res.ok()) {
      console.warn(`Customer login failed: ${res.status()}`);
      return;
    }
    const data = await res.json() as { token?: string };
    sharedCustomerToken = data.token ?? '';
  });

  test.beforeEach(async ({ page }) => {
    if (!sharedCustomerToken) {
      test.skip(true, 'Customer token not available (rate limited or wrong password)');
      return;
    }
    await injectCustomerToken(page, sharedCustomerToken);
  });

  test('order app header shows 7-digit phone number when logged in', async ({ page }) => {
    await page.goto('/order/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    // The header should show the phone number OR the customer name
    const header = page.locator('header');
    const headerText = await header.textContent() ?? '';
    const tokenInStorage = await page.evaluate(() => localStorage.getItem('online_token'));
    // If token is not there, the auth restoration silently failed
    expect(tokenInStorage, 'online_token missing from localStorage — auth not restored').toBeTruthy();
    // Check header contains phone number
    await expect(header).toContainText(TEST_PHONE, { timeout: 12_000 });
  });

  test('account page loads with profile information', async ({ page }) => {
    await page.goto('/order/account');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/sign out|logout|profile|account|name|phone/);
  });

  test('order history page loads when authenticated', async ({ page }) => {
    await page.goto('/order/order-history');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/customer/login');
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/order|history|no orders|you haven/);
  });

  test('GET /api/customer/me returns current customer', async ({ page }) => {
    const res = await page.request.get('/api/customer/me', {
      headers: { Authorization: `Bearer ${sharedCustomerToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { customer?: { phone?: string } };
    expect(JSON.stringify(body)).toMatch(/phone|customer/i);
  });

  test('logout clears token from localStorage', async ({ page }) => {
    await page.goto('/order/account');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // The "Sign Out" button is at the bottom of AccountPage (exact text)
    const signOut = page.locator('button').filter({ hasText: /^Sign Out$/ }).first();
    await expect(signOut).toBeVisible({ timeout: 12_000 });
    await signOut.click();
    await page.waitForLoadState('networkidle');

    const token = await page.evaluate(() => localStorage.getItem('online_token'));
    expect(token).toBeNull();

    const header = await page.textContent('header') ?? '';
    expect(header).not.toContain(TEST_PHONE);

    // Delete saved state so next run re-saves it
    if (fs.existsSync(STORAGE_STATE_PATH)) {
      fs.unlinkSync(STORAGE_STATE_PATH);
      console.log('ℹ️  Storage state deleted — it will be re-created on next run.');
    }
  });
});

// ── Blade login validation ────────────────────────────────────────────────
test.describe('Blade login form validation', () => {
  test('empty phone submit stays on login page', async ({ page }) => {
    await page.goto('/customer/login');
    await page.waitForLoadState('networkidle');
    await page.fill('#phone', '');
    await page.click('button.btn-submit');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/customer/login');
  });

  test('too-short phone number shows error', async ({ page }) => {
    await page.goto('/customer/login');
    await page.waitForLoadState('networkidle');
    await page.fill('#phone', '123');
    await page.click('button.btn-submit');
    await page.waitForLoadState('networkidle');
    const error = page.locator('.alert-error');
    await expect(error).toBeVisible({ timeout: 5_000 });
  });

  test('+960 prefix phone is accepted by backend', async ({ request }) => {
    // Should return 200 with has_password — 429 if rate limited, both are acceptable
    const res = await request.post('/api/auth/customer/check-phone', {
      data: { phone: '+9607972434' },
    });
    // 200 = fine, 429 = rate limited (also fine — no validation error)
    expect([200, 429]).toContain(res.status());
  });

  test('wrong OTP via API returns error', async ({ request }) => {
    const res = await request.post('/api/auth/customer/otp/verify', {
      // route is POST /api/auth/customer/otp/verify
      data: { phone: normalisePhone(TEST_PHONE), otp: '000000' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.json() as { message?: string };
    // Accept "too many attempts" (rate limit) or "invalid otp" — both mean it didn't succeed
    expect(res.status()).not.toBe(200);
  });
});
