/*
 * Tables that would scroll sideways become one card per row.
 *
 * Owner, 2026-10-09: "Still horizontal scrolling is there in many places."
 * On a phone every table kept its full width and scrolled inside its card
 * (index.css, the phone block), and on a tablet so did any table wider than
 * its card. There are 175 tables in 69 files; rather than give each one a
 * phone layout, this watches them all. A table that fits stays a table; one
 * that would scroll becomes a stack of cards, each value under its column's
 * name. It looks again when rows change, when the window changes width, and
 * when a hidden table comes into view.
 *
 * What it writes (index.css draws the cards):
 * - `data-cards` on the <table> while it is shown as cards.
 * - `data-label` on each body cell, from its column heading. A label a page
 *   set itself is kept; ours carry `data-label-auto`.
 * - `data-cell` on cells that are not a plain value: `title` (the row's first
 *   words, across the top of the card), `media` (a picture with no words),
 *   `select` (a lone tick box, top right), `actions` (only buttons, along the
 *   bottom), `full` (spans every column: a group heading, "No results") and
 *   `wide` (long text, across the card).
 * - `data-cell-wide` on a cell that, once in a card, is wider than its
 *   column (a drop-down of long choices): it takes the card's full width.
 * - `data-cards-head` on a table whose heading row holds controls (sort
 *   buttons, select all): those stay, as a wrapping row of chips.
 * - `data-cards-shrink` on a box between the table and its scroller that
 *   held the table wider than the screen (ResponsiveTable's 640px floor),
 *   or on the table itself; often dropping it is enough and the table stays.
 * - `data-cards-relax` on a table that fits once its headings may wrap.
 * - `data-table-fits` on a table that fits: the phone rule that made every
 *   table its own sideways scroller (a block, its rows short of the card's
 *   edge) is undone, and it fills its card as a table.
 *
 * `data-table-scroll="keep"` on a table or anything around it leaves it
 * alone: a grid whose columns are the point (a day per column) still scrolls.
 */

const KEEP = '[data-table-scroll="keep"]';
const CONTROL = 'button, [role="button"]';

let started = false;
/** Printing: every table is a table on paper, decided again afterwards. */
let printing = false;
const dirty = new Set<HTMLTableElement>();
let frame = 0;
/** Boxes whose size is watched; let go of once they leave the page. */
const observed = new Set<Element>();
let resizeObserver: ResizeObserver | null = null;

/** Words in a cell. textContent, not innerText: innerText lays the page out
 *  on every call, and a table of five hundred rows would pay that each time. */
function text(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Sort arrows some headings carry in their text ("Price ↕"). */
const ARROWS = /[\u2191-\u2195\u21C5\u25B2\u25B4\u25BC\u25BE]/g;

/** What a heading cell calls its column: its words, else its accessible name. */
function headingLabel(cell: HTMLTableCellElement): string {
  const t = text(cell).replace(ARROWS, '').trim();
  if (t) return t;
  const named = cell.getAttribute('aria-label')
    ?? cell.getAttribute('title')
    ?? cell.querySelector('[aria-label]')?.getAttribute('aria-label')
    ?? '';
  return named.replace(/^sort by\s+/i, '').trim();
}

interface Headings {
  labels: string[];
  sig: string;
  /** The heading row came from the body (no <thead>); its row is skipped. */
  bodyRow: HTMLTableRowElement | null;
  interactive: boolean;
}

/** The leaf heading row: the last row of <thead> made only of <th> cells. */
function headings(table: HTMLTableElement): Headings {
  let row: HTMLTableRowElement | null = null;
  let bodyRow: HTMLTableRowElement | null = null;
  const head = table.tHead;
  if (head) {
    for (let i = head.rows.length - 1; i >= 0; i--) {
      const r = head.rows[i];
      if (r.cells.length > 0 && [...r.cells].every((c) => c.tagName === 'TH')) { row = r; break; }
    }
  }
  if (!row) {
    const first = table.tBodies[0]?.rows[0];
    if (first && first.cells.length > 1 && [...first.cells].every((c) => c.tagName === 'TH')) {
      row = first;
      bodyRow = first;
    }
  }
  const labels: string[] = [];
  if (row) {
    for (const cell of row.cells) {
      const label = headingLabel(cell);
      for (let k = 0; k < Math.max(1, cell.colSpan); k++) labels.push(label);
    }
  }
  const interactive = !!head?.querySelector('button, input, select, [role="button"]');
  return { labels, sig: labels.join('\u0001'), bodyRow, interactive };
}

function isSelectCell(cell: HTMLTableCellElement): boolean {
  const boxes = cell.querySelectorAll('input[type="checkbox"], input[type="radio"]');
  return boxes.length === 1 && text(cell).length <= 2 && !cell.querySelector('button, select, textarea, a[href]');
}

/** Only buttons, and no words of its own: Edit / Delete / View. */
function isActionsCell(cell: HTMLTableCellElement): boolean {
  if (!cell.querySelector(CONTROL)) return false;
  if (cell.querySelector('input:not([type="hidden"]), select, textarea')) return false;
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue;
    if (!(n.parentElement?.closest(CONTROL))) return false;
  }
  return true;
}

