/**
 * Page Object Model for the online-order-web Checkout page (/order/checkout).
 *
 * Encapsulates all selectors so spec files stay selector-free.
 */
import { type Page, type Locator, expect } from '@playwright/test';

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
    await this.page.goto('/order/checkout');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(800);
  }

  /** Wait until the checkout form is fully rendered. */
  async waitForForm(): Promise<void> {
    // The page renders an order type selector (takeaway/delivery buttons) or a login gate
    await this.page.waitForSelector(
      'button[aria-pressed], [class*="order-type"], [class*="checkout-form"], h1',
      { timeout: 12_000 },
    );
  }

  /** Select the order type (takeaway or delivery). */
  async selectOrderType(type: 'takeaway' | 'delivery'): Promise<void> {
    const btn = this.page
      .locator('button[aria-pressed]')
      .filter({ hasText: new RegExp(type, 'i') })
      .first();

    if (await btn.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await btn.click();
      await this.page.waitForTimeout(400);
    }
  }

  /** Fill in the delivery address form fields. */
  async fillDeliveryAddress(addr: DeliveryAddress): Promise<void> {
    await this.fillIfVisible('input[placeholder*="island" i], select[name*="island" i]', addr.island);
    await this.fillIfVisible(
      'input[placeholder*="address" i], input[name*="address" i]',
      addr.addressLine1,
    );
    await this.fillIfVisible(
      'input[placeholder*="name" i], input[name*="contact_name" i]',
      addr.contactName,
    );
    await this.fillIfVisible(
      'input[placeholder*="phone" i], input[name*="contact_phone" i]',
      addr.contactPhone,
    );
    if (addr.notes) {
      await this.fillIfVisible('textarea[placeholder*="note" i]', addr.notes);
    }
  }

  /** Apply a promo code. */
  async applyPromo(code: string): Promise<void> {
    const input = this.page
      .locator('input[placeholder*="promo" i], input[placeholder*="coupon" i]')
      .first();
    if (await input.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await input.fill(code);
      const applyBtn = this.page
        .locator('button')
        .filter({ hasText: /apply|use|ok/i })
        .first();
      if (await applyBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await applyBtn.click();
        await this.page.waitForTimeout(600);
      }
    }
  }

  /** Read the displayed order total. */
  async getTotal(): Promise<string> {
    const totalEl = this.page
      .locator('[class*="total"], [data-testid="total"]')
      .filter({ hasText: /mvr|\d/i })
      .last();
    return (await totalEl.textContent({ timeout: 4_000 }).catch(() => '')) ?? '';
  }

  /** Get the delivery fee row text (if shown). */
  async getDeliveryFeeText(): Promise<string> {
    const row = this.page
      .locator('[class*="summary"] [class*="row"], li, tr')
      .filter({ hasText: /delivery fee|shipping/i })
      .first();
    return (await row.textContent({ timeout: 3_000 }).catch(() => '')) ?? '';
  }

  /** Click the confirm / place order / pay button. */
  async submitOrder(): Promise<void> {
    const btn = this.page
      .locator('button')
      .filter({ hasText: /place order|confirm|pay now|checkout/i })
      .first();
    await expect(btn).toBeVisible({ timeout: 6_000 });
    await btn.click();
  }

  /** Whether the checkout form is visible (as opposed to auth gate). */
  async isFormVisible(): Promise<boolean> {
    return this.page
      .locator('button[aria-pressed], [class*="checkout-form"]')
      .isVisible({ timeout: 4_000 })
      .catch(() => false);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async fillIfVisible(selector: string, value: string): Promise<void> {
    const el = this.page.locator(selector).first();
    if (await el.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const tag = await el.evaluate((e) => (e as HTMLElement).tagName.toLowerCase());
      if (tag === 'select') {
        await el.selectOption({ label: value }).catch(async () => {
          await el.selectOption({ value }).catch(() => {});
        });
      } else {
        await el.fill(value);
      }
    }
  }
}
