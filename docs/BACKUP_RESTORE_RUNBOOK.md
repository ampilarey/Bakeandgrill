# Database Backup & Restore Runbook

Bake & Grill uses [spatie/laravel-backup](https://github.com/spatie/laravel-backup) for nightly PostgreSQL dumps plus uploaded files under `storage/app/public`.

## Schedule (production)

| Time (server) | Command | Purpose |
|---------------|---------|---------|
| 01:00 | `backup:clean` | Prune old archives per retention policy |
| 01:30 | `backup:run` | Dump DB + zip uploads |
| 02:00 | `backup:monitor` | Alert if latest backup is missing or stale |

Requires `php artisan schedule:run` in crontab (already configured on `sg-s2`).

## Configuration

Set in `backend/.env`:

```env
BACKUP_DISKS=backups          # local: storage/app/backups
# BACKUP_DISKS=backups,s3     # add off-site copy when AWS_* is configured
BACKUP_NOTIFICATION_EMAIL=owner@example.com
BACKUP_MAX_AGE_DAYS=2
```

Local disk path: `backend/storage/app/backups/{APP_NAME}/`.

## Manual backup

```bash
cd backend
php artisan backup:run
php artisan backup:list
```

## Restore test (quarterly)

1. Copy the latest `.zip` from `storage/app/backups/` (or S3) to a **non-production** machine.
2. Extract the SQL dump from the archive.
3. Create a fresh database and restore:

```bash
createdb bakegrill_restore_test
pg_restore --dbname=bakegrill_restore_test --clean --if-exists dump.sql
# or: psql bakegrill_restore_test < dump.sql
```

4. Point a throwaway `.env` at the restore DB and run smoke checks:

```bash
php artisan migrate:status
php artisan test --filter=Health
```

5. Verify row counts for `orders`, `customers`, `loyalty_accounts`, `gift_cards`.

## Failure alerts

Failed or unhealthy backups send mail to `BACKUP_NOTIFICATION_EMAIL` and log via Sentry (`routes/console.php` `onFailure` handlers).
