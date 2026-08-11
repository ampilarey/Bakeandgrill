import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  HeroSlidesEditor,
  isHeroSlideShowing,
} from '../components/content-editors/HeroSlidesEditor';

vi.mock('../components/MediaPicker', () => ({
  MediaPicker: () => null,
}));
vi.mock('../components/VideoStudioModal', () => ({
  VideoStudioModal: () => null,
}));

describe('HeroSlidesEditor visibility', () => {
  it('treats absent showing as visible', () => {
    expect(isHeroSlideShowing({})).toBe(true);
    expect(isHeroSlideShowing({ showing: true })).toBe(true);
    expect(isHeroSlideShowing({ showing: false })).toBe(false);
  });

  it('toggles Showing/Hidden and keeps slide content in the JSON', () => {
    const onChange = vi.fn();
    const value = JSON.stringify([{
      image: '/keep.jpg',
      title: 'Parked',
      eyebrow: '',
      subtitle: '',
      cta_text: 'Order',
      cta_url: '/order/',
      cta2_text: 'Menu',
      cta2_url: '/menu',
    }]);

    render(
      <HeroSlidesEditor
        label="Hero"
        value={value}
        onChange={onChange}
        triggerUpload={() => {}}
      />,
    );

    expect(screen.getByTestId('hero-slide-0').getAttribute('data-showing')).toBe('true');
    expect(screen.getByText('Showing')).toBeTruthy();

    const toggle = screen.getByTestId('hero-slide-visibility-0').querySelector('[role="switch"]');
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle!);

    expect(onChange).toHaveBeenCalled();
    const next = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1][0] as string);
    expect(next[0].showing).toBe(false);
    expect(next[0].image).toBe('/keep.jpg');
    expect(next[0].title).toBe('Parked');
  });
});
