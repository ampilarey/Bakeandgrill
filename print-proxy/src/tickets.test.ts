import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKitchenTicket, buildReceiptTicket, sanitizePrintText, type PrintPayload } from './tickets.js';

const ESC = '\x1B';
const GS = '\x1D';

const hostilePayload = (): PrintPayload => ({
  printer_name: 'kitchen',
  order: {
    id: 1,
    order_number: 'ORD-1',
    type: 'delivery',
    // ESC/POS cash-drawer kick + cut + feed injected in every dynamic field
    notes: `open drawer ${ESC}p\x00\x19\xFA then cut ${GS}VA0`,
    subtotal: 10,
    total: 10,
    items: [
      {
        item_name: `Burger${ESC}@${GS}V\x41\x03`,
        quantity: 1,
        unit_price: 10,
        packaging_option_name: `Box${ESC}J\x40`,
        modifiers: [{ modifier_name: `Extra${GS}VA0cheese` }],
      },
    ],
    payments: [{ method: `cash${ESC}p`, amount: 10 }],
  },
  type: 'kitchen',
});

/** Count control bytes, ignoring the builder's own legitimate commands. */
const injectedControlBytes = (ticket: string): number => {
  // Remove the exact sequences the builder itself emits: init + cut + newlines.
  const withoutBuilderCommands = ticket
    .split('\x1B@\n').join('')
    .split('\x1DVA0').join('')
    .split('\n').join('');
  return (withoutBuilderCommands.match(/[\u0000-\u001F\u007F-\u009F]/g) ?? []).length;
};

test('sanitizePrintText strips all C0/C1 control characters', () => {
  assert.equal(sanitizePrintText(`${ESC}p\x00kick`), ' p kick');
  assert.equal(sanitizePrintText(`${GS}VA0cut`), ' VA0cut');
  assert.equal(sanitizePrintText(null), '');
  assert.equal(sanitizePrintText(undefined), '');
  assert.equal(sanitizePrintText('plain text'), 'plain text');
});

test('kitchen ticket contains no injected control bytes', () => {
  const ticket = buildKitchenTicket(hostilePayload());
  assert.equal(injectedControlBytes(ticket), 0);
  assert.match(ticket, /Burger/);
  assert.match(ticket, /Notes: open drawer/);
});

test('receipt ticket contains no injected control bytes (incl. notes)', () => {
  const ticket = buildReceiptTicket(hostilePayload());
  assert.equal(injectedControlBytes(ticket), 0);
  // The notes line specifically must be sanitized — regression for the line
  // the 2026-08 audit review found unsanitized.
  const notesLine = ticket.split('\n').find(l => l.startsWith('Notes:')) ?? '';
  assert.ok(notesLine.length > 0, 'notes line present');
  assert.equal((notesLine.match(/[\u0000-\u001F\u007F-\u009F]/g) ?? []).length, 0);
});

test('builders still emit their own init and cut commands', () => {
  const ticket = buildReceiptTicket(hostilePayload());
  assert.ok(ticket.startsWith('\x1B@\n'), 'starts with ESC @ init');
  assert.ok(ticket.endsWith('\x1DVA0'), 'ends with GS V cut');
});

test('receipt prints its link as an ESC/POS QR when one is given', () => {
  const payload = hostilePayload();
  payload.receipt_url = 'https://bakeandgrill.mv/receipts/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL';
  const ticket = buildReceiptTicket(payload);
  assert.ok(ticket.includes('Scan for your receipt'));
  // GS ( k … store (cn=49, fn=80) carries the URL; print (fn=81) follows it.
  assert.ok(ticket.includes(`${GS}(k`));
  assert.ok(ticket.includes(`\x31\x50\x30${payload.receipt_url}`));
  assert.ok(ticket.indexOf('\x31\x51\x30') > ticket.indexOf(payload.receipt_url));
});

test('receipt prints no QR without a link, or with one that is not a URL', () => {
  assert.ok(!buildReceiptTicket(hostilePayload()).includes('Scan for your receipt'));
  const bad = hostilePayload();
  bad.receipt_url = `${GS}(k not a url`;
  assert.ok(!buildReceiptTicket(bad).includes('Scan for your receipt'));
});
