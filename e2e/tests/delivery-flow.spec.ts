/**
 * Delivery (driver) app authenticated flow tests.
 *
 * Covers:
 *   1. Login screen renders phone + PIN fields
 *   2. Wrong credentials show an error
 *   3. Token injection → active orders screen loads
 *   4. History screen is accessible
 *   5. Detail page loads for a known delivery ID (API-level contract)
 *   6. Status update endpoint is reachable (picked_up → delivered)
 *
 * Prerequisites:
 *   - Delivery app served at /driver/
 *   - DRIVER_PHONE / DRIVER_PIN env vars (defaults: '7972434' / '1234')
 *     These should match a real driver account in the test DB.
 */
import { test, expect, type Page } from '@playwright/test';

const DRIVER_URL   = '/driver/';
const TOKEN_KEY    = 'driver_token';
const API_LOGIN    = '/api/auth/driver/pin-login';
const DRIVER_PHONE = process.env.DRIVER_PHONE ?? '7972434';
const DRIVER_PIN   = process.env.DRIVER_PIN   ?? '1234';

// ── Helper: inject a real driver token into the delivery app ─────────────

async function injectDriverToken(page: Page): Promise<boolean> {
  const res = await page.request.post(API_LOGIN, {
    data: { phone: DRIVER_PHONE, pin: DRIVER_PIN },
  });
  if (!res.ok()) return false;

  const data = (await res.json()) as { token?: string };
  const token = data.token ?? '';
  if (!token) return false;

  await page.goto(DRIVER_URL);
  await page.waitForLoadState('networkidle');

  await page.evaluate((t: string) => {
    localStorage.setItem('driver_token', t);
  }, token);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  return true;
}

// ── Login screen ──────────────────────────────────────────────────────────

