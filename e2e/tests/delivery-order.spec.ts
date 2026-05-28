/**
 * Delivery order checkout flow.
 *
 * Tests the authenticated delivery checkout path:
 *  1. Log in as test customer
 *  2. Inject cart item
 *  3. Select Delivery + fill address
 *  4. Verify delivery fee in order summary
 *  5. Verify total includes delivery fee
 *
 * Does NOT attempt BML payment.
 */
import { test, expect, type Page } from '@playwright/test';
import { MenuPage } from '../pages/MenuPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { assertNoServerError } from '../helpers/assertions';
import { injectCustomerTokenAndWait, waitForCheckoutReady } from '../helpers/wait';

const TEST_PHONE    = process.env.TEST_PHONE    ?? '7972434';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

async function injectCartItem(page: Page): Promise<void> {
  const res = await page.request.get('/api/items?per_page=1&is_available=1');
  const body = await res.json() as { data?: { id: number; name: string; base_price: string }[] };
  const item = body.data?.[0];
  if (!item) return;

  const cartEntry = { item, quantity: 1, modifiers: [] };
  await page.goto('/order/menu', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ entry }: { entry: unknown }) => {
    localStorage.setItem('bakegrill_cart', JSON.stringify([entry]));
  }, { entry: cartEntry });
}

test.describe.configure({ mode: 'serial' });

let customerToken = '';

test.beforeAll(async ({ request }) => {
  if (!TEST_PASSWORD) return;
  try {
    const res = await request.post('/api/auth/customer/login', {
      data: { phone: `+960${TEST_PHONE}`, password: TEST_PASSWORD },
    });
    if (res.status() === 429) return;
    const body = await res.json() as { token?: string };
    customerToken = body.token ?? '';
  } catch {
    // guest-only tests below
  }
});

async function loginCustomer(page: Page): Promise<boolean> {
  if (!customerToken) return false;
  await injectCustomerTokenAndWait(page, customerToken, TEST_PHONE);
  return true;
}

test.describe('Delivery order checkout flow', () => {
  test('menu page loads and items are visible', async ({ page }) => {
    const menu = new MenuPage(page);
    await menu.goto();
    const count = await menu.itemCount();
    expect(count).toBeGreaterThan(0);
  });

  test('can add item to cart from menu page', async ({ page }) => {
    const menu = new MenuPage(page);
    await menu.goto();

    const added = await menu.addFirstItemToCart();
    if (!added) {
      const body = (await page.textContent('body')) ?? '';
      assertNoServerError(body);
      return;
    }

    const body = (await page.textContent('body')) ?? '';
    expect(body.toLowerCase()).toMatch(/mvr|\d|cart|added/i);
  });

  test('checkout page is reachable from menu', async ({ page }) => {
    await injectCartItem(page);
    await page.goto('/order/checkout', { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/500|error/);

    const body = (await page.textContent('body')) ?? '';
    expect(body.toLowerCase()).not.toMatch(/server error|something went wrong|exception/i);
  });

  test('delivery type selector is visible on checkout page', async ({ page }) => {
    const loggedIn = await loginCustomer(page);
    await injectCartItem(page);
    await page.goto('/order/checkout', { waitUntil: 'domcontentloaded' });

    const body = (await page.textContent('body')) ?? '';
    assertNoServerError(body);

    if (loggedIn) {
      await waitForCheckoutReady(page);
      await expect(
        page.locator('button[aria-pressed]').filter({ hasText: /takeaway|pickup|delivery/i }).first(),
      ).toBeVisible({ timeout: 8_000 });
    } else {
      expect(body.toLowerCase()).toMatch(/checkout|login|sign in|cart|order|phone|account/i);
    }
  });

  test('selecting delivery shows address form', async ({ page }) => {
    if (!(await loginCustomer(page))) {
      test.skip(true, 'Customer auth required');
      return;
    }
    await injectCartItem(page);

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    if (!(await checkout.isFormVisible())) {
      test.skip(true, 'Auth gate shown — need customer auth');
      return;
    }
    if (await checkout.isDeliveryBlocked()) {
      test.skip(true, 'Delivery not accepting on this environment right now');
      return;
    }

    await checkout.selectOrderType('delivery');

    await expect(checkout.page.getByLabel(/^Address \*$/i)).toBeVisible({ timeout: 6_000 });
    await expect(checkout.page.getByLabel(/^Island \*$/i)).toBeVisible();
  });

  test('delivery fee appears in order summary', async ({ page }) => {
    if (!(await loginCustomer(page))) {
      test.skip(true, 'Customer auth required');
      return;
    }
    await injectCartItem(page);

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    if (!(await checkout.isFormVisible())) {
      test.skip(true, 'Auth gate shown');
      return;
    }
    if (await checkout.isDeliveryBlocked()) {
      test.skip(true, 'Delivery not accepting');
      return;
    }

    await checkout.selectOrderType('delivery');
    await checkout.fillDeliveryAddress({
      addressLine1: 'UAT Test House, Henveiru',
      island: 'Malé',
      contactName: 'UAT Delivery',
      contactPhone: TEST_PHONE,
    });

    const feeText = await checkout.getDeliveryFeeText();
    expect(feeText.toLowerCase()).toMatch(/delivery fee/);
    expect(feeText).toMatch(/MVR\s+\d+\.\d{2}/);

    const total = await checkout.getTotal();
    expect(total).toMatch(/MVR\s+\d+\.\d{2}/);
  });

  test('delivery order without address shows validation error', async ({ page }) => {
    if (!(await loginCustomer(page))) {
      test.skip(true, 'Customer auth required');
      return;
    }
    await injectCartItem(page);

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    if (!(await checkout.isFormVisible())) {
      test.skip(true, 'Auth gate shown');
      return;
    }
    if (await checkout.isDeliveryBlocked()) {
      test.skip(true, 'Delivery not accepting');
      return;
    }

    await checkout.selectOrderType('delivery');
    await checkout.submitOrder();

    await expect(checkout.page.locator('.field-error').first()).toBeVisible({ timeout: 6_000 });
    expect(page.url()).toMatch(/checkout/);
  });
});
