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
    // The builder's own emphasis: bold and double size, on and off.
    .split('\x1BE\x01').join('')
    .split('\x1BE\x00').join('')
    .split('\x1B!\x30').join('')
    .split('\x1B!\x00').join('')
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

test('receipt prints the complaint form as a second QR under the receipt one', () => {
  // Owner, 2026-09-19: "also add the complaint QR on the receipt print".
  const payload = hostilePayload();
  payload.receipt_url = 'https://bakeandgrill.mv/receipts/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL';
  payload.complaint_url = 'https://bakeandgrill.mv/complain?from=receipt&order=BG-20260919-0007';
  const ticket = buildReceiptTicket(payload);
  assert.ok(ticket.includes('Not happy? Scan to tell the owner'));
  assert.ok(ticket.includes(`\x31\x50\x30${payload.complaint_url}`));
  assert.ok(ticket.indexOf(payload.complaint_url) > ticket.indexOf(payload.receipt_url), 'complaint QR comes after the receipt QR');
  assert.ok(ticket.indexOf('\x1DVA0') > ticket.indexOf(payload.complaint_url), 'cut comes last');

  const bad = hostilePayload();
  bad.complaint_url = `${GS}(k not a url`;
  assert.ok(!buildReceiptTicket(bad).includes('Not happy?'));
  assert.ok(!buildReceiptTicket(hostilePayload()).includes('Not happy?'));
});

test('receipt prints no QR without a link, or with one that is not a URL', () => {
  assert.ok(!buildReceiptTicket(hostilePayload()).includes('Scan for your receipt'));
  const bad = hostilePayload();
  bad.receipt_url = `${GS}(k not a url`;
  assert.ok(!buildReceiptTicket(bad).includes('Scan for your receipt'));
});

// Kitchen audit, 2026-09-26: what the kitchen screen showed and paper did not.
test('kitchen chit carries heading, table, pickup time, size, line note, bundle and customer note', () => {
  const ticket = buildKitchenTicket({
    printer_name: 'kitchen',
    type: 'kitchen',
    order: {
      id: 7,
      order_number: 'BG-7',
      type: 'online_pickup',
      heading: 'ADDED',
      table: 'T4',
      pickup_at: '19:00',
      customer_notes: 'Ring when ready',
      items: [
        { item_name: 'Burger', quantity: 2, variant_name: 'Large', notes: 'No onions',
          bundle_contents: [{ name: 'Fries', quantity: 2 }] },
        { item_name: 'Samosa', quantity: 1, is_child: true },
        { item_name: 'VOID: Tea', quantity: 1, void: true },
      ],
    },
  });

  assert.ok(ticket.includes('ADDED'));
  assert.ok(ticket.includes('Table: T4'));
  assert.ok(ticket.includes('FOR 19:00'));
  assert.ok(ticket.includes('2x Burger (Large)'));
  assert.ok(ticket.includes('>> No onions'));
  assert.ok(ticket.includes('> 2x Fries'));
  assert.ok(ticket.includes('   > 1x Samosa'));
  assert.ok(ticket.includes('1x VOID: Tea'));
  assert.ok(ticket.includes('Customer: Ring when ready'));
});

test('new kitchen fields are sanitised too', () => {
  const ticket = buildKitchenTicket({
    printer_name: 'kitchen',
    type: 'kitchen',
    order: {
      id: 8,
      order_number: 'BG-8',
      type: 'takeaway',
      heading: `CHANGED${ESC}p`,
      table: `T${GS}VA0`,
      customer_notes: `hi${ESC}@`,
      items: [{ item_name: 'Tea', quantity: 1, variant_name: `L${ESC}p`, notes: `x${GS}V`, bundle_contents: [{ name: `F${ESC}`, quantity: 1 }] }],
    },
  });
  assert.equal(injectedControlBytes(ticket), 0);
});
