# Order app UI audit toolkit

Lightweight probes used after the online-order redesign.

## Commands

```bash
# Must print: data-theme: dark
node scripts/ui-audit/probe-dark-init.mjs

# Asserts MenuPage product grids use .menu-grid (2 cols via repeat(2,1fr) below 768px)
node scripts/ui-audit/screenshot-sweep.mjs

# Optional live screenshot + column assert (requires playwright + running order app)
# Start mock API + vite first:
#   node scripts/ui-audit/mock-api.mjs &
#   cd apps/online-order-web && npx vite --port 3003
ORDER_AUDIT_URL=http://localhost:3003/order node scripts/ui-audit/screenshot-sweep.mjs
```

Live mode writes `scripts/ui-audit/out/menu-390.png` and `menu-320.png`, and fails if either viewport shows fewer than 2 product columns or horizontal scroll.
