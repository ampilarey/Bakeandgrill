# CLAUDE.md

Project notes for agents and developers working in this repo.

Cursor Cloud VM setup, ports, and local service commands live in `AGENTS.md` (environment
only). Project rules and conventions live here and under `.cursor/rules/`.

## After every merge to `main`: give the owner the live deploy command

TEST deploys itself — GitHub Actions calls `POST /api/deploy/test-pull` once CI is
green, with a cron fallback. **Production never does.** `TestDeployWebhookController`
refuses any host that is not TEST, so nothing reaches the live site until somebody
runs the deploy by hand on the server.

So a merge is not a release. Whenever you fast-forward `main`, end the reply with the
command to run on the production box:

```bash
cd /home/bakeandgrill/public_html && ./scripts/full-deploy.sh production
```

That one script is the whole deploy: `git pull`, `composer install --no-dev`,
`app:verify-production-config`, `migrate --force`, `storage:link`, `config:cache`,
`route:cache`, `view:clear`, `queue:restart`, queue-worker keepalive, deploy stamp,
and `post-deploy-smoke.sh production`. There is nothing to run before or after it.

Call out anything in the merge that changes what the deploy has to do — a migration,
a new `.env` key, a rebuilt SPA bundle, a new system dependency — since those are the
cases where a half-done deploy leaves the site broken rather than merely stale.

## Admin colour tokens

When writing or editing admin dashboard page styles (`apps/admin-dashboard/src/pages/**`),
prefer CSS variables over hardcoded hex in `style={{…}}` objects. ESLint warns on new
hex literals in those objects (existing ones are baselined — see
`apps/admin-dashboard/eslint-baselines/no-hex-in-inline-style.json`).

Canonical mappings from `docs/ADMIN_THEMING_MOBILE_PLAN.md` §1.4 (case-insensitive):

| Hex | CSS variable |
|---|---|
| `#6b5d4f` | `var(--color-text-secondary)` |
| `#9c8e7e` | `var(--color-text-muted)` |
| `#e8e0d8` | `var(--color-border)` |
| `#d4813a` | `var(--color-primary)` |
| `#1c1408` | `var(--color-text)` |
| `#ef4444` | `var(--color-danger)` |
| `#f8f6f3` | `var(--color-bg)` |
| `#22c55e` | `var(--color-success)` |
| `#f59e0b` | `var(--color-warning)` |
| `#f0ebe5` | `var(--color-border-light)` |

These variables are defined on `:root` in `apps/admin-dashboard/src/index.css` and
already flip correctly under `[data-theme="dark"]`. Do not invent parallel hex
literals for the same roles.

To regenerate the hex-in-style baseline after migrating a page:

```bash
cd apps/admin-dashboard && node scripts/generate-hex-style-baseline.mjs
```

## Local database: MySQL/MariaDB preferred

Although `README.md` / `docker-compose.yml` may mention `pgsql`, local/dev on this
project uses **MySQL/MariaDB** (see `AGENTS.md`). CI also runs a PostgreSQL
compatibility suite; site_settings migrations collapse duplicates with
`havingRaw('COUNT(*) > 1')` so PostgreSQL accepts them (aliases in `HAVING` are
rejected). Automated default tests use SQLite in-memory via `phpunit.xml`.

## Dhivehi webfont inspector

Content Hub `dhivehi_font` accepts TTF/OTF natively. WOFF/WOFF2 inspection and
TTF→WOFF2 conversion need Python `fontTools` + `brotli` (`scripts/install-fonttools.sh`).
That pair is a deploy dependency (CI, TEST, production). The CSS override route
`GET /css/dhivehi-font.css` is registered outside the `web` group so it stays
cookie-less.

## TEST and production share one Redis

The Redis socket is per cPanel *account* (`REDIS_PATH=/home/bakeandgrill/.redis/redis.sock`),
so both sites talk to the same server. Nothing separates them by default —
`REDIS_PREFIX` and `CACHE_PREFIX` both fall back to a slug of `APP_NAME`, which is
the same `"Bake & Grill"` on both, and `REDIS_DB`/`REDIS_CACHE_DB` default to 0 and 1.

Left at the defaults the two environments share a **queue**, and whichever worker
pops a job runs it against its *own* database and credentials — so a TEST
campaign-SMS job can be executed by the production worker and delivered to real
customers. They also share a **cache**, and `cache:clear` on either site wipes both:
`RedisStore::flush()` is a `FLUSHDB`, which ignores prefixes.

Production keeps the defaults. TEST sets all four explicitly (fixed 2026-08-23):

```
REDIS_DB=2
REDIS_CACHE_DB=3
REDIS_PREFIX=bg-test-database-
CACHE_PREFIX=bg-test-cache-
```

Any third environment on this account needs its own set. Separate prefixes isolate
the keys; separate databases are what make a `cache:clear` on one site harmless to
the other. `app:verify-production-config` cannot catch this — it only sees one
environment — so it is a convention, not an enforced check.

## Queue worker vs synchronous SMS

The queue worker (`php artisan queue:work redis`) is only needed for async listeners
(loyalty, inventory, outgoing webhooks, campaign SMS). Payment/order SMS send
synchronously.
