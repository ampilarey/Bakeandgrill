import { afterEach, describe, expect, it, vi } from "vitest";
import { canScanGiftCard } from "./useGiftCardScan";

/**
 * Scanning is offered only where the browser can actually do it.
 *
 * No decoder library is shipped: this is the customer app, and a decoder is a
 * large download for everyone so that a few people can skip typing. iOS Safari
 * has no BarcodeDetector, so on an iPhone the button must simply not appear —
 * an offered button that cannot work is worse than no button.
 */
describe("gift card scanning support", () => {
  const original = Object.getOwnPropertyDescriptor(window, "BarcodeDetector");

  afterEach(() => {
    if (original) Object.defineProperty(window, "BarcodeDetector", original);
    else delete (window as unknown as Record<string, unknown>).BarcodeDetector;
    vi.restoreAllMocks();
  });

  const withCamera = (present: boolean) => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: present ? { getUserMedia: vi.fn() } : undefined,
      configurable: true,
    });
  };

  it("is not offered when the browser has no detector", () => {
    delete (window as unknown as Record<string, unknown>).BarcodeDetector;
    withCamera(true);

    expect(canScanGiftCard()).toBe(false);
  });

  it("is not offered when there is no camera the browser can use", () => {
    Object.defineProperty(window, "BarcodeDetector", { value: function () {}, configurable: true });
    withCamera(false);

    expect(canScanGiftCard()).toBe(false);
  });

  it("is offered when both exist", () => {
    Object.defineProperty(window, "BarcodeDetector", { value: function () {}, configurable: true });
    withCamera(true);

    expect(canScanGiftCard()).toBe(true);
  });
});
