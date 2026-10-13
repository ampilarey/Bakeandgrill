import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LabelSpot } from '../../api';
import { SpotOverlay } from './SpotOverlay';

/*
 * Tap to edit (round 3, 2026-10-13): one zone per part the server drew,
 * placed by its box in mm, a hairline widened to a tappable height, and a
 * tap naming the part.
 */
describe('SpotOverlay', () => {
  it('lays a zone over each part where it prints and says which part a tap opens', () => {
    const onPick = vi.fn();
    const spots: LabelSpot[] = [
      { key: 'name', x: 9, y: 36.5, w: 87, h: 15 },
      { key: 'storage', x: 5, y: 120.5, w: 95, h: 1 },
      { key: 'brand', x: 5, y: 5, w: 95, h: 28 },
      { key: 'brand', x: 34, y: 8, w: 48, h: 5 },
    ];
    render(<SpotOverlay spots={spots} w={105} h={148.5} onPick={onPick} />);
    const name = screen.getByRole('button', { name: 'Change the name' });
    expect(name).toHaveStyle({ left: `${(9 / 105) * 100}%`, top: `${(36.5 / 148.5) * 100}%`, width: `${(87 / 105) * 100}%`, height: `${(15 / 148.5) * 100}%` });
    // A 1 mm strip is widened to 4.5 % of the label's height, about its own centre.
    const storage = screen.getByRole('button', { name: 'Change the storage line' });
    expect(storage).toHaveStyle({ height: '4.5%', top: `${((120.5 - (148.5 * 0.045 - 1) / 2) / 148.5) * 100}%` });
    // A part drawn in two places has two zones, both opening the same sheet.
    expect(screen.getAllByRole('button', { name: 'Change the brand and logo' })).toHaveLength(2);
    fireEvent.click(name);
    expect(onPick).toHaveBeenCalledWith('name');
    fireEvent.click(screen.getAllByRole('button', { name: 'Change the brand and logo' })[1]);
    expect(onPick).toHaveBeenLastCalledWith('brand');
  });
});
