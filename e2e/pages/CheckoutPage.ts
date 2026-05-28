/**
 * Page Object Model for the online-order-web Checkout page (/order/checkout).
 *
 * Encapsulates all selectors so spec files stay selector-free.
 */
import { type Page, expect } from '@playwright/test';
import { waitForCheckoutReady } from '../helpers/wait';

export interface DeliveryAddress {
  island: string;
  addressLine1: string;
  contactName: string;
  contactPhone: string;
  notes?: string;
}

export class CheckoutPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/order/checkout', { waitUntil: 'domcontentloaded' });
    await waitForCheckoutReady(this.page).catch(() => {});
  }

  /** Wait until the checkout form is fully rendered. */
  async waitForForm(): Promise<void> {
    await waitForCheckoutReady(this.page);
  }

  /** Select the order type (takeaway or delivery). */
  async selectOrderType(type: 'takeaway' | 'delivery' | 'pickup'): Promise<void> {
    const pattern = type === 'pickup' ? /takeaway|pickup/i : new RegExp(type, 'i');
    const btn = this.page.locator('button[aria-pressed]').filter({ hasText: pattern }).first();

    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
  }

  /** Fill in the delivery address form fields. */
  async fillDeliveryAddress(addr: DeliveryAddress): Promise<void> {
    await this.page.getByLabel(/^Address \*$/i).fill(addr.addressLine1);
    await this.page.getByLabel(/^Island \*$/i).fill(addr.island);
    await this.page.getByLabel(/^Contact name \*$/i).fill(addr.contactName);
    await this.page.getByLabel(/^Contact phone \*$/i).fill(addr.contactPhone);
    if (addr.notes) {
      await this.page.getByLabel(/^Delivery notes$/i).fill(addr.notes);
    }
  }

  /** Apply a promo code. */
  async applyPromo(code: string): Promise<void> {
    const input = this.page.getByLabel(/^Promo code$/i);
    await expect(input).toBeVisible({ timeout: 6_000 });
    await input.fill(code);

    const applyBtn = this.page.locator('button').filter({ hasText: /^apply$/i }).first();
    await applyBtn.click();
  }

  /** Read the displayed order total from the Order Summary card. */
  async getTotal(): Promise<string> {
    const summary = this.page.locator('text=Order Summary').locator('xpath=ancestor::div[1]');
    const row = summary.locator('div').filter({ has: this.page.getByText(/^Total$/) }).last();
    return (await row.textContent({ timeout: 4_000 }).catch(() => '')) ?? '';
  }

  /** Get the delivery fee row text (if shown). */
  async getDeliveryFeeText(): Promise<string> {
    const summary = this.page.locator('text=Order Summary').locator('xpath=ancestor::div[1]');
    const row = summary.getByText(/^Delivery fee$/i).locator('xpath=ancestor::div[1]');
    return (await row.textContent({ timeout: 4_000 }).catch(() => '')) ?? '';
  }

  /** Click the confirm / place order / pay button. */
  async submitOrder(): Promise<void> {
    const btn = this.page
      .locator('button')
      .filter({ hasText: /place order|confirm|pay.*bml|checkout/i })
      .first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();
  }

  /** Whether the checkout form is visible (as opposed to auth gate). */
  async isFormVisible(): Promise<boolean> {
    return this.page
      .locator('button[aria-pressed]')
      .first()
      .isVisible({ timeout: 4_000 })
      .catch(() => false);
  }

  /** True when delivery is disabled (outside hours / not accepting). */
  async isDeliveryBlocked(): Promise<boolean> {
    const deliveryBtn = this.page.locator('button[aria-pressed]').filter({ hasText: /delivery/i }).first();
    if (!(await deliveryBtn.isVisible({ timeout: 2_000 }).catch(() => false))) return true;
    return deliveryBtn.isDisabled();
  }
}
