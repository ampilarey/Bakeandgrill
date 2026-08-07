# TEST Auto-Deploy (cPanel cron)

`test.bakeandgrill.mv` can pull and deploy `main` automatically — no inbound SSH and no GitHub webhook required.

## How it works

Every minute, cron runs `scripts/self-update-test.sh`, which:

1. `git fetch origin main`
2. Exits quietly if the server is already on that commit
3. Asks the GitHub API whether that commit’s Actions checks are **all green**
4. Only then fast-forwards and runs Laravel deploy steps (`composer` if lock changed, migrate, caches, `queue:restart`)

Red or still-running CI never deploys. Production (`public_html`) is **not** touched.

| Item | Value |
|---|---|
| App root | `/home/bakeandgrill/test.bakeandgrill.mv` |
| Script | `scripts/self-update-test.sh` |
| Installer | `scripts/install-self-update-cron-test.sh` |
| Log | `~/self-update-test.log` |
| Schedule | every 1 minute |

## One-time enable (cPanel Terminal)

After the scripts exist on the test server (pull once if needed):

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv \
  && git pull origin main \
  && bash scripts/install-self-update-cron-test.sh
```

Confirm:

```bash
crontab -l | grep self-update-test
tail -f ~/self-update-test.log
```

You should see either silence (already current / waiting on CI) or lines like `deploying …` / `deploy complete: …`.

## After a push to `main`

1. GitHub Actions must finish green
2. Within about a minute after that, test auto-pulls and deploys
3. Optional: `tail -f ~/self-update-test.log` to watch it

Manual override (same as before) still works if you need an immediate pull without waiting for cron:

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main && cd backend && php artisan config:cache && php artisan route:cache && php artisan view:clear && php artisan queue:restart && git log -1 --oneline
```

## Disable

```bash
crontab -l | grep -v 'self-update-test.sh' | crontab -
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Cron missing | Re-run `bash scripts/install-self-update-cron-test.sh` |
| `php` / `composer` not found in log | PATH is set in the script for ea-php84; adjust `PATH=` in `self-update-test.sh` if the host uses a different PHP |
| `CI still running — holding` | Wait for Actions to finish |
| `CI not green — holding` | Fix the failing workflow, then wait for the next green tip of `main` |
| `fast-forward failed` | Working tree dirty or diverged — fix on server (`git status`), then re-run |
| No log lines | Cron may not be running; check cPanel → Cron Jobs, or that the account allows crontab |

## Why not a GitHub webhook?

SSH to the box from Actions is not available (port 22 closed). A public webhook that shells out is harder to harden on cPanel and would risk deploying before CI is green. Minute cron + check-runs gating matches this host’s constraints.
