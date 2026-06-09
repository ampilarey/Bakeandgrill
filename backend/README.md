# Bake & Grill — Café OS Backend

Laravel 11 API + Blade public site for **Bake & Grill** (Maldives). Powers POS, KDS, online ordering, admin dashboard, payments (BML Connect, Stripe), credit/deposit accounts, inventory, and CMS site settings.

## Stack

| Layer | Tech |
|-------|------|
| Framework | Laravel 11, PHP 8.2 |
| Auth | Sanctum (staff PIN + customer OTP) |
| DB | MySQL (prod/test), SQLite (PHPUnit) |
| Queue | Redis (`queue:work redis`) |
| Realtime | SSE streams for POS/KDS |

## Apps in monorepo

| Path | Role |
|------|------|
| `apps/admin-dashboard/` | React admin UI → built to `public/admin/` |
| `apps/pos-web/` | React POS → `public/pos/` |
| `apps/online-order-web/` | Customer ordering app |
| `apps/shared/` | Shared TypeScript types |

## Local development

```bash
cd backend
composer install
cp .env.example .env   # configure DB, Redis, BML keys
php artisan key:generate
php artisan migrate
php artisan serve
```

## Tests

```bash
cd backend
php artisan test                    # full suite
composer test:readiness             # production-readiness filter
UPDATE_SNAPSHOTS=true php artisan test --filter=ContractTest
```

## Deploy (test server default)

See repo root `.cursor/rules/deploy-commands.mdc`. Test path: `test.bakeandgrill.mv`.

```bash
# Quick pull (UI / small PHP, no new migrations)
cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main \
  && cd backend && php artisan config:cache && php artisan route:cache \
  && php artisan view:clear && php artisan queue:restart
```

## Key routes layout

- `routes/api.php` — main API (loads domain fragments)
- `routes/domains/orders.php` — staff order lifecycle, refunds, receipts
- `routes/domains/payments.php` — BML, Stripe, partial/zero-balance pay
- `routes/domains/admin_customers.php` — CRM, credit, deposit
- `routes/domains/finance.php` — invoices, expenses, reports, purchases

## Documentation

- `docs/PRODUCTION_READINESS.md` — readiness checklist
- `docs/MODULARIZATION_AUDIT.md` — hybrid modular monolith status
- `docs/PRODUCTION_BLOCKERS_FINISH_REPORT.md` — latest blocker pass report
