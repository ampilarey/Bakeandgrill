/**
 * Reading a customer's purchase order (owner, 2026-11-15: "a place where I can
 * upload PO and generate invoice").
 *
 * The PDF is read in the browser. `linesOf()` turns the words pdf.js finds, each
 * with its place on the page, back into the lines a person sees, with wide gaps
 * kept as two spaces so columns stay apart. `readPo()` then looks for what an
 * invoice needs: the PO's number and dates, who to bill, where to deliver, and
 * the rows of goods. Nothing here is trusted blindly: the screen shows every
 * value in a box the owner can change, and says which ones it could not find.
 */

export type PoLine = { description: string; quantity: number; unit: string; unit_price: number; amount: number };

export type PoDraft = {
  po_number: string;
  order_date: string;
  delivery_date: string;
  bill_to: string;
  bill_address: string;
  bill_tin: string;
  bill_email: string;
  deliver_to: string;
  payment_term: string;
  currency: string;
  lines: PoLine[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  /** Rows where a smudged figure was worked out from the row's amount (scans only, in practice). */
  mended: number;
  /** What could not be found, in the screen's words. */
  missing: string[];
};

/** One piece of text from pdf.js: its words, where it starts, how wide and tall it is. */
export type PdfWord = { str: string; x: number; y: number; width: number; height: number };

/** Words back into lines: top to bottom, left to right, a wide gap kept as two spaces. */
export function linesOf(words: PdfWord[]): string[] {
  const rows: { y: number; words: PdfWord[] }[] = [];
  for (const w of words) {
    if (w.str.trim() === '') continue;
    const tol = Math.max(2, w.height * 0.45);
    const row = rows.find((r) => Math.abs(r.y - w.y) <= tol);
    if (row) row.words.push(w);
    else rows.push({ y: w.y, words: [w] });
  }
  rows.sort((a, b) => b.y - a.y);

  return rows.map((row) => {
    row.words.sort((a, b) => a.x - b.x);
    let out = '';
    let end = 0;
    for (const w of row.words) {
      if (out !== '') {
        const gap = w.x - end;
        const letter = Math.max(2, w.height * 0.5);
        out += gap > letter * 1.6 ? '  ' : gap > letter * 0.25 && !out.endsWith(' ') ? ' ' : '';
      }
      out += w.str.trim();
      end = w.x + w.width;
    }
    return out;
  });
}

const NUM = String.raw`-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?`;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function num(text: string): number {
  return Number(text.replace(/,/g, ''));
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "14-Nov-2026", "14 November 2026", "14/11/2026" or "2026-11-14" as 2026-11-14; '' when it is not a date. */
export function isoDate(text: string): string {
  const t = text.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/^(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[\s\-/.,]+(\d{4})/);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (month >= 0) return `${m[3]}-${pad(month + 1)}-${pad(+m[1])}`;
  }
  // Day first, as the Maldives writes it.
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return '';
}

/** The value after a label on any line: up to the next wide gap. */
function after(lines: string[], label: RegExp, which = 0): string {
  let seen = 0;
  for (const line of lines) {
    const re = new RegExp(label.source + String.raw`\s*[:.]?\s*(.+?)(?=\s{2,}|$)`, 'gi');
    for (const m of line.matchAll(re)) {
      if (seen === which) return m[1].trim();
      seen += 1;
    }
  }
  return '';
}

const NOT_A_ROW = /\b(total|amount|subtotal|sub-total|taxable|gst|vat|page|tel|phone|fax|date|order no|tax id|tin)\b/i;

/** A row of goods: its words, how many, the unit price and the amount, where quantity × price is the amount. */
function rowOf(line: string): PoLine | null {
  const found = [...line.matchAll(new RegExp(`(?<![A-Za-z0-9])(${NUM})(?![A-Za-z0-9-])`, 'g'))]
    .map((m) => ({ text: m[1], at: m.index ?? 0, value: num(m[1]) }));
  if (found.length < 3) return null;

  const amount = found[found.length - 1];
  const price = found[found.length - 2];
  if (!(amount.value > 0) || !(price.value > 0)) return null;

  // The quantity is the number that makes the sum come out; the nearest to the price wins.
  let qty: (typeof found)[number] | null = null;
  for (let i = found.length - 3; i >= 0; i--) {
    if (Math.abs(found[i].value * price.value - amount.value) < 0.011) { qty = found[i]; break; }
  }
  if (!qty) return null;

  let description = line.slice(0, qty.at).trim();
  // A leading line number ("1", "10.") is not part of the name.
  description = description.replace(/^\d{1,3}[.)]?\s+/, '').replace(/\s{2,}/g, ' ').trim();
  if (description === '' || /^\d+$/.test(description) || NOT_A_ROW.test(description)) return null;

  const between = line.slice(qty.at + qty.text.length, price.at).trim();
  const unit = (between.match(/^[A-Za-z]{1,12}\b/)?.[0] ?? '').trim();

  return { description, quantity: qty.value, unit, unit_price: price.value, amount: amount.value };
}

