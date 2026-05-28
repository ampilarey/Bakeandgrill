# Go-Live Operations Checklist

Quick reference for deploying Bake & Grill to production (`bakeandgrill.mv`).

## Environment (`.env`)

| Variable | Production value |
|----------|------------------|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_URL` | `https://bakeandgrill.mv` |
| `SESSION_DOMAIN` | `.bakeandgrill.mv` |
| `SANCTUM_STATEFUL_DOMAINS` | `bakeandgrill.mv,app.bakeandgrill.mv` (remove test domain) |
| `TRUSTED_PROXIES` | `*` or your proxy IP/CIDR |
| `BML_ENFORCE_SIGNATURE` | `true` |
| `QUEUE_CONNECTION` | `redis` |

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

1. `curl https://bakeandgrill.mv/api/health`
2. Smoke-test POS, admin login, online checkout
3. Confirm queue worker is running

## Security headers

CSP is configured in the web server / Laravel middleware stack. After go-live, verify with browser devtools that scripts load from expected origins only.

## Sanctum tokens

Staff PIN login issues tokens with the `staff` ability; customer OTP uses `customer`. Never mix token types across apps. Optional: set `SANCTUM_EXPIRATION` (minutes) to rotate long-lived staff tokens.
