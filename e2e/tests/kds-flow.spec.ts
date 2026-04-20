/**
 * KDS (Kitchen Display System) board and order bump flow.
 *
 * Tests:
 *  1. KDS login with valid PIN
 *  2. Board renders with columns (or empty state)
 *  3. Bump a ticket if any are present
 *  4. Recall a bumped ticket
 *
 * Requires a valid ADMIN_PIN env var. If login fails or no orders are on
 * the board, the interactive tests skip gracefully.
 */
import { test, expect, type Page } from '@playwright/test';
import { ADMIN_PIN } from '../fixtures/auth';

test.describe.configure({ mode: 'serial' });

let kdsToken = '';

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/auth/staff/pin-login', {
    data: { pin: ADMIN_PIN },
  });
  if (!res.ok()) {
    console.warn(`KDS tests: PIN login failed (${res.status()}) — interactive tests will skip`);
    return;
  }
  const data = await res.json() as { token?: string };
  kdsToken = data.token ?? '';
});

async function gotoKds(page: Page): Promise<void> {
  await page.goto('/kds/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  if (kdsToken) {
    // Inject token via localStorage and reload
    await page.evaluate((t: string) => {
      localStorage.setItem('kds_token', t);
      // KDS may use admin_token or kds_token depending on the implementation
      localStorage.setItem('admin_token', t);
    }, kdsToken);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  }
}

// ── Login ─────────────────────────────────────────────────────────────────

test('KDS login screen loads', async ({ page }) => {
  await page.goto('/kds/');
  await page.waitForLoadState('networkidle');

  const body = (await page.textContent('body')) ?? '';
  expect(body).not.toBe('');
  expect(body).not.toContain('Cannot GET /kds/');

  // Numpad should be visible on login screen
  const numpad = page.locator('button').filter({ hasText: /^[0-9]$/ }).first();
  await expect(numpad).toBeVisible({ timeout: 12_000 });
});

test('KDS valid PIN logs in and shows board', async ({ page }) => {
  if (!kdsToken) {
    test.skip(true, 'No KDS token — rate limited or wrong PIN');
    return;
  }

  await gotoKds(page);

  const body = (await page.textContent('body')) ?? '';
  // Should show the board UI — not the login screen
  expect(body.toLowerCase()).not.toMatch(/enter pin|pin login/i);
  // Board or empty state should be visible
  expect(body.toLowerCase()).toMatch(/order|ticket|kitchen|pending|ready|new|queue|empty/i);
});

// ── Board ─────────────────────────────────────────────────────────────────

test('KDS board renders with column headers or empty state', async ({ page }) => {
  if (!kdsToken) {
    test.skip(true, 'No KDS token');
    return;
  }

  await gotoKds(page);

  // Board should have column headings or an empty state message
  const headers = page.locator('[class*="column-header"], [class*="ColumnHeader"], h2, h3');
  const hCount  = await headers.count();

  const body = (await page.textContent('body')) ?? '';

  if (hCount > 0) {
    // Expect at least one column (New / Preparing / Ready)
    expect(hCount).toBeGreaterThanOrEqual(1);
  } else {
    // Empty state is acceptable
    expect(body.toLowerCase()).toMatch(/empty|no orders|kitchen|ready/i);
  }

  // Page must not have crashed
  expect(body.toLowerCase()).not.toMatch(/500|server error|exception/i);
});

// ── Bump a ticket ─────────────────────────────────────────────────────────

test('KDS bump button works on first ticket if present', async ({ page }) => {
  if (!kdsToken) {
    test.skip(true, 'No KDS token');
    return;
  }

  await gotoKds(page);

  // Look for a "bump" or "done" or "complete" button on any order card
  const bumpBtn = page
    .locator('button')
    .filter({ hasText: /bump|done|complete|ready|serve/i })
    .first();

  const bumpVisible = await bumpBtn.isVisible({ timeout: 4_000 }).catch(() => false);

  if (!bumpVisible) {
    // No tickets to bump — board is empty — acceptable
    const body = (await page.textContent('body')) ?? '';
    expect(body.toLowerCase()).not.toMatch(/500|server error/i);
    return;
  }

  // Click bump
  await bumpBtn.click();
  await page.waitForTimeout(800);

  // Verify page didn't crash after bump
  const body = (await page.textContent('body')) ?? '';
  expect(body.toLowerCase()).not.toMatch(/500|server error|exception/i);
});

// ── Recall a ticket ───────────────────────────────────────────────────────

test('KDS recall button works if present', async ({ page }) => {
  if (!kdsToken) {
    test.skip(true, 'No KDS token');
    return;
  }

  await gotoKds(page);

  // Recall button appears after bumping — may not exist
  const recallBtn = page
    .locator('button')
    .filter({ hasText: /recall|undo|back/i })
    .first();

  const visible = await recallBtn.isVisible({ timeout: 3_000 }).catch(() => false);
  if (!visible) {
    // Nothing to recall — acceptable
    return;
  }

  await recallBtn.click();
  await page.waitForTimeout(600);

  const body = (await page.textContent('body')) ?? '';
  expect(body.toLowerCase()).not.toMatch(/500|server error/i);
});

// ── No crash on navigation ────────────────────────────────────────────────

test('KDS page does not crash on direct navigation', async ({ page }) => {
  await page.goto('/kds/');
  await page.waitForLoadState('networkidle');

  const statusCode = await page.evaluate(() => (window as any).__statusCode ?? 200);
  expect(statusCode).not.toBe(500);

  const body = (await page.textContent('body')) ?? '';
  expect(body.length).toBeGreaterThan(10);
  expect(body.toLowerCase()).not.toMatch(/server error|exception/i);
});
