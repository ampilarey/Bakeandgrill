#!/usr/bin/env node
/**
 * Minimal mock API for order-app screenshot sweeps (port 8000).
 * Serves enough menu endpoints for MenuPage to render product cards.
 */
import http from 'node:http';

const categories = {
  data: [
    { id: 1, name: 'Grill', slug: 'grill', sort_order: 1, is_active: true },
    { id: 2, name: 'Bakery', slug: 'bakery', sort_order: 2, is_active: true },
  ],
};

const items = {
  data: Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    name: `Item ${i + 1}`,
    slug: `item-${i + 1}`,
    description: 'Mock menu item for layout audit',
    base_price: 45 + i,
    category_id: (i % 2) + 1,
    is_available: true,
    is_active: true,
    available_now: true,
    image_url: null,
    has_variants: false,
    variants: [],
    modifiers: [],
  })),
};

const orderingStatus = {
  open: true,
  message: '',
  reason: null,
  master_switch: true,
  override_active: false,
  override_until: null,
  schedule_active: true,
  current_close: new Date(Date.now() + 4 * 3600_000).toISOString(),
  next_open_window: null,
  delivery_available: true,
  next_delivery_window: null,
};

const routes = {
  '/api/health': { ok: true },
  '/api/categories': categories,
  '/api/items': items,
  '/api/specials': { specials: [] },
  '/api/ordering/status': orderingStatus,
  '/api/site-settings/public': { data: {} },
  '/sanctum/csrf-cookie': null,
};

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path in routes) {
    if (path === '/sanctum/csrf-cookie') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Set-Cookie': 'XSRF-TOKEN=mock; Path=/; SameSite=Lax',
      });
      res.end();
      return;
    }
    const body = JSON.stringify(routes[path]);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true',
    });
    res.end(body);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'not found', path }));
});

server.listen(8000, '127.0.0.1', () => {
  console.log('mock-api listening on http://127.0.0.1:8000');
});
