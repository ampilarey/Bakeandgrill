import { chromium } from 'playwright';

const BASE = 'https://test.bakeandgrill.mv/admin';
const PHONE = process.env.ADMIN_PHONE || '7820288';
const PASS = process.env.ADMIN_PASS || '';

const ROUTES = [
  '/dashboard', '/account', '/orders', '/activity', '/kds', '/delivery',
  '/menu', '/specials', '/inventory', '/purchase-orders', '/purchase-requests',
  '/kitchen-production', '/waste-logs', '/supplier-intelligence', '/forecasts',
  '/customers', '/customers/growth', '/loyalty', '/gift-cards', '/reservations',
  '/reviews', '/referrals', '/promotions', '/sms',
  '/reports', '/invoices', '/expenses', '/profit-loss', '/gst',
  '/staff', '/analytics', '/shifts', '/time-clock', '/devices',
  '/tables', '/refunds', '/print-jobs',
  '/online-ordering', '/online-ordering?section=fees', '/delivery-settings',
  '/settings', '/webhooks', '/xero', '/system-health', '/checklist',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800, isMobile: false },
  { name: 'ipad', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true },
];

async function ensureLoggedIn(page) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  if (page.url().includes('/login')) {
    if (!PASS) throw new Error('Not logged in and ADMIN_PASS not set');
    await page.locator('input[type="tel"]').fill(PHONE);
    await page.locator('input[type="password"]').fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 25000 });
    await page.waitForTimeout(1500);
  }
}

async function auditRoute(page, route, viewportName) {
  const errors = [];
  const onErr = (e) => errors.push(e.message);
  page.on('pageerror', onErr);

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await Promise.race([
      page.waitForSelector('h1', { timeout: 14000 }).catch(() => null),
      page.waitForSelector('text=Access Denied', { timeout: 14000 }).catch(() => null),
    ]);
    await page.waitForTimeout(1200);

    const state = await page.evaluate(() => {
      const text = (document.body?.innerText || '').trim();
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const h1 = document.querySelector('h1')?.textContent?.trim() || null;
      const onlyLoading =
        !h1 &&
        lines.length <= 4 &&
        (/^loading…?$/i.test(lines.join('')) || (lines.length === 1 && /loading/i.test(lines[0])));
      const accessDenied = text.includes('Access Denied');
      const doc = document.documentElement;
      const docOverflow = doc.scrollWidth > doc.clientWidth + 2;
      const tables = [...document.querySelectorAll('table')];
      const wideTables = tables.filter((t) => t.getBoundingClientRect().width > doc.clientWidth + 2).length;
      const scrollableTables = [...document.querySelectorAll('.table-scroll')].filter(
        (el) => el.scrollWidth > el.clientWidth + 2,
      ).length;
      return {
        title: document.title,
        h1,
        onlyLoading,
        accessDenied,
        docOverflow,
        wideTables,
        scrollableTables,
        tableCount: tables.length,
        clientWidth: doc.clientWidth,
        preview: lines.slice(0, 5).join(' | '),
      };
    });

    page.off('pageerror', onErr);

    const ok = !state.onlyLoading && !state.accessDenied && !!state.h1;
    return {
      route,
      viewport: viewportName,
      ok,
      stuckLoading: state.onlyLoading,
      accessDenied: state.accessDenied,
      missingH1: !state.h1 && !state.accessDenied && !state.onlyLoading,
      docOverflow: state.docOverflow,
      wideTables: state.wideTables,
      scrollableTables: state.scrollableTables,
      tableCount: state.tableCount,
      title: state.title,
      h1: state.h1,
      preview: state.preview,
      jsErrors: errors.slice(0, 2),
    };
  } catch (e) {
    page.off('pageerror', onErr);
    return { route, viewport: viewportName, ok: false, error: String(e.message || e), jsErrors: errors.slice(0, 2) };
  }
}

const browser = await chromium.launch({ headless: true });
const all = [];

try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch ?? false,
    });
    const page = await context.newPage();
    await ensureLoggedIn(page);
    for (const route of ROUTES) {
      all.push(await auditRoute(page, route, vp.name));
    }
    await context.close();
  }

  const byKey = (r) => `${r.route}@${r.viewport}`;
  const failed = all.filter((r) => !r.ok);
  const stuck = all.filter((r) => r.stuckLoading);
  const errors = all.filter((r) => r.error);
  const overflow = all.filter((r) => r.docOverflow);

  console.log(JSON.stringify({
    summary: {
      totalChecks: all.length,
      routes: ROUTES.length,
      viewports: VIEWPORTS.length,
      failed: failed.length,
      stuckLoading: stuck.length,
      navigationErrors: errors.length,
      docOverflow: overflow.length,
      allRoutesOkOnAllViewports: ROUTES.filter((route) =>
        VIEWPORTS.every((vp) => all.find((r) => r.route === route && r.viewport === vp.name)?.ok),
      ),
      brokenEverywhere: ROUTES.filter((route) =>
        VIEWPORTS.every((vp) => !all.find((r) => r.route === route && r.viewport === vp.name)?.ok),
      ),
    },
    failed,
    stuck,
    errors,
    overflow,
  }, null, 2));
} finally {
  await browser.close();
}
