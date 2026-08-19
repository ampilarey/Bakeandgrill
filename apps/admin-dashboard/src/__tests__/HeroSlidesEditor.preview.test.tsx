/**
 * The preview has to be reachable from the editor.
 *
 * VisualBlockPreview sat exported-but-unimported after 10c564e3 deleted the
 * old Content Hub screen — dead code no page rendered. Its own tests still
 * passed the whole time, because they mounted the component directly and so
 * could never notice that nobody could open it.
 *
 * These render the actual editor and assert the preview appears inside it,
 * for the slide being edited. That is the gap the component-level tests had.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { HeroSlidesEditor } from '../components/content-editors/HeroSlidesEditor';

vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('../components/VideoStudioModal', () => ({ VideoStudioModal: () => null }));

function drawEditor(slides: Record<string, unknown>[]) {
  render(
    <HeroSlidesEditor
      label="Hero"
      value={JSON.stringify(slides)}
      onChange={() => {}}
      triggerUpload={() => {}}
    />,
  );
}

/** The preview debounces its input by 200ms. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(250);
  });
}

describe('hero editor preview', () => {
  it('renders a preview inside the slide being edited', async () => {
    vi.useFakeTimers();
    drawEditor([{ title: 'Wood-fired <em>specials</em>', subtitle: 'Tonight only' }]);
    await settle();

    const slide = screen.getByTestId('hero-slide-0');
    const preview = screen.getByTestId('hero-slide-preview-0');

    // Inside the slide's own card, not floating somewhere else on the page.
    expect(slide.contains(preview)).toBe(true);
    expect(preview.querySelector('[data-testid="hero-visual-preview"]')).toBeTruthy();

    vi.useRealTimers();
  });

  it('previews each slide against its own settings, not the first one', async () => {
    vi.useFakeTimers();
    drawEditor([
      { title: 'First', title_bg: 'dark', title_bg_shape: 'hug' },
      { title: 'Second', title_bg: 'dark', title_bg_shape: 'line' },
    ]);
    await settle();

    const first = screen.getByTestId('hero-slide-preview-0').querySelector('.banner-title');
    const second = screen.getByTestId('hero-slide-preview-1').querySelector('.banner-title');

    expect(first?.getAttribute('data-bg-shape')).toBe('hug');
    expect(second?.getAttribute('data-bg-shape')).toBe('line');

    vi.useRealTimers();
  });

  it('shows a hidden slide in its preview so it can still be styled', async () => {
    // A parked slide is exactly the one you want to work on before showing it.
    vi.useFakeTimers();
    drawEditor([{ showing: false, title: 'Parked', title_text_color: '#ff0000' }]);
    await settle();

    const title = screen.getByTestId('hero-slide-preview-0').querySelector('.banner-title') as HTMLElement;
    expect(title).toBeTruthy();
    expect(title.style.getPropertyValue('--hero-el-text')).toBe('#ff0000');

    vi.useRealTimers();
  });
});
