import express from 'express';
import net from 'net';

const app = express();
app.use(express.json({ limit: '256kb' })); // Conservative limit — receipts are small

const PORT   = parseInt(process.env.PORT  || '3000', 10);
const IS_PROD = (process.env.NODE_ENV || 'production') === 'production';

// ── Startup validation ────────────────────────────────────────────────────────
// Fail loudly in production if PRINT_PROXY_KEY is missing or still a placeholder.
const PRINT_API_KEY = process.env.PRINT_PROXY_KEY;
const WEAK_PLACEHOLDERS = ['CHANGE_ME', 'dev-key', 'your-random', ''];

if (!PRINT_API_KEY || WEAK_PLACEHOLDERS.some(p => PRINT_API_KEY.startsWith(p))) {
  if (IS_PROD) {
    console.error('[FATAL] PRINT_PROXY_KEY is missing or insecure. Refusing to start in production.');
    console.error('[FATAL] Generate a secure key with: openssl rand -hex 32');
    process.exit(1);
  } else {
    console.warn('[WARN] PRINT_PROXY_KEY is not set or is a placeholder. This is unsafe in production.');
  }
}

// ── Printer whitelist ─────────────────────────────────────────────────────────
interface PrinterConfig {
  name: string;
  host: string;
  port: number;
}

const loadPrinterWhitelist = (): PrinterConfig[] => {
  try {
    const json = process.env.PRINTERS_JSON || '[]';
    const printers = JSON.parse(json) as PrinterConfig[];
    // Log only printer names — never log IPs in production logs
    console.log(`[INFO] Loaded ${printers.length} printer(s): ${printers.map(p => p.name).join(', ')}`);
    return printers;
  } catch {
    console.error('[ERROR] Failed to parse PRINTERS_JSON. Check the format is valid JSON array.');
    return [];
  }
};

const PRINTER_WHITELIST = loadPrinterWhitelist();

// ── Auth middleware ───────────────────────────────────────────────────────────
const requireApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!PRINT_API_KEY || WEAK_PLACEHOLDERS.some(p => PRINT_API_KEY.startsWith(p))) {
    res.status(503).json({ success: false, error: 'Print service not configured' });
    return;
  }

  const providedKey = req.header('X-Print-Key');
  if (providedKey !== PRINT_API_KEY) {
    // Do not log the provided key — it may be a real key from a different env
    console.warn(`[WARN] Invalid API key attempt from ${req.ip}`);
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  next();
};

// ── Health check ──────────────────────────────────────────────────────────────
// Production: minimal response only — no metadata leakage.
// Development: includes debug info to assist troubleshooting.
app.get('/health', (_req, res) => {
  if (IS_PROD) {
    res.json({ status: 'ok' });
    return;
  }
  // Non-production only — extra info for local debugging
  res.json({
    status: 'ok',
    env: 'development',
    printers_configured: PRINTER_WHITELIST.length,
    api_key_set: !!PRINT_API_KEY,
  });
});

// ── Payload types ─────────────────────────────────────────────────────────────
type PrintPayload = {
  printer_name: string;
  order: {
    id: number;
    order_number: string;
    type: string;
    created_at?: string | null;
    notes?: string | null;
    subtotal?: number;
    tax_amount?: number;
    discount_amount?: number;
    total?: number;
    items: Array<{
      item_name: string;
      quantity: number;
      unit_price?: number;
      modifiers?: Array<{ modifier_name: string }>;
    }>;
    payments?: Array<{
      method: string;
      amount: number;
    }>;
  };
  type?: string;
};

// ── Payload validation ────────────────────────────────────────────────────────
const MAX_ITEMS        = 50;
const MAX_MODIFIERS    = 20;
const MAX_STRING_LEN   = 512;
const MAX_NOTES_LEN    = 1000;
const ALLOWED_TYPES    = ['kitchen', 'bar', 'receipt', 'counter'];

function validatePayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return 'Invalid payload';
  const p = payload as Record<string, unknown>;

  if (typeof p.printer_name !== 'string' || p.printer_name.length === 0 || p.printer_name.length > 64)
    return 'printer_name must be a non-empty string (max 64 chars)';

  if (p.type !== undefined && (typeof p.type !== 'string' || !ALLOWED_TYPES.includes(p.type)))
    return `type must be one of: ${ALLOWED_TYPES.join(', ')}`;

  const order = p.order as Record<string, unknown> | undefined;
  if (!order || typeof order !== 'object') return 'order is required';
  if (typeof order.order_number !== 'string' || order.order_number.length === 0 || order.order_number.length > 64)
    return 'order.order_number must be a non-empty string (max 64 chars)';

  if (order.notes && (typeof order.notes !== 'string' || order.notes.length > MAX_NOTES_LEN))
    return `order.notes must be a string (max ${MAX_NOTES_LEN} chars)`;

  if (!Array.isArray(order.items)) return 'order.items must be an array';
  if (order.items.length === 0) return 'order.items must not be empty';
  if (order.items.length > MAX_ITEMS) return `order.items exceeds max (${MAX_ITEMS})`;

  for (const item of order.items as unknown[]) {
    if (typeof item !== 'object' || item === null) return 'Each item must be an object';
    const it = item as Record<string, unknown>;
    if (typeof it.item_name !== 'string' || it.item_name.length === 0 || it.item_name.length > MAX_STRING_LEN)
      return 'item_name must be a non-empty string';
    if (typeof it.quantity !== 'number' || it.quantity < 1 || it.quantity > 999)
      return 'item.quantity must be between 1 and 999';
    if (it.modifiers !== undefined) {
      if (!Array.isArray(it.modifiers)) return 'item.modifiers must be an array';
      if ((it.modifiers as unknown[]).length > MAX_MODIFIERS)
        return `item.modifiers exceeds max (${MAX_MODIFIERS})`;
    }
  }

  return null;
}

