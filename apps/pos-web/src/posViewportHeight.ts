/**
 * Publish the real visible height as `--pos-vh`, and keep it right.
 *
 * Owner, 2026-09-04, after a week of my wrong guesses — this is his find:
 *
 *   "When i update the app or close and reopen the app. Sometimes the charge
 *    button is little upper. I have to scroll to bring it to normal position.
 *    When I bring to normal position its working perfectly. But before
 *    bringing to normal position the issue is happening."
 *
 * His two screenshots, two minutes apart on the same screen, show it: in one
 * the grid stops at Cutlets with the Charge bar under it; in the other a
 * fourth row of cards is peeking through and the bar sits lower. The shell is
 * laid out at two different heights.
 *
 * `.pos-shell` was `height: 100dvh`. On iOS, `dvh` does not reliably settle on
 * a fresh load — WebKit resolves it against the *large* viewport, as though
 * the toolbar were already hidden, and only corrects on a scroll or resize.
 * So the shell is taller than the screen, everything inside sits at the wrong
 * offset, and — this is the part that cost us the week — the paint and the
 * hit-testing disagree. A finger on the second row of notes lands on the
 * first; a finger on the first lands on the tender row above it. One scroll
 * fixes it because that is exactly what makes WebKit recompute.
 *
 * `visualViewport.height` is the honest number and it updates when the toolbar
 * moves. `dvh` stays as the CSS fallback for anything without this running.
 */
const VAR = "--pos-vh";

/**
 * Installed to the home screen, or running in a browser tab?
 *
 * This is the difference that decides which reading to trust, and getting it
 * wrong in either direction breaks a different screen. In a browser there is a
 * toolbar, so the smallest reading is the honest one. Installed, there is no
 * toolbar at all — nothing can be covering the screen — so a reading smaller
 * than the others is simply a bad one, taken before iOS had settled.
 */
function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches;
}

function currentHeight(): number {
  const vv = window.visualViewport?.height;
  const inner = window.innerHeight;
  const client = document.documentElement?.clientHeight ?? 0;

  /*
   * Owner, 2026-09-04, on the installed POS: "After updating charge footer is
   * little upper if i didn't bring it down by scrolling down and click charge
   * same previous issue."
   *
   * The footer sitting high with a band under it is the shell laid out SHORT,
   * and a scroll bringing it down is this function running again on the
   * visualViewport scroll event and getting a bigger number the second time.
   * So the first number was wrong and it stayed wrong until he touched the
   * screen — through every retry on the schedule below, because those retries
   * kept asking the same source and getting the same stale answer.
   *
   * An earlier version of this comment said max() was deliberately avoided,
   * and in a browser it still is: there the larger reading is the toolbar
   * lying, and a shell taller than the screen pushes Charge below the fold,
   * which is worse. But the till is installed to the home screen. There is no
   * toolbar for the big number to be lying about, so on that surface the
   * largest of the three readings is the screen and the small one is the
   * launch artefact. Split by surface rather than picking one for both.
   */
  if (isStandalone()) {
    return Math.floor(Math.max(vv ?? 0, inner || 0, client || 0));
  }
  return Math.floor(vv ?? inner);
}

let published = 0;

function apply(): void {
  const h = currentHeight();
  // Only write when it actually moved: this now runs on every touch, and
  // re-setting the same value would invalidate style on each one.
  if (h > 0 && h !== published) {
    published = h;
    document.documentElement.style.setProperty(VAR, `${h}px`);
  }
}

/**
 * Re-measure now, and do the cashier's scroll.
 *
 * Exported for the moment it matters most — the Charge screen opening. That is
 * the one place where a stale height has been costing real taps, and it can be
 * seconds after launch, long past the schedule below.
 */
export function remeasurePosViewport(): void {
  apply();
  nudgeScrollers();
}

/**
 * Do what the cashier does by hand.
 *
 * Owner: "I have to scroll to bring it to normal position. When I bring to
 * normal position its working perfectly." A scroll is what makes WebKit
 * recompute the layout and, with it, the hit map. So do it for them — one
 * pixel down and back on every scroller, which is invisible but counts.
 *
 * Only during the first seconds after load, before anyone is using the till,
 * so it can never tug the list out from under a finger.
 */
function nudgeScrollers(): void {
  const shell = document.querySelector(".pos-shell");
  if (!shell) return;
  const scrollers: Element[] = [shell, ...shell.querySelectorAll("*")].filter((el) => {
    const s = getComputedStyle(el as Element);
    return /auto|scroll/.test(s.overflowY) && (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight;
  });
  for (const el of scrollers) {
    const node = el as HTMLElement;
    const top = node.scrollTop;
    node.scrollTop = top + 1;
    node.scrollTop = top;
  }
}

export function startPosViewportHeight(): () => void {
  // Forget any value from a previous run so the first reading is always
  // written, even when it happens to match.
  published = 0;
  apply();

  /*
   * Keep asking for the first few seconds.
   *
   * Owner, 2026-09-04: "still happens same. if the change bar is upper same."
   * The first version took one reading at boot and two shortly after, then
   * waited for an event. In a standalone launch — added to the home screen,
   * no browser toolbar — those events never fire, so a short reading taken
   * during launch was simply pinned there. That is worse than the `dvh` it
   * replaced, which at least corrected on a scroll. Hence the schedule below,
   * the standalone max() above, and the touch listener: whatever iOS settles
   * on within three seconds wins, and the first finger on the glass corrects
   * it if three seconds were not enough,
   * without needing an event that standalone never sends.
   */
  const raf = requestAnimationFrame(apply);
  const timers = [60, 150, 300, 600, 1000, 1600, 2400, 3200]
    .map((ms) => window.setTimeout(() => { apply(); nudgeScrollers(); }, ms));

  const vv = window.visualViewport;
  vv?.addEventListener("resize", apply);
  // The toolbar collapsing counts as a scroll of the visual viewport, not a resize.
  vv?.addEventListener("scroll", apply);
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  // Back from the app switcher / restored from the page cache.
  window.addEventListener("pageshow", apply);
  window.addEventListener("visibilitychange", apply);

  /*
   * Re-measure on the first touch of every interaction.
   *
   * Owner, 2026-09-04: "if i didn't bring it down by scrolling down". His
   * scroll is not fixing the layout, it is making this function run again and
   * get a number the launch reading did not have. A touch is the earliest
   * moment we can do that for him — before the tap it starts is delivered, so
   * the geometry the tap is tested against is the corrected one.
   *
   * Passive and capture: this must never delay or swallow a press on a till.
   */
  const opts = { capture: true, passive: true } as const;
  document.addEventListener("touchstart", apply, opts);
  document.addEventListener("pointerdown", apply, opts);

  return () => {
    cancelAnimationFrame(raf);
    timers.forEach((t) => window.clearTimeout(t));
    vv?.removeEventListener("resize", apply);
    vv?.removeEventListener("scroll", apply);
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
    window.removeEventListener("pageshow", apply);
    window.removeEventListener("visibilitychange", apply);
    document.removeEventListener("touchstart", apply, opts);
    document.removeEventListener("pointerdown", apply, opts);
  };
}