/** The digits a smudged figure most likely is: "37s" is 375, "2OO" is 200. */
function digitsOf(token: string): string {
  return token
    .replace(/[sS]/g, '5').replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/B/g, '8').replace(/Z/g, '2')
    .replace(/[.,]/g, '');
}

/** Whether a smudged figure has the digits of this value: "375" or "37s" for 3.75, "20000" for 200. */
function sameDigits(token: string, value: number): boolean {
  const seen = digitsOf(token);
  if (!/^\d+$/.test(seen)) return false;
  return seen === value.toFixed(2).replace('.', '') || seen === String(value).replace('.', '');
}

const FIGURE = /^[\dOolIsSBZ|][\dOolIsSBZ|,.]*$/;

/**
 * A row from a scan where one figure lost its decimal point or a digit was read
 * as a letter (menu audit of scans, 2026-11-15: "3.75" came back as "375" and
 * "37s"). The row's amount and its other figure are sound, so the smudged one
 * is worked out from them, and taken only when its digits agree with what was
 * read. A row that cannot be checked this way is left out, never guessed.
 */
function mendedRow(line: string): PoLine | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 5) return null;
  const amountTok = tokens[tokens.length - 1];
  if (!/^\d[\d,]*\.\d{2}$/.test(amountTok)) return null;
  const amount = num(amountTok);
  const priceTok = tokens[tokens.length - 2];
  if (!(amount > 0) || !FIGURE.test(priceTok) || !/\d/.test(priceTok)) return null;

  // The quantity is the figure with the unit's word after it, nearest the price.
  let at = -1;
  for (let i = tokens.length - 3; i >= 1; i--) {
    if (FIGURE.test(tokens[i]) && /\d/.test(tokens[i]) && /^[A-Za-z]{1,12}$/.test(tokens[i + 1] ?? '')) { at = i; break; }
  }
  if (at < 1) return null;
  const qtyTok = tokens[at];

  const plain = (t: string) => (/^\d[\d,]*(?:\.\d+)?$/.test(t) ? num(t) : NaN);
  let quantity = plain(qtyTok);
  let price = plain(priceTok);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.011;

  if (Number.isFinite(quantity) && quantity > 0) {
    const worked = Math.round((amount / quantity) * 100) / 100;
    if (near(worked * quantity, amount) && sameDigits(priceTok, worked)) price = worked;
  }
  if (!(Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && near(price * quantity, amount))) {
    price = plain(priceTok);
    if (!(Number.isFinite(price) && price > 0)) return null;
    const worked = Math.round((amount / price) * 100) / 100;
    if (!near(worked * price, amount) || !sameDigits(qtyTok, worked)) return null;
    quantity = worked;
  }

  // The row's number is not part of the name, nor is one read as a letter ("s" for 5).
  const description = tokens.slice(0, at).join(' ').replace(/^(?:\d{1,3}[.)]?|[sSoOlI|])\s+(?=\S)/, '').trim();
  if (description === '' || NOT_A_ROW.test(description)) return null;

  return { description, quantity, unit: tokens[at + 1], unit_price: price, amount };
}

