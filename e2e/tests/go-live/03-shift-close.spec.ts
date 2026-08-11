/**
 * Part 3 — shift close (blind count UI + cashier API secrecy).
 * Checklist: 3.1–3.6
 */
import { test, expect, type Page } from '@playwright/test';

import { obtainStaffToken } from '../../fixtures/auth';
import { artisanTinker, cashierToken, ensureOpenShift, staffHeaders } from '../../helpers/goLiveApi';
import { freshOwnerShift } from '../../helpers/freshShift';
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

/** Bump counted cash so Review can run (photo-tap or keypad). */
async function bumpCloseShiftCount(page: Page): Promise<void> {
  const row = page.locator('[data-testid^="denom-row-"]').first();
  if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await row.click();
    return;
  }
  await page.getByTestId('close-shift-count-pad').getByRole('button', { name: 'Digit 1' }).click();
}

async function openCloseShiftSheet(page: Page): Promise<void> {
  // Wait until POS shell accepted the token (not stuck on login).
  await expect
    .poll(async () => (await page.textContent('body')) ?? '', { timeout: 20_000 })
    .toMatch(/category|sales|shift|close shift|open shift|menu/i);

  // Dismiss stray panes (Events etc.) so Close Shift is reachable.
  await page.keyboard.press('Escape').catch(() => {});
  const closePanel = page.getByRole('button', { name: /close panel/i });
  if (await closePanel.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await closePanel.click();
  }

  const menuBtn = page.getByRole('button', { name: /open menu/i }).first();
  await expect(menuBtn).toBeVisible({ timeout: 10_000 });
  await menuBtn.click();

  const drawerClose = page
    .getByRole('dialog', { name: /main menu/i })
    .getByRole('button', { name: /close shift/i })
    .first();
  if (await drawerClose.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await drawerClose.click();
  } else {
    // Current Shift pane → CLOSE SHIFT
    const shiftNav = page
      .getByRole('dialog', { name: /main menu/i })
      .getByRole('button', { name: /current shift/i })
      .first();
    if (await shiftNav.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await shiftNav.click();
    }
    await page.getByRole('button', { name: /close shift/i }).first().click({ timeout: 10_000 });
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

  test('3.3 count wrong then Count again — both attempts recorded @checklist-3.3', async ({
    request,
    page,
  }) => {
    const shiftId = await freshOwnerShift(request);
    const headers = await staffHeaders(request);

    // First deliberate wrong count (empty denoms → short vs opening float).
    const wrong = await request.post(`/api/shifts/${shiftId}/count-attempt`, {
      headers,
      data: { cash_count_method: 'denominations', denominations: {} },
    });
    expect(wrong.ok(), `3.3 first attempt: ${await wrong.text()}`).toBeTruthy();
    const wrongBody = (await wrong.json()) as { attempt_number?: number; matches?: boolean };
    expect(wrongBody.attempt_number).toBe(1);
    expect(wrongBody.matches).toBe(false);

    // UI: Count again on a mismatch review (sheet open path shared with 3.2).
    await injectPosOwner(page);
    await openCloseShiftSheet(page);
    await bumpCloseShiftCount(page);
    await page.getByTestId('close-shift-review-btn').click();
    await expect(page.getByTestId('close-shift-review')).toBeVisible({ timeout: 20_000 });
    if (await page.getByTestId('close-shift-review-balanced').isVisible().catch(() => false)) {
      // POS float not synced — leave review via Back, bump again.
      await page.getByTestId('close-shift-count-again').click();
      await bumpCloseShiftCount(page);
      await bumpCloseShiftCount(page);
      await page.getByTestId('close-shift-review-btn').click();
    }
    await expect(page.getByTestId('close-shift-review-mismatch')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('close-shift-count-again')).toHaveText(/Count again/i);
    await page.getByTestId('close-shift-count-again').click();
    await expect(page.getByTestId('close-shift-sheet')).toBeVisible();
    await expect(page.getByTestId('close-shift-review')).toHaveCount(0);

    // Close records the accepted second attempt (BlindCashCountTest shape).
    const close = await request.post(`/api/shifts/${shiftId}/close`, {
      headers,
      data: {
        cash_count_method: 'plain_total',
        closing_cash: 0,
        notes: 'E2E 3.3 recount close',
      },
    });
    expect(close.ok(), `3.3 close after recount: ${await close.text()}`).toBeTruthy();

    const attemptsJson = artisanTinker(`
$rows = App\\Models\\ShiftCashCountAttempt::where('shift_id', ${shiftId})
  ->orderBy('attempt_number')->get(['attempt_number','is_accepted']);
echo $rows->count().'|'. $rows->pluck('attempt_number')->join(',').'|'. $rows->pluck('is_accepted')->map(fn($v)=>(int)$v)->join(',');
`);
    const [count, nums, accepted] = attemptsJson.split('|');
    expect(Number(count), `3.3 attempts: ${attemptsJson}`).toBeGreaterThanOrEqual(2);
    expect(nums).toMatch(/^1,/);
    expect(accepted.split(',')[0]).toBe('0');
    expect(accepted.split(',').slice(-1)[0]).toBe('1');

    const hist = await request.get('/api/shifts/history', { headers });
    expect(hist.ok(), await hist.text()).toBeTruthy();
    const histBody = (await hist.json()) as {
      shifts?: { id: number; cash_count_attempts?: { attempt_number: number }[] }[];
    };
    const row = (histBody.shifts ?? []).find((s) => s.id === shiftId);
    expect(row?.cash_count_attempts?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test('3.4 close with a difference requires a reason then closes @checklist-3.4', async ({
    request,
    page,
  }) => {
    const shiftId = await freshOwnerShift(request);
    const headers = await staffHeaders(request);

    const attempt = await request.post(`/api/shifts/${shiftId}/count-attempt`, {
      headers,
      data: { cash_count_method: 'plain_total', closing_cash: 1 },
    });
    expect(attempt.ok(), await attempt.text()).toBeTruthy();
    expect((await attempt.json() as { matches?: boolean }).matches).toBe(false);

    const noNotes = await request.post(`/api/shifts/${shiftId}/close`, {
      headers,
      data: { cash_count_method: 'plain_total', closing_cash: 1 },
    });
    expect(noNotes.status()).toBe(422);
    expect(await noNotes.text()).toMatch(/notes are required/i);
    expect(
      Number(artisanTinker(`echo App\\Models\\Shift::find(${shiftId})?->closed_at ? 1 : 0;`)),
    ).toBe(0);

    // UI: mismatch review exposes the required reason field.
    await injectPosOwner(page);
    await openCloseShiftSheet(page);
    await bumpCloseShiftCount(page);
    await page.getByTestId('close-shift-review-btn').click();
    await expect(page.getByTestId('close-shift-review')).toBeVisible({ timeout: 20_000 });
    if (await page.getByTestId('close-shift-review-balanced').isVisible().catch(() => false)) {
      await page.getByTestId('close-shift-count-again').click();
      await bumpCloseShiftCount(page);
      await bumpCloseShiftCount(page);
      await page.getByTestId('close-shift-review-btn').click();
    }
    await expect(page.getByTestId('close-shift-review-mismatch')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('#close-shift-reason')).toBeVisible();

    const close = await request.post(`/api/shifts/${shiftId}/close`, {
      headers,
      data: {
        cash_count_method: 'plain_total',
        closing_cash: 1,
        notes: 'E2E checklist 3.4 variance reason',
      },
    });
    expect(close.ok(), `3.4 close with reason: ${await close.text()}`).toBeTruthy();
    expect(
      Number(artisanTinker(`echo App\\Models\\Shift::find(${shiftId})?->closed_at ? 1 : 0;`)),
    ).toBe(1);
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
