/**
 * Mirror of online-order-web/src/utils/heroSlidePresentation.ts
 * and backend HeroSlides::presentation — keep in lockstep.
 */

export type HeroTextPosition = 'top' | 'middle' | 'bottom';

export type HeroSlidePresentation = {
  photo: number;
  scrim: number;
  text_position: HeroTextPosition;
  photo_brightness: number;
  text_background: number;
};

type SlideLike = {
  dim?: number | string;
  photo_brightness?: number | string;
  text_background?: number | string;
  text_position?: string;
};

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, n));
}

export function resolveHeroSlidePresentation(slide: SlideLike | null | undefined): HeroSlidePresentation {
  const hasPhoto = slide != null && slide.photo_brightness !== undefined && slide.photo_brightness !== null && slide.photo_brightness !== '';
  const hasScrim = slide != null && slide.text_background !== undefined && slide.text_background !== null && slide.text_background !== '';
  const hasDim = slide != null && slide.dim !== undefined && slide.dim !== null && slide.dim !== '';

  let photoBrightness = 0;
  let textBackground = 100;

  if (hasPhoto || hasScrim) {
    photoBrightness = hasPhoto ? clamp100(Number(slide!.photo_brightness)) : 100;
    textBackground = hasScrim ? clamp100(Number(slide!.text_background)) : 100;
  } else if (hasDim) {
    const dim = clamp100(Number(slide!.dim));
    photoBrightness = 100 - dim;
    textBackground = dim;
  }

  const rawPos = String(slide?.text_position ?? 'bottom').toLowerCase();
  const text_position: HeroTextPosition =
    rawPos === 'top' || rawPos === 'middle' || rawPos === 'bottom' ? rawPos : 'bottom';

  return {
    photo_brightness: photoBrightness,
    text_background: textBackground,
    photo: photoBrightness / 100,
    scrim: textBackground / 100,
    text_position,
  };
}

/** Persist new fields and drop legacy dim — one source of truth. */
export function withHeroPresentationFields<T extends Record<string, unknown>>(
  slide: T,
  patch: Partial<{ photo_brightness: number; text_background: number; text_position: HeroTextPosition }>,
): T {
  const base = resolveHeroSlidePresentation(slide);
  const next = {
    ...slide,
    photo_brightness: patch.photo_brightness ?? base.photo_brightness,
    text_background: patch.text_background ?? base.text_background,
    text_position: patch.text_position ?? base.text_position,
  } as T & { dim?: unknown };
  delete next.dim;
  return next;
}
