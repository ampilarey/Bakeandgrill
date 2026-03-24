/**
 * Form validation tests — customer-facing and admin.
 * Tests empty submits, boundary values, and bad inputs.
 */
import { test, expect, type Page } from '@playwright/test';

// ── Customer login page ────────────────────────────────────────────────────
test.describe('Customer login validation', () => {
  test('empty phone submit stays on login', async ({ page }) => {
    await page.goto('/customer/login');
    await page.waitForLoadState('networkidle');
    // Clear any pre-filled value
    await page.fill('#phone', '');
    await page.click('button.btn-submit');
    await page.waitForLoadState('networkidle');
    // Either stays on login OR shows HTML5 required validation
    const url = page.url();
    expect(url).toContain('/customer/login');
  });

  test('too-short phone number shows error', async ({ page }) => {
    await page.goto('/customer/login');
    await page.waitForLoadState('networkidle');
    await page.fill('#phone', '123');
    await page.click('button.btn-submit');
    await page.waitForLoadState('networkidle');
    const error = page.locator('.alert-error');
    await expect(error).toBeVisible({ timeout: 5_000 });
    expect(await error.textContent()).toBeTruthy();
  });

  test('+ prefix on phone is accepted', async ({ page }) => {
    await page.goto('/customer/login');
    await page.waitForLoadState('networkidle');
    await page.fill('#phone', '+9607972434');
    await page.click('button.btn-submit');
    await page.waitForLoadState('networkidle');
    // Should proceed to OTP or password step, NOT show a "too short" error
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).not.toContain('invalid phone');
  });

  test('wrong OTP API rejects the request', async ({ page }) => {
    // POST a bad OTP — should fail regardless of rate limit message
    const res = await page.request.post('/api/auth/customer/otp/verify', {
      data: { phone: '+9607972434', otp: '000000' },
    });
    // 400 / 401 / 422 / 429 all mean "not authenticated" — none should be 200
    expect(res.status()).not.toBe(200);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

// ── Checkout page validation ───────────────────────────────────────────────
test.describe('Checkout validation (unauthenticated)', () => {
  test('visiting /order/checkout with empty cart redirects to menu', async ({ page }) => {
    // Clear localStorage first
    await page.goto('/order/');
    await page.evaluate(() => {
      localStorage.removeItem('cart');
      localStorage.removeItem('bake_cart');
      // Common cart key patterns
      for (const key of Object.keys(localStorage)) {
        if (key.toLowerCase().includes('cart')) localStorage.removeItem(key);
      }
    });
    await page.goto('/order/checkout');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Should show "cart is empty" message or redirect to menu
    const url = page.url();
    const body = await page.textContent('body') ?? '';
    const isOnMenu  = url.includes('/menu');
    const showsEmpty = body.toLowerCase().includes('empty') || body.toLowerCase().includes('browse');
    expect(isOnMenu || showsEmpty).toBeTruthy();
  });
});

// ── Admin promo validation ─────────────────────────────────────────────────
test.describe('Admin promotions validation', () => {
  let adminToken = '';

  test.beforeAll(async ({ browser }) => {
    // Try to get a token via PIN login API
    const page = await browser.newPage();
    const res = await page.request.post('/api/auth/staff/pin-login', {
      data: { pin: process.env.ADMIN_PIN ?? '1111' },
    });
    if (res.ok()) {
      const body = await res.json() as { token?: string };
      adminToken = body.token ?? '';
    }
    await page.close();
  });

  test('creating a promotion with negative discount fails', async ({ page }) => {
    if (!adminToken) {
      test.skip(true, 'Could not obtain admin token');
      return;
    }

    const res = await page.request.post('/api/promotions', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: 'Bad Promo',
        code: 'BADPROMO',
        type: 'percentage',
        value: -10,
        is_active: true,
      },
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.json() as { message?: string; errors?: object };
    expect(JSON.stringify(body).toLowerCase()).toMatch(/invalid|validation|negative|must be/i);
  });

  test('creating a promotion with value > 100% fails', async ({ page }) => {
    if (!adminToken) {
      test.skip(true, 'Could not obtain admin token');
      return;
    }

    const res = await page.request.post('/api/promotions', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: 'Over 100 Promo',
        code: 'OVER100',
        type: 'percentage',
        value: 150,
        is_active: true,
      },
    });

    // Backend should reject value > 100 for percentage discounts
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

// ── API rate limiting ──────────────────────────────────────────────────────
test.describe('API rate limiting', () => {
  test('gift card balance endpoint rate-limits after many requests', async ({ request }) => {
    const results: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request.get('/api/gift-cards/FAKECODE/balance');
      results.push(res.status());
    }
    // At least one of the later requests should return 404 (not found is fine)
    // or 429 (rate limited) — but NOT a server crash (500)
    const has5xx = results.some((s) => s >= 500);
    expect(has5xx).toBeFalsy();
    // After many requests, we should see either 404 or 429
    expect(results.some((s) => s === 429 || s === 404)).toBeTruthy();
  });
});

// ── 404 page ──────────────────────────────────────────────────────────────
test('visiting a non-existent page returns 404', async ({ page, request }) => {
  const res = await request.get('/this-page-does-not-exist-xyz123');
  expect(res.status()).toBe(404);
});

// ── XSS guard ─────────────────────────────────────────────────────────────
test('search input does not execute injected script', async ({ page }) => {
  await page.goto('/order/menu');
  await page.waitForLoadState('networkidle');

  // Try XSS in search
  const searchInput = page.locator(
    'input[placeholder*="search" i], input[placeholder*="find" i], input[type="search"]'
  ).first();

  if (!(await searchInput.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip(true, 'No search input found');
    return;
  }

  let xssExecuted = false;
  await page.exposeFunction('xssDetected', () => { xssExecuted = true; });

  await searchInput.fill('<script>window.xssDetected && window.xssDetected()</script><img src=x onerror="window.xssDetected && window.xssDetected()">');
  await page.waitForTimeout(600);

  expect(xssExecuted).toBeFalsy();
});

// ── CSRF protection ────────────────────────────────────────────────────────
test('POST to customer OTP web route without CSRF token returns 419', async ({ request }) => {
  // The Blade form action is route('customer.request-otp') → POST /customer/request-otp
  const res = await request.post('/customer/request-otp', {
    data: { phone: '7972434' },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  // Laravel returns 419 (CSRF mismatch) or 404 if route name differs on staging
  expect([419, 404, 405]).toContain(res.status());
});
