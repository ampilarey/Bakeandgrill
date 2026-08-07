# TEST Auto-Deploy

`test.bakeandgrill.mv` deploys `main` automatically. Production is never auto-deployed.

## Immediate path (preferred)

After CI is green on a push to `main`, GitHub Actions calls:

`POST https://test.bakeandgrill.mv/api/deploy/test-pull`

That starts `scripts/pull-deploy-test.sh` in the background (no 1-minute wait).

### One-time setup

**1. On the TEST server** (cPanel Terminal), pull this code and set a secret:

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main
SECRET=$(openssl rand -hex 32)
echo "TEST_DEPLOY_WEBHOOK_SECRET=${SECRET}" >> backend/.env
cd backend && php artisan config:cache
echo "Save this secret for GitHub: ${SECRET}"
```

**2. In GitHub** → repo **Settings → Environments → `test`** → add secret:

| Name | Value |
|---|---|
| `TEST_DEPLOY_WEBHOOK_SECRET` | same value as in TEST `.env` |

**3. Keep cron as fallback** (still recommended):

```bash
bash /home/bakeandgrill/test.bakeandgrill.mv/scripts/install-self-update-cron-test.sh
```

### Verify

```bash
# Should return 202
curl -sS -X POST "https://test.bakeandgrill.mv/api/deploy/test-pull" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sha":"'"$(git -C /home/bakeandgrill/test.bakeandgrill.mv rev-parse HEAD)"'"}'

tail -f ~/self-update-test.log
```

## Cron fallback (~1 minute)

If the webhook secret is missing or the HTTP trigger fails, `scripts/self-update-test.sh` still runs every minute, waits for GitHub Actions check-runs to be green, then deploys.

| Item | Value |
|---|---|
| App root | `/home/bakeandgrill/test.bakeandgrill.mv` |
| Immediate script | `scripts/pull-deploy-test.sh` |
| Cron script | `scripts/self-update-test.sh` |
| Installer | `scripts/install-self-update-cron-test.sh` |
| Log | `~/self-update-test.log` |

## After a merge to `main`

1. GitHub Actions must finish green (`frontend`, `test`, `test-postgres`, `contract`)
2. Deploy job hits the webhook → TEST pulls that SHA immediately
3. If webhook/SSH unavailable → cron picks it up within ~1 minute after checks are green

## Disable webhook

Remove `TEST_DEPLOY_WEBHOOK_SECRET` from TEST `.env` and from the GitHub `test` environment, then `php artisan config:cache` on the server. Endpoint returns 404 when unset.

## Disable cron

```bash
crontab -l | grep -v 'self-update-test.sh' | crontab -
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Actions notice: secret not set | Add `TEST_DEPLOY_WEBHOOK_SECRET` to GitHub env `test` |
| Webhook HTTP 404 | Secret missing/short on server, or host is not `test.bakeandgrill.mv` — run `config:cache` |
| Webhook HTTP 401 | GitHub secret ≠ server `.env` value |
| Webhook HTTP 503 | `proc_open` blocked — cron fallback still works; ask host to allow process spawn |
| Cron `CI still running` | Normal while Actions is in progress |
| `fast-forward failed` | Dirty/diverged tree on server — `git status` and fix |

## Why not “pull on merge before CI”?

Deploying red builds to TEST wastes time and can break UAT. Immediate deploy runs only from the Actions deploy job after required checks pass.
