import express from 'express';
import net from 'net';

const app = express();
app.use(express.json({ limit: '1mb' })); // Limit request size

const PORT = process.env.PORT || 3000;
const PRINT_API_KEY = process.env.PRINT_PROXY_KEY;

// SECURITY: Whitelist of allowed printers (loaded from env)
interface PrinterConfig {
  name: string;
  host: string;
  port: number;
}

const loadPrinterWhitelist = (): PrinterConfig[] => {
  try {
    const json = process.env.PRINTERS_JSON || '[]';
    const printers = JSON.parse(json) as PrinterConfig[];
    console.log(`Loaded ${printers.length} printer(s) from whitelist:`, printers.map(p => p.name));
    return printers;
  } catch (error) {
    console.error('Failed to parse PRINTERS_JSON:', error);
    return [];
  }
};

const PRINTER_WHITELIST = loadPrinterWhitelist();

// Auth middleware - require API key
const requireApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const providedKey = req.header('X-Print-Key');
  
  if (!PRINT_API_KEY) {
    // API key not configured - reject all requests
    console.warn('PRINT_PROXY_KEY not configured - rejecting request');
    res.status(503).json({ success: false, error: 'Print service not configured' });
    return;
  }
  
  if (providedKey !== PRINT_API_KEY) {
    console.warn('Invalid API key attempt from', req.ip);
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  
  next();
};

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'Print Proxy',
    printers_configured: PRINTER_WHITELIST.length,
  });
});

type PrintPayload = {
  printer_name: string; // SECURITY: Only accept name, not IP/port
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
  type?: string; // kitchen, bar, receipt, counter
};

const buildKitchenTicket = (payload: PrintPayload) => {
  const lines: string[] = [];
  lines.push('\x1B@\n'); // Initialize
  lines.push('BAKE & GRILL\n');
  lines.push(`${(payload.type || 'KITCHEN').toUpperCase()} TICKET\n`);
  lines.push(`Order: ${payload.order.order_number}\n`);
  lines.push(`Type: ${payload.order.type}\n`);
  if (payload.order.created_at) {
    lines.push(`Time: ${new Date(payload.order.created_at).toLocaleTimeString()}\n`);
  }
  lines.push('-----------------------------\n');
  payload.order.items.forEach((item) => {
    lines.push(`${item.quantity}x ${item.item_name}\n`);
    if (item.modifiers && item.modifiers.length > 0) {
      lines.push(`  - ${item.modifiers.map((mod) => mod.modifier_name).join(', ')}\n`);
    }
  });
  if (payload.order.notes) {
    lines.push('-----------------------------\n');
    lines.push(`Notes: ${payload.order.notes}\n`);
  }
  lines.push('\n\n\n');
  lines.push('\x1DVA0'); // Cut
  return lines.join('');
};

const buildReceiptTicket = (payload: PrintPayload) => {
  const lines: string[] = [];
  lines.push('\x1B@\n');
  lines.push('BAKE & GRILL\n');
  lines.push('RECEIPT\n');
  lines.push(`Order: ${payload.order.order_number}\n`);
  if (payload.order.created_at) {
    lines.push(`Time: ${new Date(payload.order.created_at).toLocaleTimeString()}\n`);
  }
  lines.push('-----------------------------\n');
  payload.order.items.forEach((item) => {
    const price = item.unit_price ?? 0;
    const lineTotal = price * item.quantity;
    lines.push(`${item.quantity}x ${item.item_name}  ${lineTotal.toFixed(2)}\n`);
    if (item.modifiers && item.modifiers.length > 0) {
      lines.push(`  - ${item.modifiers.map((mod) => mod.modifier_name).join(', ')}\n`);
    }
  });
  lines.push('-----------------------------\n');
  if (typeof payload.order.subtotal === 'number') {
    lines.push(`Subtotal: ${payload.order.subtotal.toFixed(2)}\n`);
  }
  if (typeof payload.order.tax_amount === 'number') {
    lines.push(`Tax: ${payload.order.tax_amount.toFixed(2)}\n`);
  }
  if (typeof payload.order.discount_amount === 'number' && payload.order.discount_amount > 0) {
    lines.push(`Discount: -${payload.order.discount_amount.toFixed(2)}\n`);
  }
  if (typeof payload.order.total === 'number') {
    lines.push(`Total: ${payload.order.total.toFixed(2)}\n`);
  }
  if (payload.order.payments && payload.order.payments.length > 0) {
    lines.push('Payments:\n');
    payload.order.payments.forEach((payment) => {
      lines.push(`  ${payment.method}: ${payment.amount.toFixed(2)}\n`);
    });
  }
  if (payload.order.notes) {
    lines.push('-----------------------------\n');
    lines.push(`Notes: ${payload.order.notes}\n`);
  }
  lines.push('\n\n\n');
  lines.push('\x1DVA0');
  return lines.join('');
};

const sendToPrinter = (ip: string, port: number, data: string) =>
  new Promise<void>((resolve, reject) => {
    const client = new net.Socket();
    const timeout = 10000; // 10 second timeout
    
    client.setTimeout(timeout);
    client.connect(port, ip, () => {
      client.write(data, 'utf8', () => {
        client.end();
        resolve();
      });
    });
    
    client.on('error', (error) => {
      client.destroy();
      reject(error);
    });
    
    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Print timeout'));
    });
  });

// SECURE: Print endpoint with API key auth + whitelist
app.post('/print', requireApiKey, async (req, res) => {
  try {
    const payload = req.body as PrintPayload;
    
    // Validate required fields
    if (!payload?.printer_name || !payload?.order?.order_number) {
      res.status(400).json({ 
        success: false, 
        error: 'Missing printer_name or order_number' 
      });
      return;
    }

    // SECURITY: Lookup printer from whitelist ONLY - reject arbitrary IP/port
    const printer = PRINTER_WHITELIST.find(p => p.name === payload.printer_name);
    if (!printer) {
      console.warn(`Rejected print request for unknown printer: ${payload.printer_name}`);
      res.status(403).json({ 
        success: false, 
        error: `Printer '${payload.printer_name}' not in whitelist` 
      });
      return;
    }

    // Build print content
    const content = (payload.type === 'receipt' || payload.type === 'counter')
      ? buildReceiptTicket(payload)
      : buildKitchenTicket(payload);

    // Send to whitelisted printer only
    await sendToPrinter(printer.host, printer.port, content);

    console.log(`Print sent to ${payload.printer_name} (${printer.host}:${printer.port}) for order ${payload.order.order_number}`);

    res.json({
      success: true,
      message: 'Print job sent',
      printer: payload.printer_name,
    });
  } catch (error) {
    console.error('Print job failed:', error);
    res.status(500).json({
      success: false,
      error: 'Print job failed',
    });
  }
});

// Bind to 0.0.0.0 for Docker, but should be firewalled at network level
// In production VPS, bind to 127.0.0.1 only
const HOST = process.env.BIND_HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Print proxy running on ${HOST}:${PORT}`);
  console.log(`API key configured: ${PRINT_API_KEY ? 'YES' : 'NO - INSECURE!'}`);
  console.log(`Printers whitelisted: ${PRINTER_WHITELIST.length}`);
  if (PRINTER_WHITELIST.length === 0) {
    console.warn('⚠️  No printers configured in PRINTERS_JSON - printing disabled');
  }
});
