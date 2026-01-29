#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backup}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-bakegrill}"
DB_USER="${DB_USER:-bakegrill}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "${BACKUP_DIR}"

pg_dump --format=custom --no-owner --no-acl \
  --host="${DB_HOST}" --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --file="${BACKUP_DIR}/bakegrill-${STAMP}.dump" \
  "${DB_NAME}"

tar -czf "${BACKUP_DIR}/storage-${STAMP}.tar.gz" \
  backend/storage/app backend/storage/app/public

echo "Backup complete: ${BACKUP_DIR}/bakegrill-${STAMP}.dump"