function isMediaCell(cell: HTMLTableCellElement): boolean {
  return !text(cell) && !!cell.querySelector('img, picture, video, canvas') && !cell.querySelector('input, select, textarea, button');
}

function hasContent(cell: HTMLTableCellElement): boolean {
  return !!text(cell) || !!cell.querySelector('img, svg, input, select, textarea, button, a[href]');
}

function bodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const rows: HTMLTableRowElement[] = [];
  for (const body of table.tBodies) rows.push(...body.rows);
  if (table.tFoot) rows.push(...table.tFoot.rows);
  return rows;
}

/** Label each cell from its column and say what kind of cell it is. */
function labelRows(table: HTMLTableElement, h: Headings): void {
  const columns = h.labels.length;
  for (const tr of bodyRows(table)) {
    if (tr === h.bodyRow) { tr.setAttribute('data-cards-heading', ''); continue; }
    if (tr.dataset.cardsSig === h.sig) continue;
    let col = 0;
    let titled = false;
    for (const cell of tr.cells) {
      const span = Math.max(1, cell.colSpan);
      const full = columns > 1 && span >= columns;
      if (!cell.hasAttribute('data-label') || cell.hasAttribute('data-label-auto')) {
        cell.setAttribute('data-label', full ? '' : (h.labels[col] ?? ''));
        cell.setAttribute('data-label-auto', '');
      }
      let role = '';
      if (full) role = 'full';
      else if (isSelectCell(cell)) role = 'select';
      else if (isActionsCell(cell)) role = 'actions';
      else if (!titled && isMediaCell(cell)) role = 'media';
      else if (!titled && hasContent(cell)) { role = 'title'; titled = true; }
      else if (text(cell).length > 48) role = 'wide';
      if (role) cell.setAttribute('data-cell', role);
      else cell.removeAttribute('data-cell');
      col += span;
    }
    tr.dataset.cardsSig = h.sig;
  }
}

function overflowX(el: Element): string {
  return getComputedStyle(el).overflowX;
}

/**
 * The box that scrolls the table sideways, if one does: the table itself (the
 * phone rule makes a bare table its own scroller), or a wrapper it is wider
 * than. Not just the nearest scroller: ResponsiveTable puts a 640px floor
 * between the table and the box that scrolls, so the table itself fits its
 * floor while the box around them both scrolls.
 */
function sidewaysScroller(table: HTMLTableElement): HTMLElement | null {
  for (let el: HTMLElement | null = table; el && el !== document.body; el = el.parentElement) {
    const ox = overflowX(el);
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth - el.clientWidth > 2) {
      if (el === table || table.offsetWidth > el.clientWidth + 2) return el;
    }
    if (el.tagName === 'MAIN' || el.getAttribute('role') === 'dialog') break;
  }
  return null;
}

/** A minimum width in pixels; a percentage (min-width: 100%) is not a floor. */
function minWidthPx(el: Element): number {
  const min = getComputedStyle(el).minWidth;
  return min.endsWith('px') ? parseFloat(min) : 0;
}

/**
 * What holds the table wider than its box: a minimum width on the table
 * (ResponsiveTable's rule gives it 640px) or on a box between it and its
 * scroller (ResponsiveTable's inner 640px div). Not the phone rule's
 * min-width: 100%, which only makes a narrow table fill its card.
 */