// ── Ticket builders ───────────────────────────────────────────────────────────
const buildKitchenTicket = (payload: PrintPayload): string => {
  const lines: string[] = [];
  lines.push('\x1B@\n');
  lines.push('BAKE & GRILL\n');
  lines.push(`${(payload.type || 'KITCHEN').toUpperCase()} TICKET\n`);
  lines.push(`Order: ${payload.order.order_number}\n`);
  lines.push(`Type: ${payload.order.type}\n`);
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
    lines.push(`${item.quantity}x ${item.item_name}\n`);
    if (item.modifiers && item.modifiers.length > 0) {
      lines.push(`  - ${item.modifiers.map(m => m.modifier_name).join(', ')}\n`);
    }
  });
  if (payload.order.notes) {
    lines.push('-----------------------------\n');
    lines.push(`Notes: ${payload.order.notes}\n`);
  }
  lines.push('\n\n\n');
  lines.push('\x1DVA0');
  return lines.join('');
};

const buildReceiptTicket = (payload: PrintPayload): string => {
  const lines: string[] = [];
  lines.push('\x1B@\n');
  lines.push('BAKE & GRILL\n');
  lines.push('RECEIPT\n');
  lines.push(`Order: ${payload.order.order_number}\n`);
  if (payload.order.created_at) {
    lines.push(`Time: ${new Date(payload.order.created_at).toLocaleTimeString()}\n`);
  }
  lines.push('-----------------------------\n');
  payload.order.items.forEach(item => {
    const price     = item.unit_price ?? 0;
    const lineTotal = price * item.quantity;
    lines.push(`${item.quantity}x ${item.item_name}  ${lineTotal.toFixed(2)}\n`);
    if (item.modifiers && item.modifiers.length > 0) {
      lines.push(`  - ${item.modifiers.map(m => m.modifier_name).join(', ')}\n`);
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
    payload.order.payments.forEach(p => lines.push(`  ${p.method}: ${p.amount.toFixed(2)}\n`));
  }
  if (payload.order.notes) {
    lines.push('-----------------------------\n');
    lines.push(`Notes: ${payload.order.notes}\n`);
  }
  lines.push('\n\n\n');
  lines.push('\x1DVA0');
  return lines.join('');
};

// ── Printer TCP send ──────────────────────────────────────────────────────────
const sendToPrinter = (ip: string, port: number, data: string) =>
  new Promise<void>((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(10_000);
    client.connect(port, ip, () => {
      client.write(data, 'utf8', () => { client.end(); resolve(); });
    });
    client.on('error',   err => { client.destroy(); reject(err); });
    client.on('timeout', ()  => { client.destroy(); reject(new Error('Print timeout')); });
  });

// ── /print endpoint ───────────────────────────────────────────────────────────
app.post('/print', requireApiKey, async (req, res) => {
  // Validate payload shape before touching anything
  const validationError = validatePayload(req.body);
  if (validationError) {
    res.status(400).json({ success: false, error: validationError });
    return;
  }

  const payload = req.body as PrintPayload;

  // Look up printer from whitelist — reject arbitrary names
  const printer = PRINTER_WHITELIST.find(p => p.name === payload.printer_name);
  if (!printer) {
    // Log the rejected name (safe — it's attacker-controlled text, not a secret)
    console.warn(`[WARN] Rejected print for unknown printer: "${payload.printer_name}"`);
    res.status(403).json({ success: false, error: `Printer '${payload.printer_name}' not in whitelist` });
    return;
  }

  try {
    const content = (payload.type === 'receipt' || payload.type === 'counter')
      ? buildReceiptTicket(payload)
      : buildKitchenTicket(payload);

    await sendToPrinter(printer.host, printer.port, content);

    // Log printer name + order number only — never log printer IP/port in production
    console.log(`[INFO] Print sent to "${printer.name}" for order ${payload.order.order_number}`);

    res.json({ success: true, message: 'Print job sent', printer: payload.printer_name });
  } catch (error) {
    // Log error class/message only — not the full stack with internal IPs
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ERROR] Print job failed for "${printer.name}": ${msg}`);
    res.status(500).json({ success: false, error: 'Print job failed' });
  }
});

// ── Server startup ────────────────────────────────────────────────────────────
// Default to 127.0.0.1 (loopback) for safety.
// Override with BIND_HOST=0.0.0.0 only inside isolated Docker networks.
const HOST = process.env.BIND_HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`[INFO] Print proxy running on ${HOST}:${PORT} (${IS_PROD ? 'production' : 'development'})`);
  console.log(`[INFO] API key configured: ${PRINT_API_KEY ? 'YES' : 'NO — INSECURE!'}`);
  console.log(`[INFO] Printers whitelisted: ${PRINTER_WHITELIST.length}`);
  if (PRINTER_WHITELIST.length === 0) {
    console.warn('[WARN] No printers configured in PRINTERS_JSON — printing disabled');
  }
  if (HOST === '0.0.0.0') {
    console.warn('[WARN] Binding to 0.0.0.0 — ensure this host is firewalled from the public internet');
  }
});
