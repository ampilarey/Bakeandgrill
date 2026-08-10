# AGENTS.md

Status: **Operational agent guide (rescued).** Cross-check against `CLAUDE.md` and `.cursor/rules` if instructions conflict — prefer repo rules and `CLAUDE.md` when they disagree.

> Rescued from branch `cursor/setup-dev-environment-4700` (not written fresh on this branch).

---

Operating notes for agents working in this repo. See also `CLAUDE.md` and the
rules under `.cursor/rules/` for architecture, admin panel, CMS, and deploy details.

## Cursor Cloud specific instructions

This section captures durable, non-obvious context for running the Bake & Grill
café OS in the Cloud Agent VM. Standard commands live in `README.md`,
`backend/README.md`, `backend/composer.json` scripts, and each app's
`package.json`; prefer those and only rely on the caveats below.

### Services & how they run (dev)

- **Backend API + Blade site** (`backend/`, Laravel 12 / PHP 8.4): run
  `php artisan serve --host=0.0.0.0 --port=8000` from `backend/`. Health check:
  `GET http://localhost:8000/api/health` → `{"status":"ok"}`. Everything else
  depends on this being up on port `8000`.
- **Admin dashboard** (`apps/admin-dashboard/`, React/Vite): `npm run dev` →
  http://localhost:3004/admin/ (note the `/admin/` base path). Vite proxies
  `/api` and `/sanctum` to `:8000`.
- Other frontends (dev servers, all proxy/point to the `:8000` API):
  `apps/online-order-web` (`:3003`), `apps/pos-web` (`:3001`),
  `apps/kds-web` (`:3002`), `apps/delivery-web` (`:3004`). Delivery and admin
  both default to `:3004` — run only one at a time or override `--port`.
- Root `npm run dev` fans out to every app's dev server (npm workspaces).

### Database: use MySQL/MariaDB locally, NOT PostgreSQL

Although `README.md`, `docker-compose.yml`, and `backend/.env.example` default to
`DB_CONNECTION=pgsql`, a **fresh `php artisan migrate` fails on PostgreSQL**:
migration `2026_07_22_150000_add_scope_to_site_settings` uses a `HAVING` clause on
a SELECT alias (`having "c" > 1`), which MySQL/MariaDB and SQLite accept but
PostgreSQL rejects (`column "c" does not exist`). The migrations already branch on
`mysql`/`mariadb` vs `pgsql` drivers, and `.env.example` documents MySQL as a
supported local option, so this VM is configured for **MariaDB** (reported as the
`mysql` driver). In `backend/.env`: `DB_CONNECTION=mysql`, `DB_HOST=127.0.0.1`,
`DB_PORT=3306`, `DB_DATABASE=bakegrill`, `DB_USERNAME=bakegrill`,
`DB_PASSWORD=secret`. Do not switch dev to `pgsql` without first fixing that
migration. (Automated tests are unaffected — `phpunit.xml` forces SQLite in-memory.)

### Starting stateful services on a fresh boot

The VM snapshot has PHP 8.4, Composer, MariaDB, and Redis installed, but system
services may not auto-start after a reboot. If the backend cannot connect, start
them first:

```bash
sudo service mariadb start
sudo service redis-server start
```

Redis is configured over TCP (`REDIS_SCHEME=tcp`, `REDIS_HOST=127.0.0.1`,
`REDIS_PORT=6379`) — the committed `.env.example` uses a unix socket path that
does not exist here. `backend/.env` (gitignored) already has the working values;
if `.env` is missing, recreate it from `.env.example` and re-apply the MySQL +
Redis-TCP + local-session changes, then `php artisan key:generate`.

### Seeded demo data (local/dev only)

`php artisan migrate --seed` (or `migrate:fresh --seed`) creates demo staff logins
(skipped when `APP_ENV=production`). Log in at the admin dashboard with identifier
`owner@bakegrill.local`, password `password` (password mode) or PIN `1111`
(PIN mode). Manager PIN `3333`, Staff PIN `4444`. The seeder also imports ~58 menu
items.

### Lint / test / build

- Backend tests: `php artisan test` (full, SQLite) or `composer test:readiness`
  (fast curated subset). Backend lint/format: `./vendor/bin/pint` (use `--test`
  to check without writing). Note: `pint --test` currently reports pre-existing
  style diffs in some test files — that is repo state, not an env problem.
- Admin dashboard: `npm run test` (vitest), `npm run lint` (eslint + a custom
  hex-in-CSS baseline check). ESLint passes; the hex-in-CSS check reports
  pre-existing baseline diffs in `src/index.css`.
- Queue worker (`php artisan queue:work redis`) is only needed for async
  listeners (loyalty, inventory, outgoing webhooks, campaign SMS); payment/order
  SMS send synchronously.
