import { describe, expect, it } from 'vitest';
import type { LabelLimits, LabelPreset, LabelRoll } from '../../api';
import {
  choiceFromRequest, designFor, gridCount, pageOf, parseRolls, requestFor, rollChoice, rollMatches, rollName, rollStock, rollStockWords, rollUnit, sizeCm, sizeName, sizeProblem, stockOf, stocksFor,
  switchShape, withPreset, type LabelShape, type SizeChoice,
} from './labelSize';

/**
 * The size picker's mirror of StickerLayouts, checked against the shared
 * fixtures/label_size_parity.json table (PHPUnit checks the server against
 * the same table), and its handling of the presets the server sends.
 */
const REPO_RELATIVE = 'fixtures/label_size_parity.json';

type Parity = {
  repo_relative_path: string;
  limits: LabelLimits;
  sizes: { shape: LabelShape; w: number; h: number; design: string; a4: { page_w: number; page_h: number; cols: number; rows: number }; fits_sheet: boolean; fits_printer: boolean }[];
};

async function loadFixture(): Promise<Parity> {
  const fs = await import('node:fs') as { readFileSync: (p: string, e: string) => string };
  const path = await import('node:path') as { dirname: (p: string) => string; join: (...p: string[]) => string };
  const url = await import('node:url') as { fileURLToPath: (u: string) => string };
  // apps/admin-dashboard/src/components/labels → repo root is 5 levels up
  const dir = path.dirname(url.fileURLToPath(import.meta.url));
  return JSON.parse(fs.readFileSync(path.join(dir, '../../../../../', REPO_RELATIVE), 'utf8')) as Parity;
}

/** As GET /api/labels/layouts sends them (StickerLayouts::presets). */
const PRESETS: LabelPreset[] = [
  { id: 'r105x148', shape: 'rect', w: 105, h: 148.5, name: '105 × 148.5 mm', cm: '10.5 × 14.85 cm', design: 'full', options: [
    { on: 'sheet', layout: 'a4-4', label: 'A4 sheet', per_page: 4, landscape: false },
    { on: 'precut', layout: 'a4-4-precut', label: 'Ready-cut A4 sheet', per_page: 4, landscape: false },
    { on: 'landscape', layout: 'a4-2', label: 'A4 landscape', per_page: 2, landscape: true },
    { on: 'printer', layout: 'single-105x148', label: 'Label printer', per_page: 1, landscape: false },
  ] },
  { id: 'r99x70', shape: 'rect', w: 99, h: 70.5, name: '99 × 70.5 mm', cm: '9.9 × 7.05 cm', design: 'mini', options: [
    { on: 'sheet', layout: 'a4-8', label: 'A4 sheet', per_page: 8, landscape: false },
    { on: 'printer', layout: 'single-custom', label: 'Label printer', per_page: 1, landscape: true },
  ] },
  { id: 'r40x60', shape: 'rect', w: 40, h: 60, name: '40 × 60 mm', cm: '4 × 6 cm', design: 'small', options: [
    { on: 'sheet', layout: 'a4-custom', label: 'A4 sheet', per_page: 21, landscape: true },
    { on: 'printer', layout: 'single-custom', label: 'Label printer', per_page: 1, landscape: false },
  ] },
  { id: 'c60', shape: 'circle', w: 60, h: 60, name: 'Round 60 mm', cm: '6 cm across', design: 'round', options: [
    { on: 'sheet', layout: 'a4-round-custom', label: 'A4 sheet', per_page: 12, landscape: false },
    { on: 'printer', layout: 'single-round-custom', label: 'Label printer', per_page: 1, landscape: false },
  ] },
  { id: 'c50', shape: 'circle', w: 50, h: 50, name: 'Round 50 mm', cm: '5 cm across', design: 'round', options: [
    { on: 'sheet', layout: 'a4-round-50', label: 'A4 sheet', per_page: 20, landscape: false },
    { on: 'printer', layout: 'single-round-50', label: 'Label printer', per_page: 1, landscape: false },
  ] },
];

const typed = (shape: LabelShape, w: number, h: number, on: SizeChoice['on'] = 'sheet'): SizeChoice => ({ shape, preset: 'custom', on, w, h });

describe('label size parity with the server', () => {
  it('reads the shared repo-root table', async () => {
    const fixture = await loadFixture();
    expect(fixture.repo_relative_path).toBe(REPO_RELATIVE);
    expect(fixture.sizes.length).toBeGreaterThan(20);
  });

  it('gives every size the same design, A4 grid and fit as StickerLayouts', async () => {
    const { limits, sizes } = await loadFixture();
    for (const s of sizes) {
      const name = sizeName(s.shape, s.w, s.h);
      expect(designFor(s.shape, s.w, s.h), `${name}: design`).toBe(s.design);
      const g = gridCount(s.w, s.h, limits.sheet_margin);
      expect({ page_w: g.pageW, page_h: g.pageH, cols: g.cols, rows: g.rows }, `${name}: A4 grid`).toEqual(s.a4);
      expect(sizeProblem(typed(s.shape, s.w, s.h, 'sheet'), limits) === null, `${name}: on an A4 sheet`).toBe(s.fits_sheet);
      expect(sizeProblem(typed(s.shape, s.w, s.h, 'printer'), limits) === null, `${name}: on a label printer`).toBe(s.fits_printer);
    }
  });
});

