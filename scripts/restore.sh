#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
STORAGE_TAR="${2:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-bakegrill}"
DB_USER="${DB_USER:-bakegrill}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: scripts/restore.sh <backup.dump> [storage.tar.gz]"
  exit 1
fi

pg_restore --no-owner --no-acl \
  --host="${DB_HOST}" --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  "${BACKUP_FILE}"

if [ -n "${STORAGE_TAR}" ]; then
  tar -xzf "${STORAGE_TAR}" -C .
fi

echo "Restore complete."
