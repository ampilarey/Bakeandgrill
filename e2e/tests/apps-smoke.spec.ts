/**
 * Smoke tests for the three staff-facing SPAs that had 0% E2E coverage:
 *   - KDS  (/kds/)       — Kitchen Display System (state-based, PIN login)
 *   - POS  (/pos/)       — Point of Sale (state-based, email + PIN login)
 *   - Driver (/driver/)  — Delivery driver app (route-based, phone + PIN login)
 *
 * These tests verify:
 *   1. Each app shell loads (HTML served, JS boots, no blank page)
 *   2. The login screen renders the expected inputs
 *   3. Wrong credentials return an error (not a crash)
 *   4. The auth-required screen is not shown to unauthenticated users
 *
 * No real staff PIN is required — we use obviously-wrong credentials to test
 * the error path and confirm the app is alive.
 */
import { test, expect } from '@playwright/test';
import { ADMIN_PIN } from '../fixtures/auth';

// ── KDS (/kds/) ────────────────────────────────────────────────────────────
test.describe('KDS app', () => {
  test('KDS login screen renders', async ({ page }) => {
    await page.goto('/kds/');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body') ?? '';
    expect(body).not.toBe('');
    expect(body).not.toContain('Cannot GET /kds/');

    // Numpad / PIN input should be visible
    const numpad = page.locator('button').filter({ hasText: /^[0-9]$/ }).first();
    await expect(numpad).toBeVisible({ timeout: 12_000 });
  });

  test('KDS logo is visible on login screen', async ({ page }) => {
    await page.goto('/kds/');
    await page.waitForLoadState('networkidle');

    const logo = page.locator('img[src*="logo"]').first();
    await expect(logo).toBeVisible({ timeout: 8_000 });
    // Ensure the image actually loaded (no broken img)
    const naturalWidth = await logo.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('KDS wrong PIN shows error, not crash', async ({ page }) => {
    await page.goto('/kds/');
    await page.waitForLoadState('networkidle');

    // Enter clearly wrong PIN digits
    for (const digit of ['9', '8', '7', '6']) {
      const btn = page.locator('button').filter({ hasText: new RegExp(`^\\s*${digit}\\s*$`) }).first();
      if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) await btn.click();
    }

    // Submit (look for Sign In / Enter / Login button)
    const signInBtn = page.locator('button').filter({ hasText: /sign.?in|enter|login|submit/i }).first();
    if (await signInBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await signInBtn.click();
      await page.waitForTimeout(2000);
    }

    // Should show an error message, NOT navigate away to the KDS board
    const body = await page.textContent('body') ?? '';
    // Either an error is shown OR we're still on the login screen (PIN input still present)
    const stillOnLogin = await page.locator('button').filter({ hasText: /^[0-9]$/ }).first().isVisible({ timeout: 3_000 }).catch(() => false);
    const showsError   = body.toLowerCase().match(/invalid|failed|error|wrong|incorrect|pin/);
    expect(stillOnLogin || !!showsError, 'KDS wrong PIN should show error or stay on login').toBe(true);
  });

  test('KDS board not accessible without login', async ({ page }) => {
    // Clear any stored KDS token
    await page.goto('/kds/');
    await page.evaluate(() => localStorage.removeItem('kds_token'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should stay on login — numpad visible
    const numpad = page.locator('button').filter({ hasText: /^[0-9]$/ }).first();
    await expect(numpad).toBeVisible({ timeout: 10_000 });
  });

  test('KDS app injects token and sees board', async ({ page, request }) => {
    // Get a real staff token via API to exercise the logged-in board
    const res = await request.post('/api/auth/staff/pin-login', {
      data: { pin: ADMIN_PIN },
    });
    if (!res.ok()) {
      test.skip(true, `Could not get staff token (${res.status()}) — skipping board test`);
      return;
    }
    const { token } = await res.json() as { token: string };

    await page.goto('/kds/');
    await page.waitForLoadState('networkidle');
    await page.evaluate((t: string) => {
      localStorage.setItem('kds_token', t);
    }, token);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = await page.textContent('body') ?? '';
    // Board shows column headers or order cards or "nothing here"
    expect(body.toLowerCase()).toMatch(/pending|cooking|ready|queue|kitchen|nothing here/);
  });
});

// ── POS (/pos/) ────────────────────────────────────────────────────────────
test.describe('POS app', () => {
  test('POS login screen renders', async ({ page }) => {
    await page.goto('/pos/');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body') ?? '';
    expect(body).not.toBe('');
    expect(body).not.toContain('Cannot GET /pos/');

    // Mobile or email username field (type="text", not type="email")
    const usernameInput = page.locator('input[autocomplete="username"], input[placeholder*="example.com"]').first();
    await expect(usernameInput).toBeVisible({ timeout: 12_000 });
  });

  test('POS logo is visible on login screen', async ({ page }) => {
    await page.goto('/pos/');
    await page.waitForLoadState('networkidle');

    const logo = page.locator('img[src*="logo"]').first();
    await expect(logo).toBeVisible({ timeout: 8_000 });
    const naturalWidth = await logo.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('POS PIN numpad renders', async ({ page }) => {
    await page.goto('/pos/');
    await page.waitForLoadState('networkidle');

    // Numpad digits
    const digits = page.locator('button').filter({ hasText: /^[0-9]$/ });
    expect(await digits.count()).toBeGreaterThanOrEqual(9);
  });

  test('POS wrong credentials show error, not crash', async ({ page }) => {
    await page.goto('/pos/');
    await page.waitForLoadState('networkidle');

    const usernameInput = page.locator('input[autocomplete="username"], input[placeholder*="example.com"]').first();
    await usernameInput.fill('noone@example.com');

    // Enter PIN digits
    for (const digit of ['1', '2', '3', '4']) {
      const btn = page.locator('button').filter({ hasText: new RegExp(`^\\s*${digit}\\s*$`) }).first();
      if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) await btn.click();
    }

    const signInBtn = page.locator('button').filter({ hasText: /sign.?in|login|submit/i }).first();
    if (await signInBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await signInBtn.click();
      await page.waitForTimeout(2000);
    }

    const body = await page.textContent('body') ?? '';
    // Either error shown or still on login
    const stillOnLogin = await page.locator('input[autocomplete="username"], input[placeholder*="example.com"]').first().isVisible({ timeout: 2_000 }).catch(() => false);
    const showsError   = body.toLowerCase().match(/invalid|failed|error|wrong|incorrect|not found/);
    expect(stillOnLogin || !!showsError, 'POS wrong credentials should show error or stay on login').toBe(true);
  });

  test('POS sales screen not accessible without login', async ({ page }) => {
    await page.goto('/pos/');
    await page.evaluate(() => localStorage.removeItem('pos_token'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    const usernameInput = page.locator('input[autocomplete="username"], input[placeholder*="example.com"]').first();
    await expect(usernameInput).toBeVisible({ timeout: 10_000 });
  });
});

// ── Delivery app (/driver/) ────────────────────────────────────────────────
test.describe('Delivery (driver) app', () => {
  test('driver login screen renders', async ({ page }) => {
    await page.goto('/driver/login');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body') ?? '';
    expect(body).not.toBe('');
    expect(body).not.toContain('Cannot GET');

    // Phone input should be visible
    const phoneInput = page.locator('input[type="tel"], input[placeholder*="phone" i], input[name*="phone" i]').first();
    await expect(phoneInput).toBeVisible({ timeout: 12_000 });
  });

  test('driver app /driver/ redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/driver/');
    await page.evaluate(() => localStorage.removeItem('driver_token'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const body = await page.textContent('body') ?? '';
    // Either redirected to /driver/login or the login UI is shown inline
    const onLogin = url.includes('/driver/login') || body.toLowerCase().match(/phone|pin|sign in|log in/);
    expect(onLogin, 'Unauthenticated /driver/ should redirect to login').toBeTruthy();
  });

  test('driver wrong credentials show error', async ({ page }) => {
    await page.goto('/driver/login');
    await page.waitForLoadState('networkidle');

    // Fill fake phone
    const phoneInput = page.locator('input[type="tel"], input[placeholder*="phone" i]').first();
    if (await phoneInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await phoneInput.fill('7000000');
    }

    // Fill fake PIN (4 individual digit inputs)
    const pinInputs = page.locator('input[type="password"][maxlength="1"]');
    const count = await pinInputs.count();
    if (count >= 4) {
      for (let i = 0; i < 4; i++) {
        await pinInputs.nth(i).fill('9');
      }
    }

    const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /sign.?in|log.?in|deliver/i }).first();
    if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }

    const body = await page.textContent('body') ?? '';
    const stillOnLogin = await page.locator('input[type="tel"], input[placeholder*="phone" i]').first().isVisible({ timeout: 3_000 }).catch(() => false);
    const showsError   = body.toLowerCase().match(/invalid|failed|error|wrong|incorrect|not found/);
    expect(stillOnLogin || !!showsError, 'Driver wrong credentials should show error or stay on login').toBe(true);
  });

  test('driver app /driver/history renders (with injected token)', async ({ page, request }) => {
    const res = await request.post('/api/auth/driver/pin-login', {
      data: { phone: process.env.DRIVER_PHONE ?? '7000001', pin: process.env.DRIVER_PIN ?? '0000' },
    }).catch(() => null);

    if (!res || !res.ok()) {
      test.skip(true, 'No driver credentials available — skipping authenticated driver test');
      return;
    }

    const { token } = await res.json() as { token: string };
    await page.goto('/driver/');
    await page.waitForLoadState('networkidle');
    await page.evaluate((t: string) => localStorage.setItem('driver_token', t), token);
    await page.goto('/driver/history');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/history|delivery|completed|no deliveries/);
  });
});
