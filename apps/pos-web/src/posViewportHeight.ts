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
  // Round down: a fractional pixel over the real height brings the scrollbar
  // and the toolbar dance back.
  return Math.floor(vv?.height ?? window.innerHeight);
}

function apply(): void {
  const h = currentHeight();
  if (h > 0) document.documentElement.style.setProperty(VAR, `${h}px`);
}

export function startPosViewportHeight(): () => void {
  apply();

  // The load itself is when iOS lies, so re-measure once the first frames are
  // through rather than trusting the value we got during boot.
  const raf = requestAnimationFrame(apply);
  const settle = window.setTimeout(apply, 300);

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
    window.clearTimeout(settle);
    vv?.removeEventListener("resize", apply);
    vv?.removeEventListener("scroll", apply);
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
    window.removeEventListener("pageshow", apply);
  };
}
