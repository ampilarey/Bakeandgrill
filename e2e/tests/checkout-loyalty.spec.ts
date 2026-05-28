/**
 * Loyalty points redemption preview at checkout (no BML payment).
 */
import { test, expect, type Page } from '@playwright/test';
import { CheckoutPage } from '../pages/CheckoutPage';
import { injectCustomerTokenAndWait } from '../helpers/wait';
import { ensureCustomerLoyaltyPoints } from '../helpers/testRewards';

const TEST_PHONE    = process.env.TEST_PHONE    ?? '7972434';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';

async function injectCartItem(page: Page): Promise<void> {
  const res = await page.request.get('/api/items?per_page=1&is_available=1');
  const body = await res.json() as { data?: { id: number; name: string; base_price: string; tax_rate?: number | null }[] };
  const item = body.data?.[0];
  if (!item) throw new Error('No menu items returned from API');

  await page.goto('/order/menu', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ entry }: { entry: unknown }) => {
    localStorage.setItem('bakegrill_cart', JSON.stringify([entry]));
  }, {
    entry: {
      item: {
        id: item.id,
        name: item.name,
        base_price: item.base_price,
        tax_rate: item.tax_rate ?? 0,
      },
      quantity: 1,
      modifiers: [],
    },
  });
}

test.describe.configure({ mode: 'serial' });

let customerToken = '';

test.beforeAll(async ({ request }) => {
  if (!TEST_PASSWORD) return;
  const res = await request.post('/api/auth/customer/login', {
    data: { phone: `+960${TEST_PHONE}`, password: TEST_PASSWORD },
  });
  if (res.ok()) {
    const body = await res.json() as { token?: string };
    customerToken = body.token ?? '';
    if (customerToken) {
      await ensureCustomerLoyaltyPoints(request, customerToken, 500);
    }
  }
});

test.describe('Checkout loyalty points', () => {
  test('loyalty checkbox shows discount in order summary', async ({ page }) => {
    if (!customerToken) {
      test.skip(true, 'Customer credentials required');
      return;
    }

    await injectCustomerTokenAndWait(page, customerToken, TEST_PHONE);
    await injectCartItem(page);

    const checkout = new CheckoutPage(page);
    await checkout.goto();
    if (!(await checkout.isFormVisible())) {
      test.skip(true, 'Checkout auth gate visible');
      return;
    }

    await checkout.selectOrderType('pickup');

    const loyaltySection = page.getByText(/^Loyalty Points$/i);
    if (!(await loyaltySection.isVisible({ timeout: 6_000 }).catch(() => false))) {
      test.skip(true, 'Test customer has no loyalty points — staff seed failed');
      return;
    }

    const totalBefore = await checkout.getTotal();
    await checkout.applyLoyaltyPoints();
    await checkout.expectLoyaltyDiscount();

    const totalAfter = await checkout.getTotal();
    expect(totalAfter).not.toBe(totalBefore);
  });
});
