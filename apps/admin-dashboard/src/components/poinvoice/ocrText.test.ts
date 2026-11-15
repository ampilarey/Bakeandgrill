import { describe, expect, it } from 'vitest';
import { linesOfScan, readingScale, tidyFigure } from './ocrText';
import { readPo } from './readPo';

/*
 * Owner, 2026-11-15: "what if I get a scanned PO" → "yes add it". A scan is a
 * picture; its words are worked out from the picture and come back with boxes.
 */

const word = (text: string, x0: number, y0: number, x1: number, lineY0 = y0, lineY1 = y0 + 20) => ({
  text, bbox: { x0, y0, x1, y1: y0 + 20 }, line: { bbox: { x0: 0, y0: lineY0, x1: 1000, y1: lineY1 } },
});

describe('a scanned PO', () => {
  it('puts the words of a row on one line, top to bottom, columns apart', () => {
    const lines = linesOfScan([
      word('750.00', 900, 300, 960), word('MASROSHI', 80, 300, 200), word('1', 20, 300, 30),
      word('200.00', 420, 300, 480), word('Piece', 520, 300, 570), word('3.75', 800, 300, 840),
      word('Order', 600, 100, 650), word('No.', 655, 100, 680), word('HKUD-M30300000524', 720, 100, 900),
    ], 1000);

    expect(lines).toEqual([
      'Order No.  HKUD-M30300000524',
      '1  MASROSHI  200.00  Piece  3.75  750.00',
    ]);
    const po = readPo(lines);
    expect(po.po_number).toBe('HKUD-M30300000524');
    expect(po.lines).toEqual([{ description: 'MASROSHI', quantity: 200, unit: 'Piece', unit_price: 3.75, amount: 750 }]);
  });

  it('drops specks and ruled lines read as marks', () => {
    expect(linesOfScan([
      word('Order', 20, 100, 70), word('No.', 75, 100, 100), word('~~', 180, 100, 200), word('PO-77', 260, 100, 320), word('|', 400, 100, 404),
    ], 500)).toEqual(['Order No.  PO-77']);
  });

  it('reads a figure spelt with letters as the figure', () => {
    expect(tidyFigure('2OO.OO')).toBe('200.00');
    expect(tidyFigure('l,350.00')).toBe('1,350.00');
    // Words, and codes that only look a little like numbers, are left alone.
    expect(tidyFigure('Oil')).toBe('Oil');
    expect(tidyFigure('HKUD-M30300000524')).toBe('HKUD-M30300000524');
  });

  it('enlarges a small picture and brings a big one down', () => {
    expect(readingScale(992, 1403)).toBeCloseTo(2400 / 1403, 5);
    expect(readingScale(3000, 4000)).toBeCloseTo(0.6, 5);
    // Never more than three times: a thumbnail has nothing more to give.
    expect(readingScale(300, 400)).toBe(3);
  });
});
