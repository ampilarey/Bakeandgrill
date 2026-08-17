import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  HeroSlidesEditor,
} from '../components/content-editors/HeroSlidesEditor';

/** Controlled wrapper — real Content Hub usage feeds onChange back into value. */
function ControlledHero({ initial, onChangeSpy }: { initial: string; onChangeSpy: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <HeroSlidesEditor
      label="Hero"
      value={value}
      onChange={(next) => {
        onChangeSpy(next);
        setValue(next);
      }}
      triggerUpload={() => {}}
      wideLayout
    />
  );
}

vi.mock('../components/MediaPicker', () => ({
  MediaPicker: () => null,
}));
vi.mock('../components/VideoStudioModal', () => ({
  VideoStudioModal: () => null,
}));

/**
 * Website Content desktop revision 3 — Stage C: HeroSlidesEditor `wideLayout`
 * renders a slide strip + 3 columns (Picture / Words / Look) instead of the
 * nested slide sheet. RE-LAYOUT ONLY — these tests check the same
 * presentation values still round-trip through the same helpers.
 */
describe('HeroSlidesEditor wideLayout (Stage C — rev3)', () => {
  const buildValue = () => JSON.stringify([
    {
      image: '/slide-0.jpg',
      title: 'First slide',
      eyebrow: 'Eyebrow one',
      subtitle: 'Subtitle one',
      cta_text: 'Order',
      cta_url: '/order/',
      cta2_text: 'Menu',
      cta2_url: '/menu',
      showing: true,
      photo_brightness: 100,
      text_background: 100,
      text_position: 'bottom',
    },
    {
      image: '/slide-1.jpg',
      title: 'Second slide',
      eyebrow: '',
      subtitle: '',
      cta_text: '',
      cta_url: '/order/',
      cta2_text: '',
      cta2_url: '/menu',
      showing: false,
      photo_brightness: 80,
      text_background: 60,
      text_position: 'top',
    },
  ]);

  it('lists every slide in the strip with real title + Showing/Hidden state', () => {
    const onChange = vi.fn();
    render(
      <HeroSlidesEditor
        label="Hero"
        value={buildValue()}
        onChange={onChange}
        triggerUpload={() => {}}
        wideLayout
      />,
    );

    expect(screen.getByTestId('hero-slides-wide')).toBeTruthy();
    // No nested slide sheet in the wide layout path.
    expect(screen.queryByTestId('hero-slide-editor-sheet')).toBeNull();

    const card0 = screen.getByTestId('hero-slide-wide-0');
    const card1 = screen.getByTestId('hero-slide-wide-1');
    expect(within(card0).getByText('First slide')).toBeTruthy();
    expect(within(card0).getByText('Showing')).toBeTruthy();
    expect(within(card1).getByText('Second slide')).toBeTruthy();
    expect(within(card1).getByText('Hidden')).toBeTruthy();
  });

  it('renders the slide strip on top and the parts of the selected slide below', () => {
    const onChange = vi.fn();
    render(
      <HeroSlidesEditor
        label="Hero"
        value={buildValue()}
        onChange={onChange}
        triggerUpload={() => {}}
        wideLayout
      />,
    );

    expect(screen.getByTestId('hero-slides-wide-rail')).toBeTruthy();

    // Grouped by part rather than by kind of setting — owner, 2026-08-17:
    // "Under photo everything related to its settings … Under heading 1: Text,
    // text color ext. animation, background ext."
    expect(screen.getByTestId('hero-common-0')).toBeTruthy();
    for (const part of ['photo', 'eyebrow', 'title', 'subtitle', 'buttons']) {
      expect(screen.getByTestId(`hero-part-${part}-0`)).toBeTruthy();
    }
    // The old split must be gone, not merely hidden.
    expect(screen.queryByTestId('hero-slide-wide-picture-0')).toBeNull();
    expect(screen.queryByTestId('hero-slide-wide-words-0')).toBeNull();
    expect(screen.queryByTestId('hero-slide-wide-look-0')).toBeNull();
    expect(screen.getByTestId('hero-slides-wide-foot')).toBeTruthy();
  });

  it('selecting a different card loads that slide values into the parts', () => {
    const onChange = vi.fn();
    render(
      <HeroSlidesEditor
        label="Hero"
        value={buildValue()}
        onChange={onChange}
        triggerUpload={() => {}}
        wideLayout
      />,
    );

    // The first slide's heading part holds its title text.
    expect(within(screen.getByTestId('hero-part-title-0')).getByDisplayValue('First slide')).toBeTruthy();
    expect(screen.queryByTestId('hero-part-title-1')).toBeNull();

    fireEvent.click(screen.getByTestId('hero-slide-wide-1'));

    expect(screen.queryByTestId('hero-part-title-0')).toBeNull();
    expect(within(screen.getByTestId('hero-part-title-1')).getByDisplayValue('Second slide')).toBeTruthy();
    // Second slide is Hidden — the slide-wide group's toggle reflects it.
    expect(within(screen.getByTestId('hero-common-1')).getByText('Hidden')).toBeTruthy();
  });

  it('photo brightness / text position / swatches still write the same values as the default layout', () => {
    const onChange = vi.fn();
    render(
      <HeroSlidesEditor
        label="Hero"
        value={buildValue()}
        onChange={onChange}
        triggerUpload={() => {}}
        wideLayout
      />,
    );

    // Brightness belongs to the photo now, not to a general "Look" column.
    const photoPart = screen.getByTestId('hero-part-photo-0');
    const brightness = within(photoPart).getByLabelText('Photo brightness');
    fireEvent.change(brightness, { target: { value: '42' } });

    expect(onChange).toHaveBeenCalled();
    let next = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1][0] as string);
    expect(next[0].photo_brightness).toBe(42);
    expect(next[0].title).toBe('First slide');

    // Where the text sits is genuinely slide-wide, so it lives in the common group.
    fireEvent.click(within(screen.getByTestId('hero-common-0')).getByTestId('hero-text-position-0-top'));
    next = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1][0] as string);
    expect(next[0].text_position).toBe('top');
  });

  it('Duplicate and Delete in the wide-layout footer still mutate the same underlying slide array', () => {
    const onChangeSpy = vi.fn();
    render(<ControlledHero initial={buildValue()} onChangeSpy={onChangeSpy} />);

    fireEvent.click(screen.getByTestId('hero-slide-wide-duplicate-0'));
    let next = JSON.parse(onChangeSpy.mock.calls[onChangeSpy.mock.calls.length - 1][0] as string);
    expect(next).toHaveLength(3);
    expect(next[1].title).toBe('First slide');

    // Duplicate selects the new copy (index 1) — delete that one.
    fireEvent.click(screen.getByTestId('hero-slide-wide-delete-1'));
    next = JSON.parse(onChangeSpy.mock.calls[onChangeSpy.mock.calls.length - 1][0] as string);
    expect(next).toHaveLength(2);
  });

  it('shows the draft status banner when provided', () => {
    const onChange = vi.fn();
    render(
      <HeroSlidesEditor
        label="Hero"
        value={buildValue()}
        onChange={onChange}
        triggerUpload={() => {}}
        wideLayout
        draftStatus={<span>Unpublished changes</span>}
      />,
    );

    expect(screen.getByTestId('hero-wide-draft-status').textContent).toContain('Unpublished changes');
  });
});
