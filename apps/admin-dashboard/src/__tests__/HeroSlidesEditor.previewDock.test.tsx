/**
 * Owner, on the editor layout:
 *
 *   1. "can u make hero preview floating in mobile and desktop view, with
 *       option to minimize"
 *   2. "in hero setting desktop view … settings are shrinked in to a small
 *       area, around 1/3 of the screen, now have to scroll a lot … how about
 *       putting 2 column?"
 *
 * The second was a real regression. hero-slides-wide-columns declared
 * `repeat(3, minmax(0,1fr))` around renderPartsStack — which returns ONE
 * element — so the whole editor occupied a single track and two sat empty.
 */
import { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { HeroSlidesEditor } from '../components/content-editors/HeroSlidesEditor';

vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('../components/VideoStudioModal', () => ({ VideoStudioModal: () => null }));

function ControlledEditor(props: { mobileMode?: boolean; wideLayout?: boolean }) {
  const [value, setValue] = useState(
    JSON.stringify([
      { title: 'First', subtitle: 'One', showing: true },
      { title: 'Second', subtitle: 'Two', showing: true },
    ]),
  );
  return (
    <HeroSlidesEditor
      label="Hero"
      value={value}
      onChange={setValue}
      triggerUpload={() => {}}
      mobileMode={props.mobileMode}
      wideLayout={props.wideLayout}
    />
  );
}

describe('hero preview dock', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('floats over the desktop editor rather than sitting in the scroll', () => {
    render(<ControlledEditor wideLayout />);

    const dock = screen.getByTestId('hero-preview-dock');
    expect(dock).toBeTruthy();
    // Portalled to body, so no card or overflow rule can clip it.
    expect(dock.parentElement).toBe(document.body);
    // And not duplicated into the settings flow.
    expect(screen.queryByTestId('hero-slide-preview-0')).toBeNull();
  });

  it('floats over the mobile sheet too', async () => {
    render(<ControlledEditor mobileMode />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('hero-slide-overview-0'));
    });

    expect(screen.getByTestId('hero-preview-dock')).toBeTruthy();
    expect(screen.queryByTestId('hero-slide-preview-0')).toBeNull();
  });

  it('shows exactly one dock, not one per slide', () => {
    // Two slides in the fixture; a dock each would stack on top of itself.
    render(<ControlledEditor wideLayout />);
    expect(screen.getAllByTestId('hero-preview-dock')).toHaveLength(1);
  });

  it('minimizes to just its bar, and restores', () => {
    render(<ControlledEditor wideLayout />);

    expect(screen.getByTestId('hero-preview-dock-body')).toBeTruthy();

    fireEvent.click(screen.getByTestId('hero-preview-dock-toggle'));
    expect(screen.queryByTestId('hero-preview-dock-body')).toBeNull();
    expect(screen.getByTestId('hero-preview-dock').getAttribute('data-minimized')).toBe('yes');
    // The bar stays, or there is no way back.
    expect(screen.getByTestId('hero-preview-dock-toggle')).toBeTruthy();

    fireEvent.click(screen.getByTestId('hero-preview-dock-toggle'));
    expect(screen.getByTestId('hero-preview-dock-body')).toBeTruthy();
  });

  it('remembers being minimized across a remount', () => {
    // Someone who wants the space back should not ask again every visit.
    const first = render(<ControlledEditor wideLayout />);
    fireEvent.click(screen.getByTestId('hero-preview-dock-toggle'));
    first.unmount();

    render(<ControlledEditor wideLayout />);
    expect(screen.getByTestId('hero-preview-dock').getAttribute('data-minimized')).toBe('yes');
    expect(screen.queryByTestId('hero-preview-dock-body')).toBeNull();
  });

  it('previews the slide that is selected, not always the first', () => {
    render(<ControlledEditor wideLayout />);
    expect(screen.getByTestId('hero-preview-dock').textContent).toContain('Slide 1');

    fireEvent.click(screen.getByTestId('hero-slide-wide-1'));
    expect(screen.getByTestId('hero-preview-dock').textContent).toContain('Slide 2');
  });
});

describe('hero settings layout on desktop', () => {
  it('lays the parts out in two columns instead of one narrow track', () => {
    render(<ControlledEditor wideLayout />);

    const stack = screen.getByTestId('hero-slide-0');
    expect(stack.getAttribute('data-columns')).toBe('two');
    expect(stack.className).toContain('hero-slides-parts--columns');
  });

  it('keeps whole-slide settings spanning the full width above the parts', () => {
    // They are the frame the parts sit in, not a sibling of Heading.
    render(<ControlledEditor wideLayout />);

    const common = screen.getByTestId('hero-common-0');
    expect(common.className).toContain('hero-slides-parts__common');
    expect(common.parentElement?.getAttribute('data-testid')).toBe('hero-slide-0');
  });

  it('leaves the mobile layout in one column', () => {
    // Explicitly asked for: "don't change mobile view".
    render(<ControlledEditor mobileMode />);
    fireEvent.click(screen.getByTestId('hero-slide-overview-0'));

    const stack = screen.getByTestId('hero-slide-0');
    expect(stack.getAttribute('data-columns')).toBe('one');
    expect(stack.className).not.toContain('hero-slides-parts--columns');
  });
});
