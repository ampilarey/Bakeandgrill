import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  // The drag designer (round 8, 2026-10-13): in move mode a zone is a handle.
  describe('move mode', () => {
    afterEach(() => vi.restoreAllMocks());
    const spots: LabelSpot[] = [
      { key: 'name', x: 10, y: 20, w: 50, h: 10 },
      { key: 'batch', x: 5, y: 50, w: 30, h: 4, fixed: true },
    ];
    /** The preview stands 210 px wide for a 105 mm label: 2 px per mm. */
    const twoPxPerMm = () => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 210, height: 297, left: 0, top: 0, right: 210, bottom: 297, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);

    it('drags a part and reports the move in mm, and a fixed part stays put', () => {
      twoPxPerMm();
      const onMove = vi.fn();
      const onPick = vi.fn();
      render(<SpotOverlay spots={spots} w={105} h={148.5} onPick={onPick} mode="move" onMove={onMove} />);
      expect(screen.getByTestId('spot-overlay')).toHaveAttribute('data-mode', 'move');
      const name = screen.getByRole('button', { name: 'Move the name' });
      fireEvent.pointerDown(name, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(name, { pointerId: 1, clientX: 120, clientY: 94 });
      expect(name).toHaveStyle({ transform: 'translate(20px, -6px)' });
      fireEvent.pointerUp(name, { pointerId: 1, clientX: 120, clientY: 94 });
      expect(onMove).toHaveBeenCalledWith('name', 10, -3);
      expect(onPick).not.toHaveBeenCalled();
      // A slip shorter than a third of a millimetre is not a move.
      fireEvent.pointerDown(name, { pointerId: 2, clientX: 100, clientY: 100 });
      fireEvent.pointerUp(name, { pointerId: 2, clientX: 100.2, clientY: 100 });
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Move the batch number' })).toBeNull();
      expect(screen.getByTestId('spot-fixed')).toHaveAttribute('title', 'The batch number stays where the design puts it');
    });

    it('resizes from the corner and nudges from the keyboard', () => {
      twoPxPerMm();
      const onMove = vi.fn();
      const onScale = vi.fn();
      render(<SpotOverlay spots={spots} w={105} h={148.5} onPick={vi.fn()} mode="move" onMove={onMove} onScale={onScale} />);
      const corner = screen.getByTestId('spot-corner');
      // The name is 50 mm, 100 px, wide: 50 px more is one and a half times the size.
      fireEvent.pointerDown(corner, { pointerId: 3, clientX: 200, clientY: 60 });
      fireEvent.pointerUp(corner, { pointerId: 3, clientX: 250, clientY: 60 });
      expect(onScale).toHaveBeenCalledWith('name', 1.5);
      expect(onMove).not.toHaveBeenCalled();
      const name = screen.getByRole('button', { name: 'Move the name' });
      fireEvent.keyDown(name, { key: 'ArrowRight' });
      fireEvent.keyDown(name, { key: 'ArrowUp', shiftKey: true });
      expect(onMove).toHaveBeenNthCalledWith(1, 'name', 1, 0);
      expect(onMove).toHaveBeenNthCalledWith(2, 'name', 0, -5);
      fireEvent.keyDown(name, { key: '+' });
      fireEvent.keyDown(name, { key: '-' });
      expect(onScale).toHaveBeenNthCalledWith(2, 'name', 1.1);
      expect(onScale).toHaveBeenNthCalledWith(3, 'name', 1 / 1.1);
    });
  });
});
