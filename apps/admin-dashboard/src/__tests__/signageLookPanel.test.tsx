import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LookPanel } from '../pages/signage/LookPanel';
import type { MenuCategory } from '../api';

/*
 * Owner, 2026-09-23: "setting different layout for the tv in admin app".
 * The Look panel on a screen or group card: pick a preset, turn the knobs,
 * choose categories and colours, save.
 */

const cats = [
  { id: 10, name: 'Food', parent_id: null },
  { id: 4, name: 'Shorteats', parent_id: 10 },
  { id: 20, name: 'Drinks', parent_id: null },
  { id: 8, name: 'Hot Drinks', parent_id: 20 },
] as unknown as MenuCategory[];

describe('LookPanel', () => {
  it('saves a preset with its defaults, the chosen categories and no theme', () => {
    const onSave = vi.fn();
    render(<LookPanel kind="screen" layout={null} theme={null} categories={cats} saving={false} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('signage-look-toggle'));
    fireEvent.click(screen.getByTestId('signage-look-preset-photo_grid'));
    expect((screen.getByTestId('signage-look-columns') as HTMLSelectElement).value).toBe('3');
    expect((screen.getByTestId('signage-look-rows') as HTMLInputElement).value).toBe('6');

    fireEvent.click(screen.getByTestId('signage-look-cat-20'));
    fireEvent.click(screen.getByTestId('signage-look-save'));

    expect(onSave).toHaveBeenCalledWith({
      layout: {
        preset: 'photo_grid',
        columns: 3,
        rows_per_slide: 6,
        show_thumbs: true,
        showcase_cap: 3,
        card_style: 'split',
        category_ids: [20],
        dhivehi_first: false,
      },
      theme: null,
    });
  });

  it('lets a knob override the preset and saves colours when the theme is on', () => {
    const onSave = vi.fn();
    render(<LookPanel kind="group" layout={{ preset: 'classic', columns: 2 }} theme={null} categories={[]} saving={false} onSave={onSave} />);

    // Already open: a look is set.
    fireEvent.change(screen.getByTestId('signage-look-columns'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('signage-look-dv-first'));
    fireEvent.click(screen.getByTestId('signage-look-theme-on'));
    fireEvent.change(screen.getByTestId('signage-look-color-primary'), { target: { value: '#c0392b' } });
    fireEvent.change(screen.getByTestId('signage-look-font'), { target: { value: 'serif' } });
    fireEvent.click(screen.getByTestId('signage-look-save'));

    const call = onSave.mock.calls[0][0];
    expect(call.layout).toMatchObject({ preset: 'classic', columns: 3, dhivehi_first: true, rows_per_slide: 14 });
    expect(call.theme).toMatchObject({ primary: '#c0392b', font_display: 'Georgia, serif', font_body: '' });
  });

  it('saves day parts and sleep without forcing a preset', () => {
    const onSave = vi.fn();
    render(<LookPanel kind="screen" layout={null} theme={null} categories={cats} saving={false} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('signage-look-toggle'));
    fireEvent.click(screen.getByTestId('signage-look-daypart-add'));
    fireEvent.change(screen.getByTestId('signage-look-daypart-0-label'), { target: { value: 'Breakfast' } });
    fireEvent.change(screen.getByTestId('signage-look-daypart-0-end'), { target: { value: '10:59' } });
    fireEvent.click(screen.getByTestId('signage-look-daypart-0-cat-4'));
    fireEvent.click(screen.getByLabelText('day 5'));
    fireEvent.change(screen.getByTestId('signage-look-daypart-0-preset'), { target: { value: 'photo_grid' } });

    fireEvent.click(screen.getByTestId('signage-look-sleep-on'));
    fireEvent.change(screen.getByTestId('signage-look-sleep-off'), { target: { value: '22:30' } });
    fireEvent.click(screen.getByTestId('signage-look-save'));

    const { layout } = onSave.mock.calls[0][0];
    expect(layout.preset).toBeUndefined();
    expect(layout.dayparts).toHaveLength(1);
    expect(layout.dayparts[0]).toMatchObject({ label: 'Breakfast', category_ids: [4], preset: 'photo_grid', schedule: { days: [5], windows: [{ start: '06:00', end: '10:59' }] } });
    expect(layout.sleep).toMatchObject({ enabled: true, off: '22:30', on: '06:45' });
    expect(screen.getByText(/1 day part · sleeps 22:30–06:45/)).toBeTruthy();
  });

  it('drops an unnamed day part and a switched-off sleep', () => {
    const onSave = vi.fn();
    render(<LookPanel kind="screen" layout={null} theme={null} categories={[]} saving={false} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('signage-look-toggle'));
    fireEvent.click(screen.getByTestId('signage-look-daypart-add'));
    fireEvent.click(screen.getByTestId('signage-look-save'));
    expect(onSave).toHaveBeenCalledWith({ layout: null, theme: null });
  });

  it('"Playlist\'s own" clears the look at this level', () => {
    const onSave = vi.fn();
    render(<LookPanel kind="screen" layout={{ preset: 'magazine' }} theme={null} inherited={{ preset: 'price_board' }} inheritedLabel="Dining TVs" categories={[]} saving={false} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('signage-look-preset-own'));
    expect(screen.getByText(/falls back to Price board \(from Dining TVs\)/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('signage-look-save'));
    expect(onSave).toHaveBeenCalledWith({ layout: null, theme: null });
  });
});
