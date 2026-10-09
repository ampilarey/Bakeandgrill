import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fitTable, startTableCards } from '../utils/tableCards';

/*
 * Owner, 2026-10-09: "Still horizontal scrolling is there in many places."
 * A table that would scroll sideways is shown as cards, each value under its
 * column's name; one that fits stays a table. jsdom has no layout, so the
 * scroller's widths are stubbed per element.
 */

const widths = new WeakMap<Element, { client: number; scroll: number }>();
const clientDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!;
const scrollDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')!;
const offsetDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!;
const rectsDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'getClientRects')!;

/** A table as wide as its content: the widest scroller around it says how wide that is. */
function naturalWidth(el: Element): number {
  let w = 0;
  for (let a = el.parentElement; a; a = a.parentElement) w = Math.max(w, widths.get(a)?.scroll ?? 0);
  return w;
}

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return widths.get(this)?.client ?? 0; } });
  Object.defineProperty(Element.prototype, 'scrollWidth', { configurable: true, get() { return widths.get(this)?.scroll ?? 0; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.tagName === 'TABLE' ? naturalWidth(this) : (widths.get(this)?.client ?? 0); },
  });
  // Everything counts as on screen unless it is inside a hidden box.
  Object.defineProperty(Element.prototype, 'getClientRects', {
    configurable: true,
    value(this: Element) { return this.closest('[hidden]') ? [] : [{ width: 1, height: 1 }]; },
  });
});

afterEach(() => {
  Object.defineProperty(Element.prototype, 'clientWidth', clientDesc);
  Object.defineProperty(Element.prototype, 'scrollWidth', scrollDesc);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetDesc);
  Object.defineProperty(Element.prototype, 'getClientRects', rectsDesc);
  document.body.innerHTML = '';
});

function mount(html: string): { scroller: HTMLElement; table: HTMLTableElement } {
  document.body.innerHTML = `<main><div class="table-scroll" style="overflow-x: auto">${html}</div></main>`;
  return {
    scroller: document.querySelector('.table-scroll') as HTMLElement,
    table: document.querySelector('table') as HTMLTableElement,
  };
}

const ORDERS = `
  <table>
    <thead><tr><th><input type="checkbox" aria-label="Select all"></th><th>Customer</th><th>Phone</th><th>Total</th><th>Notes</th><th>Actions</th></tr></thead>
    <tbody>
      <tr>
        <td><input type="checkbox" aria-label="Select"></td>
        <td>Aisha Ali</td>
        <td>7771234</td>
        <td>MVR 120.00</td>
        <td>Leave at the gate behind the blue door, ring twice please</td>
        <td><button>Edit</button><button>Delete</button></td>
      </tr>
      <tr><td colspan="6">2 more on the next page</td></tr>
    </tbody>
  </table>`;

