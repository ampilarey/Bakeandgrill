#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backup}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-bakegrill}"
DB_USER="${DB_USER:-bakegrill}"
DB_PASSWORD="${DB_PASSWORD:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Auto-detect DB type from backend/.env if not explicitly set
if [[ -z "${DB_CONNECTION:-}" ]] && [[ -f "$(dirname "$0")/../backend/.env" ]]; then
    DB_CONNECTION=$(grep "^DB_CONNECTION" "$(dirname "$0")/../backend/.env" \
        | cut -d= -f2 | tr -d '[:space:]' || true)
fi
DB_CONNECTION="${DB_CONNECTION:-pgsql}"

mkdir -p "${BACKUP_DIR}"

if [[ "$DB_CONNECTION" == "mysql" ]]; then
    echo "Backing up MySQL database: ${DB_NAME}"
    mysqldump -u"${DB_USER}" -p"${DB_PASSWORD}" -h"${DB_HOST}" -P"${DB_PORT}" \
        "${DB_NAME}" > "${BACKUP_DIR}/bakegrill-${STAMP}.sql"
    echo "Backup complete: ${BACKUP_DIR}/bakegrill-${STAMP}.sql"
elif [[ "$DB_CONNECTION" == "pgsql" ]]; then
    echo "Backing up PostgreSQL database: ${DB_NAME}"
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        --format=custom --no-owner --no-acl \
        --host="${DB_HOST}" --port="${DB_PORT}" \
        --username="${DB_USER}" \
        --file="${BACKUP_DIR}/bakegrill-${STAMP}.dump" \
        "${DB_NAME}"
    echo "Backup complete: ${BACKUP_DIR}/bakegrill-${STAMP}.dump"
else
    echo "ERROR: Unknown DB_CONNECTION='${DB_CONNECTION}'. Expected 'pgsql' or 'mysql'."
    exit 1
fi

tar -czf "${BACKUP_DIR}/storage-${STAMP}.tar.gz" \
    backend/storage/app backend/storage/app/public

echo "Storage backup complete: ${BACKUP_DIR}/storage-${STAMP}.tar.gz"
