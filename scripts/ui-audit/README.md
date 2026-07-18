# Order app UI audit toolkit

Lightweight probes used after the online-order redesign.

## Commands

```bash
# Must print: data-theme: dark
node scripts/ui-audit/probe-dark-init.mjs

# Asserts MenuPage product grids use minmax(130px) (≥2 cols at 390px)
node scripts/ui-audit/screenshot-sweep.mjs

# Optional live screenshot (requires playwright + running order app)
ORDER_AUDIT_URL=http://localhost:3003/order node scripts/ui-audit/screenshot-sweep.mjs
```
