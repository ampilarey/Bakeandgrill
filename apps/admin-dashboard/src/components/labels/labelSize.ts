import type { LabelLimits, LabelPreset, LabelRoll, LabelStock } from '../../api';

/*
 * The label size picker's state, and what it sends (owner, 2026-10-11: "Add
 * label size. For example rectangular 4 cm by 6 cm, circle 6 cm diameter").
 * A size is one of the server's presets or one typed in; where it prints is
 * an A4 sheet, a ready-cut sheet, two on landscape A4 or a label printer.
 * The server (StickerLayouts) has the last word on sizes; these mirror its
 * rules so the picker can say "21 on A4" and "too small" before asking.
 */

export type LabelShape = 'rect' | 'circle';
export type StickerDesignName = 'full' | 'mini' | 'small' | 'round' | 'wrap';

export type SizeChoice = {
  shape: LabelShape;
  /** A preset's id, or 'custom' for a size typed in. */
  preset: string;
  on: LabelStock;
  /** The typed size in mm; a circle uses w. */
  w: number;
  h: number;
};

export const DEFAULT_CHOICE: SizeChoice = { shape: 'rect', preset: 'r105x148', on: 'sheet', w: 40, h: 60 };

/** The layouts that take their label size from the request. */
const SIZED: Record<LabelShape, Record<'sheet' | 'printer', string>> = {
  rect: { sheet: 'a4-custom', printer: 'single-custom' },
  circle: { sheet: 'a4-round-custom', printer: 'single-round-custom' },
};

export const SHEET_MARGIN = 5;

export function isSizedLayout(layout: string): boolean {
  return Object.values(SIZED).some((m) => m.sheet === layout || m.printer === layout);
}

/** As many labels as fit on A4 inside the edge, whichever way round takes more (StickerLayouts::grid). */
export function gridCount(w: number, h: number, margin = SHEET_MARGIN): { pageW: number; pageH: number; cols: number; rows: number; perPage: number } {
  if (!(w > 0 && h > 0)) return { pageW: 210, pageH: 297, cols: 0, rows: 0, perPage: 0 };
  let best: ReturnType<typeof gridCount> | null = null;
  for (const [pw, ph] of [[210, 297], [297, 210]]) {
    const cols = Math.floor((pw - 2 * margin + 0.001) / w);
    const rows = Math.floor((ph - 2 * margin + 0.001) / h);
    if (best === null || cols * rows > best.perPage) best = { pageW: pw, pageH: ph, cols, rows, perPage: cols * rows };
  }
  return best!;
}

/** The sticker design a size gets (StickerLayouts::design). */
export function designFor(shape: LabelShape, w: number, h: number): StickerDesignName {
  if (shape === 'circle') return 'round';
  if (Math.min(w / 105, h / 148.5) >= 0.7) return 'full';
  // A wide, short label is a wrap-around label with parts side by side (WrapDesign).
  if (w >= 90 && h >= 25 && w / h >= 2.5) return 'wrap';
  if (w >= 50 && h >= 60 && w / h <= 1.6) return 'mini';
  return 'small';
}

export const DESIGN_NAMES: Record<StickerDesignName, string> = {
  full: 'full sticker',
  mini: 'compact sticker',
  small: 'small sticker',
  round: 'round sticker',
  wrap: 'wrap-around label with parts',
};

const trim = (n: number) => String(Math.round(n * 10) / 10);

/** "40 × 60 mm" or "Round 60 mm". */
export function sizeName(shape: LabelShape, w: number, h: number): string {
  return shape === 'circle' ? `Round ${trim(w)} mm` : `${trim(w)} × ${trim(h)} mm`;
}

/** "4 × 6 cm" or "6 cm across", the way the owner says it. */
export function sizeCm(shape: LabelShape, w: number, h: number): string {
  const cm = (mm: number) => String(Math.round(mm * 10) / 100);
  return shape === 'circle' ? `${cm(w)} cm across` : `${cm(w)} × ${cm(h)} cm`;
}

function presetOf(choice: SizeChoice, presets: LabelPreset[]): LabelPreset | null {
  return choice.preset === 'custom' ? null : presets.find((p) => p.id === choice.preset) ?? null;
}

/** The size the choice prints at: its preset's, or the one typed in. */
export function sizeOf(choice: SizeChoice, presets: LabelPreset[]): { w: number; h: number } {
  const p = presetOf(choice, presets);
  if (p) return { w: p.w, h: p.h };
  return choice.shape === 'circle' ? { w: choice.w, h: choice.w } : { w: choice.w, h: choice.h };
}

export type StockOption = { on: LabelStock; layout: string; label: string; perPage: number; landscape: boolean };

/** Where the choice can print: its preset's stocks, or an A4 sheet and a label printer for a typed size. */
export function stocksFor(choice: SizeChoice, presets: LabelPreset[]): StockOption[] {
  const p = presetOf(choice, presets);
  if (p) return p.options.map((o) => ({ on: o.on, layout: o.layout, label: o.label, perPage: o.per_page, landscape: o.landscape }));
  const { w, h } = sizeOf(choice, presets);
  const grid = gridCount(w, h);
  return [
    { on: 'sheet', layout: SIZED[choice.shape].sheet, label: 'A4 sheet', perPage: grid.perPage, landscape: grid.pageW > grid.pageH },
    { on: 'printer', layout: SIZED[choice.shape].printer, label: 'Label printer', perPage: 1, landscape: false },
  ];
}

