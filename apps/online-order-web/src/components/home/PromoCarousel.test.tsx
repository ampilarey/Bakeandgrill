import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    image: partial.image ?? '/storage/hero.jpg',
    eyebrow: partial.eyebrow ?? '',
    title: partial.title,
    subtitle: partial.subtitle ?? '',
    cta_text: partial.cta_text ?? '',
    cta_url: partial.cta_url ?? '/order/',
    cta2_text: partial.cta2_text ?? '',
    cta2_url: partial.cta2_url ?? '/menu',
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

  it('renders prev/next and dots when there are multiple slides', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PromoCarousel slides={threeSlides} apiOrigin="https://example.test" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('home-promo-hero')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous slide' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next slide' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Next slide' }));
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
});