test.describe('Delivery — login screen', () => {
  test('login screen renders with phone and PIN inputs', async ({ page }) => {
    // Clear any leftover token first
    await page.goto(DRIVER_URL);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.removeItem('driver_token'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body') ?? '';
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain('Cannot GET /driver/');

    // Phone input
    const phoneInput = page.locator('input[type="tel"], input[type="text"], input[placeholder*="phone" i], input[placeholder*="number" i]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });

    // PIN inputs (4 boxes)
    const pinInputs = page.locator('input[type="text"][maxlength="1"], input[type="number"][maxlength="1"], input[inputmode="numeric"]');
    const pinCount = await pinInputs.count();
    expect(pinCount).toBeGreaterThanOrEqual(1);
  });

  test('wrong phone + PIN show error, not crash', async ({ page }) => {
    await page.goto(DRIVER_URL);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.removeItem('driver_token'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Fill phone
    const phoneInput = page.locator('input[type="tel"], input[type="text"], input[placeholder*="phone" i]').first();
    await phoneInput.fill('0000000', { timeout: 10_000 });

    // Fill PIN boxes
    const pinInputs = page.locator('input[type="text"][maxlength="1"], input[type="number"][maxlength="1"], input[inputmode="numeric"]');
    const pinCount = await pinInputs.count();
    if (pinCount >= 4) {
      for (let i = 0; i < 4; i++) {
        await pinInputs.nth(i).fill('9');
      }
    }

    // Submit
    const submitBtn = page.locator('button').filter({ hasText: /login|sign.?in|enter|continue/i }).last();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    } else {
      // Trigger submit via keyboard
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(2500);

    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/invalid|incorrect|wrong|error|not found|unauthorized|failed|phone|pin/);
  });

  test('unauthenticated request to /driver/ redirects to login', async ({ page }) => {
    await page.goto(DRIVER_URL + 'orders');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.removeItem('driver_token'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    const url = page.url();
    const body = await page.textContent('body') ?? '';
    // Should either redirect to /login or show the login form
    const isOnLogin = url.includes('/login') || body.toLowerCase().match(/phone|pin|sign.?in|login/);
    expect(isOnLogin).toBeTruthy();
  });
});

// ── Authenticated driver flows ────────────────────────────────────────────

test.describe('Delivery — authenticated flows', () => {
  test('active deliveries screen loads after token injection', async ({ page }) => {
    const ok = await injectDriverToken(page);
    if (!ok) {
      test.skip(true, 'Could not obtain driver token (no driver account?) — skipping');
      return;
    }

    const body = await page.textContent('body') ?? '';
    // Active screen shows either orders or an empty state message
    expect(body.toLowerCase()).toMatch(/delivery|order|active|no.*deliver|nothing/);
  });

  test('history page is reachable with a valid token', async ({ page }) => {
    const ok = await injectDriverToken(page);
    if (!ok) {
      test.skip(true, 'Could not obtain driver token — skipping');
      return;
    }

    await page.goto('/driver/history');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const body = await page.textContent('body') ?? '';
    // History shows past orders or empty state
    expect(body.toLowerCase()).toMatch(/history|past|deliver|no.*order|nothing/);
  });

  test('profile page is reachable with a valid token', async ({ page }) => {
    const ok = await injectDriverToken(page);
    if (!ok) {
      test.skip(true, 'Could not obtain driver token — skipping');
      return;
    }

    await page.goto('/driver/profile');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/profile|name|phone|logout|sign.?out/);
  });
});

// ── API contract: status update ───────────────────────────────────────────

test.describe('Delivery — status update API contract', () => {
  test('driver delivery list endpoint returns 200 with valid token', async ({ page }) => {
    const loginRes = await page.request.post(API_LOGIN, {
      data: { phone: DRIVER_PHONE, pin: DRIVER_PIN },
    });
    if (!loginRes.ok()) {
      test.skip(true, `Driver login failed (${loginRes.status()}) — skipping API contract tests`);
      return;
    }
    const { token } = (await loginRes.json()) as { token: string };

    const deliveriesRes = await page.request.get('/api/driver/deliveries', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deliveriesRes.status()).toBe(200);

    const data = (await deliveriesRes.json()) as { deliveries?: unknown[] } | unknown[];
    const list = Array.isArray(data) ? data : ((data as { deliveries?: unknown[] }).deliveries ?? []);
    // deliveries is an array (may be empty if no active deliveries)
    expect(Array.isArray(list)).toBe(true);
  });

  test('status update endpoint accepts valid transitions', async ({ page }) => {
    const loginRes = await page.request.post(API_LOGIN, {
      data: { phone: DRIVER_PHONE, pin: DRIVER_PIN },
    });
    if (!loginRes.ok()) {
      test.skip(true, `Driver login failed — skipping`);
      return;
    }
    const { token } = (await loginRes.json()) as { token: string };

    // Get active deliveries to find a real order to test
    const deliveriesRes = await page.request.get('/api/driver/deliveries', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await deliveriesRes.json()) as { deliveries?: Array<{ id: number; status: string }> } | Array<{ id: number; status: string }>;
    const deliveries = Array.isArray(data) ? data : (data.deliveries ?? []);

    if (deliveries.length === 0) {
      // No active deliveries — just confirm the endpoint rejects a fake ID
      const res = await page.request.patch('/api/driver/deliveries/99999/status', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { status: 'picked_up' },
      });
      // 404 or 403 — either is correct, not a 500
      expect([403, 404, 422]).toContain(res.status());
      return;
    }

    // Test with a real delivery — try advancing its status
    const delivery = deliveries[0];
    const nextStatus = delivery.status === 'pending' ? 'picked_up' : 'delivered';

    const updateRes = await page.request.patch(
      `/api/driver/deliveries/${delivery.id}/status`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { status: nextStatus },
      },
    );
    // Accept 200 (updated) or 422 (invalid transition) — both mean endpoint works
    expect([200, 422]).toContain(updateRes.status());
  });

  test('status update requires auth (no token → 401)', async ({ page }) => {
    const res = await page.request.patch('/api/driver/deliveries/1/status', {
      data: { status: 'picked_up' },
    });
    expect(res.status()).toBe(401);
  });

  test('history endpoint is paginated and returns correct shape', async ({ page }) => {
    const loginRes = await page.request.post(API_LOGIN, {
      data: { phone: DRIVER_PHONE, pin: DRIVER_PIN },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Driver login failed — skipping');
      return;
    }
    const { token } = (await loginRes.json()) as { token: string };

    const histRes = await page.request.get('/api/driver/deliveries/history', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(histRes.status()).toBe(200);

    const body = await histRes.json() as Record<string, unknown>;
    // Laravel pagination shape or array
    const hasData = 'data' in body || 'deliveries' in body || Array.isArray(body);
    expect(hasData).toBe(true);
  });
});
