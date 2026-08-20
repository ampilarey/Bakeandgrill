# AGENTS.md

Cursor Cloud environment and tooling notes for this repository. Project rules and
conventions are in `CLAUDE.md` and `.cursor/rules/` — do not add policy here.

## Services & how they run (dev)

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

## Database connection on this VM

This VM is configured for **MariaDB** (reported as the `mysql` driver). In
`backend/.env`: `DB_CONNECTION=mysql`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`,
`DB_DATABASE=bakegrill`, `DB_USERNAME=bakegrill`, `DB_PASSWORD=secret`. Why local
dev must not use PostgreSQL is documented in `CLAUDE.md`.

## Starting stateful services on a fresh boot

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

## Seeded demo data (local/dev only)

`php artisan migrate --seed` (or `migrate:fresh --seed`) creates demo staff logins
(skipped when `APP_ENV=production`). Log in at the admin dashboard with identifier
`owner@bakegrill.local`, password `password` (password mode) or PIN `1111`
(PIN mode). Manager PIN `3333`, Staff PIN `4444`. The seeder also imports ~58 menu
items.

## Lint / test / build (Cloud Agent)

Standard commands also live in `README.md`, `backend/README.md`,
`backend/composer.json` scripts, and each app's `package.json`.

- Dhivehi WOFF2 inspector: `bash scripts/install-fonttools.sh` (Python `fontTools` + `brotli`). Required for Content Hub WOFF/WOFF2 uploads and the font PHPUnit tests.
- Backend tests: `php artisan test` (full, SQLite) or `composer test:readiness`
  (fast curated subset). Backend lint/format: `./vendor/bin/pint` (use `--test`
  to check without writing). Note: `pint --test` currently reports pre-existing
  style diffs in some test files — that is repo state, not an env problem.
- Admin dashboard: `npm run test` (vitest), `npm run lint` (eslint + a custom
  hex-in-CSS baseline check). ESLint passes; the hex-in-CSS check reports
  pre-existing baseline diffs in `src/index.css`.
