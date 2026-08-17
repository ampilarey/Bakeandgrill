import type { CSSProperties } from 'react';
import {
  type HeroBgToken,
  type HeroElementKey,
  type HeroTextPosition,
} from '../../../utils/heroSlidePresentation';

export type { HeroBgToken, HeroElementKey, HeroPresentationPatch, HeroTextPosition } from '../../../utils/heroSlidePresentation';

export type HeroSlideRow = {
  image: string;
  image_master?: string;
  image_focal_x?: number | string;
  image_focal_y?: number | string;
  image_alt?: string;
  /** @deprecated Prefer photo_brightness + text_background. */
  dim?: number | string;
  /** 0–100, 100 = full bright (no knock-back). */
  photo_brightness?: number | string;
  /** 0–100, 100 = strong text background. */
  text_background?: number | string;
  text_position?: HeroTextPosition | string;
  /**
   * Customer visibility. Absent or true = Showing (legacy slides stay live).
   * Explicit false = Hidden — kept in admin, skipped by website + order app.
   */
  showing?: boolean;
  show_from?: string;
  show_until?: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta_text: string;
  cta_url: string;
  cta2_text: string;
  cta2_url: string;
  video?: string;
  video_poster?: string;
  eyebrow_bg?: string;
  eyebrow_bg_strength?: number | string;
  title_bg?: string;
  title_bg_strength?: number | string;
  title_bg_full_width?: boolean | string | number;
  title_bg_shape?: string;
  subtitle_bg?: string;
  subtitle_bg_strength?: number | string;
  subtitle_bg_full_width?: boolean | string | number;
  subtitle_bg_shape?: string;
  cta1_bg?: string;
  cta1_bg_strength?: number | string;
  cta2_bg?: string;
  cta2_bg_strength?: number | string;
};

export const BG_SWATCHES: Array<{ id: HeroBgToken; label: string; color: string }> = [
  { id: 'none', label: 'None', color: 'transparent' },
  { id: 'dark', label: 'Dark', color: '#1c1408' },
  { id: 'light', label: 'Light', color: '#ffffff' },
  { id: 'amber', label: 'Amber', color: '#d4813a' },
  { id: 'brand_dark', label: 'Brand dark', color: '#2d1a0a' },
  // Frosted white wash + blur — matches default secondary CTA look at strength 10
  { id: 'glass', label: 'Glass', color: 'rgba(255,255,255,0.35)' },
];

export const ELEMENT_LABELS: Record<HeroElementKey, string> = {
  eyebrow: 'Eyebrow',
  title: 'Title',
  subtitle: 'Subtitle',
  cta1: 'Button 1',
  cta2: 'Button 2',
};

/** Absent flag means visible — matches HeroSlides::isSlideShowing / order app. */
export function isHeroSlideShowing(slide: { showing?: boolean }): boolean {
  return slide.showing !== false;
}

export const emptySlide = (): HeroSlideRow => ({
  image: '',
  showing: true,
  eyebrow: '',
  title: '',
  subtitle: '',
  cta_text: '',
  cta_url: '/order/',
  cta2_text: '',
  cta2_url: '/menu',
  image_focal_x: 50,
  image_focal_y: 50,
  image_alt: '',
  photo_brightness: 100,
  text_background: 100,
  text_position: 'bottom',
});

export const FIELDS: Array<{ key: keyof HeroSlideRow; label: string; col: 'half' | 'full'; placeholder: string; multiline?: boolean }> = [
  { key: 'eyebrow', label: 'Eyebrow tag', col: 'half', placeholder: "Malé's neighbourhood café" },
  { key: 'cta_text', label: 'Button 1 text', col: 'half', placeholder: 'Order Now →', multiline: true },
  { key: 'cta_url', label: 'Button 1 URL', col: 'half', placeholder: '/order/' },
  { key: 'cta2_text', label: 'Button 2 text', col: 'half', placeholder: 'View Menu', multiline: true },
  { key: 'cta2_url', label: 'Button 2 URL', col: 'half', placeholder: '/menu' },
  { key: 'title', label: 'Title (HTML: <br> <em>)', col: 'full', placeholder: 'Dhivehi breakfast<br>meets <em>artisan baking</em>', multiline: true },
  { key: 'subtitle', label: 'Subtitle', col: 'full', placeholder: 'Real food. Proper char. Baked fresh at 5am.', multiline: true },
];

export const btnStyle: CSSProperties = {
  height: 32,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

export type LibraryTarget = { idx: number; kind: 'video' | 'poster' } | null;

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
