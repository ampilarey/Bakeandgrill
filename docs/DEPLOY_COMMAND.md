# Server Deploy Command

## Where the two sites actually live

Both are on `sg-s2`, under the `bakeandgrill` user. Verified 2026-08-21.

| | Project root | Backend |
|---|---|---|
| **TEST** — test.bakeandgrill.mv | `/home/bakeandgrill/test.bakeandgrill.mv` | `…/backend` |
| **PRODUCTION** — bakeandgrill.mv | `/home/bakeandgrill/public_html` | `…/backend` |

Production is the cPanel document root, **not** `/home/bakeandgrill/bakeandgrill.mv`.
That path appears in `docs/archive/MAIN_PRODUCTION_LAUNCH_TODO.md` and was never
created — commands copied from there fail with "No such file or directory", or
worse, silently run against whatever directory you happened to be in. Check the
prompt before running anything destructive.

---

## TEST auto-deploy (preferred)

Once enabled, `test.bakeandgrill.mv` pulls `main` **immediately** after GitHub Actions is green (webhook), with a 1-minute cron fallback.

See [TEST_AUTO_DEPLOY.md](./TEST_AUTO_DEPLOY.md) for the one-time secret + cron setup.

Dhivehi WOFF2 uploads need Python `fontTools` + `brotli` once per install:

```bash
bash /home/bakeandgrill/test.bakeandgrill.mv/scripts/install-fonttools.sh
```

---

## Manual TEST deploy

Run this on the server whenever you want to pull immediately (bypass cron).

### Full Deploy (use this after any update)

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main && cd backend && composer install --no-dev --optimize-autoloader && php artisan migrate --force && php artisan config:cache && php artisan route:cache && php artisan view:clear && php artisan queue:restart
```

---

## PRODUCTION deploy

No auto-deploy — production is pulled by hand, deliberately.

```bash
cd /home/bakeandgrill/public_html && git pull origin main && cd backend && composer install --no-dev --optimize-autoloader && php artisan migrate --force && php artisan config:cache && php artisan route:cache && php artisan view:clear && php artisan queue:restart
```

Before you run it:

- **Deploy to TEST first** and confirm the thing you changed actually works there.
- **Out of service hours.** `config:cache` and `queue:restart` interrupt in-flight work,
  and a failed migration mid-lunch is a stopped counter.
- **Check what you are about to ship:** `git log --oneline HEAD..origin/main`

Confirm afterwards:

```bash
cd /home/bakeandgrill/public_html/backend
git log --oneline -1
php artisan migrate:status | tail -5
```

---

## One-time setup per install

**Dhivehi WOFF2 uploads** need Python `fontTools` + `brotli`. Installed with
`pip --user` under `bakeandgrill`, so `~/.local` is shared by both sites — doing
it once covers TEST and production. Idempotent, safe to re-run:

```bash
bash /home/bakeandgrill/test.bakeandgrill.mv/scripts/install-fonttools.sh
```

Verify (after the font feature is deployed to that site):

```bash
php artisan tinker --execute="echo App\Domains\Content\DhivehiFont::canInspectCompressedFonts() ? 'OK' : 'MISSING', PHP_EOL;"
```

Without it, WOFF2 uploads are refused with "this server cannot inspect WOFF2"
and TTF uploads are stored uncompressed instead of converted.

**Scheduled tasks and the queue worker** must point at the right directory. A
wrong path here fails silently — cron reports nothing, and every scheduled job
simply never runs (`insights:compute-item-pairs`, stale-order cancellation,
loyalty expiry, reorder alerts, scheduled SMS). Check what is installed:

```bash
crontab -l | grep -E "schedule:run|queue:work"
```

Every path in the output must be a directory that exists. Production is
`/home/bakeandgrill/public_html/backend`.

---

## What each step does

| Command | Purpose |
|---|---|
| `cd /home/bakeandgrill/test.bakeandgrill.mv` | Navigate to the project root on the server |
| `git pull origin main` | Pull the latest code from GitHub |
| `cd backend` | Enter the Laravel backend folder |
| `composer install --no-dev --optimize-autoloader` | Install/update PHP dependencies |
| `php artisan migrate --force` | Run any new database migrations |
| `php artisan config:cache` | Cache the config files for performance |
| `php artisan route:cache` | Cache routes for performance |
| `php artisan view:clear` | Clear compiled Blade views |

---

## Quick Pull (no new migrations or dependencies)

If the update is frontend/small fixes only:

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main && cd backend && php artisan config:cache && php artisan route:cache && php artisan view:clear
```

---

## Server Details

| Field | Value |
|---|---|
| Server | `sg-s2` |
| User | `bakeandgrill` |
| TEST project root | `/home/bakeandgrill/test.bakeandgrill.mv` |
| TEST backend | `/home/bakeandgrill/test.bakeandgrill.mv/backend` |
| PRODUCTION project root | `/home/bakeandgrill/public_html` |
| PRODUCTION backend | `/home/bakeandgrill/public_html/backend` |
| GitHub repo | `https://github.com/ampilarey/Bakeandgrill` |
| Branch | `main` |

---

## Common Errors

**`fatal: not a git repository`**  
You are in the wrong directory. `cd` to the project root for the site you mean —
`/home/bakeandgrill/test.bakeandgrill.mv` for TEST,
`/home/bakeandgrill/public_html` for production.

**`bash: cd: … No such file or directory`, and the next command runs anyway**  
Chained commands keep going after a failed `cd`, so the rest of the line executes
in your *previous* directory. This has already caused a production change to be
applied to TEST. If a `cd` fails, stop and re-read the prompt before continuing.

**`SQLSTATE` migration errors**  
A column or table may already exist from a partial migration. Run `php artisan migrate:status` to check, then re-run `php artisan migrate --force`.

**`Class not found` after composer**  
Run `composer dump-autoload` to rebuild the autoloader.