describe('tables that do not fit become cards', () => {
  it('leaves a table that fits as a table', () => {
    const { scroller, table } = mount(ORDERS);
    widths.set(scroller, { client: 900, scroll: 900 });
    fitTable(table);
    expect(table).not.toHaveAttribute('data-cards');
  });

  it('turns a table that would scroll into cards, each value labelled by its column', () => {
    const { scroller, table } = mount(ORDERS);
    widths.set(scroller, { client: 358, scroll: 820 });
    fitTable(table);
    expect(table).toHaveAttribute('data-cards');

    const cells = table.tBodies[0].rows[0].cells;
    expect(cells[0]).toHaveAttribute('data-cell', 'select');
    expect(cells[1]).toHaveAttribute('data-cell', 'title');
    expect(cells[2]).toHaveAttribute('data-label', 'Phone');
    expect(cells[2]).not.toHaveAttribute('data-cell');
    expect(cells[3]).toHaveAttribute('data-label', 'Total');
    expect(cells[4]).toHaveAttribute('data-cell', 'wide');
    expect(cells[5]).toHaveAttribute('data-cell', 'actions');
    // A row across every column is a message, with no label.
    const note = table.tBodies[0].rows[1].cells[0];
    expect(note).toHaveAttribute('data-cell', 'full');
    expect(note).toHaveAttribute('data-label', '');
    // The heading row holds a control (select all), so it stays as chips.
    expect(table).toHaveAttribute('data-cards-head');
  });

  it('goes back to a table when there is room again', () => {
    const { scroller, table } = mount(ORDERS);
    widths.set(scroller, { client: 358, scroll: 820 });
    fitTable(table);
    expect(table).toHaveAttribute('data-cards');
    widths.set(scroller, { client: 1100, scroll: 1100 });
    fitTable(table);
    expect(table).not.toHaveAttribute('data-cards');
  });

  it('drops sort arrows from a heading when it labels a value', () => {
    const { scroller, table } = mount(`
      <table>
        <thead><tr><th>Item ↕</th><th>Price ▲</th></tr></thead>
        <tbody><tr><td>Bajiya</td><td>MVR 3.00</td></tr></tbody>
      </table>`);
    widths.set(scroller, { client: 200, scroll: 600 });
    fitTable(table);
    expect(table.tBodies[0].rows[0].cells[1]).toHaveAttribute('data-label', 'Price');
  });

  it('keeps a label a page set itself, and leaves a table marked keep alone', () => {
    const { scroller, table } = mount(`
      <table>
        <thead><tr><th>Item</th><th>Price</th></tr></thead>
        <tbody><tr><td>Bajiya</td><td data-label="Catalog price">MVR 5.00</td></tr></tbody>
      </table>`);
    widths.set(scroller, { client: 200, scroll: 600 });
    fitTable(table);
    expect(table.tBodies[0].rows[0].cells[1]).toHaveAttribute('data-label', 'Catalog price');

    table.setAttribute('data-table-scroll', 'keep');
    fitTable(table);
    expect(table).not.toHaveAttribute('data-cards');
  });

  it('frees a box that held the table wider than the screen', () => {
    document.body.innerHTML = `<main><div class="responsive-table table-scroll" style="overflow-x: auto"><div style="min-width: 640px"><table>
      <thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div></div></main>`;
    const scroller = document.querySelector('.table-scroll') as HTMLElement;
    const floor = scroller.firstElementChild as HTMLElement;
    const table = document.querySelector('table') as HTMLTableElement;
    widths.set(scroller, { client: 358, scroll: 640 });
    widths.set(floor, { client: 640, scroll: 640 });
    fitTable(table);
    expect(table).toHaveAttribute('data-cards');
    expect(floor).toHaveAttribute('data-cards-shrink');

    widths.set(scroller, { client: 900, scroll: 900 });
    widths.set(floor, { client: 900, scroll: 900 });
    fitTable(table);
    expect(table).not.toHaveAttribute('data-cards');
    expect(floor).not.toHaveAttribute('data-cards-shrink');
  });

  it('keeps a narrow table a table when only a floor made it too wide', () => {
    document.body.innerHTML = `<main><div class="responsive-table table-scroll" style="overflow-x: auto"><div style="min-width: 640px"><table>
      <thead><tr><th>Method</th><th>Amount</th></tr></thead><tbody><tr><td>BML Pay</td><td>MVR 90.00</td></tr></tbody></table></div></div></main>`;
    const scroller = document.querySelector('.table-scroll') as HTMLElement;
    const floor = scroller.firstElementChild as HTMLElement;
    const table = document.querySelector('table') as HTMLTableElement;
    // With the floor the box scrolls; without it (data-cards-shrink) the table fits.
    const sizes = () => (floor.hasAttribute('data-cards-shrink')
      ? { scroller: { client: 610, scroll: 610 }, floor: { client: 610, scroll: 610 } }
      : { scroller: { client: 610, scroll: 640 }, floor: { client: 640, scroll: 640 } });
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, get: () => sizes().scroller.scroll });
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, get: () => sizes().scroller.client });
    Object.defineProperty(floor, 'clientWidth', { configurable: true, get: () => sizes().floor.client });
    Object.defineProperty(table, 'offsetWidth', { configurable: true, get: () => (floor.hasAttribute('data-cards-shrink') ? 300 : 640) });
    fitTable(table);
    expect(table).not.toHaveAttribute('data-cards');
    expect(floor).toHaveAttribute('data-cards-shrink');
  });

  it('gives a cell too wide for its column the whole card', () => {
    const { scroller, table } = mount(`
      <table>
        <thead><tr><th>Product</th><th>Shelf life</th><th>Ingredients from</th></tr></thead>
        <tbody><tr><td>Bajiya</td><td>3</td><td><select><option>Recipe, else typed (no recipe)</option></select></td></tr></tbody>
      </table>`);
    widths.set(scroller, { client: 650, scroll: 674 });
    const [, shelf, from] = table.tBodies[0].rows[0].cells;
    widths.set(from, { client: 150, scroll: 235 });
    widths.set(shelf, { client: 150, scroll: 150 });
    fitTable(table);
    expect(table).toHaveAttribute('data-cards');
    expect(from).toHaveAttribute('data-cell-wide');
    expect(shelf).not.toHaveAttribute('data-cell-wide');

    widths.set(scroller, { client: 1100, scroll: 1100 });
    fitTable(table);
    expect(table).not.toHaveAttribute('data-cards');
    expect(from).not.toHaveAttribute('data-cell-wide');
  });

  it('prints every table as a table, and decides again after printing', async () => {
    const { scroller, table } = mount(ORDERS);
    widths.set(scroller, { client: 358, scroll: 820 });
    const stop = startTableCards();
    try {
      await new Promise((r) => setTimeout(r, 50));
      expect(table).toHaveAttribute('data-cards');

      window.dispatchEvent(new Event('beforeprint'));
      expect(table).not.toHaveAttribute('data-cards');
      // Nothing puts it back while the page is on paper.
      table.tBodies[0].append(table.tBodies[0].rows[0].cloneNode(true));
      await new Promise((r) => setTimeout(r, 50));
      expect(table).not.toHaveAttribute('data-cards');

      window.dispatchEvent(new Event('afterprint'));
      await new Promise((r) => setTimeout(r, 50));
      expect(table).toHaveAttribute('data-cards');
    } finally {
      stop();
    }
  });

  it('leaves alone for a while a table that keeps changing its mind', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    try {
      const { scroller, table } = mount(ORDERS);
      const narrow = { client: 358, scroll: 820 };
      const wide = { client: 1100, scroll: 1100 };
      for (let i = 0; i < 7; i++) {
        widths.set(scroller, i % 2 === 0 ? narrow : wide);
        fitTable(table);
      }
      expect(table).toHaveAttribute('data-cards');
      // There is room again, but it changed seven times in a moment: it waits.
      widths.set(scroller, wide);
      fitTable(table);
      expect(table).toHaveAttribute('data-cards');
      vi.setSystemTime(Date.now() + 5200);
      fitTable(table);
      expect(table).not.toHaveAttribute('data-cards');
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('waits for a hidden table to come into view', () => {
    document.body.innerHTML = `<main><section hidden><div class="table-scroll" style="overflow-x: auto"><table>
      <thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div></section></main>`;
    const scroller = document.querySelector('.table-scroll') as HTMLElement;
    const table = document.querySelector('table') as HTMLTableElement;
    widths.set(scroller, { client: 100, scroll: 600 });
    fitTable(table);
    expect(table).not.toHaveAttribute('data-cards');
    expect(table.tBodies[0].rows[0].cells[0]).not.toHaveAttribute('data-label');

    document.querySelector('section')!.removeAttribute('hidden');
    fitTable(table);
    expect(table).toHaveAttribute('data-cards');
    expect(table.tBodies[0].rows[0].cells[1]).toHaveAttribute('data-label', 'B');
  });
});