describe('label size picker', () => {
  it('names sizes the way the owner says them', () => {
    expect(sizeName('rect', 40, 60)).toBe('40 × 60 mm');
    expect(sizeCm('rect', 40, 60)).toBe('4 × 6 cm');
    expect(sizeName('circle', 60, 60)).toBe('Round 60 mm');
    expect(sizeCm('circle', 60, 60)).toBe('6 cm across');
    expect(sizeCm('rect', 105, 148.5)).toBe('10.5 × 14.85 cm');
  });

  it('sends the size only for layouts that take one', () => {
    expect(requestFor({ shape: 'rect', preset: 'r40x60', on: 'sheet', w: 0, h: 0 }, PRESETS)).toEqual({ layout: 'a4-custom', w: 40, h: 60 });
    expect(requestFor({ shape: 'rect', preset: 'r105x148', on: 'precut', w: 0, h: 0 }, PRESETS)).toEqual({ layout: 'a4-4-precut', w: null, h: null });
    expect(requestFor({ shape: 'circle', preset: 'c60', on: 'printer', w: 0, h: 0 }, PRESETS)).toEqual({ layout: 'single-round-custom', w: 60, h: null });
    expect(requestFor(typed('rect', 45, 65, 'printer'), PRESETS)).toEqual({ layout: 'single-custom', w: 45, h: 65 });
    expect(requestFor(typed('circle', 35, 35), PRESETS)).toEqual({ layout: 'a4-round-custom', w: 35, h: null });
  });

  it('offers an A4 sheet and a label printer for a typed size, with the count that fits', () => {
    const stocks = stocksFor(typed('rect', 40, 60), PRESETS);
    expect(stocks.map((s) => [s.on, s.layout, s.perPage, s.landscape])).toEqual([
      ['sheet', 'a4-custom', 21, true],
      ['printer', 'single-custom', 1, false],
    ]);
    expect(pageOf(typed('rect', 40, 60), PRESETS)).toEqual({ w: 297, h: 210 });
    expect(pageOf(typed('rect', 40, 60, 'printer'), PRESETS)).toEqual({ w: 40, h: 60 });
  });

  it('turns a saved label back into the size it was printed at', () => {
    expect(choiceFromRequest('a4-custom', 40, 60, PRESETS)).toMatchObject({ shape: 'rect', preset: 'r40x60', on: 'sheet' });
    expect(choiceFromRequest('single-custom', 99, 70.5, PRESETS)).toMatchObject({ preset: 'r99x70', on: 'printer' });
    expect(choiceFromRequest('a4-4', null, null, PRESETS)).toMatchObject({ preset: 'r105x148', on: 'sheet' });
    expect(choiceFromRequest('a4-2', null, null, PRESETS)).toMatchObject({ preset: 'r105x148', on: 'landscape' });
    expect(choiceFromRequest('single-round-custom', 60, null, PRESETS)).toMatchObject({ shape: 'circle', preset: 'c60', on: 'printer' });
    expect(choiceFromRequest('a4-custom', 45, 65, PRESETS)).toEqual({ shape: 'rect', preset: 'custom', on: 'sheet', w: 45, h: 65 });
    expect(choiceFromRequest('single-round-custom', 35, null, PRESETS)).toEqual({ shape: 'circle', preset: 'custom', on: 'printer', w: 35, h: 35 });
    expect(choiceFromRequest('no-such-layout', null, null, PRESETS)).toBeNull();
  });

  it('keeps the stock when a new size offers it, else falls back to the A4 sheet', () => {
    const precut: SizeChoice = { shape: 'rect', preset: 'r105x148', on: 'precut', w: 105, h: 148.5 };
    expect(withPreset(precut, 'r40x60', PRESETS)).toMatchObject({ preset: 'r40x60', on: 'sheet', w: 40, h: 60 });
    const printer: SizeChoice = { ...precut, on: 'printer' };
    expect(withPreset(printer, 'r40x60', PRESETS)).toMatchObject({ preset: 'r40x60', on: 'printer' });
    // Custom starts from the size in use.
    expect(withPreset({ shape: 'rect', preset: 'r40x60', on: 'sheet', w: 40, h: 60 }, 'custom', PRESETS)).toEqual(typed('rect', 40, 60, 'sheet'));
    expect(stockOf({ ...precut, preset: 'r40x60' }, PRESETS).on).toBe('sheet');
  });

  it('moves between shapes at their usual size', () => {
    const rect: SizeChoice = { shape: 'rect', preset: 'r40x60', on: 'printer', w: 40, h: 60 };
    expect(switchShape(rect, 'circle', PRESETS)).toMatchObject({ shape: 'circle', preset: 'c60', on: 'printer', w: 60, h: 60 });
    expect(switchShape({ shape: 'circle', preset: 'c60', on: 'sheet', w: 60, h: 60 }, 'rect', PRESETS)).toMatchObject({ shape: 'rect', preset: 'r105x148', on: 'sheet' });
    expect(switchShape(typed('rect', 45, 65), 'circle', PRESETS)).toEqual({ shape: 'circle', preset: 'custom', on: 'sheet', w: 45, h: 45 });
  });

  it('says why a typed size cannot print', async () => {
    const { limits } = await loadFixture();
    expect(sizeProblem(typed('rect', 25, 20), limits)).toBe('Labels can be from 30 × 20 mm (3 × 2 cm).');
    expect(sizeProblem(typed('rect', 205, 290), limits)).toBe('A label on an A4 sheet can be up to 200 × 287 mm.');
    expect(sizeProblem(typed('rect', 205, 290, 'printer'), limits)).toBeNull();
    expect(sizeProblem(typed('circle', 25, 25), limits)).toBe('Round stickers can be from 30 to 200 mm across.');
    // A preset is always fine.
    expect(sizeProblem({ shape: 'rect', preset: 'r40x60', on: 'sheet', w: 1, h: 1 }, limits)).toBeNull();
  });
});

