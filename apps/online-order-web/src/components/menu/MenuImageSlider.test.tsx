import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('MenuImageSlider video', () => {
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
});
