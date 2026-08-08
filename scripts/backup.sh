#!/usr/bin/env bash
set -euo pipefail

# Restrictive permissions for dump files and directories.
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Prefer an explicit absolute path outside any web root. Relative defaults are
# unsafe on cPanel (cwd may be public_html). In production, require BACKUP_DIR.
if [[ -z "${BACKUP_DIR:-}" ]]; then
  if [[ "${APP_ENV:-}" == "production" || "${FORCE_PRODUCTION_BACKUP_CHECKS:-}" == "1" ]]; then
    echo "ERROR: BACKUP_DIR must be set to an absolute path outside the web root in production." >&2
    exit 1
  fi
  BACKUP_DIR="${REPO_ROOT}/storage/backups"
  echo "WARNING: BACKUP_DIR unset; using ${BACKUP_DIR}" >&2
fi

# Require absolute path.
if [[ "${BACKUP_DIR}" != /* ]]; then
  echo "ERROR: BACKUP_DIR must be an absolute path (got '${BACKUP_DIR}')." >&2
  exit 1
fi

# Refuse common web-root destinations.
case "${BACKUP_DIR}" in
  */public_html|*/public_html/*|*/public|*/public/*)
    echo "ERROR: BACKUP_DIR looks like a web-accessible path: ${BACKUP_DIR}" >&2
    exit 1
    ;;
esac

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-bakegrill}"
DB_USER="${DB_USER:-bakegrill}"
DB_PASSWORD="${DB_PASSWORD:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Auto-detect DB type from backend/.env if not explicitly set
if [[ -z "${DB_CONNECTION:-}" ]] && [[ -f "${REPO_ROOT}/backend/.env" ]]; then
    DB_CONNECTION=$(grep "^DB_CONNECTION" "${REPO_ROOT}/backend/.env" \
        | cut -d= -f2 | tr -d '[:space:]' || true)
fi
DB_CONNECTION="${DB_CONNECTION:-pgsql}"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

if [[ "$DB_CONNECTION" == "mysql" ]]; then
    echo "Backing up MySQL database: ${DB_NAME}"
    # Prefer MYSQL_PWD env over -p on the command line (avoids argv exposure).
    export MYSQL_PWD="${DB_PASSWORD}"
    mysqldump -u"${DB_USER}" -h"${DB_HOST}" -P"${DB_PORT}" \
        --single-transaction --quick \
        "${DB_NAME}" > "${BACKUP_DIR}/bakegrill-${STAMP}.sql"
    unset MYSQL_PWD
    chmod 600 "${BACKUP_DIR}/bakegrill-${STAMP}.sql"
    echo "Backup complete: ${BACKUP_DIR}/bakegrill-${STAMP}.sql"
elif [[ "$DB_CONNECTION" == "pgsql" ]]; then
    echo "Backing up PostgreSQL database: ${DB_NAME}"
    export PGPASSWORD="${DB_PASSWORD}"
    pg_dump \
        --format=custom --no-owner --no-acl \
        --host="${DB_HOST}" --port="${DB_PORT}" \
        --username="${DB_USER}" \
        --file="${BACKUP_DIR}/bakegrill-${STAMP}.dump" \
        "${DB_NAME}"
    unset PGPASSWORD
    chmod 600 "${BACKUP_DIR}/bakegrill-${STAMP}.dump"
    echo "Backup complete: ${BACKUP_DIR}/bakegrill-${STAMP}.dump"
else
    echo "ERROR: Unknown DB_CONNECTION='${DB_CONNECTION}'. Expected 'pgsql' or 'mysql'."
    exit 1
fi

tar -czf "${BACKUP_DIR}/storage-${STAMP}.tar.gz" \
    -C "${REPO_ROOT}" \
    backend/storage/app backend/storage/app/public
chmod 600 "${BACKUP_DIR}/storage-${STAMP}.tar.gz"

echo "Storage backup complete: ${BACKUP_DIR}/storage-${STAMP}.tar.gz"
