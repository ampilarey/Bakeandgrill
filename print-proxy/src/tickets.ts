// ── Ticket building (pure, testable — no server side effects) ────────────────

export type PrintPayload = {
  printer_name: string;
  order: {
    id: number;
    order_number: string;
    type: string;
    created_at?: string | null;
    notes?: string | null;
    /** ADDED / CHANGED / REPRINT / CANCELLED - DO NOT MAKE, printed large. */
    heading?: string | null;
    /** Table or ticket name. */
    table?: string | null;
    /** Pickup time, HH:MM, for a booked pickup. */
    pickup_at?: string | null;
    /** What the customer typed on an online order. */
    customer_notes?: string | null;
    subtotal?: number;
    tax_amount?: number;
    discount_amount?: number;
    total?: number;
    items: Array<{
      item_name: string;
      quantity: number;
      unit_price?: number;
      variant_name?: string | null;
      packaging_option_name?: string | null;
      /** The cashier's per-line instruction: "no onions", "well done". */
      notes?: string | null;
      /** A platter's pick, printed indented under its platter. */
      is_child?: boolean;
      /** A line to stop making (its name already starts VOID: or CANCEL:). */
      void?: boolean;
      modifiers?: Array<{ modifier_name: string }>;
      /** What a fixed bundle is made of. */
      bundle_contents?: Array<{ name: string; quantity: number }> | null;
    }>;
    payments?: Array<{
      method: string;
      amount: number;
    }>;
  };
  type?: string;
  /** Public web receipt URL; printed as a QR at the foot of a receipt. */
  receipt_url?: string | null;
  /** The complaint form on the live site; a second QR under the first (owner, 2026-09-19). */
  complaint_url?: string | null;
};

const isUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\/[^\s]+$/.test(v);

/**
 * ESC/POS for a QR code (GS ( k), as Epson and the compatible clones read
 * it: model 2, module size 5, error correction M, then store and print.
 * Every byte here is below 0x80, so it survives the string-to-bytes step
 * whatever the encoding, as long as the payload stays under 128 bytes —
 * a receipt link is about 80.
 */
export const escPosQr = (data: string): string => {
  if (data.length === 0 || data.length > 120) return '';
  const len = data.length + 3;
  const pL = String.fromCharCode(len & 0xff);
  const pH = String.fromCharCode((len >> 8) & 0xff);
  return [
    '\x1Ba\x01',                       // centre
    '\x1D(k\x04\x00\x31\x41\x32\x00', // model 2
    '\x1D(k\x03\x00\x31\x43\x05',     // module size 5
    '\x1D(k\x03\x00\x31\x45\x31',     // error correction M
    `\x1D(k${pL}${pH}\x31\x50\x30${data}`, // store
    '\x1D(k\x03\x00\x31\x51\x30',     // print
    '\x1Ba\x00',                       // left again
  ].join('');
};

/**
 * Strip every C0/C1 control character (ESC 0x1B, GS 0x1D, DEL, …) from
 * user-derived text. Only the ticket builders below may emit printer control
 * sequences — order data (item names, notes, modifiers) must never inject
 * ESC/POS commands like cut, feed, or cash-drawer kick into the byte stream.
 */
export const sanitizePrintText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
};

const BIG_ON = '\x1B!\x30';   // double height and width
const BIG_OFF = '\x1B!\x00';
const BOLD_ON = '\x1BE\x01';
const BOLD_OFF = '\x1BE\x00';

/**
 * The kitchen chit. Kitchen audit, 2026-09-26: it printed dish and
 * modifiers only, so the size, the cashier's "no onions", the table, the
 * pickup time, the customer's note and a bundle's contents were on the
 * screen and not on paper; and nothing said whether a chit was the order,
 * an add-on, a change or a cancellation.
 */
