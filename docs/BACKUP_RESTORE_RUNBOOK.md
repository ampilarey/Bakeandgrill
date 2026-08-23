# Database Backup & Restore Runbook

Bake & Grill uses [spatie/laravel-backup](https://github.com/spatie/laravel-backup) for nightly database dumps plus uploaded files under `storage/app/public`.

Production runs **MySQL/MariaDB** (see CLAUDE.md). This runbook said PostgreSQL and gave `pg_restore` commands until 2026-08-23 — worth knowing if you followed an older copy.

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

## Off-server retention is NOT configured — deferred, on purpose

`BACKUP_DISKS` is `backups` only, so **every backup sits on the same server as
the data it protects**. `app:verify-production-config` reports this as a
warning on every deploy; it is a warning rather than a failure because
local-only backups are better than none.

What it does and does not cover:

| Failure | Covered today? |
|---|---|
| Someone drops a table, a bad migration, a bad deploy | Yes — restore from `storage/app/backups/` |
| Ransomware or a compromised account with write access | No — the archives are reachable from the same account |
| The server or its disk is lost, or the hosting account is suspended | No — the backups go with it |

Deliberately deferred (2026-08-23, owner's call). To enable it later, no code
change is needed — create a private bucket, then in `backend/.env`:

```env
BACKUP_DISKS=backups,s3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=...
AWS_BUCKET=...
```

Then `php artisan backup:run` and confirm the archive appears in both places.
Give the key write-but-not-delete permission if the bucket supports it, so a
compromised server cannot erase its own off-site copies — that is most of the
point.

Two things to keep in mind when you do:

- The bucket is a full copy of the customer database. It needs to be private,
  encrypted at rest, and covered by whatever retention promise the privacy
  policy makes.
- TEST and production share this account. Point TEST at a different bucket or
  prefix, or its dumps will land beside the real ones — the same trap the
  Redis prefixes had (see CLAUDE.md).

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
mysql -e "CREATE DATABASE bakegrill_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql bakegrill_restore_test < dump.sql
```

CI additionally runs a PostgreSQL compatibility suite, which is why some
migrations carry PostgreSQL-specific workarounds — but the thing you restore
from a production backup is MySQL.

4. Point a throwaway `.env` at the restore DB and run smoke checks:

```bash
php artisan migrate:status
php artisan test --filter=Health
```

5. Verify row counts for `orders`, `customers`, `loyalty_accounts`, `gift_cards`.

## Failure alerts

Failed or unhealthy backups send mail to `BACKUP_NOTIFICATION_EMAIL` and log via Sentry (`routes/console.php` `onFailure` handlers).
