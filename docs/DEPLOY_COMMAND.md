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

**Scheduled tasks and the queue worker.** Check what is installed:

```bash
crontab -l | grep -E "schedule:run|queue:work"
```

It should match the four lines below exactly. The first three were repaired on
2026-08-21 after both the scheduler and the queue worker were found dead —
see "Why these lines look the way they do". The fourth (2026-09-03) keeps the
print proxy alive the same way, and only belongs on the host that runs the
proxy (where `print-proxy/.env` exists).

```
* * * * * /bin/flock -n /home/bakeandgrill/public_html/backend/storage/queue-worker.lock -c 'cd /home/bakeandgrill/public_html/backend && exec /opt/alt/php84/usr/bin/php artisan queue:work redis --sleep=3 --tries=3 --max-time=3600' >> /home/bakeandgrill/public_html/backend/storage/logs/queue-worker.log 2>&1
* * * * * /bin/flock -n /home/bakeandgrill/test.bakeandgrill.mv/backend/storage/queue-worker.lock -c 'cd /home/bakeandgrill/test.bakeandgrill.mv/backend && exec /opt/alt/php84/usr/bin/php artisan queue:work redis --sleep=3 --tries=3 --max-time=3600' >> /home/bakeandgrill/test.bakeandgrill.mv/backend/storage/logs/queue-worker.log 2>&1
* * * * * cd /home/bakeandgrill/public_html/backend && /opt/alt/php84/usr/bin/php artisan schedule:run > /dev/null 2>> storage/logs/schedule-error.log
* * * * * /bin/flock -n /home/bakeandgrill/public_html/print-proxy/.run.lock /home/bakeandgrill/public_html/scripts/print-proxy-run.sh >> /home/bakeandgrill/public_html/backend/storage/logs/print-proxy.log 2>&1
```

**Print proxy keepalive.** `scripts/print-proxy-run.sh` loads `print-proxy/.env`
and runs `node dist/index.js` in the foreground; `flock -n` on
`print-proxy/.run.lock` means cron starts it only when nothing holds the lock,
so a crash or a reboot is repaired within a minute and there is never a second
copy. `full-deploy.sh` rebuilds the proxy, kills the old process, and starts
the new one through the same lock. If cron's PATH has no `node`, set
`NODE_BIN=/opt/alt/alt-nodejs20/root/usr/bin/node` (check with `command -v node`
from a login shell) in `print-proxy/.env`. Confirm with:

```bash
pgrep -af "print-proxy/dist/index.js"
curl -s http://127.0.0.1:3000/health   # lists printers_offline by name
```

If the proxy runs on a Windows PC beside the printers instead, use Task
Scheduler: a task "At log on" running `npm start` in the print-proxy folder,
with "Restart the task if it fails" every 1 minute. There is no cron there and
the deploy script does not reach it, so after a merge that touches
`print-proxy/` pull and `npm run build` on that PC by hand.

Edit them by writing a file, never by pasting into a shell — a bare `*` at the
start of a line is a glob, and bash will expand it against your home directory:

```bash
crontab -l > /tmp/cron.new     # edit /tmp/cron.new, then:
crontab /tmp/cron.new && crontab -l
```

Confirm afterwards. Expect exactly two PHP processes, both `/opt/alt/php84`:

```bash
ps -eo args | grep "[a]rtisan queue:work" | grep -v flock | grep -v "sh -c"
```

Changing the cron line does not replace a running worker — `--max-time=3600`
keeps it alive for up to an hour and flock stops a replacement starting. To
apply a change now: `pkill -f "artisan queue:work"` and wait a minute.

### Why these lines look the way they do

Three deliberate details, each of which was a real failure:

**Absolute path to PHP.** Bare `php` under cron resolved to
`/opt/cpanel/ea-php84/root/usr/bin/php`, which no longer exists after a cPanel
PHP update — so every invocation failed. `/usr/local/bin/php` is not safe
either: it reports 8.4 interactively but resolves to **ea-php81** without a
TTY, which is below the `^8.2` this project requires and is past end of life.
`/opt/alt/php84/usr/bin/php` is the binary Laravel's own scheduler picks for
sub-processes.

**`flock`, not `pgrep`.** The previous guard was
`pgrep -f "queue:work.*public_html" || cd … && nohup php …`, which failed twice
over. The working directory is not part of a process's argv, so the pattern
could never match; and `A || B && C` runs `C` whether or not `A` succeeds, so
the guard did nothing in either direction. `flock -n` holds a real lock for the
worker's lifetime and cannot be fooled by what is or isn't in a command line.

**stderr is logged, stdout is not.** The scheduler previously ended in
`>> /dev/null 2>&1`, which is why a command failing every minute for an unknown
length of time produced no evidence anywhere. Sending stdout to `/dev/null` and
stderr to a file keeps the log empty while healthy and captures failures.

A quick health check any time:

```bash
cat /home/bakeandgrill/public_html/backend/storage/logs/schedule-error.log   # want empty
ps -eo args | grep -c "[a]rtisan queue:work.*php84"                          # want 2
```

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