/* My label rolls (round 6, 2026-10-13): a roll is a size choice with a name. */
describe('label rolls', () => {
  const big: LabelRoll = { id: 'big', name: 'Big sheets', shape: 'rect', preset: 'r105x148', on: 'precut', w: 105, h: 148.5 };
  const small: LabelRoll = { id: 'small', name: '', shape: 'rect', preset: 'custom', on: 'printer', w: 40, h: 60 };

  it('turns a roll into the picker\'s choice and names it', () => {
    expect(rollChoice(big)).toEqual({ shape: 'rect', preset: 'r105x148', on: 'precut', w: 105, h: 148.5 });
    expect(rollName(big)).toBe('Big sheets');
    expect(rollName(small)).toBe('40 × 60 mm');
  });

  it('matches a choice by shape, printed size and stock', () => {
    expect(rollMatches(big, { shape: 'rect', preset: 'r105x148', on: 'precut', w: 1, h: 1 }, PRESETS)).toBe(true);
    expect(rollMatches(big, { shape: 'rect', preset: 'r105x148', on: 'sheet', w: 105, h: 148.5 }, PRESETS)).toBe(false);
    // A typed size that prints the same as a preset is the same roll; the preset r40x60 on a printer is the small roll.
    expect(rollMatches(small, { shape: 'rect', preset: 'r40x60', on: 'printer', w: 40, h: 60 }, PRESETS)).toBe(true);
    expect(rollMatches(small, typed('rect', 40, 60, 'printer'), PRESETS)).toBe(true);
    expect(rollMatches(small, typed('rect', 40, 60), PRESETS)).toBe(false);
    expect(rollMatches(small, typed('circle', 40, 40, 'printer'), PRESETS)).toBe(false);
  });

  it('reads the rolls kept in the settings map and drops what is not a roll', () => {
    expect(parseRolls('')).toEqual([]);
    expect(parseRolls('not json')).toEqual([]);
    expect(parseRolls(JSON.stringify([big, { id: 'c', shape: 'circle', w: 60, on: 'sheet' }, { shape: 'rect' }, 7]))).toEqual([
      big,
      { id: 'c', name: '', shape: 'circle', preset: 'custom', on: 'sheet', w: 60, h: 60 },
    ]);
  });

  // Label stock (round 13): how many are left and the warning level ride along; a roll without a count says nothing.
  it('keeps a roll\'s stock and words it by what the roll counts', () => {
    const [counted, plain] = parseRolls(JSON.stringify([{ ...small, left: 34, low: 50, low_alerted_at: '2026-10-13T09:00:00+05:00' }, { ...big, left: null, low: 'x' }]));
    expect(counted).toMatchObject({ id: 'small', left: 34, low: 50, low_alerted_at: '2026-10-13T09:00:00+05:00' });
    expect(plain).toEqual(big);
    expect(rollStock(counted)).toEqual({ left: 34, low: 50, unit: 'labels', lowNow: true, out: false });
    expect(rollStockWords(counted)).toBe('34 labels left');
    expect(rollStockWords({ ...big, left: 1, low: 2 })).toBe('1 sheet left');
    expect(rollStockWords({ ...big, left: 0 })).toBe('Out of sheets');
    expect(rollStockWords(plain)).toBeNull();
    expect(rollStock({ ...small, left: 80, low: 50 })).toMatchObject({ lowNow: false, out: false });
    expect(rollUnit(big)).toBe('sheets');
  });
});
