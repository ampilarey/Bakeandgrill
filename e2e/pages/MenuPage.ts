/**
 * Page Object Model for the online-order-web Menu page (/order/menu).
 *
 * Encapsulates all selectors so spec files stay selector-free.
 */
import { type Page, type Locator, expect } from '@playwright/test';

export class MenuPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/order/menu');
    await this.page.waitForLoadState('networkidle');
    await this.waitForItems();
  }

  async waitForItems(): Promise<void> {
    await this.page.waitForSelector('article.menu-card-article', { timeout: 20_000 });
  }

  get items(): Locator {
    return this.page.locator('article.menu-card-article');
  }

  get categoryPills(): Locator {
    return this.page.locator('.category-pill, button.cat-btn-hover');
  }

  async itemCount(): Promise<number> {
    return this.items.count();
  }

  async clickCategory(index: number): Promise<void> {
    const pills = this.categoryPills;
    const count = await pills.count();
    if (count > index) {
      await pills.nth(index).dispatchEvent('click');
      await this.page.waitForTimeout(500);
    }
  }

  /** Open the item modal/detail for the nth card. */
  async openItemModal(index = 0): Promise<Locator> {
    const card = this.items.nth(index);
    await card.click();
    const modal = this.page.locator(
      'dialog, [role="dialog"], [class*="modal"], [class*="Modal"]',
    ).first();
    await expect(modal).toBeVisible({ timeout: 8_000 });
    return modal;
  }

  /** Add the first available item to the cart; returns true on success. */
  async addFirstItemToCart(): Promise<boolean> {
    const count = await this.items.count();
    if (count === 0) return false;

    for (let i = 0; i < Math.min(count, 3); i++) {
      const card = this.items.nth(i);

      // Try direct "Add" button on the card first
      const quickAdd = card.locator('button').filter({ hasText: /^\+$|^add$/i }).first();
      if (await quickAdd.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await quickAdd.click();
        await this.page.waitForTimeout(600);
        return true;
      }

      // Otherwise open the modal and add from there
      await card.click();
      const modal = this.page.locator('[role="dialog"], [class*="modal"]').first();
      const visible = await modal.isVisible({ timeout: 5_000 }).catch(() => false);
      if (visible) {
        const addBtn = modal.locator('button').filter({ hasText: /add to cart|add/i }).first();
        if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await addBtn.click();
          await this.page.waitForTimeout(600);
          return true;
        }
        // Dismiss modal
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(300);
      }
    }

    return false;
  }

  /** Open the cart drawer/sidebar. */
  async openCart(): Promise<void> {
    const cartBtn = this.page.locator(
      'button[aria-label*="cart" i], [class*="cart-icon"], [class*="cart-toggle"]',
    ).first();
    if (await cartBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cartBtn.click();
      await this.page.waitForTimeout(400);
    }
    // If no explicit toggle, the drawer may already be visible
  }

  /** Returns the cart total text (e.g. "MVR 25.00") */
  async getCartTotal(): Promise<string> {
    const total = this.page.locator(
      '[class*="cart-total"], [class*="CartTotal"], [data-testid="cart-total"]',
    ).first();
    const text = await total.textContent({ timeout: 3_000 }).catch(() => '');
    return text ?? '';
  }
}
