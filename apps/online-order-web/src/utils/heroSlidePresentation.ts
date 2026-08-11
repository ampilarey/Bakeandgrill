/**
 * Hero slide presentation — lockstep with backend HeroSlides::presentation
 * and website Blade CSS vars (--hero-photo / --hero-scrim).
 *
 * @see docs/HERO_READABILITY_PLAN.md §2.1 §2.2
 */

export type HeroTextPosition = 'top' | 'middle' | 'bottom';

export type HeroSlidePresentation = {
  /** 0–1, 1 = full bright (no knock-back). */
  photo: number;
  /** 0–1, 1 = strong text scrim. */
  scrim: number;
  text_position: HeroTextPosition;
  /** Admin / storage 0–100. */
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

/**
 * Resolve photo brightness + text background + position.
 * Legacy `dim` maps so the public look is unchanged:
 *   photo_brightness = 100 - dim, text_background = dim.
 */
export function resolveHeroSlidePresentation(slide: SlideLike | null | undefined): HeroSlidePresentation {
  const hasPhoto = slide != null && slide.photo_brightness !== undefined && slide.photo_brightness !== null && slide.photo_brightness !== '';
  const hasScrim = slide != null && slide.text_background !== undefined && slide.text_background !== null && slide.text_background !== '';
  const hasDim = slide != null && slide.dim !== undefined && slide.dim !== null && slide.dim !== '';

  // Legacy implicit default was dim=100 (knocked-back photo + strong scrim).
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

/** Mobile media opacity — matches website .banner-slide img */
export function heroMediaOpacityMobile(photo: number): number {
  return 0.45 + 0.55 * photo;
}

/** Legacy mobile opacity from dim 0–100 (for identity asserts). */
export function legacyDimMediaOpacityMobile(dim: number): number {
  return 1 - 0.55 * (clamp100(dim) / 100);
}