/** The last number on the first line that carries the label. */
function figure(lines: string[], label: RegExp): number | null {
  for (const line of lines) {
    const m = line.match(new RegExp(label.source + String.raw`.*?(?<![\d.,])(${NUM})\s*$`, 'i'));
    if (m) return num(m[1]);
  }
  return null;
}

export function readPo(lines: string[]): PoDraft {
  const text = lines.map((l) => l.replace(/ /g, ' '));

  const po_number = after(text, /(?:purchase\s+order|order|p\.?\s?o\.?)\s*(?:no|number|#)\.?/)
    .split(/\s/)[0]?.replace(/[^\w/-]/g, '') ?? '';
  const order_date = isoDate(after(text, /(?:order|p\.?o\.?|issue)\s+date/) || after(text, /(?:^|\s{2,})date/));
  const delivery_date = isoDate(after(text, /(?:delivery|deliver\s+by|required|due)\s+date/));

  // Who the invoice is made out to: the PO's own "issue the invoice to" block
  // when it has one, else the company named at the top of the page.
  let bill_to = '';
  let bill_address = '';
  let bill_tin = '';
  const issueAt = text.findIndex((l) => /issue\s+(?:the\s+)?(?:tax\s+)?invoice/i.test(l));
  if (issueAt >= 0) {
    const block = text.slice(issueAt + 1, issueAt + 6).map((l) => l.trim()).filter((l) => l !== '');
    bill_to = block[0] ?? '';
    const addr: string[] = [];
    for (const l of block.slice(1)) {
      const tin = l.match(/(?:tax\s*id|tin|gst\s*(?:no|tin))\s*[:.]?\s*([A-Z0-9-]{4,})/i);
      if (tin) { bill_tin = tin[1]; break; }
      if (/^note\b/i.test(l)) break;
      addr.push(l);
    }
    bill_address = addr.join(', ');
  }
  if (bill_to === '') {
    bill_to = text.map((l) => l.trim()).find((l) => l !== '' && !/purchase\s+order/i.test(l)) ?? '';
  }

  const shipName = after(text, /(?:ship|deliver(?:y)?|consign(?:ee)?)\s+to/);
  const shipAddress = text.some((l) => /ship\s+to/i.test(l)) ? after(text, /address/, 1) : '';
  const deliver_to = [shipName, shipAddress].filter((s) => s !== '').join(', ');

  const rows: PoLine[] = [];
  let mended = 0;
  for (const line of text) {
    let row = rowOf(line);
    if (!row) {
      row = mendedRow(line);
      if (row) mended += 1;
    }
    if (row) rows.push(row);
  }

  const subtotal = figure(text, /(?:taxable\s+amount|sub-?\s?total)/);
  const total = figure(text, /(?:total\s+amount|grand\s+total|order\s+total|^\s*total)/);
  // The tax line among the totals, not the "(Excl. GST/VAT)" column heading.
  const tax = figure(text.filter((l) => !/excl|taxable/i.test(l)), /(?:gst\/vat|\bgst\b|\bvat\b|\btax\b)\s*(?:amount)?/);

  const currency = (text.join(' ').match(/\b(MVR|USD|EUR)\b/) ?? [''])[0];

  const missing: string[] = [];
  if (po_number === '') missing.push('the PO number');
  if (bill_to === '') missing.push('who to bill');
  if (rows.length === 0) missing.push('the items');

  return {
    po_number,
    order_date,
    delivery_date,
    bill_to,
    bill_address,
    bill_tin,
    bill_email: (after(text, /buyer'?s?\s+e-?mail/).match(/[^\s@]+@[^\s@]+\.[^\s@]+/) ?? [''])[0],
    deliver_to,
    payment_term: after(text, /payment\s+terms?/),
    currency,
    lines: rows,
    subtotal,
    tax,
    total,
    mended,
    missing,
  };
}

/** The draft's own rows added up, to hold against the PO's printed total. */
export function sumOf(lines: { quantity: number; unit_price: number }[]): number {
  return Math.round(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0) * 100) / 100;
}
