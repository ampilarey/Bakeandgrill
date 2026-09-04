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
/** Pretend the POS is installed to the home screen, or is not. */
function asStandalone(value: boolean) {
  Object.defineProperty(window, "matchMedia", {
    value: (q: string) => ({
      matches: value && q.includes("standalone"),
      media: q, addEventListener: () => {}, removeEventListener: () => {},
    }),
    configurable: true,
  });
}

describe("POS viewport height", () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    document.documentElement.style.removeProperty("--pos-vh");
    // Every case starts from a plain browser tab with nothing left over from
    // the last one — these are defineProperty overrides, which no mock reset
    // undoes.
    asStandalone(false);
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true });
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
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

  /*
   * Installed to the home screen, the small reading is the bad one.
   *
   * Owner, 2026-09-04: "After updating charge footer is little upper if i
   * didn't bring it down by scrolling down and click charge same previous
   * issue." A footer sitting high with a band under it is a shell laid out
   * short; a scroll fixing it is this module running again and getting a
   * bigger number. So the launch reading was wrong and stayed wrong.
   *
   * On the installed app there is no toolbar, so nothing can legitimately be
   * covering the screen and the largest reading is the screen. In a browser
   * the opposite holds — there the big number is the toolbar lying, and
   * trusting it would push Charge below the fold.
   */
  it("installed: takes the largest reading, so a short launch number loses", () => {
    asStandalone(true);
    Object.defineProperty(window, "innerHeight", { value: 956, configurable: true });
    Object.defineProperty(window, "visualViewport", {
      value: { height: 620, addEventListener: () => {}, removeEventListener: () => {} },
      configurable: true,
    });

    stop = startPosViewportHeight();

    // 620 is the reading taken mid-launch; the screen is 956.
    expect(read()).toBe("956px");
  });

  it("in a browser: still trusts the visual viewport over innerHeight", () => {
    asStandalone(false);
    Object.defineProperty(window, "innerHeight", { value: 956, configurable: true });
    Object.defineProperty(window, "visualViewport", {
      value: { height: 888, addEventListener: () => {}, removeEventListener: () => {} },
      configurable: true,
    });

    stop = startPosViewportHeight();

    // Here 956 IS the lie — the toolbar is covering the difference.
    expect(read()).toBe("888px");
  });

  it("corrects on the first touch, which is what the cashier's scroll was doing", () => {
    asStandalone(true);
    Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });
    Object.defineProperty(window, "visualViewport", {
      value: { height: 600, addEventListener: () => {}, removeEventListener: () => {} },
      configurable: true,
    });

    stop = startPosViewportHeight();
    expect(read()).toBe("600px");

    // iOS settles on the real screen, but sends no event for it.
    Object.defineProperty(window, "innerHeight", { value: 956, configurable: true });
    document.dispatchEvent(new Event("touchstart"));

    expect(read()).toBe("956px");
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
