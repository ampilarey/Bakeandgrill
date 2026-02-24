# Fixing 500 Internal Server Error

Run these commands **on the server** (SSH or cPanel Terminal). Replace `/home/bakeandgrill/app.bakeandgrill.mv/backend` with your actual backend path if different.

## 1. See the actual error (required)

```bash
cd /home/bakeandgrill/app.bakeandgrill.mv/backend
tail -80 storage/logs/laravel.log
```

The last exception in the log (message + file:line) is the cause of the 500. Fix that first.

## 2. Try without config cache (quick test)

Sometimes `config:cache` breaks if .env was wrong or paths differ:

```bash
cd /home/bakeandgrill/app.bakeandgrill.mv/backend
php artisan config:clear
```

Then reload the site. If the 500 goes away, the problem is with cached config (e.g. wrong APP_URL or missing env). Fix .env and only then run `php artisan config:cache` again.

## 3. Permissions (if log says "permission denied" or "failed to open stream")

```bash
cd /home/bakeandgrill/app.bakeandgrill.mv/backend
chmod -R 775 storage bootstrap/cache
# If your web server runs as a different user (e.g. nobody, apache), fix ownership:
# chown -R bakeandgrill:apache storage bootstrap/cache
```

## 4. Enable debug temporarily (only to see error in browser)

In `.env` on the server set:

```
APP_DEBUG=true
```

Reload the site once, copy the error page, then set back to:

```
APP_DEBUG=false
```

Never leave APP_DEBUG=true on a live site.

## 5. Common causes after deployment

| Cause | What to do |
|-------|------------|
| Missing or wrong APP_KEY | Run `php artisan key:generate` and update .env |
| Database connection | Check DB_DATABASE, DB_USERNAME, DB_PASSWORD in .env; test with `php artisan migrate:status` |
| Storage / cache not writable | chmod -R 775 storage bootstrap/cache |
| Cached config wrong | `php artisan config:clear` and fix .env before caching again |
| Missing PHP extension | Install required extensions (e.g. pdo_mysql, mbstring, openssl, fileinfo) |

## 6. After fixing

```bash
php artisan config:clear
# Only if you want cached config (faster):
php artisan config:cache
```
