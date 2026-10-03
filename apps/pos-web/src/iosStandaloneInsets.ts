/**
 * How tall the iPhone or iPad status bar is, as a CSS variable, in a
 * Home Screen install (owner, 2026-10-03: "still there is a frost on the
 * top of the POS").
 *
 * This iOS lays a soft frost over the status bar and about forty points
 * below it, over whatever the app draws there, and it does so whether the
 * app asked for a see-through status bar or a plain one. With the plain
 * one the page starts below the status bar, so `env(safe-area-inset-top)`
 * is 0 and CSS alone cannot tell that the frost is there. In that mode
 * the window is exactly the screen minus the status bar, so the
 * difference is the status bar's height; with a see-through bar the two
 * are equal and the safe-area inset carries the height instead. The top
 * bar adds its clearance when either is non-zero (see .pos-topbar).
 *
 * Only a Home Screen install on iOS reports `navigator.standalone`; in a
 * browser tab, on Android and on a desktop the variable stays unset.
 */
export function startIosStandaloneInsets(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone !== true) return;

  const apply = () => {
    // iOS reports screen.height as the long side whatever the orientation,
    // so only a portrait window can be compared with it. In landscape iOS
    // hides the status bar on a phone and draws no frost.
    const portrait = window.innerHeight >= window.innerWidth;
    const gap = portrait ? Math.round(window.screen.height - window.innerHeight) : 0;
    // A real status bar is 20 to 70 points; anything else is a keyboard, a
    // split view or a browser toolbar, and we must not clear for those.
    const statusBar = gap >= 20 && gap <= 70 ? gap : 0;
    document.documentElement.style.setProperty("--pos-status-bar", `${statusBar}px`);
  };

  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
}
