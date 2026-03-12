# Server Deploy Command

Run this on the server whenever you want to pull the latest code and apply changes.

## Full Deploy (use this after any update)

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main && cd backend && composer install --no-dev --optimize-autoloader && php artisan migrate --force && php artisan config:cache && php artisan route:cache && php artisan view:clear
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
| Project root | `/home/bakeandgrill/test.bakeandgrill.mv` |
| Backend folder | `/home/bakeandgrill/test.bakeandgrill.mv/backend` |
| GitHub repo | `https://github.com/ampilarey/Bakeandgrill` |
| Branch | `main` |

---

## Common Errors

**`fatal: not a git repository`**  
You are in the wrong directory. Make sure you `cd /home/bakeandgrill/test.bakeandgrill.mv` first.

**`SQLSTATE` migration errors**  
A column or table may already exist from a partial migration. Run `php artisan migrate:status` to check, then re-run `php artisan migrate --force`.

**`Class not found` after composer**  
Run `composer dump-autoload` to rebuild the autoloader.
