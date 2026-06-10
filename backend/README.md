# Bake & Grill — Café OS Backend

Laravel 11 API + Blade public site for **Bake & Grill** (Maldives). Powers POS, KDS, online ordering, admin dashboard, payments (BML Connect, Stripe), credit/deposit accounts, inventory, and CMS site settings.

## Stack

| Layer | Tech |
|-------|------|
| Framework | Laravel 11, PHP 8.2 |
| Auth | Sanctum (staff PIN + customer OTP) |
| DB | PostgreSQL 15 (prod/test), SQLite (PHPUnit default) |
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

PHPUnit defaults to **SQLite in-memory** (`phpunit.xml`) for fast local runs. Production uses **PostgreSQL 15**; CI runs the full Feature + Contract suites against both engines.

```bash
cd backend
php artisan test                    # full suite (SQLite)
composer test:readiness             # production-readiness filter
UPDATE_SNAPSHOTS=true php artisan test --filter=ContractTest
```

**PostgreSQL locally** (Docker example):

```bash
docker run -d --name bakegrill-pg -e POSTGRES_DB=bakegrill_test \
  -e POSTGRES_USER=bakegrill -e POSTGRES_PASSWORD=secret -p 5432:5432 postgres:15-alpine

cd backend
DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT=5432 \
  DB_DATABASE=bakegrill_test DB_USERNAME=bakegrill DB_PASSWORD=secret \
  php artisan test --testsuite=Feature
```

GitHub Actions job `test-postgres` mirrors this against `postgres:15-alpine`.

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