/** The stock in use: the one asked for when the size offers it, else the size's first. */
export function stockOf(choice: SizeChoice, presets: LabelPreset[]): StockOption {
  const stocks = stocksFor(choice, presets);
  return stocks.find((s) => s.on === choice.on) ?? stocks[0];
}

/** What a sticker request carries for this choice: the layout, and the size when the layout takes one. */
export function requestFor(choice: SizeChoice, presets: LabelPreset[]): { layout: string; w: number | null; h: number | null } {
  const stock = stockOf(choice, presets);
  if (!isSizedLayout(stock.layout)) return { layout: stock.layout, w: null, h: null };
  const { w, h } = sizeOf(choice, presets);
  return { layout: stock.layout, w, h: choice.shape === 'circle' ? null : h };
}

/** The page a choice prints on, mm: the label itself on a label printer, A4 (either way round) otherwise. */
export function pageOf(choice: SizeChoice, presets: LabelPreset[], fixedPages: Record<string, { w: number; h: number }> = {}): { w: number; h: number } {
  const stock = stockOf(choice, presets);
  const { w, h } = sizeOf(choice, presets);
  if (stock.on === 'printer') return { w, h };
  if (fixedPages[stock.layout] && !isSizedLayout(stock.layout)) return fixedPages[stock.layout];
  if (isSizedLayout(stock.layout)) {
    const g = gridCount(w, h);
    return { w: g.pageW, h: g.pageH };
  }
  return stock.landscape ? { w: 297, h: 210 } : { w: 210, h: 297 };
}

const near = (a: number, b: number | null | undefined) => b != null && Math.abs(a - Number(b)) < 0.05;

/** A saved request back into the picker: the preset it was printed with, or a typed size. */
export function choiceFromRequest(layout: string, w: number | null | undefined, h: number | null | undefined, presets: LabelPreset[]): SizeChoice | null {
  const sized = isSizedLayout(layout);
  for (const p of presets) {
    for (const o of p.options) {
      if (o.layout !== layout) continue;
      if (!sized || (near(p.w, w) && (p.shape === 'circle' || near(p.h, h)))) {
        return { shape: p.shape, preset: p.id, on: o.on, w: p.w, h: p.h };
      }
    }
  }
  if (sized && w) {
    const shape: LabelShape = layout.includes('round') ? 'circle' : 'rect';
    return { shape, preset: 'custom', on: layout.startsWith('a4') ? 'sheet' : 'printer', w: Number(w), h: shape === 'circle' ? Number(w) : Number(h ?? w) };
  }
  return null;
}

/** Why a typed size cannot print, or null; the server checks the same. */
export function sizeProblem(choice: SizeChoice, limits: LabelLimits | null): string | null {
  if (choice.preset !== 'custom' || !limits) return null;
  const onSheet = choice.on !== 'printer';
  if (choice.shape === 'circle') {
    const max = onSheet ? Math.min(limits.max_w - 2 * limits.sheet_margin, limits.max_round) : limits.max_round;
    return choice.w >= limits.min_round && choice.w <= max ? null : `Round stickers can be from ${limits.min_round} to ${max} mm across.`;
  }
  const short = Math.min(choice.w, choice.h);
  const long = Math.max(choice.w, choice.h);
  if (!(short >= limits.min_short && long >= limits.min_long)) return `Labels can be from ${limits.min_long} × ${limits.min_short} mm (3 × 2 cm).`;
  if (onSheet) {
    const inW = limits.max_w - 2 * limits.sheet_margin;
    const inH = limits.max_h - 2 * limits.sheet_margin;
    const fits = (choice.w <= inW && choice.h <= inH) || (choice.w <= inH && choice.h <= inW);
    return fits ? null : `A label on an A4 sheet can be up to ${inW} × ${inH} mm.`;
  }
  const fits = (choice.w <= limits.max_w && choice.h <= limits.max_h) || (choice.w <= limits.max_h && choice.h <= limits.max_w);
  return fits ? null : `Labels can be up to ${limits.max_w} × ${limits.max_h} mm.`;
}

/** Move to another shape: its usual size, keeping the stock when it is offered. */
export function switchShape(choice: SizeChoice, shape: LabelShape, presets: LabelPreset[]): SizeChoice {
  if (shape === choice.shape) return choice;
  if (choice.preset === 'custom') return { ...choice, shape, h: shape === 'circle' ? choice.w : choice.h };
  const pick = presets.find((p) => p.shape === shape && p.id === (shape === 'circle' ? 'c60' : 'r105x148')) ?? presets.find((p) => p.shape === shape);
  if (!pick) return { ...choice, shape, preset: 'custom' };
  return withPreset({ ...choice, shape }, pick.id, presets);
}

