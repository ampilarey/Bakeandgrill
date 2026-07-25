/**
 * Absolute document Y to place a category section flush under the sticky menu controls.
 */
export function categoryScrollTop(
  sectionTopInViewport: number,
  windowScrollY: number,
  stickyHeight: number,
  gapPx = 4,
): number {
  return Math.max(0, sectionTopInViewport + windowScrollY - stickyHeight - gapPx);
}
