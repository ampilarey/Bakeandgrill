import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WrapPartKey, WrapStrips } from '../../api';
import { StripEditor, StripOverlay, partsForCount } from './StripEditor';
import { WRAP_FALLBACK } from './WrapParts';

/*
 * Strips you can see and touch (round 2, 2026-10-13): how many strips from
 * thumbnails, a board drawn to the label with one strip per part, a tap
 * opening the sheet that changes, moves or removes the strip, and the
 * server's left-out parts shown as such.
 */
const seven: WrapPartKey[] = ['brand', 'legal', 'nutrition', 'dates', 'barcode', 'qr', 'marks'];

function mount(parts: WrapPartKey[] = seven, extra: Partial<React.ComponentProps<typeof StripEditor>> = {}) {
  const onChange = vi.fn();
  render(<StripEditor parts={parts} onChange={onChange} catalogue={WRAP_FALLBACK} {...extra} />);
  return { onChange };
}

describe('partsForCount', () => {
  it('trims to the count, or fills from the usual order', () => {
    expect(partsForCount(seven, 3, WRAP_FALLBACK)).toEqual(['brand', 'legal', 'nutrition']);
    expect(partsForCount(['dates', 'brand'], 4, WRAP_FALLBACK)).toEqual(['dates', 'brand', 'legal', 'nutrition']);
    expect(partsForCount(seven, 9, WRAP_FALLBACK)).toEqual([...seven, 'text', 'packed']);
  });
});

describe('StripEditor', () => {
  it('picks how many strips from the thumbnails and draws one per part', () => {
    const { onChange } = mount();
    const board = screen.getByRole('group', { name: 'Strips' });
    expect(within(board).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Strip 1: Brand and name', 'Strip 2: Ingredients and legal text', 'Strip 3: Nutrition per 100 g or ml', 'Strip 4: Dates and batch', 'Strip 5: Barcode', 'Strip 6: QR code', 'Strip 7: Recycling marks and pictures', 'Add a strip',
    ]);
    const counts = screen.getByRole('group', { name: 'How many strips' });
    expect(within(counts).getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(within(counts).getByRole('button', { name: '3' }));
    expect(onChange).toHaveBeenLastCalledWith(['brand', 'legal', 'nutrition']);
    fireEvent.click(within(counts).getByRole('button', { name: 'All 9' }));
    expect(onChange).toHaveBeenLastCalledWith([...seven, 'text', 'packed']);
    fireEvent.click(within(board).getByRole('button', { name: 'Add a strip' }));
    expect(onChange).toHaveBeenLastCalledWith([...seven, 'text']);
  });

  it('opens a strip\'s sheet to change, move or remove it', () => {
    // A parent that keeps the parts, as the editors do, so the open strip follows its part.
    const seen = vi.fn();
    function Harness() {
      const [parts, setParts] = useState<WrapPartKey[]>(['brand', 'legal', 'dates']);
      return <StripEditor parts={parts} onChange={(next) => { seen(next); setParts(next); }} catalogue={WRAP_FALLBACK} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Strip 2: Ingredients and legal text' }));
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('Strip 2 of 3');
    expect(within(sheet).getByRole('radio', { name: /Ingredients and legal text/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(sheet).getByRole('radio', { name: /Dates and batch/ })).toHaveTextContent('strip 3');

    // Choosing a part already on another strip swaps the two; the sheet stays on this strip.
    fireEvent.click(within(sheet).getByRole('radio', { name: /Dates and batch/ }));
    expect(seen).toHaveBeenLastCalledWith(['brand', 'dates', 'legal']);
    expect(screen.getByRole('dialog')).toHaveTextContent('Strip 2 of 3');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: /^Barcode/ }));
    expect(seen).toHaveBeenLastCalledWith(['brand', 'barcode', 'legal']);
  });

  it('moves and removes from the sheet, and drags to reorder', () => {
    const { onChange } = mount(['brand', 'legal', 'dates']);
    fireEvent.click(screen.getByRole('button', { name: 'Strip 2: Ingredients and legal text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move right' }));
    expect(onChange).toHaveBeenLastCalledWith(['brand', 'dates', 'legal']);
    fireEvent.click(screen.getByRole('button', { name: 'Move left' }));
    expect(onChange).toHaveBeenLastCalledWith(['legal', 'brand', 'dates']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this strip' }));
    expect(onChange).toHaveBeenLastCalledWith(['brand', 'dates']);

    const from = screen.getByRole('button', { name: 'Strip 3: Dates and batch' });
    const to = screen.getByRole('button', { name: 'Strip 1: Brand and name' });
    const data: Record<string, string> = {};
    const dataTransfer = { setData: (k: string, v: string) => { data[k] = v; }, getData: (k: string) => data[k] ?? '', effectAllowed: '' };
    fireEvent.dragStart(from, { dataTransfer });
    fireEvent.dragOver(to, { dataTransfer });
    fireEvent.drop(to, { dataTransfer });
    expect(onChange).toHaveBeenLastCalledWith(['dates', 'brand', 'legal']);
  });

  it('draws the board to the server\'s widths and says which strips are not printing', () => {
    const strips: WrapStrips = {
      strips: [{ part: 'brand', x: 1.5, y: 1.5, w: 60, h: 28 }, { part: 'dates', x: 63.3, y: 1.5, w: 30, h: 28 }],
      band: { x: 1.5, y: 31, w: 177, h: 7.6 },
      left_out: { nutrition: 'empty', qr: 'narrow' },
    };
    mount(['brand', 'nutrition', 'dates', 'qr'], { strips, w: 180, h: 40 });
    const board = screen.getByRole('group', { name: 'Strips' });
    expect(board).toHaveStyle({ aspectRatio: '180 / 40' });
    expect(screen.getByRole('button', { name: 'Strip 1: Brand and name' })).toHaveStyle({ flex: '0.6666666666666666 1 0' });
    expect(screen.getByRole('button', { name: 'Strip 2: Nutrition per 100 g or ml (nothing to print)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Strip 4: QR code (no room on this size)' })).toBeInTheDocument();
    expect(screen.getByTestId('strip-left-out')).toHaveTextContent('Not printing: Nutrition per 100 g or ml (nothing to print in it), QR code (no room on this size).');
  });

  it('opens the sheet from a tap on the preview', () => {
    const onPick = vi.fn();
    const strips: WrapStrips = { strips: [{ part: 'brand', x: 1.5, y: 1.5, w: 60, h: 28 }, { part: 'dates', x: 63.3, y: 1.5, w: 30, h: 28 }], band: null, left_out: {} };
    render(<StripOverlay strips={strips} w={180} h={40} catalogue={WRAP_FALLBACK} onPick={onPick} />);
    const zone = screen.getByRole('button', { name: 'Change the Dates and batch strip' });
    expect(zone).toHaveStyle({ left: '35.166666666666664%', width: '16.666666666666664%' });
    fireEvent.click(zone);
    expect(onPick).toHaveBeenCalledWith('dates');
  });
});