/** Pick a size, keeping the stock when the size offers it. */
export function withPreset(choice: SizeChoice, preset: string, presets: LabelPreset[]): SizeChoice {
  const p = presets.find((x) => x.id === preset);
  if (!p) {
    const { w, h } = sizeOf(choice, presets);
    return { ...choice, preset: 'custom', w, h, on: choice.on === 'printer' ? 'printer' : 'sheet' };
  }
  const on = p.options.some((o) => o.on === choice.on) ? choice.on : (p.options.find((o) => o.on === 'sheet') ?? p.options[0]).on;
  return { ...choice, shape: p.shape, preset: p.id, on, w: p.w, h: p.h };
}

/*
 * My label rolls (round 6, 2026-10-13): the rolls and sheets the business
 * owns, each a size choice with a name; the pickers show them first.
 */

/** The picker's choice for a roll. */
export function rollChoice(roll: LabelRoll): SizeChoice {
  return { shape: roll.shape, preset: roll.preset, on: roll.on, w: roll.w, h: roll.h };
}

/** What a roll is called: its name, else its size. */
export function rollName(roll: LabelRoll): string {
  return roll.name.trim() || sizeName(roll.shape, roll.w, roll.h);
}

/** Whether a choice is this roll: the same shape, the same printed size and the same stock. */
export function rollMatches(roll: LabelRoll, choice: SizeChoice, presets: LabelPreset[]): boolean {
  if (roll.shape !== choice.shape) return false;
  const a = sizeOf(rollChoice(roll), presets);
  const b = sizeOf(choice, presets);
  return near(a.w, b.w) && near(a.h, b.h) && stockOf(rollChoice(roll), presets).on === stockOf(choice, presets).on;
}

/** The rolls kept in the settings map (`label_rolls`, JSON), or none. */
export function parseRolls(raw: string | null | undefined): LabelRoll[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((r): r is LabelRoll => Boolean(r) && typeof r === 'object' && typeof (r as LabelRoll).id === 'string' && ((r as LabelRoll).shape === 'rect' || (r as LabelRoll).shape === 'circle') && Number.isFinite((r as LabelRoll).w))
      .map((r) => ({
        id: r.id, name: typeof r.name === 'string' ? r.name : '', shape: r.shape, preset: typeof r.preset === 'string' && r.preset ? r.preset : 'custom', on: r.on, w: Number(r.w), h: Number.isFinite(r.h) ? Number(r.h) : Number(r.w),
        // Label stock (round 13): kept only where a number was typed.
        ...(Number.isFinite(r.left) ? { left: Number(r.left) } : {}),
        ...(Number.isFinite(r.low) ? { low: Number(r.low) } : {}),
        ...(typeof r.low_alerted_at === 'string' && r.low_alerted_at ? { low_alerted_at: r.low_alerted_at } : {}),
      }));
  } catch {
    return [];
  }
}

/*
 * Label stock (round 13, owner 2026-10-13: "how many labels are left on each
 * roll, with a warning when low"): a roll counts labels when it is on a
 * label printer, sheets otherwise; a roll without a number typed in is not
 * counted and says nothing.
 */
export function rollUnit(roll: LabelRoll): 'labels' | 'sheets' {
  return roll.on === 'printer' ? 'labels' : 'sheets';
}

export function rollStock(roll: LabelRoll): { left: number | null; low: number | null; unit: 'labels' | 'sheets'; lowNow: boolean; out: boolean } {
  const left = Number.isFinite(roll.left) ? Number(roll.left) : null;
  const low = Number.isFinite(roll.low) ? Number(roll.low) : null;
  return { left, low, unit: rollUnit(roll), lowNow: left !== null && low !== null && left <= low, out: left !== null && left <= 0 };
}

/** "34 labels left", "1 sheet left", "Out of labels"; null when the roll is not counted. */
export function rollStockWords(roll: LabelRoll): string | null {
  const s = rollStock(roll);
  if (s.left === null) return null;
  if (s.out) return `Out of ${s.unit}`;
  return `${s.left} ${s.left === 1 ? s.unit.slice(0, -1) : s.unit} left`;
}

const LAST_SIZE_KEY = 'labels.lastSize';

/**
 * The size last prepared on Print labels, kept in the browser so the next
 * sheet, the custom label editor's preview and a custom label's one-tap Save
 * all start from it (owner, 2026-10-12: "Layout of the custom labels is
 * different when i go to print"). Null in a private window or before any print.
 */
export function rememberedSize(): SizeChoice | null {
  try {
    const raw = localStorage.getItem(LAST_SIZE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SizeChoice>;
    if ((v.shape === 'rect' || v.shape === 'circle') && typeof v.preset === 'string' && typeof v.on === 'string') {
      return { ...DEFAULT_CHOICE, ...v } as SizeChoice;
    }
  } catch { /* private window, or a value from an older version */ }
  return null;
}

export function rememberSize(choice: SizeChoice): void {
  try { localStorage.setItem(LAST_SIZE_KEY, JSON.stringify(choice)); } catch { /* private window */ }
}
