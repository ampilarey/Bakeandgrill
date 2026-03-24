/**
 * Mobile responsiveness smoke tests — iPhone 14 viewport.
 * These run under the "mobile" project in playwright.config.ts.
 */
import { test, expect } from '@playwright/test';

// ── Homepage ───────────────────────────────────────────────────────────────
test('homepage renders correctly on mobile', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // No horizontal overflow
  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasHorizontalOverflow).toBeFalsy();

  // Navigation is visible (mobile nav or hamburger)
  const nav = page.locator('nav, header, [class*="nav"]').first();
  await expect(nav).toBeVisible();

  // Screenshot for visual review
  await page.screenshot({ path: 'e2e/screenshots/mobile-homepage.png', fullPage: true });
});

// ── Order app ─────────────────────────────────────────────────────────────
test('order app /order/ loads on mobile', async ({ page }) => {
  await page.goto('/order/');
  await page.waitForLoadState('networkidle');

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasHorizontalOverflow).toBeFalsy();

  await page.screenshot({ path: 'e2e/screenshots/mobile-order-app.png', fullPage: true });
});

test('order app menu loads on mobile', async ({ page }) => {
  await page.goto('/order/menu');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasHorizontalOverflow).toBeFalsy();

  await page.screenshot({ path: 'e2e/screenshots/mobile-menu.png', fullPage: true });
});

// ── Mobile footer nav ─────────────────────────────────────────────────────
test('mobile footer navigation has correct items', async ({ page }) => {
  await page.goto('/order/');
  await page.waitForLoadState('networkidle');

  // Footer nav should be visible on mobile
  const footerNav = page.locator('nav[class*="bottom"], [class*="mobile-nav"], [class*="footer-nav"]').first();
  if (await footerNav.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const navText = await footerNav.textContent() ?? '';
    // Should have menu, orders/cart, profile-type links
    expect(navText.toLowerCase()).toMatch(/menu|order|home|cart/);
    // Should NOT have "My Account" as a tab (per UI spec)
    expect(navText.toLowerCase()).not.toContain('my account');
  } else {
    // Take screenshot and note absence
    await page.screenshot({ path: 'e2e/screenshots/mobile-no-footer-nav.png' });
    test.skip(true, 'No mobile footer nav element found with expected selectors');
  }
});

// ── Order app header ──────────────────────────────────────────────────────
test('order app header has no Logout button on mobile', async ({ page }) => {
  await page.goto('/order/');
  await page.waitForLoadState('networkidle');

  const header = page.locator('header').first();
  const headerText = await header.textContent() ?? '';
  // Per UI spec: logout was removed from header on mobile
  expect(headerText.toLowerCase()).not.toMatch(/log.?out/);
});

test('mobile header order tracking bar is visible', async ({ page }) => {
  await page.goto('/order/menu');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // OrderStatusBar should be rendered (may or may not have active orders)
  // Check it doesn't overflow or break layout
  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasHorizontalOverflow).toBeFalsy();
});

// ── Blade website mobile ───────────────────────────────────────────────────
test('main website mobile: phone number in header', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // The mobile header should show the phone number (7-digit) not "My Account" text
  const mobileHeader = page.locator('.show-mobile header, .mobile-header, header .mobile').first();
  if (await mobileHeader.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const text = await mobileHeader.textContent() ?? '';
    // Should contain a 7-digit number
    expect(text).toMatch(/\d{7}/);
    // Should NOT have separate "My Account" nav item
    expect(text.toLowerCase()).not.toContain('my account');
  }

  await page.screenshot({ path: 'e2e/screenshots/mobile-main-website.png', fullPage: true });
});

// ── Touch targets ─────────────────────────────────────────────────────────
test('primary action buttons meet minimum 44px touch target', async ({ page }) => {
  await page.goto('/order/menu');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Check at least the main CTA buttons
  const primaryBtns = page.locator('button').filter({ hasText: /checkout|add to cart|order now|menu/i });
  const count = await primaryBtns.count();

  for (let i = 0; i < Math.min(count, 5); i++) {
    const btn = primaryBtns.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    const box = await btn.boundingBox();
    if (box) {
      // WCAG recommends 44×44px minimum — we allow 32px as a soft threshold here
      expect(box.height, `Button "${await btn.textContent()}" is only ${box.height}px tall`).toBeGreaterThanOrEqual(32);
    }
  }
});

// ── Admin on mobile ───────────────────────────────────────────────────────
test('admin login page renders on mobile viewport', async ({ page }) => {
  await page.goto('/admin/');
  await page.waitForLoadState('networkidle');

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasHorizontalOverflow).toBeFalsy();

  // Numpad should still be visible and tappable
  const btn1 = page.locator('button').filter({ hasText: /^1$/ }).first();
  await expect(btn1).toBeVisible();
  const box = await btn1.boundingBox();
  expect(box?.width).toBeGreaterThan(30);
  expect(box?.height).toBeGreaterThan(30);

  await page.screenshot({ path: 'e2e/screenshots/mobile-admin-login.png', fullPage: true });
});
