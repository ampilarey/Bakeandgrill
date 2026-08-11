/**
 * Part 3 — shift close (blind count UI + cashier API secrecy).
 * Checklist: 3.1, 3.2, 3.5, 3.6
 */
import { test, expect, type Page } from '@playwright/test';

import { obtainStaffToken } from '../../fixtures/auth';
import { cashierToken, ensureOpenShift } from '../../helpers/goLiveApi';
import { assertLocalOnlyBaseUrl, enableSmsGlobalKillSwitch } from '../../helpers/localOnly';

async function injectPosOwner(page: Page): Promise<void> {
  const token = await obtainStaffToken(page.request);
  expect(token).not.toBe('');
  const meRes = await page.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(meRes.ok()).toBeTruthy();
  const meData = (await meRes.json()) as {
    user?: { permissions?: string[]; role?: string };
  };
  const permissions = meData.user?.permissions ?? [];
  const role = meData.user?.role ?? 'owner';

  await page.goto('/pos/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ t, perms, r }) => {
      localStorage.setItem('pos_token', t);
      localStorage.setItem('pos_staff_permissions', JSON.stringify(perms));
      localStorage.setItem('pos_staff_role', r);
      localStorage.setItem('pos_device_id', 'POS-001');
    },
    { t: token, perms: permissions, r: role },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
}

async function openCloseShiftSheet(page: Page): Promise<void> {
  // Wait until POS shell accepted the token (not stuck on login).
  await expect
    .poll(async () => (await page.textContent('body')) ?? '', { timeout: 20_000 })
    .toMatch(/category|sales|shift|close shift|open shift|menu/i);

  // Drawer shortcut: label "Close shift" (usePosApp drawerItems).
  const menuBtn = page.getByRole('button', { name: /open menu/i }).first();
  if (await menuBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await menuBtn.click();
  }

  const candidates = [
    page.getByRole('button', { name: /^close shift$/i }),
    page.getByRole('button', { name: /close shift/i }),
    page.locator('button', { hasText: /^CLOSE SHIFT$/ }),
    page.locator('[data-drawer-id="close_shift"], [data-id="close_shift"]'),
  ];

  let clicked = false;
  for (const loc of candidates) {
    if (await loc.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await loc.first().click();
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    // Shift pane → CLOSE SHIFT
    const shiftNav = page.getByRole('button', { name: /^shift$/i }).first();
    if (await shiftNav.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await shiftNav.click();
    }
    await page.locator('button', { hasText: /close shift/i }).first().click({ timeout: 10_000 });
  }

  await expect(page.getByTestId('close-shift-sheet')).toBeVisible({ timeout: 15_000 });
}

test.describe('Part 3 — shift close', () => {
  test.beforeAll(async ({ baseURL, request }) => {
    assertLocalOnlyBaseUrl(baseURL);
    await enableSmsGlobalKillSwitch(request);
  });

  test('3.1 no expected total visible to a cashier @checklist-3.1', async ({ request, page }) => {
    const shiftId = await ensureOpenShift(request);
    const token = await cashierToken(request);
    expect(token, 'cashier token').not.toBe('');

    const attempt = await request.post(`/api/shifts/${shiftId}/count-attempt`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      data: { closing_cash: 1, cash_count_method: 'plain_total' },
    });
    const body = (await attempt.json().catch(() => ({}))) as Record<string, unknown>;
    if (attempt.ok()) {
      expect(body, '3.1 cashier count-attempt must not include expected_cash').not.toHaveProperty(
        'expected_cash',
      );
      expect(body, '3.1 cashier count-attempt must not include variance').not.toHaveProperty(
        'variance',
      );
      expect(body).toHaveProperty('matches');
      expect(body).toHaveProperty('attempt_number');
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `count-attempt status ${attempt.status()} body=${JSON.stringify(body)}`,
      });
      // Still assert open POS body as cashier never advertises expected drawer total.
    }

    await page.goto('/pos/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('pos_token', t);
      localStorage.setItem('pos_staff_role', 'staff');
    }, token);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const bodyText = (await page.textContent('body')) ?? '';
    expect(bodyText).not.toMatch(/expected\s*(cash|total|drawer)/i);
  });

  test('3.2 review popup shows no amounts @checklist-3.2', async ({ request, page }) => {
    await ensureOpenShift(request);
    await injectPosOwner(page);
    await openCloseShiftSheet(page);

    // Bump the selected denomination via + stepper (more reliable than keypad across viewports).
    const plus = page.locator('[data-testid^="denom-row-"] button, [data-testid^="denom-count-"] + button').filter({ hasText: '+' }).first();
    if (await plus.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await plus.click();
    } else {
      await page.getByTestId('close-shift-count-pad').getByRole('button', { name: 'Digit 1' }).click();
    }

    await page.getByTestId('close-shift-review-btn').click();
    const review = page.getByTestId('close-shift-review');
    await expect(review).toBeVisible({ timeout: 20_000 });
    const reviewText = (await review.textContent()) ?? '';
    expect(reviewText).not.toMatch(/MVR\s*\d/);
    expect(reviewText).not.toMatch(/expected/i);
    expect(reviewText).not.toMatch(/variance/i);
    expect(reviewText).toMatch(/Balanced|does not match/i);
  });

  test('3.5 MVR 1000 lives under More @checklist-3.5', async ({ request, page }) => {
    await ensureOpenShift(request);
    await injectPosOwner(page);
    await openCloseShiftSheet(page);

    // Default list must hide the MVR 1000 face (100_000 laari); it lives under More.
    await expect(page.getByTestId('denom-row-100000')).toHaveCount(0);
    await expect(page.getByTestId('close-shift-more-coins')).toBeVisible();
    await page.getByTestId('close-shift-more-coins').click();
    await expect(page.getByTestId('close-shift-more-overlay')).toBeVisible();
    await expect(page.getByTestId('denom-row-100000')).toBeVisible();
  });

  for (const vp of [
    { w: 390, h: 844, name: 'phone' },
    { w: 768, h: 1024, name: 'tablet-portrait' },
    { w: 1024, h: 768, name: 'tablet-landscape' },
  ]) {
    test(`3.6 no vertical scroll default @ ${vp.name} ${vp.w}x${vp.h} @checklist-3.6`, async ({
      request,
      browser,
      baseURL,
    }) => {
      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        hasTouch: true,
        isMobile: vp.w < 800,
        baseURL: baseURL ?? 'http://127.0.0.1:8000',
      });
      const page = await context.newPage();
      try {
        await ensureOpenShift(request);
        await injectPosOwner(page);
        await openCloseShiftSheet(page);

        const sheet = page.getByTestId('close-shift-sheet');
        await expect(sheet).toBeVisible();
        const overflow = await sheet.evaluate((el) => {
          const walk = (node: Element): boolean => {
            const style = window.getComputedStyle(node);
            const oy = style.overflowY;
            if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 2) {
              return true;
            }
            for (const child of Array.from(node.children)) {
              if (walk(child)) return true;
            }
            return false;
          };
          return {
            sheetScrolls: el.scrollHeight > el.clientHeight + 2,
            childScrolls: walk(el),
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          };
        });
        expect(
          overflow.sheetScrolls || overflow.childScrolls,
          `3.6 unexpected vertical scroll at ${vp.w}x${vp.h}: ${JSON.stringify(overflow)}`,
        ).toBe(false);
      } finally {
        await context.close();
      }
    });
  }
});