function floors(table: HTMLTableElement, scroller: HTMLElement | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  const parent = table.parentElement;
  if (parent && minWidthPx(table) > parent.clientWidth + 2) out.push(table);
  // The boxes between the table and the box that scrolls it. When the table is
  // its own scroller, or spills out of a box that does not scroll, only that box.
  const stop = scroller && scroller !== table ? scroller : parent?.parentElement ?? null;
  for (let el = parent; el && el !== stop && el !== document.body; el = el.parentElement) {
    if (minWidthPx(el) > 0) out.push(el);
  }
  return out;
}

function toTable(table: HTMLTableElement): void {
  table.removeAttribute('data-cards');
  table.removeAttribute('data-cards-relax');
  table.removeAttribute('data-table-fits');
  for (let el: HTMLElement | null = table; el && el !== document.body; el = el.parentElement) {
    el.removeAttribute('data-cards-shrink');
  }
  for (const cell of table.querySelectorAll('[data-cell-wide]')) cell.removeAttribute('data-cell-wide');
}

/**
 * In a card, a cell whose contents are wider than its column (a drop-down
 * of long choices, a row of chips that may not break) takes the card's full
 * width. All measured first, then all marked: one layout, not one per cell.
 */
function widenCrowdedCells(table: HTMLTableElement): void {
  const crowded: Element[] = [];
  for (const tr of bodyRows(table)) {
    for (const cell of tr.cells) {
      if (cell.scrollWidth - cell.clientWidth > 1) crowded.push(cell);
    }
  }
  for (const cell of crowded) cell.setAttribute('data-cell-wide', '');
}

function observe(el: Element): void {
  if (!resizeObserver || observed.has(el)) return;
  observed.add(el);
  resizeObserver.observe(el);
}

/**
 * Look again when the table or the room around it changes size: the table
 * itself (a picture or a font arrives), and each box out to the one that
 * would scroll it. Not only the nearest: ResponsiveTable's 640px floor keeps
 * its size whatever the card does, so a card that narrows after the table
 * was decided (a tab settling, a menu folding) would go unseen.
 */
function watchSize(table: HTMLTableElement): void {
  if (!resizeObserver) return;
  observe(table);
  let el = table.parentElement;
  for (let i = 0; el && el !== document.body && i < 4; i++, el = el.parentElement) {
    observe(el);
    if (overflowX(el) !== 'visible' || el.tagName === 'MAIN') break;
  }
}

/**
 * How often a table went between table and cards lately. One that keeps
 * changing its mind (cards make the page taller, a scrollbar appears and
 * takes the room that let it be a table) is left as it is for a while,
 * not decided again every frame.
 */
const flips = new WeakMap<HTMLTableElement, { count: number; since: number; holdUntil: number }>();

function noteFlip(table: HTMLTableElement): void {
  const now = Date.now();
  const f = flips.get(table) ?? { count: 0, since: now, holdUntil: 0 };
  if (now - f.since > 2000) { f.count = 0; f.since = now; }
  f.count += 1;
  if (f.count > 6) {
    f.holdUntil = now + 5000;
    // Decided once more when the pause ends, whatever has settled by then.
    setTimeout(() => { dirty.add(table); schedule(); }, 5100);
  }
  flips.set(table, f);
}

/** Decide one table: as it is, or as cards. */
export function fitTable(table: HTMLTableElement): void {
  if (!table.isConnected) return;
  if (table.closest(KEEP)) { toTable(table); return; }
  watchSize(table);
  // Out of sight (a hidden tab): decide when it shows, the resize watch says when.
  if (table.getClientRects().length === 0) return;
  if (Date.now() < (flips.get(table)?.holdUntil ?? 0)) return;
  const wasCards = table.hasAttribute('data-cards');
  decide(table);
  if (table.hasAttribute('data-cards') !== wasCards) noteFlip(table);
}

