# Backup & Restore

These steps back up the PostgreSQL database and app storage for Bake & Grill.

## Database backup (PostgreSQL)

1. Ensure your `.env` uses the correct database credentials.
2. Run a dump:

```
pg_dump --format=custom --no-owner --no-acl \
  --host=127.0.0.1 --port=5432 \
  --username=bakegrill \
  --file=backup/bakegrill.dump \
  bakegrill
```

3. Store the dump file in a safe location.

## Database restore (PostgreSQL)

1. Create the database if needed:

```
createdb --host=127.0.0.1 --port=5432 --username=bakegrill bakegrill
```

2. Restore from the dump:

```
pg_restore --no-owner --no-acl \
  --host=127.0.0.1 --port=5432 \
  --username=bakegrill \
  --dbname=bakegrill \
  backup/bakegrill.dump
```

## File storage backup

Backup `storage/app` and `storage/app/public`:

```
tar -czf backup/storage.tar.gz storage/app storage/app/public
```

Restore:

```
tar -xzf backup/storage.tar.gz -C .
```

## Recommended schedule

- Daily DB dump
- Weekly full storage archive
- Keep at least 14 days of backups
