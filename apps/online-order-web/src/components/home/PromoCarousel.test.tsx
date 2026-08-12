import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PromoCarousel } from './PromoCarousel';
import type { HeroSlideRow } from '../../context/SiteSettingsContext';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

function slide(partial: Partial<HeroSlideRow> & { title: string }): HeroSlideRow {
  return {
    image: '/storage/hero.jpg',
    eyebrow: '',
    subtitle: '',
    cta_text: '',
    cta_url: '/order/',
    cta2_text: '',
    cta2_url: '/menu',
    ...partial,
  };
}

const threeSlides = [
  slide({ title: 'Slide One' }),
  slide({ title: 'Slide Two' }),
  slide({ title: 'Slide Three' }),
];

describe('PromoCarousel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: true, // prefers-reduced-motion → no autoplay flakiness
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies photo/scrim CSS vars and text position independently', () => {
    render(
      <MemoryRouter>
        <PromoCarousel
          slides={[
            slide({
              title: 'Bright strong',
              photo_brightness: 100,
              text_background: 100,
              text_position: 'top',
            }),
            slide({
              title: 'Legacy dim',
              dim: 50,
            }),
          ]}
          apiOrigin="https://example.test"
        />
      </MemoryRouter>,
    );

    const first = screen.getByTestId('hero-overlay-0');
    expect(first).toHaveAttribute('data-text-position', 'top');
    const firstSlide = first.closest('.home-promo-hero__slide') as HTMLElement;
    expect(firstSlide.style.getPropertyValue('--hero-photo')).toBe('1');
    expect(firstSlide.style.getPropertyValue('--hero-scrim')).toBe('1');

    const second = screen.getByTestId('hero-overlay-1');
    expect(second).toHaveAttribute('data-text-position', 'bottom');
    const secondSlide = second.closest('.home-promo-hero__slide') as HTMLElement;
    expect(secondSlide.style.getPropertyValue('--hero-photo')).toBe('0.5');
    expect(secondSlide.style.getPropertyValue('--hero-scrim')).toBe('0.5');
  });

  it('renders prev/next and dots when there are multiple slides', () => {
    render(
      <MemoryRouter>
        <PromoCarousel slides={threeSlides} apiOrigin="https://example.test" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('home-promo-hero')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous slide' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next slide' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(screen.getByRole('tab', { name: 'Slide 2' })).toHaveAttribute('aria-selected', 'true');
  });

  it('advances and rewinds slides via horizontal swipe', () => {
    render(
      <MemoryRouter>
        <PromoCarousel slides={threeSlides} apiOrigin="https://example.test" />
      </MemoryRouter>,
    );

    const hero = screen.getByTestId('home-promo-hero');
    expect(screen.getByRole('tab', { name: 'Slide 1' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.touchStart(hero, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(hero, { changedTouches: [{ clientX: 120 }] }); // swipe left → next
    expect(screen.getByRole('tab', { name: 'Slide 2' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.touchStart(hero, { touches: [{ clientX: 120 }] });
    fireEvent.touchEnd(hero, { changedTouches: [{ clientX: 200 }] }); // swipe right → prev
    expect(screen.getByRole('tab', { name: 'Slide 1' })).toHaveAttribute('aria-selected', 'true');
  });

  it('hides carousel chrome when there is only one slide', () => {
    render(
      <MemoryRouter>
        <PromoCarousel slides={[slide({ title: 'Only' })]} apiOrigin="https://example.test" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'Next slide' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('renders unsafe legacy CTA URLs as inert links', () => {
    render(
      <MemoryRouter>
        <PromoCarousel
          slides={[slide({ title: 'Unsafe', cta_text: 'Tap me', cta_url: 'javascript:alert(1)' })]}
          apiOrigin="https://example.test"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Tap me' })).toHaveAttribute('href', '#');
  });

  it('puts text-hug title background on a single inline span, not the heading', () => {
    render(
      <MemoryRouter>
        <PromoCarousel
          slides={[
            slide({
              title: 'Where Dhivehi breakfast<br><em>meets</em> baking',
              title_bg: 'dark',
              title_bg_strength: 70,
              title_bg_full_width: false,
            }),
          ]}
          apiOrigin="https://example.test"
        />
      </MemoryRouter>,
    );

    const heading = screen.getByTestId('hero-title-0');
    expect(heading.tagName).toBe('H2');
    expect(heading).not.toHaveAttribute('data-has-bg');
    expect(heading).toHaveAttribute('data-bg-hug', '1');
    const pills = heading.querySelectorAll('.hero-text-bg');
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveAttribute('data-has-bg', '1');
    expect(pills[0]).toHaveAttribute('data-bg-full', '0');
    expect(pills[0].innerHTML).toContain('<br>');
    expect(pills[0].innerHTML).toContain('<em>meets</em>');
    expect((pills[0] as HTMLElement).style.getPropertyValue('--hero-el-bg')).toMatch(/rgba/);
  });

  it('keeps full-width title background on the heading itself', () => {
    render(
      <MemoryRouter>
        <PromoCarousel
          slides={[
            slide({
              title: 'Full bar',
              title_bg: 'dark',
              title_bg_strength: 50,
              title_bg_full_width: true,
            }),
          ]}
          apiOrigin="https://example.test"
        />
      </MemoryRouter>,
    );

    const heading = screen.getByTestId('hero-title-0');
    expect(heading).toHaveAttribute('data-has-bg', '1');
    expect(heading).toHaveAttribute('data-bg-full', '1');
    expect(heading.querySelector('.hero-text-bg')).toBeNull();
  });
});
