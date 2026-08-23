import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MenuImageSlider } from './MenuImageSlider';
import type { MediaSlide } from '../../utils/itemMedia';

const videoSlides: MediaSlide[] = [
  {
    type: 'video',
    url: 'https://example.com/clip.mp4',
    poster: 'https://example.com/poster.jpg',
    alt: 'Clip',
  },
];

const imageSlides: MediaSlide[] = [
  {
    type: 'image',
    url: 'https://example.com/food.jpg',
    alt: 'Food',
  },
];

const imageSlidesWithWebp: MediaSlide[] = [
  {
    type: 'image',
    url: 'https://example.com/food.jpg',
    webpUrl: 'https://example.com/food.webp',
    thumbUrl: 'https://example.com/food-thumb.jpg',
    thumbWebpUrl: 'https://example.com/food-thumb.webp',
    alt: 'Food',
  },
];

describe('MenuImageSlider', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? false : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders muted looping playsInline video in sheet mode', () => {
    const { container } = render(
      <MenuImageSlider slides={videoSlides} alt="Item" />,
    );
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.hasAttribute('muted') || video?.muted).toBeTruthy();
    expect(video?.hasAttribute('loop')).toBeTruthy();
    expect(video?.hasAttribute('playsinline') || video?.playsInline).toBeTruthy();
  });

  it('posterOnly never mounts video', () => {
    const { container } = render(
      <MenuImageSlider slides={videoSlides} alt="Item" posterOnly />,
    );
    expect(container.querySelector('video')).toBeNull();
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('poster.jpg');
  });

  it('reduced motion shows poster image only', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = render(
      <MenuImageSlider slides={videoSlides} alt="Item" />,
    );
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toBeTruthy();
  });

  it('with no slides renders branded fill placeholder (not emoji)', () => {
    const { container } = render(
      <MenuImageSlider slides={[]} alt="Mas huni" logoSrc="/logo.png" />,
    );
    expect(container.querySelector('[data-testid="branded-placeholder"]')).toBeTruthy();
    expect(container.textContent).not.toContain('🍽️');
    expect(container.querySelector('.menu-media-placeholder__logo')).toBeTruthy();
  });

  it('with an image renders lazy cover img filling the box', () => {
    const { container } = render(
      <MenuImageSlider slides={imageSlides} alt="Food" />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(img.style.width).toBe('100%');
    expect(img.style.height).toBe('100%');
    expect(img.style.objectFit).toBe('cover');
    // No WebP → no <picture> wrapper (JPEG-only fallback path).
    expect(container.querySelector('picture')).toBeNull();
  });

  it('shows the stand-in logo whole rather than cropping it', () => {
    // A real photo fills the frame — cropping a plate of food is fine. The
    // stand-in is the site logo, and at 16/10 cover slices the flame off the
    // top and the wordmark off the bottom, which is what an item with no
    // photo used to show on its detail page.
    const { container } = render(
      <MenuImageSlider
        slides={[{ type: 'image', url: '/storage/site/logo.png', isPlaceholder: true }]}
        alt="Coke"
        placeholderFit="contain"
      />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.style.objectFit).toBe('contain');
    // Padding would otherwise grow the inset:0 box rather than inset the image.
    expect(img.style.boxSizing).toBe('border-box');
    // And the panel behind it matches the logo's own ground, so the contained
    // image does not read as a black square floating on cream.
    const root = container.querySelector('.menu-image-slider') as HTMLElement;
    expect(root.style.background).toContain('--menu-placeholder-bg');
  });

  it('leaves the stand-in cropped on surfaces that want it to fill', () => {
    // The round cards are the reason this is a prop and not a rule. There the
    // logo filling the circle is correct, and containing it would leave a
    // shrunken logo with pale corners around it.
    const { container } = render(
      <MenuImageSlider
        slides={[{ type: 'image', url: '/storage/site/logo.png', isPlaceholder: true }]}
        alt="Coke"
      />,
    );
    expect((container.querySelector('img') as HTMLImageElement).style.objectFit).toBe('cover');
    // No dark panel either — the circle is filled, so there is nothing to match.
    const root = container.querySelector('.menu-image-slider') as HTMLElement;
    expect(root.style.background).not.toContain('--menu-placeholder-bg');
  });

  it('never contains a real photo, even on a hero', () => {
    // Cropping a plate of food to fill the frame is the intended look.
    const { container } = render(
      <MenuImageSlider slides={imageSlides} alt="Food" placeholderFit="contain" />,
    );
    expect((container.querySelector('img') as HTMLImageElement).style.objectFit).toBe('cover');
  });

  it('emits picture/source when webpUrl is present and still keeps JPEG img', () => {
    const { container } = render(
      <MenuImageSlider slides={imageSlidesWithWebp} alt="Food" sizes="100vw" />,
    );
    const picture = container.querySelector('picture');
    const source = container.querySelector('source[type="image/webp"]');
    const img = container.querySelector('img');
    expect(picture).toBeTruthy();
    expect(source?.getAttribute('srcset')).toContain('food-thumb.webp');
    expect(source?.getAttribute('srcset')).toContain('food.webp');
    expect(source?.getAttribute('sizes')).toBe('100vw');
    expect(img?.getAttribute('src')).toContain('food.jpg');
    expect(img?.getAttribute('srcset')).toContain('400w');
    expect(img?.getAttribute('srcset')).toContain('1200w');
    expect(img?.getAttribute('sizes')).toBe('100vw');
  });
});
