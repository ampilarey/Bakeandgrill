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
  });
});
