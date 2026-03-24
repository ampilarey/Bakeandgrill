/**
 * Full checkout + BML payment test.
 *
 * ⚠️  Uses the REAL BML Connect sandbox.
 *     Card details come from e2e/.env.test (gitignored).
 *     This test places a real order on staging and pays with a sandbox card.
 *     No money is charged — BML sandbox is non-monetary.
 *
 * Prerequisites:
 *   1. Run customer-auth.spec.ts first to save .auth/customer.json
 *   2. Ensure e2e/.env.test has all BML_TEST_CARD_* values filled
 */
import { test, expect, type Page } from '@playwright/test';

const TEST_PHONE     = process.env.TEST_PHONE     ?? '7972434';
const TEST_PASSWORD  = process.env.TEST_PASSWORD  ?? '';
const BML_CARD_NUMBER     = process.env.BML_TEST_CARD_NUMBER ?? '';
const BML_CARD_EXPIRY     = process.env.BML_TEST_CARD_EXPIRY ?? '';
const BML_CARD_CVV        = process.env.BML_TEST_CARD_CVV    ?? '';
const BML_CARD_NAME       = process.env.BML_TEST_CARD_NAME   ?? 'TEST CARD';

// ── Helper: inject a cart item directly into localStorage ───────────────────
async function injectCartItem(page: Page) {
  // Fetch a real item from the API so we have a valid item object
  const res = await page.request.get('/api/items?per_page=1');
  const body = await res.json() as { data?: { id: number; name: string; base_price: string }[] };
  const item = body.data?.[0];
  if (!item) throw new Error('No menu items returned from API');

  const cartEntry = { item, quantity: 1, modifiers: [] };
  await page.evaluate(({ key, entry }: { key: string; entry: unknown }) => {
    localStorage.setItem(key, JSON.stringify([entry]));
  }, { key: 'bakegrill_cart', entry: cartEntry });
}

// ── Helper: restore auth state ───────────────────────────────────────────────
// ONE API login shared across all checkout tests
test.describe.configure({ mode: 'serial' });
let sharedCustomerToken = '';
test.beforeAll(async ({ request }) => {
  if (!TEST_PASSWORD) return;
  const res = await request.post('/api/auth/customer/login', {
    data: { phone: `+960${TEST_PHONE}`, password: TEST_PASSWORD },
  });
  if (res.status() === 429) {
    console.warn('Customer login rate-limited — checkout tests will skip');
    return;
  }
  if (!res.ok()) {
    console.warn(`Customer login failed: ${res.status()}`);
    return;
  }
  const data = await res.json() as { token?: string };
  sharedCustomerToken = data.token ?? '';
});

async function injectCustomerAuth(page: Page, token: string) {
  await page.goto('/order/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(({ t, phone }: { t: string; phone: string }) => {
    localStorage.setItem('online_token', t);
    localStorage.setItem('online_customer_name', phone);
    window.dispatchEvent(new Event('auth_change'));
  }, { t: token, phone: TEST_PHONE });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

