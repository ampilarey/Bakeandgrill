/**
 * Owner, mobile: "cannot edit/write text in hero banner parts, after one
 * character keyboard lost."
 *
 * Losing the keyboard after one character is a remount: React hands back a
 * different DOM node for the textarea, so focus goes with the old one and the
 * on-screen keyboard closes. Typing has to leave the same node focused.
 *
 * Driven through a controlled wrapper, because that is how the Content Hub
 * uses this editor — every keystroke round-trips back down as a new `value`
 * prop, which is exactly the condition a remount bug needs.
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { HeroSlidesEditor } from '../components/content-editors/HeroSlidesEditor';

vi.mock('../components/MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('../components/VideoStudioModal', () => ({ VideoStudioModal: () => null }));

function ControlledEditor({ mobileMode = false }: { mobileMode?: boolean }) {
  const [value, setValue] = useState(
    JSON.stringify([{ title: '', subtitle: '', showing: true }]),
  );
  return (
    <HeroSlidesEditor
      label="Hero"
      value={value}
      onChange={setValue}
      triggerUpload={() => {}}
      mobileMode={mobileMode}
    />
  );
}

/**
 * Type one character at a time, letting the preview's 200ms debounce fire.
 *
 * Timers are flushed first: opening a sheet legitimately moves focus to its
 * close button once, on a setTimeout(0). That is correct behaviour, so let it
 * happen before focusing the field — otherwise the test would be measuring
 * the open, not the typing.
 */
async function typeInto(selector: string, chars: string) {
  await act(async () => { vi.advanceTimersByTime(50); });

  const first = document.querySelector(selector) as HTMLTextAreaElement;
  first.focus();

  for (const ch of chars) {
    const current = document.querySelector(selector) as HTMLTextAreaElement;
    fireEvent.change(current, { target: { value: current.value + ch } });
    await act(async () => { vi.advanceTimersByTime(250); });
  }

  return first;
}

describe('hero editor typing', () => {
  it('keeps focus on the heading across several characters (wide layout)', async () => {
    vi.useFakeTimers();
    render(<ControlledEditor />);

    const original = await typeInto('#hero-0-title', 'Bake');

    const after = document.querySelector('#hero-0-title') as HTMLTextAreaElement;
    expect(after.value).toBe('Bake');
    expect(after).toBe(original);
    expect(document.activeElement).toBe(after);

    vi.useRealTimers();
  });

  it('keeps focus on the heading across several characters (mobile sheet)', async () => {
    vi.useFakeTimers();
    render(<ControlledEditor mobileMode />);

    // Mobile opens one slide into a sheet before any field exists.
    await act(async () => {
      fireEvent.click(screen.getByTestId('hero-slide-overview-0'));
    });

    const original = await typeInto('#hero-0-title', 'Bake');

    const after = document.querySelector('#hero-0-title') as HTMLTextAreaElement;
    expect(after.value).toBe('Bake');
    // The node itself must survive, or the phone keyboard closes.
    expect(after).toBe(original);
    expect(document.activeElement).toBe(after);

    vi.useRealTimers();
  });

  it('keeps focus on the subheading too', async () => {
    vi.useFakeTimers();
    render(<ControlledEditor mobileMode />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('hero-slide-overview-0'));
    });

    const original = await typeInto('#hero-0-subtitle', 'Tonight');

    const after = document.querySelector('#hero-0-subtitle') as HTMLTextAreaElement;
    expect(after.value).toBe('Tonight');
    expect(after).toBe(original);
    expect(document.activeElement).toBe(after);

    vi.useRealTimers();
  });
});
