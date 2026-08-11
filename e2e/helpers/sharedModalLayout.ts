/**
 * SharedUI Modal layout assertions for Playwright (real Chromium).
 * Do not inject CSS — assert against shipped admin styles only.
 */
import { expect, type Page } from '@playwright/test';
import { expectNoDocumentHorizontalOverflow } from './mobileLayout';

export async function expectSharedModalOpen(page: Page): Promise<void> {
  await expect(page.getByTestId('shared-modal-backdrop')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('shared-modal-close')).toBeVisible();
}

/** Close control must paint inside the viewport. */
export async function expectSharedModalCloseInViewport(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  const close = page.getByTestId('shared-modal-close');
  const box = await close.boundingBox();
  expect(box, 'close button must have a bounding box').toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

/** Body scroll is locked while the SharedUI Modal is mounted. */
export async function expectBodyScrollLocked(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.body.style.overflow);
  expect(overflow, 'body overflow should be hidden while modal is open').toBe('hidden');

  const before = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy(0, 400));
  const after = await page.evaluate(() => window.scrollY);
  expect(after, 'page behind modal must not scroll').toBe(before);
}

/** Full SharedUI Modal layout contract at the current viewport. */
export async function expectSharedModalLayoutOk(page: Page): Promise<void> {
  await expectSharedModalOpen(page);
  await expectNoDocumentHorizontalOverflow(page);
  await expectSharedModalCloseInViewport(page);

  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  const container = page.locator('.modal-backdrop .modal-container').first();
  const box = await container.boundingBox();
  expect(box, 'modal-container must have a bounding box').toBeTruthy();
  expect(
    box!.x + box!.width,
    `modal-container right edge ${box!.x + box!.width} exceeds viewport ${viewport!.width}`,
  ).toBeLessThanOrEqual(viewport!.width + 1);

  await expectBodyScrollLocked(page);
}
