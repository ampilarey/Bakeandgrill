import { afterEach, describe, expect, it, vi } from "vitest";
import { startIosStandaloneInsets } from "./iosStandaloneInsets";

/**
 * The iOS 26 frost under the status bar (owner, 2026-10-03). The helper
 * measures the status bar from the gap between screen and window in a
 * Home Screen install, so the top bar can clear the frosted band.
 */
function setup(opts: { standalone?: boolean; screen: [number, number]; inner: [number, number] }) {
  Object.defineProperty(window.navigator, "standalone", { value: opts.standalone, configurable: true });
  Object.defineProperty(window, "screen", { value: { width: opts.screen[0], height: opts.screen[1] }, configurable: true });
  Object.defineProperty(window, "innerWidth", { value: opts.inner[0], configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: opts.inner[1], configurable: true, writable: true });
}

const read = () => document.documentElement.style.getPropertyValue("--pos-status-bar");

afterEach(() => {
  document.documentElement.style.removeProperty("--pos-status-bar");
  vi.restoreAllMocks();
});

describe("startIosStandaloneInsets", () => {
  it("measures the status bar on an iPhone with a plain status bar", () => {
    setup({ standalone: true, screen: [393, 852], inner: [393, 793] });
    startIosStandaloneInsets();
    expect(read()).toBe("59px");
  });

  it("measures the iPad's thinner status bar", () => {
    setup({ standalone: true, screen: [834, 1194], inner: [834, 1170] });
    startIosStandaloneInsets();
    expect(read()).toBe("24px");
  });

  it("reports 0 with a see-through status bar, where the safe-area inset carries the height", () => {
    setup({ standalone: true, screen: [393, 852], inner: [393, 852] });
    startIosStandaloneInsets();
    expect(read()).toBe("0px");
  });

  it("reports 0 in landscape, where the phone shows no status bar", () => {
    setup({ standalone: true, screen: [393, 852], inner: [852, 334] });
    startIosStandaloneInsets();
    expect(read()).toBe("0px");
  });

  it("ignores a gap that is a keyboard or a browser toolbar, not a status bar", () => {
    setup({ standalone: true, screen: [393, 852], inner: [393, 500] });
    startIosStandaloneInsets();
    expect(read()).toBe("0px");
  });

  it("does nothing outside a Home Screen install", () => {
    setup({ standalone: undefined, screen: [393, 852], inner: [393, 793] });
    startIosStandaloneInsets();
    expect(read()).toBe("");
  });
});
