/**
 * Page Object Model for the online-order-web CartDrawer component.
 *
 * The drawer is rendered inside the menu page — it is not a separate route.
 */
import { type Page, type Locator, expect } from '@playwright/test';

export class CartDrawer {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Open the cart drawer by clicking the cart toggle button. */
  async open(): Promise<void> {
    const toggle = this.page
      .locator('button[aria-label*="cart" i], [class*="cart-icon"], [class*="cart-toggle"]')
      .first();
    if (await toggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await toggle.click();
      await this.page.waitForTimeout(400);
    }
  }

  get drawer(): Locator {
    return this.page.locator('[class*="cart-drawer"], [class*="CartDrawer"], [aria-label*="cart" i]').first();
  }

  get items(): Locator {
    return this.page.locator('[class*="cart-item"], [class*="CartItem"]');
  }

  get checkoutButton(): Locator {
    return this.page.locator('button').filter({ hasText: /checkout|pay/i }).first();
  }

  /** Increase the quantity of the first cart item. */
  async increaseQuantity(): Promise<void> {
    const incBtn = this.page
      .locator('button[aria-label*="increase" i], button[aria-label="+"]')
      .first();
    if (await incBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await incBtn.click();
      await this.page.waitForTimeout(300);
    }
  }

  /** Decrease the quantity of the first cart item. */
  async decreaseQuantity(): Promise<void> {
    const decBtn = this.page
      .locator('button[aria-label*="decrease" i], button[aria-label="-"]')
      .first();
    if (await decBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await decBtn.click();
      await this.page.waitForTimeout(300);
    }
  }

  async isVisible(): Promise<boolean> {
    return this.drawer.isVisible({ timeout: 3_000 }).catch(() => false);
  }

  async itemCount(): Promise<number> {
    return this.items.count();
  }

  async clickCheckout(): Promise<void> {
    await expect(this.checkoutButton).toBeVisible({ timeout: 5_000 });
    await this.checkoutButton.click();
  }
}