export const buildKitchenTicket = (payload: PrintPayload): string => {
  const s = sanitizePrintText;
  const lines: string[] = [];
  lines.push('\x1B@\n');
  if (payload.order.heading) {
    lines.push(`${BIG_ON}${s(payload.order.heading)}${BIG_OFF}\n`);
  }
  lines.push('BAKE & GRILL\n');
  lines.push(`${s(payload.type || 'KITCHEN').toUpperCase()} TICKET\n`);
  lines.push(`${BOLD_ON}Order: ${s(payload.order.order_number)}${BOLD_OFF}\n`);
  lines.push(`Type: ${s(payload.order.type)}\n`);
  if (payload.order.table) {
    lines.push(`${BOLD_ON}Table: ${s(payload.order.table)}${BOLD_OFF}\n`);
  }
  if (payload.order.pickup_at) {
    lines.push(`${BIG_ON}FOR ${s(payload.order.pickup_at)}${BIG_OFF}\n`);
  }
  if (payload.order.created_at) {
    const timeStr = new Date(payload.order.created_at).toLocaleTimeString('en-US', {
      timeZone: 'Indian/Maldives',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    lines.push(`Time: ${timeStr}\n`);
  }
  lines.push('-----------------------------\n');
  payload.order.items.forEach(item => {
    const indent = item.is_child ? '   > ' : '';
    const size = item.variant_name ? ` (${s(item.variant_name)})` : '';
    const text = `${indent}${item.quantity}x ${s(item.item_name)}${size}`;
    lines.push(item.void ? `${BOLD_ON}${text}${BOLD_OFF}\n` : `${text}\n`);
    if (item.packaging_option_name) {
      lines.push(`  - ${s(item.packaging_option_name)}\n`);
    }
    if (item.modifiers && item.modifiers.length > 0) {
      lines.push(`  - ${item.modifiers.map(m => s(m.modifier_name)).join(', ')}\n`);
    }
    (item.bundle_contents ?? []).forEach(row => {
      lines.push(`    > ${row.quantity}x ${s(row.name)}\n`);
    });
    if (item.notes) {
      lines.push(`  ${BOLD_ON}>> ${s(item.notes)}${BOLD_OFF}\n`);
    }
  });
  if (payload.order.customer_notes) {
    lines.push('-----------------------------\n');
    lines.push(`${BOLD_ON}Customer: ${s(payload.order.customer_notes)}${BOLD_OFF}\n`);
  }
  if (payload.order.notes) {
    lines.push('-----------------------------\n');
    lines.push(`Notes: ${s(payload.order.notes)}\n`);
  }
  lines.push('\n\n\n');
  lines.push('\x1DVA0');
  return lines.join('');
};

export const buildReceiptTicket = (payload: PrintPayload): string => {
  const s = sanitizePrintText;
  const lines: string[] = [];
  lines.push('\x1B@\n');
  lines.push('BAKE & GRILL\n');
  lines.push('RECEIPT\n');
  lines.push(`Order: ${s(payload.order.order_number)}\n`);
  if (payload.order.created_at) {
    lines.push(`Time: ${new Date(payload.order.created_at).toLocaleTimeString()}\n`);
  }
  lines.push('-----------------------------\n');
  payload.order.items.forEach(item => {
    const price     = item.unit_price ?? 0;
    const lineTotal = price * item.quantity;
    lines.push(`${item.quantity}x ${s(item.item_name)}  ${lineTotal.toFixed(2)}\n`);
    if (item.packaging_option_name) {
      lines.push(`  - ${s(item.packaging_option_name)}\n`);
    }
    if (item.modifiers && item.modifiers.length > 0) {
      lines.push(`  - ${item.modifiers.map(m => s(m.modifier_name)).join(', ')}\n`);
    }
  });
  lines.push('-----------------------------\n');
  if (typeof payload.order.subtotal === 'number') lines.push(`Subtotal: ${payload.order.subtotal.toFixed(2)}\n`);
  if (typeof payload.order.tax_amount === 'number') lines.push(`Tax: ${payload.order.tax_amount.toFixed(2)}\n`);
  if (typeof payload.order.discount_amount === 'number' && payload.order.discount_amount > 0)
    lines.push(`Discount: -${payload.order.discount_amount.toFixed(2)}\n`);
  if (typeof payload.order.total === 'number') lines.push(`Total: ${payload.order.total.toFixed(2)}\n`);
  if (payload.order.payments && payload.order.payments.length > 0) {
    lines.push('Payments:\n');
    payload.order.payments.forEach(p => lines.push(`  ${s(p.method)}: ${p.amount.toFixed(2)}\n`));
  }
  if (payload.order.notes) {
    lines.push('-----------------------------\n');
    lines.push(`Notes: ${s(payload.order.notes)}\n`);
  }
  // The receipt's own link as a QR. Owner, 2026-09-02: one scan brings the
  // order back up at the till, or opens feedback and complaints. The URL is
  // ours, never customer text, so it does not go through the sanitizer —
  // that would strip nothing useful and the QR bytes must be exact.
  const qr = isUrl(payload.receipt_url) ? escPosQr(payload.receipt_url) : '';
  if (qr) {
    lines.push('-----------------------------\n');
    lines.push('\x1Ba\x01Scan for your receipt\n\x1Ba\x00');
    lines.push(qr);
    lines.push('\n');
  }
  // The complaint box. Owner, 2026-09-19: "also add the complaint QR on the
  // receipt print" — staff, food or service, anonymous or with a number,
  // straight to the owner. Same rule: our URL, never customer text.
  const complaintQr = isUrl(payload.complaint_url) ? escPosQr(payload.complaint_url) : '';
  if (complaintQr) {
    lines.push('-----------------------------\n');
    lines.push('\x1Ba\x01Not happy? Scan to tell the owner\n\x1Ba\x00');
    lines.push(complaintQr);
    lines.push('\n');
  }
  lines.push('\n\n\n');
  lines.push('\x1DVA0');
  return lines.join('');
};
