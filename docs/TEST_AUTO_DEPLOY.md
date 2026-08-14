# TEST Auto-Deploy

`test.bakeandgrill.mv` pulls `main` automatically. Production is never auto-deployed.

## Fast path (default)

On every push to `main`, workflow **Deploy TEST (immediate)** runs right away
(`.github/workflows/deploy-test-immediate.yml`):

1. Does **not** wait for PHPUnit / frontend / full CI
2. `POST https://test.bakeandgrill.mv/api/deploy/test-pull` with the commit SHA
3. Server runs `scripts/pull-deploy-test.sh` in the background

Typical delay: runner pickup + ~20–40s pull (usually under a minute after the push).

Full CI still runs in parallel for quality. Cron is only a fallback if the webhook fails.

## One-time setup

**1. TEST server secret**

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv
SECRET=$(openssl rand -hex 32)
sed -i '/^TEST_DEPLOY_WEBHOOK_SECRET=/d' backend/.env
echo "TEST_DEPLOY_WEBHOOK_SECRET=${SECRET}" >> backend/.env
cd backend && php artisan config:cache
echo "$SECRET"
```

**2. GitHub** → Settings → Environments → **test** → secret  
`TEST_DEPLOY_WEBHOOK_SECRET` = same value

**3. Cron fallback (recommended)**

```bash
bash /home/bakeandgrill/test.bakeandgrill.mv/scripts/install-self-update-cron-test.sh
```

## After a push to `main`

1. Open Actions → **Deploy TEST (immediate)** — should go green within ~1 minute
2. Refresh https://test.bakeandgrill.mv/
3. Optional: `tail -f ~/self-update-test.log` on the server

## Clone LIVE data → TEST (catalog, CMS, photos)

When you want real menu photos and live content on TEST for QA:

```bash
CONFIRM=1 bash /home/bakeandgrill/test.bakeandgrill.mv/scripts/clone-live-to-test.sh
```

- Copies LIVE MySQL → TEST MySQL (after a TEST safety dump under `~/backups/`)
- `rsync`s `backend/storage/app/public/` (item/CMS images)
- Does **not** overwrite TEST `.env` or code
- Flags: `--db-only`, `--media-only`, `--keep-test-media`, `--no-backup`

See script header: `scripts/clone-live-to-test.sh`.

## Disable webhook

Remove `TEST_DEPLOY_WEBHOOK_SECRET` from TEST `.env` and the GitHub `test` environment, then `php artisan config:cache` on the server.

## Disable cron

```bash
crontab -l | grep -v 'self-update-test.sh' | crontab -
```
