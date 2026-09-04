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

function currentHeight(): number {
  const vv = window.visualViewport;
  // `visualViewport.height` is the honest number: in a browser with a toolbar
  // it excludes the toolbar, which `innerHeight` does not.
  //
  // Deliberately NOT max() of the three readings. That would fix a short
  // launch reading but break the toolbar case, where the larger number is the
  // lie and the shell would end up taller than the screen — pushing Charge
  // below the fold, which is worse than what we are fixing. The correction for
  // a bad launch reading is the schedule below, not a bigger number.
  return Math.floor(vv?.height ?? window.innerHeight);
}

function apply(): void {
  const h = currentHeight();
  if (h > 0) document.documentElement.style.setProperty(VAR, `${h}px`);
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
  apply();

  /*
   * Keep asking for the first few seconds.
   *
   * Owner, 2026-09-04: "still happens same. if the change bar is upper same."
   * The first version took one reading at boot and two shortly after, then
   * waited for an event. In a standalone launch — added to the home screen,
   * no browser toolbar — those events never fire, so a short reading taken
   * during launch was simply pinned there. That is worse than the `dvh` it
   * replaced, which at least corrected on a scroll. Hence the schedule below
   * and the max() above: whatever iOS settles on within three seconds wins,
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

  return () => {
    cancelAnimationFrame(raf);
    timers.forEach((t) => window.clearTimeout(t));
    vv?.removeEventListener("resize", apply);
    vv?.removeEventListener("scroll", apply);
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
    window.removeEventListener("pageshow", apply);
  };
}
