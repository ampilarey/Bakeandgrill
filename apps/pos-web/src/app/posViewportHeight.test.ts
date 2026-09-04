import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startPosViewportHeight } from "../posViewportHeight";

/**
 * The shell is sized from a measured height, not from `dvh`.
 *
 * Owner's find, 2026-09-04, after a week of my wrong guesses:
 *
 *   "When i update the app or close and reopen the app. Sometimes the charge
 *    button is little upper. I have to scroll to bring it to normal position.
 *    When I bring to normal position its working perfectly."
 *
 * `.pos-shell` was `height: 100dvh`. On iOS that does not settle on a fresh
 * load — WebKit resolves it against the large viewport as though the toolbar
 * were hidden, and only corrects on a scroll. The shell came out taller than
 * the screen, so the paint and the hit-testing disagreed: a finger on the
 * second row of notes landed on the first, and one on the first landed on the
 * tender row. Which is why one scroll made it behave.
 */
describe("POS viewport height", () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    document.documentElement.style.removeProperty("--pos-vh");
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.restoreAllMocks();
  });

  const read = () => document.documentElement.style.getPropertyValue("--pos-vh");

  it("publishes the visible height immediately, before anything renders", () => {
    Object.defineProperty(window, "innerHeight", { value: 812, configurable: true });
    stop = startPosViewportHeight();
    expect(read()).toBe("812px");
  });

  it("prefers the visual viewport, which is what the toolbar actually leaves", () => {
    Object.defineProperty(window, "innerHeight", { value: 956, configurable: true });
    Object.defineProperty(window, "visualViewport", {
      value: { height: 888, addEventListener: () => {}, removeEventListener: () => {} },
      configurable: true,
    });
    stop = startPosViewportHeight();
    // 956 is the lie dvh tells; 888 is the screen the cashier can touch.
    expect(read()).toBe("888px");
  });

  it("re-measures when the toolbar moves", () => {
    let handler: (() => void) | null = null;
    Object.defineProperty(window, "innerHeight", { value: 700, configurable: true });
    Object.defineProperty(window, "visualViewport", {
      value: {
        height: 700,
        addEventListener: (ev: string, fn: () => void) => { if (ev === "resize") handler = fn; },
        removeEventListener: () => {},
      },
      configurable: true,
    });
    stop = startPosViewportHeight();
    expect(read()).toBe("700px");

    (window.visualViewport as unknown as { height: number }).height = 764;
    handler?.();
    expect(read()).toBe("764px");
  });

  it("floors fractional heights", () => {
    Object.defineProperty(window, "visualViewport", {
      value: { height: 743.5, addEventListener: () => {}, removeEventListener: () => {} },
      configurable: true,
    });
    stop = startPosViewportHeight();
    expect(read()).toBe("743px");
  });
});

describe("the stylesheet uses it", () => {
  const css = readFileSync(join(__dirname, "..", "index.css"), "utf8");

  it("sizes .pos-shell from the measured value, keeping dvh as the fallback", () => {
    const rule = css.match(/\.pos-shell \{[^}]*\}/)?.[0] ?? "";
    expect(rule, ".pos-shell rule not found").not.toBe("");
    expect(rule).toMatch(/height: var\(--pos-vh, 100dvh\)/);
    // The fallbacks stay for anything that never runs the measurement.
    expect(rule).toMatch(/height: 100vh/);
  });

  it("the measured value comes last so it wins", () => {
    const rule = css.match(/\.pos-shell \{[^}]*\}/)?.[0] ?? "";
    expect(rule.lastIndexOf("var(--pos-vh")).toBeGreaterThan(rule.lastIndexOf("height: 100dvh;"));
  });
});
