#!/usr/bin/env bash
# Clone LIVE database + public media → TEST (one direction only).
#
# Use when you want TEST to mirror real catalog/photos/content for QA.
# Does NOT overwrite TEST .env, code, or queue workers.
#
# On sg-s2:
#   CONFIRM=1 bash /home/bakeandgrill/test.bakeandgrill.mv/scripts/clone-live-to-test.sh
#   # or from a pulled checkout:
#   CONFIRM=1 bash scripts/clone-live-to-test.sh
#
# Flags:
#   --yes              same as CONFIRM=1
#   --db-only          skip media rsync
#   --media-only       skip database dump/import
#   --keep-test-media  rsync without --delete (keep TEST-only files)
#   --no-backup        skip TEST DB safety dump (not recommended)
#
# Env overrides (optional):
#   LIVE_ROOT  TEST_ROOT  BACKUP_DIR
#
set -euo pipefail

export HOME="${HOME:-/home/bakeandgrill}"
export PATH="$HOME/bin:/usr/local/bin:/opt/cpanel/ea-php84/root/usr/bin:/usr/bin:/bin:${PATH:-}"

LIVE_ROOT="${LIVE_ROOT:-/home/bakeandgrill/public_html}"
TEST_ROOT="${TEST_ROOT:-/home/bakeandgrill/test.bakeandgrill.mv}"
BACKUP_DIR="${BACKUP_DIR:-/home/bakeandgrill/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOCK="${HOME}/.clone-live-to-test.lock"

DO_DB=1
DO_MEDIA=1
MEDIA_DELETE=1
DO_BACKUP=1
CONFIRM="${CONFIRM:-0}"

log() { echo "$(date '+%F %T') $*"; }
die() { log "ERROR: $*"; exit 1; }

usage() {
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) usage ;;
    --yes) CONFIRM=1 ;;
    --db-only) DO_MEDIA=0 ;;
    --media-only) DO_DB=0 ;;
    --keep-test-media) MEDIA_DELETE=0 ;;
    --no-backup) DO_BACKUP=0 ;;
    *) die "unknown flag: $arg (try --help)" ;;
  esac
done

[[ "$CONFIRM" == "1" ]] || die "refusing to wipe TEST without CONFIRM=1 or --yes"

command -v mysql >/dev/null || die "mysql client not found"
command -v mysqldump >/dev/null || die "mysqldump not found"
command -v rsync >/dev/null || die "rsync not found"
command -v php >/dev/null || die "php not found"

[[ -d "$LIVE_ROOT/backend" ]] || die "LIVE_ROOT missing: $LIVE_ROOT"
[[ -d "$TEST_ROOT/backend" ]] || die "TEST_ROOT missing: $TEST_ROOT"
[[ -f "$LIVE_ROOT/backend/.env" ]] || die "missing LIVE .env"
[[ -f "$TEST_ROOT/backend/.env" ]] || die "missing TEST .env"

# Hard safety: never allow paths that look inverted / same install.
LIVE_REAL="$(cd "$LIVE_ROOT" && pwd -P)"
TEST_REAL="$(cd "$TEST_ROOT" && pwd -P)"
[[ "$LIVE_REAL" != "$TEST_REAL" ]] || die "LIVE_ROOT and TEST_ROOT resolve to the same path"
[[ "$TEST_REAL" == *test.bakeandgrill* ]] || die "TEST_ROOT does not look like the TEST install: $TEST_REAL"
[[ "$LIVE_REAL" == *public_html* || "$LIVE_REAL" == *bakeandgrill.mv* ]] || \
  log "WARNING: LIVE_ROOT does not look like public_html — continuing with $LIVE_REAL"

mkdir "$LOCK" 2>/dev/null || die "clone already in progress (lock: $LOCK)"
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

