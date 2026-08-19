/**
 * Owner, 2026-08-19: "If there is setting for each place separately, then no
 * need a common setting for all."
 *
 * Alignment, animation and background movement each existed twice — once in
 * "Whole slide" as a default, once per part as an override. That is the
 * duplication being removed. The whole-slide block keeps only what has no
 * per-part equivalent.
 *
 * The load-bearing part of this change is backward compatibility: slides saved
 * before it have the slide-wide fields set and their parts empty. The
 * resolver's fallback stays, so those slides render exactly as they did and
 * their parts SHOW the value they are actually rendering.
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HeroSlidesEditor } from '../components/content-editors/HeroSlidesEditor';

vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('../components/VideoStudioModal', () => ({ VideoStudioModal: () => null }));

function Editor({ slide }: { slide: Record<string, unknown> }) {
  const [value, setValue] = useState(JSON.stringify([{ showing: true, ...slide }]));
  return (
    <HeroSlidesEditor
      label="Hero"
      value={value}
      onChange={setValue}
      triggerUpload={() => {}}
      wideLayout
    />
  );
}

const draw = (slide: Record<string, unknown> = {}) => render(<Editor slide={slide} />);

describe('hero settings are in one place each', () => {
  it('no longer offers alignment, animation or background movement slide-wide', () => {
    draw({ title: 'Hi' });

    expect(screen.queryByTestId('hero-text-align-0-left')).toBeNull();
    expect(screen.queryByTestId('hero-text-anim-0-fade')).toBeNull();
    expect(screen.queryByTestId('hero-box-anim-0-glow')).toBeNull();
  });

  it('keeps the settings that genuinely have no per-part equivalent', () => {
    draw({ title: 'Hi' });

    // Where the copy sits, and how fast everything moves, are slide-level
    // facts — there is no per-part version of them to duplicate.
    expect(screen.getByTestId('hero-text-position-0-middle')).toBeTruthy();
    expect(screen.getByTestId('hero-motion-speed-0')).toBeTruthy();
  });

  it('drops the Same as slide option from each part', () => {
    // "None" and "Same as slide (none)" were two buttons doing one thing.
    draw({ title: 'Hi' });

    expect(screen.queryByTestId('hero-part-title_align-0-inherit')).toBeNull();
    expect(screen.queryByTestId('hero-part-title_anim-0-inherit')).toBeNull();
    expect(screen.getByTestId('hero-part-title_align-0-left')).toBeTruthy();
  });

  it('writes the part its own value when a control is used', () => {
    const onChange = vi.fn();
    render(
      <HeroSlidesEditor
        label="Hero"
        value={JSON.stringify([{ showing: true, title: 'Hi' }])}
        onChange={onChange}
        triggerUpload={() => {}}
        wideLayout
      />,
    );

    fireEvent.click(screen.getByTestId('hero-part-title_align-0-right'));

    const next = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1][0] as string);
    expect(next[0].title_align).toBe('right');
  });
});

describe('slides saved before the change', () => {
  const selected = (testId: string) =>
    screen.getByTestId(testId).getAttribute('aria-checked') === 'true';

  it('shows the old slide-wide alignment on each part, because that is what renders', () => {
    // The part fields are empty; the legacy text_align is what the visitor
    // sees, so that is what the control has to show.
    draw({ title: 'Hi', subtitle: 'Sub', text_align: 'right' });

    expect(selected('hero-part-title_align-0-right')).toBe(true);
    expect(selected('hero-part-subtitle_align-0-right')).toBe(true);
    expect(selected('hero-part-title_align-0-center')).toBe(false);
  });

  it('shows the old slide-wide animation on each part too', () => {
    draw({ title: 'Hi', text_anim: 'zoom' });
    expect(selected('hero-part-title_anim-0-zoom')).toBe(true);
  });

  it('still renders a legacy slide the way it always did', () => {
    // The resolver fallback is what makes the UI change safe; if it were
    // dropped, every slide saved before today would silently re-centre.
    draw({ title: 'Hi', text_align: 'right' });

    const title = document.querySelector('.banner-title');
    expect(title?.getAttribute('data-align')).toBe('right');
  });

  it('lets one part break away without disturbing the others', () => {
    const onChange = vi.fn();
    render(
      <HeroSlidesEditor
        label="Hero"
        value={JSON.stringify([{ showing: true, title: 'Hi', subtitle: 'Sub', text_align: 'right' }])}
        onChange={onChange}
        triggerUpload={() => {}}
        wideLayout
      />,
    );

    fireEvent.click(screen.getByTestId('hero-part-title_align-0-left'));

    const next = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1][0] as string);
    expect(next[0].title_align).toBe('left');
    // The subheading was never touched and keeps following the legacy value.
    expect(next[0].subtitle_align).toBeUndefined();
    expect(next[0].text_align).toBe('right');
  });
});

/**
 * Owner, 2026-08-19, on the last slide-wide dial: one speed drove the copy
 * arriving AND a slow background drift, so a snappy heading over a calm photo
 * could not be expressed. Split in two rather than five — the real case is
 * "photo slower than the words", not five independent tempos.
 */
describe('text speed and photo speed are separate', () => {
  it('offers a photo speed only once the photo actually moves', () => {
    // A slider that changes nothing is worse than no slider.
    draw({ title: 'Hi' });
    expect(screen.queryByTestId('hero-photo-speed-0')).toBeNull();
  });

  it('offers it as soon as a photo movement is chosen', () => {
    draw({ title: 'Hi', photo_anim: 'pan' });
    expect(screen.getByTestId('hero-photo-speed-0')).toBeTruthy();
  });

  it('starts the photo at the text speed rather than at zero', () => {
    // Falling back means a slide saved before the split keeps one tempo until
    // the photo is deliberately given its own.
    draw({ title: 'Hi', photo_anim: 'pan', motion_speed: 80 });

    const photo = screen.getByTestId('hero-photo-speed-0') as HTMLInputElement;
    expect(photo.value).toBe('80');
  });

  it('writes the photo its own value, leaving the text speed alone', () => {
    const onChange = vi.fn();
    render(
      <HeroSlidesEditor
        label="Hero"
        value={JSON.stringify([{ showing: true, title: 'Hi', photo_anim: 'pan', motion_speed: 80 }])}
        onChange={onChange}
        triggerUpload={() => {}}
        wideLayout
      />,
    );

    fireEvent.change(screen.getByTestId('hero-photo-speed-0'), { target: { value: '10' } });

    const next = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1][0] as string);
    expect(next[0].photo_motion_speed).toBe(10);
    expect(next[0].motion_speed).toBe(80);
  });

  it('hands the stylesheet both tempos', () => {
    draw({ title: 'Hi', photo_anim: 'pan', motion_speed: 100, photo_motion_speed: 0 });

    const hero = screen.getByTestId('hero-visual-preview');
    expect(hero.style.getPropertyValue('--hero-speed')).toBe('2');
    expect(hero.style.getPropertyValue('--hero-photo-speed')).toBe('0.5');
  });
});
