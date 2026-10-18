/**
 * Every page fits a 390 px phone (owner, 2026-10-09: nothing scrolls sideways;
 * iruali import plan, feature 18).
 *
 * The page lists are read from the code, so a new page is checked without anyone
 * adding it here: the order app's routes from its router (main.tsx), the admin's
 * pages from navConfig.ts, the website's public pages from its route list below
 * plus one category link and one dish page found on the menu.
 *
 * Each page is a soft check, so one run names every page that scrolls sideways.
 * Runs under the "mobile" project (390 × 844).
 *
 * Dhivehi (iruali import plan, feature 3b): the website's pages again under /dv and
 * the order app in Dhivehi, each checked to read right to left as well as to fit.
 * Skipped, saying so, while "Dhivehi on the website and in the order app" is off on
 * the server, because then /dv only forwards to the English page.
 */
import fs from 'fs';
import path from 'path';
import { expect, test, type Page } from '@playwright/test';

import { canEstablishAdminSession } from '../fixtures/auth';
import { gotoAdminAuthenticated } from '../helpers/injectAuth';

const ROOT = path.resolve(__dirname, '../..');
const TOLERANCE_PX = 1;

/** Static paths (no ":param", no "*") from `<Route path="…">` in a router file. */
export function routerPaths(file: string): string[] {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const paths = [...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(paths.filter((p) => !p.includes(':') && !p.includes('*')))];
}

/** Admin pages: every `to: '/…'` in the nav, without query strings. */
export function adminNavPaths(): string[] {
  const src = fs.readFileSync(path.join(ROOT, 'apps/admin-dashboard/src/components/navConfig.ts'), 'utf8');
  const paths = [...src.matchAll(/\bto:\s*'(\/[^'?#]*)/g)].map((m) => m[1]);
  return [...new Set(paths)];
}

/** Public website pages that need no data. */
const WEBSITE_PAGES = ['/', '/menu', '/contact', '/hours', '/terms', '/refund', '/privacy', '/complain', '/prayer-times', '/sms/preferences'];

/** Signage screens are TV-sized, not phone pages. */
const ORDER_APP_SKIP = new Set(['tv']);

async function overflowOf(page: Page): Promise<{ scrollWidth: number; viewport: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: Math.min(document.documentElement.clientWidth, window.innerWidth),
  }));
}

/** The order app's saved language (LanguageContext's LANG_STORAGE_KEY). */
const ORDER_LANG_KEY = 'bakegrill_lang';

async function checkPage(page: Page, url: string, label: string, rtl = false): Promise<void> {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null);
  if (!res) {
    expect.soft(res, `${label}: did not load`).not.toBeNull();
    return;
  }
  await page.waitForLoadState('load').catch(() => undefined);
  // Let lazy chunks, fonts and pictures settle; layout shifts after first paint.
  await page.waitForTimeout(1_200);
  const { scrollWidth, viewport } = await overflowOf(page);
  expect.soft(scrollWidth, `${label} scrolls sideways: ${scrollWidth}px wide on a ${viewport}px screen`).toBeLessThanOrEqual(viewport + TOLERANCE_PX);
  if (rtl) {
    const dir = await page.evaluate(() => document.documentElement.dir || getComputedStyle(document.documentElement).direction);
    expect.soft(dir, `${label} does not read right to left`).toBe('rtl');
  }
}

/** Website pages that have a /dv address (LocaleUrl::PUBLIC), plus a category and a dish. */
async function websitePages(page: Page, prefix = ''): Promise<string[]> {
  const pages = [...WEBSITE_PAGES];
  await page.goto(`${prefix}/menu`, { waitUntil: 'domcontentloaded' });
  const links = await page.locator('a[href*="/menu/"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).pathname));
  const bare = links.map((p) => p.replace(/^\/dv(?=\/)/, ''));
  const category = bare.find((p) => p.startsWith('/menu/c/'));
  const dish = bare.find((p) => /^\/menu\/(?!c\/|print)[^/]+$/.test(p));
  if (category) pages.push(category);
  if (dish) pages.push(dish);
  return pages;
}

/** True when the server serves Dhivehi pages (a /dv address answers instead of forwarding). */
async function dhivehiOn(request: import('@playwright/test').APIRequestContext): Promise<boolean> {
  const res = await request.get('/dv/hours', { maxRedirects: 0 }).catch(() => null);
  return res?.status() === 200;
}

test.describe('Every page fits a 390 px phone', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test('website', async ({ page }) => {
    for (const p of await websitePages(page)) await checkPage(page, p, `Website ${p}`);
  });

  test('website in Dhivehi', async ({ page, request }) => {
    test.skip(!(await dhivehiOn(request)), 'Dhivehi is switched off on this server (Admin → Website)');
    // Pages without a /dv address (complaint form, SMS settings) stay English.
    const dvPages = (await websitePages(page, '/dv')).filter((p) => !['/complain', '/sms/preferences'].includes(p));
    for (const p of dvPages) await checkPage(page, p === '/' ? '/dv' : `/dv${p}`, `Website /dv${p === '/' ? '' : p}`, true);
  });

  test('order app in Dhivehi', async ({ page, request }) => {
    test.skip(!(await dhivehiOn(request)), 'Dhivehi is switched off on this server (Admin → Website)');
    await page.addInitScript((key) => { try { localStorage.setItem(key, 'dv'); } catch { /* private mode */ } }, ORDER_LANG_KEY);
    const paths = routerPaths('apps/online-order-web/src/main.tsx').filter((p) => !ORDER_APP_SKIP.has(p.replace(/^\//, '')));
    for (const p of ['/', ...paths]) {
      const sub = p === '/' ? '' : p.replace(/^\//, '');
      await checkPage(page, `/order/${sub}`, `Order app (Dhivehi) /${sub}`, true);
    }
  });

  test('order app', async ({ page }) => {
    const paths = routerPaths('apps/online-order-web/src/main.tsx').filter((p) => !ORDER_APP_SKIP.has(p.replace(/^\//, '')));
    expect(paths.length, 'order app routes found in main.tsx').toBeGreaterThan(10);
    for (const p of ['/', ...paths]) {
      const sub = p === '/' ? '' : p.replace(/^\//, '');
      await checkPage(page, `/order/${sub}`, `Order app /${sub}`);
    }
  });

  test('admin', async ({ page, request }) => {
    test.skip(!(await canEstablishAdminSession(request)), 'Admin session not available (set ADMIN_PHONE + ADMIN_PASSWORD or ADMIN_PIN)');
    const paths = adminNavPaths();
    expect(paths.length, 'admin pages found in navConfig.ts').toBeGreaterThan(20);
    await gotoAdminAuthenticated(page, '/admin/dashboard');
    for (const p of paths) await checkPage(page, `/admin${p}`, `Admin ${p}`);
  });
});
