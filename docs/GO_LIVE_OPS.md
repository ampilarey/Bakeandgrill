# Go-Live Operations Checklist

Quick reference for deploying Bake & Grill to production (`bakeandgrill.mv`).

## Required production env

Run `php artisan app:verify-production-config` after every production deploy (also wired into CI). It exits non-zero when fatal misconfigurations are detected.

| Variable | Production value | Notes |
|----------|------------------|-------|
| `APP_ENV` | `production` | |
| `APP_DEBUG` | `false` | Must never be `true` on live |
| `APP_KEY` | *(set)* | `php artisan key:generate` if missing |
| `APP_URL` | `https://bakeandgrill.mv` | |
| `SESSION_DOMAIN` | `.bakeandgrill.mv` | |
| `SANCTUM_STATEFUL_DOMAINS` | `bakeandgrill.mv,app.bakeandgrill.mv` | Remove test domain on prod |
| `TRUSTED_PROXIES` | Explicit IPs/CIDRs | **Never `*`** — OTP/login throttles use client IP |
| `SENTRY_LARAVEL_DSN` | Backend Sentry DSN | Error monitoring |
| `VITE_SENTRY_DSN` | Per-app DSN | **Build-time** — rebuild admin/pos/order after setting |
| `BACKUP_DISKS` | `s3` (recommended) | Plus `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET`, `AWS_DEFAULT_REGION` |
| `HEALTHCHECK_URL` | Healthchecks.io ping URL | Scheduler heartbeat (warn-only if unset) |
| `ADMIN_TOKEN_TTL_HOURS` | `24` (default) | Admin dashboard Sanctum token lifetime |
| `QUEUE_CONNECTION` | `redis` | |
| `CACHE_STORE` | `redis` | |
| `BML_ENFORCE_SIGNATURE` | `true` | |

See `backend/.env.example` for the full list.

## Queue worker

Each install needs its own worker:

```bash
cd /home/bakeandgrill/public_html/backend
nohup php artisan queue:work redis --sleep=3 --tries=3 --max-time=3600 >> storage/logs/queue-worker.log 2>&1 &
```

Verify:

```bash
pgrep -af "artisan queue:work"
```

Crontab keepalive (one line per env) — see `.cursor/rules/deploy-commands.mdc`.

## Deploy

Manual production deploy is **workflow_dispatch only** in CI. After deploy:

1. `./scripts/post-deploy-smoke.sh production` (or `test`)
2. Smoke-test POS, admin login, online checkout in browser
3. Confirm queue worker is running (`pgrep -af "artisan queue:work"`)

Root `index.php` + `.htaccess` in the repo bootstrap Laravel from cPanel `public_html` without changing the document root. SPA assets live under `backend/public/{admin,order,pos,kds,driver}/` and are served via rewrite rules.

Quick pull on the server:

```bash
./scripts/uat-quick-pull.sh test
# or
./scripts/uat-quick-pull.sh production
```

## Security headers

CSP is configured in the web server / Laravel middleware stack. After go-live, verify with browser devtools that scripts load from expected origins only.

## Sanctum tokens

Staff PIN login issues tokens with the `staff` ability; customer OTP uses `customer`. Never mix token types across apps. Optional: set `SANCTUM_EXPIRATION` (minutes) to rotate long-lived staff tokens.
