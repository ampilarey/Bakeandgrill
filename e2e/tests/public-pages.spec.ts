/**
 * Public pages smoke tests — no auth required.
 * Covers: homepage, order app landing, menu, static pages, nav, health endpoint.
 */
import { test, expect, type Page } from '@playwright/test';

const consoleErrors: string[] = [];

async function collectConsoleErrors(page: Page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const loc = msg.location();
      consoleErrors.push(`${loc?.url ?? 'unknown'} — ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));
}

async function assertNoServerError(page: Page) {
  const status = await page.evaluate(() => document.title);
  expect(status).not.toContain('500');
  expect(status).not.toContain('Error');
}

// ── API health ──────────────────────────────────────────────────────────────
test('GET /api/health returns ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json() as { status: string };
  expect(body.status).toBe('ok');
});

// ── Homepage (Blade) ────────────────────────────────────────────────────────
test('homepage loads with hero and categories', async ({ page }) => {
  collectConsoleErrors(page);

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Title
  expect(await page.title()).toContain('Bake');

  // Hero carousel: at least one slide visible
  const hero = page.locator('.hero, [class*="hero"], [class*="banner"]').first();
  await expect(hero).toBeVisible({ timeout: 10_000 });

  // Navigation links
  await expect(page.locator('a[href="/order/menu"]').first()).toBeVisible();
  await expect(page.locator('a[href*="pre-order"]').first()).toBeVisible();

  // Footer present
  await expect(page.locator('footer')).toBeVisible();

  // No 500 error
  await assertNoServerError(page);
});

test('homepage Open/Closed badge is visible', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // The badge text is either "Open Now" / "Closed" / "Opens at..."
  const badge = page.locator('text=/open now|closed|opens at/i').first();
  await expect(badge).toBeVisible({ timeout: 8_000 });
});

test('dark mode toggle works', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Toggle dark mode button (look for sun/moon icon or data attribute)
  const toggle = page.locator('[aria-label*="dark"], [aria-label*="theme"], button:has-text("🌙"), button:has-text("☀️")').first();
  if (await toggle.isVisible()) {
    await toggle.click();
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark') ||
      localStorage.getItem('theme') === 'dark' || document.cookie.includes('dark'));
    expect(dark).toBeTruthy();
    // Toggle back
    await toggle.click();
  } else {
    test.skip(true, 'No dark mode toggle found on page');
  }
});

// ── Static public pages ────────────────────────────────────────────────────
const publicPages: [string, string][] = [
  ['/contact',       'Contact'],
  ['/hours',         'Hours'],
  ['/terms',         'Terms'],
  ['/refund',        'Refund'],
  ['/prayer-times',  'Prayer'],
];

for (const [url, heading] of publicPages) {
  test(`${url} loads without error`, async ({ page }) => {
    collectConsoleErrors(page);
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await assertNoServerError(page);
    // Page should contain the expected heading keyword
    const content = await page.textContent('body') ?? '';
    expect(content.toLowerCase()).toContain(heading.toLowerCase());
  });
}

// ── Order app (React SPA) ──────────────────────────────────────────────────
test('order app homepage loads', async ({ page }) => {
  collectConsoleErrors(page);
  await page.goto('/order/');
  await page.waitForLoadState('networkidle');

  // React app shell should render — look for the site name or a nav element
  const body = await page.textContent('body') ?? '';
  expect(body).not.toContain('Cannot GET');
  expect(body).not.toBe('');

  // Bottom mobile nav or header should be present
  const nav = page.locator('nav, header').first();
  await expect(nav).toBeVisible({ timeout: 10_000 });
});

test('order app /order/menu loads items', async ({ page }) => {
  collectConsoleErrors(page);
  await page.goto('/order/menu');
  await page.waitForLoadState('networkidle');

  // Should show at least one item card
  const cards = page.locator('[class*="card"], [class*="item"], [class*="menu"]');
  await expect(cards.first()).toBeVisible({ timeout: 12_000 });
});

test('order app /order/hours loads', async ({ page }) => {
  await page.goto('/order/hours');
  await page.waitForLoadState('networkidle');
  const body = await page.textContent('body') ?? '';
  expect(body.toLowerCase()).toMatch(/hours|monday|tuesday|sunday|schedule/);
});

test('order app /order/contact loads', async ({ page }) => {
  await page.goto('/order/contact');
  await page.waitForLoadState('networkidle');
  const body = await page.textContent('body') ?? '';
  expect(body.toLowerCase()).toMatch(/contact|phone|address|whatsapp/);
});

// ── Navigation links ───────────────────────────────────────────────────────
test('homepage nav: clicking Menu link navigates to /order/menu', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const menuLink = page.locator('a[href="/order/menu"]').first();
  await expect(menuLink).toBeVisible();
  await menuLink.click();
  await page.waitForURL('**/order/menu**');
  expect(page.url()).toContain('/order/menu');
});

test('footer legal links resolve without 404', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const footerLinks = ['/terms', '/refund'];
  for (const link of footerLinks) {
    const res = await page.request.get(link);
    expect(res.status(), `Footer link ${link} returned ${res.status()}`).toBeLessThan(400);
  }
});

// ── Login page accessible ──────────────────────────────────────────────────
test('customer login page loads', async ({ page }) => {
  await page.goto('/customer/login');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#phone')).toBeVisible();
  await expect(page.locator('button.btn-submit')).toBeVisible();
});

test('admin login page loads', async ({ page }) => {
  await page.goto('/admin/');
  await page.waitForLoadState('networkidle');
  // Numpad should be visible
  const numpad = page.locator('button').filter({ hasText: '1' }).first();
  await expect(numpad).toBeVisible({ timeout: 10_000 });
});
