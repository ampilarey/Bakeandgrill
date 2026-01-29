import express from 'express';
import net from 'net';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'http://localhost:8000';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'Print Proxy',
  });
});

type PrintPayload = {
  printer: {
    ip_address: string;
    port: number;
    name: string;
    type: string;
    station?: string | null;
  };
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
};

const buildKitchenTicket = (payload: PrintPayload) => {
  const lines: string[] = [];
  lines.push('\x1B@\n');
  lines.push('BAKE & GRILL\n');
  lines.push(`${payload.printer.type.toUpperCase()} TICKET\n`);
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
  lines.push('\x1DVA0');
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
  });

app.post('/print', async (req, res) => {
  try {
    const payload = req.body as PrintPayload;
    if (!payload?.printer?.ip_address || !payload?.order?.order_number) {
      res.status(400).json({ success: false, error: 'Invalid print payload' });
      return;
    }

    const content =
      payload.printer.type === 'receipt' || payload.printer.type === 'counter'
        ? buildReceiptTicket(payload)
        : buildKitchenTicket(payload);
    const port = payload.printer.port || 9100;
    await sendToPrinter(payload.printer.ip_address, port, content);

    res.json({
      success: true,
      message: 'Print job sent',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Print job failed',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Print proxy running on port ${PORT}`);
  console.log(`API URL: ${API_URL}`);
});
