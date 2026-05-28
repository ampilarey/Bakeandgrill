/**
 * Checkout promo + gift-card preview flows (no BML payment).
 */
import { test, expect, type Page } from '@playwright/test';
import { CheckoutPage } from '../pages/CheckoutPage';
import { injectCustomerTokenAndWait } from '../helpers/wait';
import { ensureE2EPromo, issueE2EGiftCard, E2E_PROMO_CODE } from '../helpers/testRewards';

const TEST_PHONE    = process.env.TEST_PHONE    ?? '7972434';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

async function injectCartItem(page: Page): Promise<void> {
  const res = await page.request.get('/api/items?per_page=1&is_available=1');
  const body = await res.json() as { data?: { id: number; name: string; base_price: string; tax_rate?: number | null }[] };
  const item = body.data?.[0];
  if (!item) throw new Error('No menu items returned from API');

  const cartEntry = {
    item: {
      id: item.id,
      name: item.name,
      base_price: item.base_price,
      tax_rate: item.tax_rate ?? 0,
    },
    quantity: 1,
    modifiers: [],
  };

  await page.goto('/order/menu', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ entry }: { entry: unknown }) => {
    localStorage.setItem('bakegrill_cart', JSON.stringify([entry]));
  }, { entry: cartEntry });
}

test.describe.configure({ mode: 'serial' });

let customerToken = '';
let promoCode = '';
let giftCardCode = '';

test.beforeAll(async ({ request }) => {
  promoCode = await ensureE2EPromo(request);
  giftCardCode = await issueE2EGiftCard(request, 25);

  if (!TEST_PASSWORD) return;
  const res = await request.post('/api/auth/customer/login', {
    data: { phone: `+960${TEST_PHONE}`, password: TEST_PASSWORD },
  });
  if (res.ok()) {
    const body = await res.json() as { token?: string };
    customerToken = body.token ?? '';
  }
});

async function openAuthenticatedCheckout(page: Page): Promise<CheckoutPage> {
  if (!customerToken) {
    test.skip(true, 'Customer credentials required');
  }
  await injectCustomerTokenAndWait(page, customerToken, TEST_PHONE);
  await injectCartItem(page);

  const checkout = new CheckoutPage(page);
  await checkout.goto();
  if (!(await checkout.isFormVisible())) {
    test.skip(true, 'Checkout auth gate visible');
  }
  await checkout.selectOrderType('pickup');
  return checkout;
}

test.describe('Checkout promo and gift card', () => {
  test('valid promo code shows discount in order summary', async ({ page }) => {
    if (!promoCode) {
      test.skip(true, 'Could not ensure E2E promo — staff credentials required');
      return;
    }

    const checkout = await openAuthenticatedCheckout(page);
    const totalBefore = await checkout.getTotal();

    await checkout.applyPromo(promoCode);
    await checkout.expectPromoApplied(promoCode);

    const summary = page.locator('text=Order Summary').locator('xpath=ancestor::div[1]');
    await expect(summary.getByText(new RegExp(`Promo \\(${promoCode}\\)`, 'i'))).toBeVisible();
    await expect(summary.getByText(/− MVR/i)).toBeVisible();

    const totalAfter = await checkout.getTotal();
    expect(totalAfter).not.toBe(totalBefore);
  });

  test('gift card balance check and apply updates order summary', async ({ page }) => {
    if (!giftCardCode) {
      test.skip(true, 'Could not issue E2E gift card — staff credentials required');
      return;
    }

    const checkout = await openAuthenticatedCheckout(page);
    await checkout.checkGiftCard(giftCardCode);
    await checkout.applyGiftCard();
    await checkout.expectGiftCardDiscount();
  });

  test('promo and gift card can stack in summary preview', async ({ page }) => {
    if (!promoCode || !giftCardCode) {
      test.skip(true, 'Staff fixtures unavailable');
      return;
    }

    const checkout = await openAuthenticatedCheckout(page);
    await checkout.applyPromo(promoCode);
    await checkout.expectPromoApplied(promoCode);
    await checkout.checkGiftCard(giftCardCode);
    await checkout.applyGiftCard();

    const summary = page.locator('text=Order Summary').locator('xpath=ancestor::div[1]');
    await expect(summary.getByText(new RegExp(`Promo \\(${promoCode}\\)`, 'i'))).toBeVisible();
    await expect(summary.getByText(/^Gift Card/i)).toBeVisible();
  });
});
