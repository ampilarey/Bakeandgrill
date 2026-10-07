import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { fold } from '../utils/fold';

/**
 * Whether a folding panel should be in the page: true as soon as it opens,
 * and still true while it folds shut, so it can be seen closing (owner,
 * 2026-10-07: "it hides suddenly. Cant u animate"). Render or show the panel
 * on the returned value and put `ref` on it. Nothing moves on first paint.
 */
export function useFold(open: boolean, ref: RefObject<HTMLElement | null>): boolean {
  const [shown, setShown] = useState(open);
  const laidOut = useRef(false);
  const settled = useRef(false);

  // Opening: the panel is in the page from this same render, so it can be
  // measured and unfolded before the browser paints it full size.
  useLayoutEffect(() => {
    if (!laidOut.current) {
      laidOut.current = true;
      return;
    }
    if (open) fold(ref.current, true);
  }, [open, ref]);

  // Closing: it stays until folded, then goes.
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (open) {
      setShown(true);
      return;
    }
    return fold(ref.current, false, () => setShown(false));
  }, [open, ref]);

  return open || shown;
}
