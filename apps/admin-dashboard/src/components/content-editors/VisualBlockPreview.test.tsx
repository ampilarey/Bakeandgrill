import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { VisualBlockPreview } from './VisualBlockPreview';

describe('VisualBlockPreview (§6.4)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders hero first showing slide with media, copy and CTAs', async () => {
    vi.useFakeTimers();
    const slides = [
      {
        showing: false,
        image: '/hidden.jpg',
        title: 'Hidden',
      },
      {
        showing: true,
        image: '/hero.jpg',
        image_focal_x: 30,
        image_focal_y: 70,
        eyebrow: 'Tonight',
        title: 'Wood-fired <em>specials</em>',
        subtitle: 'Order for pickup',
        cta_text: 'Order now',
        cta2_text: 'View menu',
        photo_brightness: 60,
        text_background: 40,
        text_position: 'middle',
      },
    ];
    render(
      <VisualBlockPreview
        editor="hero"
        value={JSON.stringify(slides)}
        appLabel="Website"
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    const hero = screen.getByTestId('hero-visual-preview');
    expect(hero.getAttribute('data-showing-count')).toBe('1');
    expect(hero.getAttribute('data-slide-count')).toBe('2');
    expect(hero.className).toContain('visual-block-preview__hero--middle');
    expect(screen.getByText('Tonight')).toBeTruthy();
    expect(screen.getByText('Order now')).toBeTruthy();
    expect(screen.getByText('View menu')).toBeTruthy();
    expect(screen.getByText(/1 showing/)).toBeTruthy();
    const img = hero.querySelector('img') as HTMLImageElement;
    expect(img.src).toContain('/hero.jpg');
    expect(img.style.objectPosition).toBe('30% 70%');
  });

  it('uses video_poster when video is set', async () => {
    vi.useFakeTimers();
    render(
      <VisualBlockPreview
        editor="hero"
        value={JSON.stringify([{
          showing: true,
          video: '/clip.mp4',
          video_poster: '/poster.jpg',
          title: 'Clip',
        }])}
        appLabel="Website"
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    const hero = screen.getByTestId('hero-visual-preview');
    expect(hero.getAttribute('data-has-video')).toBe('1');
    expect((hero.querySelector('img') as HTMLImageElement).src).toContain('/poster.jpg');
  });

  it('renders customer-facing text for plain keys', async () => {
    vi.useFakeTimers();
    render(
      <VisualBlockPreview
        editor="text"
        value="Fresh from the grill"
        appLabel="Website"
        fallbackLabel="Proof eyebrow"
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByTestId('content-value-as-seen').textContent).toContain('Proof eyebrow');
    expect(screen.getByTestId('content-value-as-seen').textContent).toContain('Fresh from the grill');
  });
});