# Read KEY from a Laravel .env without sourcing the whole file.
env_get() {
  local file="$1" key="$2"
  local line
  line="$(grep -E "^${key}=" "$file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 0
  line="${line#*=}"
  line="${line%$'\r'}"
  # Strip optional surrounding quotes
  if [[ "$line" == \"*\" && "$line" == *\" ]]; then
    line="${line:1:${#line}-2}"
  elif [[ "$line" == \'*\' && "$line" == *\' ]]; then
    line="${line:1:${#line}-2}"
  fi
  printf '%s' "$line"
}

LIVE_ENV="$LIVE_ROOT/backend/.env"
TEST_ENV="$TEST_ROOT/backend/.env"

LIVE_DB="$(env_get "$LIVE_ENV" DB_DATABASE)"
LIVE_USER="$(env_get "$LIVE_ENV" DB_USERNAME)"
LIVE_PASS="$(env_get "$LIVE_ENV" DB_PASSWORD)"
LIVE_HOST="$(env_get "$LIVE_ENV" DB_HOST)"
LIVE_PORT="$(env_get "$LIVE_ENV" DB_PORT)"

TEST_DB="$(env_get "$TEST_ENV" DB_DATABASE)"
TEST_USER="$(env_get "$TEST_ENV" DB_USERNAME)"
TEST_PASS="$(env_get "$TEST_ENV" DB_PASSWORD)"
TEST_HOST="$(env_get "$TEST_ENV" DB_HOST)"
TEST_PORT="$(env_get "$TEST_ENV" DB_PORT)"

LIVE_HOST="${LIVE_HOST:-127.0.0.1}"
TEST_HOST="${TEST_HOST:-127.0.0.1}"
LIVE_PORT="${LIVE_PORT:-3306}"
TEST_PORT="${TEST_PORT:-3306}"

[[ -n "$LIVE_DB" && -n "$LIVE_USER" ]] || die "LIVE DB_DATABASE/DB_USERNAME missing"
[[ -n "$TEST_DB" && -n "$TEST_USER" ]] || die "TEST DB_DATABASE/DB_USERNAME missing"
[[ "$LIVE_DB" != "$TEST_DB" ]] || die "LIVE and TEST DB_DATABASE are identical ($LIVE_DB) — aborting"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

log "clone LIVE → TEST starting"
log "  LIVE: $LIVE_REAL  db=$LIVE_DB"
log "  TEST: $TEST_REAL  db=$TEST_DB"
log "  backup dir: $BACKUP_DIR"

if [[ "$DO_DB" -eq 1 ]]; then
  if [[ "$DO_BACKUP" -eq 1 ]]; then
    TEST_BAK="$BACKUP_DIR/test-before-clone-${STAMP}.sql"
    log "backing up TEST DB → $TEST_BAK"
    export MYSQL_PWD="$TEST_PASS"
    mysqldump -u"$TEST_USER" -h"$TEST_HOST" -P"$TEST_PORT" \
      --single-transaction --quick --routines --triggers \
      "$TEST_DB" > "$TEST_BAK"
    unset MYSQL_PWD
    chmod 600 "$TEST_BAK"
  fi

  LIVE_DUMP="$BACKUP_DIR/live-to-test-${STAMP}.sql"
  log "dumping LIVE DB → $LIVE_DUMP"
  export MYSQL_PWD="$LIVE_PASS"
  mysqldump -u"$LIVE_USER" -h"$LIVE_HOST" -P"$LIVE_PORT" \
    --single-transaction --quick --routines --triggers \
    "$LIVE_DB" > "$LIVE_DUMP"
  unset MYSQL_PWD
  chmod 600 "$LIVE_DUMP"

  log "importing dump into TEST DB (drops + recreates $TEST_DB)"
  export MYSQL_PWD="$TEST_PASS"
  mysql -u"$TEST_USER" -h"$TEST_HOST" -P"$TEST_PORT" -e \
    "DROP DATABASE IF EXISTS \`${TEST_DB}\`; CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  mysql -u"$TEST_USER" -h"$TEST_HOST" -P"$TEST_PORT" "$TEST_DB" < "$LIVE_DUMP"
  unset MYSQL_PWD
  log "database clone complete"
fi

if [[ "$DO_MEDIA" -eq 1 ]]; then
  LIVE_PUB="$LIVE_ROOT/backend/storage/app/public"
  TEST_PUB="$TEST_ROOT/backend/storage/app/public"
  [[ -d "$LIVE_PUB" ]] || die "LIVE public storage missing: $LIVE_PUB"
  mkdir -p "$TEST_PUB"
  RSYNC_FLAGS=(-a)
  if [[ "$MEDIA_DELETE" -eq 1 ]]; then
    RSYNC_FLAGS+=(--delete)
    log "rsync media LIVE → TEST (with --delete)"
  else
    log "rsync media LIVE → TEST (keep extra TEST files)"
  fi
  rsync "${RSYNC_FLAGS[@]}" "$LIVE_PUB"/ "$TEST_PUB"/
  log "media clone complete"
fi

log "refreshing TEST Laravel caches (keeping TEST .env)"
cd "$TEST_ROOT/backend"
php artisan storage:link >/dev/null 2>&1 || true
php artisan optimize:clear >/dev/null 2>&1 || {
  php artisan config:clear >/dev/null 2>&1 || true
  php artisan cache:clear >/dev/null 2>&1 || true
  php artisan view:clear >/dev/null 2>&1 || true
  php artisan route:clear >/dev/null 2>&1 || true
}
php artisan config:cache
php artisan route:cache
php artisan view:clear
php artisan queue:restart >/dev/null 2>&1 || true

log "DONE — TEST now mirrors LIVE data/media"
log "  Reminder: TEST .env unchanged (APP_URL / BML / SMS stay TEST-safe)"
log "  Spot-check: https://test.bakeandgrill.mv/  and Admin → Menu"
