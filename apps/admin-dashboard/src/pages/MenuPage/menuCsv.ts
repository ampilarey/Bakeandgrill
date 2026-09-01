import type { BulkItemFields, MenuCategory, MenuItem, MenuVariant } from '../../api';
import type { Drafts } from './bulkEdit';

/**
 * CSV round-trip for the menu grid.
 *
 * Spreadsheets are hostile to this data in two specific ways, and both are
 * handled here rather than left to the user:
 *
 *  1. Excel opens a UTF-8 file as the local codepage unless it starts with a
 *     byte-order mark, which turns every Dhivehi name into mojibake — and if
 *     that file is then saved and re-imported, the mojibake overwrites the
 *     good names. Export therefore always writes a BOM.
 *  2. Excel rewrites anything that looks like a number, so a SKU of "0012"
 *     comes back as 12. Text columns are exported with a leading apostrophe
 *     stripped on import, and import matches rows by `id` — never by name —
 *     so a mangled name cannot silently retarget a row.
 *
 * Import can only ever UPDATE. It does not create items, does not delete
 * them, and ignores ids it does not recognise: a spreadsheet round-trip is a
 * bulk edit, not a replacement for the menu.
 */

export const CSV_COLUMNS = [
  'id',
  'type',
  'item_id',
  'name',
  'name_dv',
  'category',
  'category_id',
  'price',
  'cost',
  'sku',
  'barcode',
  'gst',
  'track_stock',
  'stock',
  'consumption_factor',
  'available',
  'active',
  'sort',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** One parsed line, before it is matched to anything. */
export type CsvRow = Record<string, string>;

export type CsvImportResult = {
  drafts: Drafts;
  variantDrafts: Drafts;
  /** Rows that matched something and carried at least one difference. */
  changedRows: number;
  /** Rows whose id is not on the current screen — skipped, never created. */
  unknownRows: number;
  /** Lines that could not be read as a row at all. */
  malformedRows: number;
  /** Columns in the file we do not write, reported so nobody assumes they saved. */
  ignoredColumns: string[];
};

function escapeCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (raw === '') return '';
  // Quote when the value could otherwise break the row or be re-typed by the
  // spreadsheet (leading zeros, a leading + or -, anything with a separator).
  const needsQuote = /[",\n\r]/.test(raw);

  return needsQuote ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function boolCell(value: unknown): string {
  return value ? 'yes' : 'no';
}

/** Item rows, each followed by its sizes. */
export function itemsToCsv(items: MenuItem[], canSeeCost: boolean): string {
  const columns = CSV_COLUMNS.filter((c) => canSeeCost || c !== 'cost');
  const lines: string[] = [columns.join(',')];

  const push = (row: Partial<Record<CsvColumn, unknown>>) => {
    lines.push(columns.map((c) => escapeCell(row[c])).join(','));
  };

  for (const item of items) {
    push({
      id: item.id,
      type: 'item',
      item_id: '',
      name: item.name,
      name_dv: item.name_dv ?? '',
      category: item.category?.name ?? '',
      category_id: item.category_id ?? '',
      price: Number(item.base_price ?? 0).toFixed(2),
      cost: item.cost === null || item.cost === undefined ? '' : Number(item.cost).toFixed(2),
      sku: item.sku ?? '',
      barcode: (item as unknown as Record<string, unknown>).barcode as string ?? '',
      gst: item.tax_code ?? 'standard_8',
      track_stock: boolCell(item.track_stock),
      stock: item.track_stock ? (item.stock_quantity ?? 0) : '',
      consumption_factor: '',
      available: boolCell(item.is_available),
      active: boolCell(item.is_active),
      sort: item.sort_order ?? 0,
    });

    for (const v of (item.variants ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
      push({
        id: v.id ?? '',
        type: 'size',
        item_id: item.id,
        name: v.name,
        name_dv: v.name_dv ?? '',
        category: item.category?.name ?? '',
        category_id: '',
        price: Number(v.price ?? 0).toFixed(2),
        cost: v.cost === null || v.cost === undefined ? '' : Number(v.cost).toFixed(2),
        sku: v.sku ?? '',
        barcode: v.barcode ?? '',
        gst: '',
        track_stock: boolCell(v.track_stock),
        stock: v.track_stock ? (v.stock_qty ?? 0) : '',
        consumption_factor: v.consumption_factor ?? 1,
        available: boolCell(v.is_available !== false),
        active: boolCell(v.is_active),
        sort: v.sort_order ?? 0,
      });
    }
  }

  // The BOM is what stops Excel mangling Dhivehi on open.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Split one CSV line, honouring quotes and doubled quotes inside them. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cell += '"'; i += 1; } else { quoted = false; }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  out.push(cell);

  return out;
}

export function parseCsv(text: string): { header: string[]; rows: CsvRow[] } {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { header: [], rows: [] };

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: CsvRow = {};
    header.forEach((key, i) => { row[key] = (cells[i] ?? '').trim(); });

    return row;
  });

  return { header, rows };
}

/** Excel likes to prefix text cells with an apostrophe; strip it back off. */
function text(value: string): string {
  return value.replace(/^'/, '').trim();
}

function bool(value: string): boolean | null {
  const v = text(value).toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(v)) return true;
  if (['no', 'n', 'false', '0'].includes(v)) return false;

  return null;
}

function num(value: string): number | null {
  const v = text(value).replace(/,/g, '');
  if (v === '') return null;
  const n = Number(v);

  return Number.isFinite(n) ? n : null;
}

const ITEM_COLUMN_FIELDS: Partial<Record<CsvColumn, keyof BulkItemFields>> = {
  name: 'name',
  name_dv: 'name_dv',
  category_id: 'category_id',
  price: 'base_price',
  cost: 'cost',
  sku: 'sku',
  barcode: 'barcode',
  gst: 'tax_code',
  track_stock: 'track_stock',
  stock: 'stock_quantity',
  available: 'is_available',
  active: 'is_active',
  sort: 'sort_order',
};

const VARIANT_COLUMN_FIELDS: Partial<Record<CsvColumn, string>> = {
  name: 'name',
  name_dv: 'name_dv',
  price: 'price',
  cost: 'cost',
  sku: 'sku',
  barcode: 'barcode',
  track_stock: 'track_stock',
  stock: 'stock_qty',
  consumption_factor: 'consumption_factor',
  available: 'is_available',
  active: 'is_active',
  sort: 'sort_order',
};

const VALID_GST = ['standard_8', 'zero_rated', 'exempt', 'out_of_scope'];

function cellToValue(column: string, raw: string, forVariant: boolean): unknown | undefined {
  switch (column) {
    case 'name':
    case 'name_dv':
      return text(raw);
    case 'sku':
    case 'barcode':
      return text(raw) === '' ? null : text(raw);
    case 'gst': {
      const v = text(raw).toLowerCase();
      return VALID_GST.includes(v) ? v : undefined;
    }
    case 'price':
    case 'cost':
    case 'consumption_factor':
      return num(raw) ?? undefined;
    case 'stock':
    case 'sort':
    case 'category_id': {
      const n = num(raw);
      return n === null ? undefined : Math.round(n);
    }
    case 'track_stock':
    case 'available':
    case 'active':
      return bool(raw) ?? undefined;
    default:
      return forVariant ? undefined : undefined;
  }
}

/**
 * Match a parsed file against what is on screen and produce grid drafts.
 *
 * Nothing is written here — the differences land in the same staging area a
 * typed edit lands in, so the import is reviewed in the grid (amber cells,
 * a count, a Save button) before any of it reaches the server.
 */
export function csvToDrafts(
  rows: CsvRow[],
  header: string[],
  items: MenuItem[],
  canSeeCost: boolean,
): CsvImportResult {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const variantById = new Map<number, MenuVariant>();
  for (const item of items) {
    for (const v of item.variants ?? []) {
      if (v.id != null) variantById.set(v.id, v);
    }
  }

  const drafts: Drafts = {};
  const variantDrafts: Drafts = {};
  let changedRows = 0;
  let unknownRows = 0;
  let malformedRows = 0;

  const known = new Set<string>(CSV_COLUMNS);
  const ignoredColumns = header.filter((h) => h !== '' && !known.has(h));

  for (const row of rows) {
    const id = num(row.id ?? '');
    const type = text(row.type ?? '').toLowerCase();
    if (id === null || (type !== 'item' && type !== 'size')) {
      malformedRows += 1;
      continue;
    }

    const isVariant = type === 'size';
    const target = isVariant ? variantById.get(id) : itemById.get(id);
    if (!target) {
      unknownRows += 1;
      continue;
    }

    const map = isVariant ? VARIANT_COLUMN_FIELDS : ITEM_COLUMN_FIELDS;
    const fields: Record<string, unknown> = {};

    for (const [column, field] of Object.entries(map)) {
      if (!(column in row)) continue;
      if (!canSeeCost && field === 'cost') continue;
      const value = cellToValue(column, row[column] ?? '', isVariant);
      if (value === undefined) continue;

      const current = currentValue(target as unknown as Record<string, unknown>, field as string);
      if (!sameCell(current, value)) fields[field as string] = value;
    }

    if (Object.keys(fields).length === 0) continue;
    changedRows += 1;
    if (isVariant) variantDrafts[id] = fields as BulkItemFields;
    else drafts[id] = fields as BulkItemFields;
  }

  return { drafts, variantDrafts, changedRows, unknownRows, malformedRows, ignoredColumns };
}

/**
 * Columns whose absence means something other than "empty".
 *
 * `is_available` arrived after sizes already existed, so an older row has no
 * value for it and is sellable. Exporting writes "yes"; without this the
 * import would then read that "yes" as a change on every untouched size.
 */
const ABSENT_DEFAULTS: Record<string, unknown> = {
  is_available: true,
  consumption_factor: 1,
};

function currentValue(target: Record<string, unknown>, field: string): unknown {
  const raw = target[field];
  if (raw === null || raw === undefined) {
    return field in ABSENT_DEFAULTS ? ABSENT_DEFAULTS[field] : raw;
  }

  return raw;
}

function sameCell(current: unknown, value: unknown): boolean {
  if (typeof value === 'boolean' || typeof current === 'boolean') {
    return !!current === !!value;
  }
  // A spreadsheet cannot tell "no Dhivehi name" from an empty cell, so an
  // untouched export must not read as a change on every blank optional field.
  // Clearing a value the row actually had is still a change: only the
  // empty-to-empty case collapses.
  const blank = (v: unknown) => v === null || v === undefined || v === '';
  if (blank(current) || blank(value)) {
    return blank(current) && blank(value);
  }
  if (!Number.isNaN(Number(current)) && !Number.isNaN(Number(value)) && String(current).trim() !== '') {
    return Math.abs(Number(current) - Number(value)) < 0.0001;
  }

  return String(current) === String(value);
}

/** Filename that says what was exported and when, so downloads do not collide. */
export function csvFilename(category: MenuCategory | null, search: string): string {
  const scope = category ? category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'menu';
  const query = search.trim() ? '-search' : '';
  const stamp = new Date().toISOString().slice(0, 10);

  return `bakeandgrill-${scope}${query}-${stamp}.csv`;
}
