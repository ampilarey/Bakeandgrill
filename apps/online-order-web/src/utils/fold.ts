/**
 * Folds a panel open or shut instead of it appearing and vanishing at once
 * (owner, 2026-10-07: "it hides suddenly. Cant u animate"). Height, padding
 * and opacity together, so whatever sits under it glides rather than jumps.
 * The website does the same with `window.bgFold` (layout.blade.php).
 *
 * Opening: call once the panel is shown. Closing: `done` runs when it has
 * folded, to hide or unmount it. Returns a cancel for a change of mind
 * halfway. With reduced motion, or no Web Animations, `done` runs at once.
 */
export function fold(el: HTMLElement | null, open: boolean, done?: () => void): () => void {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!el || reduce || typeof el.animate !== 'function') {
    done?.();
    return () => {};
  }
  const cs = window.getComputedStyle(el);
  const full = { height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 };
  const none = { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 };
  el.style.overflow = 'hidden';
  const anim = el.animate(open ? [none, full] : [full, none], {
    duration: open ? 280 : 220,
    easing: open ? 'cubic-bezier(0.2, 0.8, 0.2, 1)' : 'cubic-bezier(0.4, 0, 0.6, 1)',
    // Shut stays shut until `done` has hidden it, so nothing flashes back.
    fill: open ? 'none' : 'forwards',
  });
  let over = false;
  const end = () => { over = true; el.style.overflow = ''; };
  anim.onfinish = () => {
    end();
    done?.();
    if (!open) requestAnimationFrame(() => anim.cancel());
  };
  return () => {
    if (over) return;
    anim.onfinish = null;
    anim.cancel();
    end();
  };
}
