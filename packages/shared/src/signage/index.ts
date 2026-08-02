export type {
  MenuItemLite,
  SignageCategoryLite,
  SignageConfig,
  SignageElement,
  SignageSlide,
  SignageTheme,
} from './types';

export {
  AUTO_MENU_ORIGIN,
  expandAutoSlides,
  expandPlaylist,
  isOnSignage,
  qualifiesForShowcase,
  rotateWindow,
} from './autoSlides';

export { interpolate, buildWeightedRotation } from './interpolate';
export { resolveBoundItems, formatPrice } from './bindMenu';
export { SlideCanvas } from './SlideCanvas';
export type { SlideCanvasProps } from './SlideCanvas';
export {
  PARITY_THEME,
  PARITY_VARIABLES,
  PARITY_ITEMS,
  PARITY_SLIDE,
  PARITY_MARKERS,
  PARITY_AUTO_ITEMS,
  PARITY_AUTO_SLIDE,
  PARITY_CATEGORIES,
  parityConfig,
} from './parityFixture';
