/**
 * Accessibility smoke tests — axe-core via @axe-core/playwright.
 *
 * Runs a light WCAG 2.1 Level AA scan on critical pages and fails if any
 * "critical" or "serious" violations are found. Warns for "moderate"
 * violations without failing the suite.
 *
 * Pages tested:
 *  - / (public homepage — Blade)
 *  - /order/menu (online order app — React SPA)
 *  - /order/checkout (checkout — React SPA)
 *  - /admin/ (admin login — React SPA)
 *
 * Note: axe-core cannot access content inside iframes. The tests scan the
 * top-level DOM only.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ── Helper: run axe and assert no critical/serious violations ──────────────
async function assertNoAccessibilityViolations(
  page: AxeBuilder,
  label: string,
): Promise<void> {
  const results = await page.analyze();

  const critical = results.violations.filter((v) => v.impact === 'critical');
  const serious  = results.violations.filter((v) => v.impact === 'serious');
  const moderate = results.violations.filter((v) => v.impact === 'moderate');

  if (moderate.length > 0) {
    console.warn(`[a11y] ${label}: ${moderate.length} moderate violation(s) (non-blocking):`);
    for (const v of moderate) {
      console.warn(`  • ${v.id}: ${v.description} (${v.nodes.length} node(s))`);
    }
  }

  const blockers = [...critical, ...serious];
  if (blockers.length > 0) {
    const messages = blockers.map(
      (v) => `  • [${v.impact}] ${v.id}: ${v.description}\n    Nodes: ${v.nodes.length}`,
    );
    throw new Error(
      `[a11y] ${label} has ${blockers.length} critical/serious violation(s):\n${messages.join('\n')}`,
    );
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('homepage has no critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await assertNoAccessibilityViolations(
    new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude(['[class*="cookie" i]', '[class*="banner" i]']), // ignore cookie banners
    'Homepage',
  );
});

test('menu page has no critical accessibility violations', async ({ page }) => {
  await page.goto('/order/menu');
  await page.waitForLoadState('networkidle');

  // Wait for content to load
  await page.waitForSelector('article.menu-card-article, [class*="menu-item"]', {
    timeout: 15_000,
  }).catch(() => {});

  await assertNoAccessibilityViolations(
    new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']),
    'Menu page',
  );
});

test('checkout page has no critical accessibility violations', async ({ page }) => {
  await page.goto('/order/checkout');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  await assertNoAccessibilityViolations(
    new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']),
    'Checkout page',
  );
});

test('admin login page has no critical accessibility violations', async ({ page }) => {
  await page.goto('/admin/');
  await page.waitForLoadState('networkidle');
  // Wait for PIN numpad to render
  await page.waitForSelector('button', { timeout: 10_000 }).catch(() => {});

  await assertNoAccessibilityViolations(
    new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']),
    'Admin login',
  );
});

test('contact page has no critical accessibility violations', async ({ page }) => {
  await page.goto('/contact');
  await page.waitForLoadState('networkidle');

  await assertNoAccessibilityViolations(
    new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']),
    'Contact page',
  );
});
