/**
 * Page Object Model for the admin Orders page (/admin/orders).
 */
import { type Page, type Locator, expect } from '@playwright/test';

export class AdminOrdersPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/orders');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(600);
  }

  get orderRows(): Locator {
    return this.page.locator('table tbody tr, [class*="order-row"]');
  }

  async orderCount(): Promise<number> {
    return this.orderRows.count();
  }

  async openFirstOrder(): Promise<void> {
    const first = this.orderRows.first();
    await expect(first).toBeVisible({ timeout: 8_000 });
    await first.click();
    await this.page.waitForTimeout(400);
  }

  get statusFilter(): Locator {
    return this.page.locator('select[name*="status" i], [class*="status-filter"]').first();
  }

  async filterByStatus(status: string): Promise<void> {
    if (await this.statusFilter.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await this.statusFilter.selectOption({ value: status });
      await this.page.waitForTimeout(500);
    }
  }
}
