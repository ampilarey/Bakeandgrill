type Handle = { stop: () => void };
const folds = new WeakMap<HTMLElement, Handle>();

/**
 * Folds a panel open or shut instead of it appearing and vanishing at once
 * (owner, 2026-10-07: "it hides suddenly. Cant u animate"). Height, padding
 * and opacity together, so whatever sits under it glides rather than jumps.
 * The website does the same with `window.bgFold` (layout.blade.php).
 *
 * Opening: call once the panel is shown. Closing: `done` runs when it has
 * folded, to hide or unmount it. Returns a stop for a change of mind halfway.
 * With reduced motion, or no Web Animations, `done` runs at once.
 *
 * No frame may show the panel full size by mistake (owner: "it hides and
 * reappears for a millisecond like a flash"). Opening, it is pinned shut by
 * inline style until the animation is really running, since Safari can paint
 * a frame before a new animation applies. Closing, the animation holds it
 * shut after it ends, so however long React takes to hide it, it stays shut;
 * the hold is only let go when the next fold starts.
 */
export function fold(el: HTMLElement | null, open: boolean, done?: () => void): () => void {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!el || reduce || typeof el.animate !== 'function') {
    done?.();
    return () => {};
  }
  folds.get(el)?.stop();
  const pin = (on: boolean) => {
    el.style.height = on ? '0px' : '';
    el.style.paddingTop = on ? '0px' : '';
    el.style.paddingBottom = on ? '0px' : '';
    el.style.opacity = on ? '0' : '';
  };
  const handle: Handle = { stop: () => {} };
  const mine = () => folds.get(el) === handle;
  let anim: Animation | null = null;
  el.style.overflow = 'hidden';
  if (open) pin(true);
  // Started on the next frame, not now: the tap that asked for it is still
  // drawing the panel (and, for search, focusing the box), and on a slow
  // phone that work would eat the first half of the fold, so it would jump.
  const start = () => {
    raf = 0;
    if (!mine()) return;
    if (open) pin(false);
    const cs = window.getComputedStyle(el);
    const full = { height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 };
    const shut = { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 };
    if (open) pin(true);
    const a = el.animate(open ? [shut, full] : [full, shut], {
      duration: open ? 280 : 220,
      easing: open ? 'cubic-bezier(0.2, 0.8, 0.2, 1)' : 'cubic-bezier(0.4, 0, 0.6, 1)',
      fill: open ? 'none' : 'forwards',
    });
    anim = a;
    if (open) a.ready?.then(() => { if (mine()) pin(false); }, () => {});
    a.onfinish = () => {
      if (open && mine()) {
        pin(false);
        el.style.overflow = '';
        folds.delete(el);
      }
      done?.();
    };
  };
  let raf = requestAnimationFrame(start);
  handle.stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (anim) {
      anim.onfinish = null;
      anim.cancel();
    }
    if (!mine()) return;
    pin(false);
    el.style.overflow = '';
    folds.delete(el);
  };
  folds.set(el, handle);
  return handle.stop;
}