test.describe('Checkout flow', () => {
  test.beforeEach(async ({ page }) => {
    if (!sharedCustomerToken) {
      test.skip(true, 'Customer token not available (rate limited)');
      return;
    }
    await injectCustomerAuth(page, sharedCustomerToken);
    await injectCartItem(page);
  });

  // ── Promo code validation ──────────────────────────────────────────────
  test('invalid promo code shows error message', async ({ page }) => {
    await injectCartItem(page);
    await page.goto('/order/checkout');
    await page.waitForLoadState('networkidle');

    // Fill promo code with garbage
    const promoInput = page.locator('input[aria-label="Promo code"], input[placeholder*="promo" i]').first();
    await expect(promoInput).toBeVisible({ timeout: 8_000 });
    await promoInput.fill('INVALIDXXX999');

    const applyBtn = page.locator('button').filter({ hasText: /^apply$/i }).first();
    await applyBtn.click();

    // Error should appear
    const error = page.locator('.field-error, [class*="error"]').first();
    await expect(error).toBeVisible({ timeout: 5_000 });
    const errText = await error.textContent() ?? '';
    expect(errText.toLowerCase()).toMatch(/invalid|expired|not found/);
  });

  // ── Delivery address required ──────────────────────────────────────────
  test('delivery order without address shows validation error', async ({ page }) => {
    await injectCartItem(page);
    await page.goto('/order/checkout');
    await page.waitForLoadState('networkidle');

    // Select delivery
    const deliveryBtn = page.locator('button[aria-pressed]').filter({ hasText: /delivery/i }).first();
    await expect(deliveryBtn).toBeVisible({ timeout: 6_000 });
    await deliveryBtn.click();

    // Try to pay without filling address
    const payBtn = page.locator('button').filter({ hasText: /pay.*bml|place order/i }).first();
    await payBtn.click();
    await page.waitForTimeout(500);

    // Should show required field errors
    const errors = page.locator('.field-error');
    await expect(errors.first()).toBeVisible({ timeout: 4_000 });
  });

  // ── Full payment flow with BML sandbox ────────────────────────────────
  test('full checkout with BML sandbox card completes successfully', async ({ page }) => {
    if (!BML_CARD_NUMBER) {
      test.skip(true, 'BML_TEST_CARD_NUMBER not set in e2e/.env.test');
      return;
    }

    // Safety guard: verify we're using the test account
    await page.goto('/order/');
    await page.waitForLoadState('networkidle');
    const header = await page.textContent('header') ?? '';
    if (!header.includes(TEST_PHONE)) {
      test.skip(true, `Not logged in as test account ${TEST_PHONE} — aborting for safety`);
      return;
    }

    await injectCartItem(page);

    // Navigate to checkout
    await page.goto('/order/checkout');
    await page.waitForLoadState('networkidle');

    // Verify authenticated (AuthBlock should NOT be visible)
    const authBlock = page.locator('[class*="auth"], h2:has-text("Your phone number")').first();
    const authVisible = await authBlock.isVisible({ timeout: 2_000 }).catch(() => false);
    if (authVisible) {
      test.skip(true, 'Auth block still visible — not logged in');
      return;
    }

    // Select Takeaway
    const takeawayBtn = page.locator('button[aria-pressed]').filter({ hasText: /takeaway/i }).first();
    await expect(takeawayBtn).toBeVisible({ timeout: 8_000 });
    await takeawayBtn.click();
    await expect(takeawayBtn).toHaveAttribute('aria-pressed', 'true');

    // Add special instructions
    const notesField = page.locator('textarea.field-input, textarea[placeholder*="allerg" i]').first();
    if (await notesField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await notesField.fill('QA test order — please disregard');
    }

    // Click Pay with BML
    const payBtn = page.locator('button').filter({ hasText: /pay.*bml/i }).first();
    await expect(payBtn).toBeVisible({ timeout: 8_000 });

    // Set up a listener for the BML redirect
    const navigationPromise = page.waitForURL((url) => !url.toString().includes('/order/checkout'), {
      timeout: 30_000,
    });

    await payBtn.click();

    // Wait for redirect (either to BML Connect or directly to order status on error)
    await navigationPromise;

    const currentUrl = page.url();

    if (currentUrl.includes('bml.com.mv') || currentUrl.includes('connect.') || currentUrl.includes('payment')) {
      // We landed on BML Connect sandbox — fill the card form
      console.log(`\n💳 On BML Connect page: ${currentUrl}\n`);
      await page.waitForLoadState('networkidle');

      // BML card form fields (field names vary by BML Connect version)
      const cardNumberField = page.locator(
        'input[name*="card"], input[id*="card"], input[placeholder*="card number" i], input[placeholder*="1234" i]'
      ).first();

      if (await cardNumberField.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await cardNumberField.fill(BML_CARD_NUMBER);

        // Expiry
        const expiryField = page.locator(
          'input[name*="expir"], input[id*="expir"], input[placeholder*="MM/YY" i], input[placeholder*="expir" i]'
        ).first();
        if (await expiryField.isVisible()) await expiryField.fill(BML_CARD_EXPIRY);

        // CVV
        const cvvField = page.locator(
          'input[name*="cvv"], input[name*="cvc"], input[id*="cvv"], input[placeholder*="cvv" i], input[placeholder*="cvc" i], input[placeholder*="security" i]'
        ).first();
        if (await cvvField.isVisible()) await cvvField.fill(BML_CARD_CVV);

        // Cardholder name
        const nameField = page.locator(
          'input[name*="holder"], input[name*="name"], input[placeholder*="name" i]'
        ).first();
        if (await nameField.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await nameField.fill(BML_CARD_NAME);
        }

        // Submit the payment form
        const submitBtn = page.locator(
          'button[type="submit"], input[type="submit"], button:has-text("Pay"), button:has-text("Confirm")'
        ).first();
        await expect(submitBtn).toBeVisible({ timeout: 5_000 });

        // Wait for redirect back to our site
        await Promise.all([
          page.waitForURL((url) => url.toString().includes('test.bakeandgrill.mv'), {
            timeout: 30_000,
          }),
          submitBtn.click(),
        ]);
      } else {
        // BML Connect page structure is different — take a screenshot and skip
        await page.screenshot({ path: 'e2e/screenshots/bml-connect-unknown.png', fullPage: true });
        test.skip(true, 'BML Connect page structure not recognized — screenshot saved');
        return;
      }
    }

    // Should now be on order status page
    await page.waitForLoadState('networkidle');
    const finalUrl = page.url();
    console.log(`\n✅ Final URL after payment: ${finalUrl}\n`);

    expect(finalUrl).toMatch(/\/order\/orders\/|payment=CONFIRMED/);

    // Order status page should show some confirmation
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/confirmed|preparing|pending|order|payment/);

    // Screenshot of success
    await page.screenshot({ path: 'e2e/screenshots/checkout-success.png', fullPage: true });
  });
});