function decide(table: HTMLTableElement): void {
  const h = headings(table);
  labelRows(table, h);
  if (h.interactive) table.setAttribute('data-cards-head', '');
  else table.removeAttribute('data-cards-head');
  // Measured as a table, then put back as cards in the same frame if it does
  // not fit: it scrolls sideways in some box, or spills out of one that does
  // not. A floor that alone made it too wide (ResponsiveTable's 640px under a
  // two-column table on a tablet) is dropped first; cards only if that is not enough.
  toTable(table);
  const tooWide = () => {
    const sc = sidewaysScroller(table);
    const box = table.parentElement;
    return { scroller: sc, over: !!sc || (!!box && table.offsetWidth - box.clientWidth > 2) };
  };
  const fits = () => { table.setAttribute('data-table-fits', ''); };
  const first = tooWide();
  if (!first.over) { fits(); return; }
  const held = floors(table, first.scroller);
  for (const el of held) el.setAttribute('data-cards-shrink', '');
  if (held.length && !tooWide().over) { fits(); return; }
  // Headings that may not break ("MIN LIFETIME PTS") are often all that is
  // too wide on a computer; let them wrap before giving up on the table.
  // Dates and amounts in the cells still never break (TD_NOWRAP).
  table.setAttribute('data-cards-relax', '');
  if (!tooWide().over) { fits(); return; }
  table.removeAttribute('data-cards-relax');
  table.setAttribute('data-cards', '');
  widenCrowdedCells(table);
}

function flush(): void {
  frame = 0;
  if (printing) return;
  const tables = [...dirty];
  dirty.clear();
  for (const t of tables) {
    // One odd table must not leave the rest of the batch undecided.
    try {
      fitTable(t);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('tableCards', e);
    }
  }
  for (const box of observed) {
    if (box.isConnected) continue;
    resizeObserver?.unobserve(box);
    observed.delete(box);
  }
}

function schedule(): void {
  if (frame) return;
  frame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(flush)
    : (setTimeout(flush, 16) as unknown as number);
}

function markAll(root: ParentNode): void {
  for (const t of root.querySelectorAll('table')) dirty.add(t as HTMLTableElement);
}

function onMutations(records: MutationRecord[]): void {
  for (const r of records) {
    const target = r.target instanceof Element ? r.target : r.target.parentElement;
    if (!target) continue;
    const table = target.closest('table');
    if (table) {
      dirty.add(table as HTMLTableElement);
      // A row whose cells changed is labelled again.
      const row = target.closest('tr');
      if (row) delete (row as HTMLTableRowElement).dataset.cardsSig;
      for (const n of r.addedNodes) {
        if (n instanceof HTMLTableRowElement) delete n.dataset.cardsSig;
      }
      continue;
    }
    for (const n of r.addedNodes) {
      if (!(n instanceof Element)) continue;
      if (n.tagName === 'TABLE') dirty.add(n as HTMLTableElement);
      else markAll(n);
    }
    // A section shown by dropping `hidden`.
    if (r.type === 'attributes') markAll(target);
  }
  if (dirty.size) schedule();
}

/** Start watching every table in the document. Idempotent; returns a stop. */
export function startTableCards(doc: Document = document): () => void {
  if (started) return () => {};
  started = true;
  observed.clear();
  const mo = new MutationObserver(onMutations);
  mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.target instanceof HTMLTableElement) dirty.add(e.target);
        markAll(e.target);
      }
      schedule();
    });
  const onResize = () => { markAll(doc); schedule(); };
  window.addEventListener('resize', onResize);
  // The brand fonts arrive after the first tables are decided, and change their widths.
  doc.fonts?.addEventListener?.('loadingdone', onResize);
  // Menu and Production plan print the page itself; on paper a table is a
  // table, whatever the screen it was printed from showed.
  const beforePrint = () => {
    printing = true;
    for (const t of doc.querySelectorAll('table')) toTable(t as HTMLTableElement);
  };
  const afterPrint = () => { printing = false; onResize(); };
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  markAll(doc);
  schedule();
  return () => {
    mo.disconnect();
    resizeObserver?.disconnect();
    resizeObserver = null;
    window.removeEventListener('resize', onResize);
    doc.fonts?.removeEventListener?.('loadingdone', onResize);
    window.removeEventListener('beforeprint', beforePrint);
    window.removeEventListener('afterprint', afterPrint);
    printing = false;
    if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    frame = 0;
    dirty.clear();
    started = false;
  };
}
