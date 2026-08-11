#!/usr/bin/env bash
# Immediate TEST pull + Laravel deploy (no CI wait).
#
# Used by:
#   - POST /api/deploy/test-pull (GitHub Actions after green CI)
#   - scripts/self-update-test.sh (cron, after it confirms CI is green)
#
# Optional arg: expected full SHA to deploy (retries fetch briefly if tip lags).
# PHP-FPM/nohup often has no HOME — set before `set -u`.
export HOME="${HOME:-/home/bakeandgrill}"
set -uo pipefail

export PATH="$HOME/bin:/usr/local/bin:/opt/cpanel/ea-php84/root/usr/bin:/usr/bin:/bin:${PATH:-}"
command -v php >/dev/null || { echo "$(date '+%F %T') php not found on PATH=$PATH"; exit 1; }
command -v git >/dev/null || { echo "$(date '+%F %T') git not found on PATH"; exit 1; }
command -v composer >/dev/null || { echo "$(date '+%F %T') composer not found on PATH=$PATH"; exit 1; }

ROOT="/home/bakeandgrill/test.bakeandgrill.mv"
LOCK="$HOME/.self-update-test.lock"
EXPECTED_SHA="${1:-}"

echo "$(date '+%F %T') pull-deploy-test starting (HOME=$HOME expected=${EXPECTED_SHA:-none})"

mkdir "$LOCK" 2>/dev/null || {
  echo "$(date '+%F %T') deploy already in progress — skipping"
  exit 0
}
trap 'rmdir "$LOCK"' EXIT

cd "$ROOT" || { echo "$(date '+%F %T') cannot cd to $ROOT"; exit 1; }

fetch_main() {
  git fetch origin main --quiet
}

fetch_main || { echo "$(date '+%F %T') git fetch failed"; exit 1; }

# Webhook/Actions pass a SHA that must be the tip of origin/main.
# Feature-branch SHAs will never match — fail fast after a short wait.
if [[ -n "$EXPECTED_SHA" ]]; then
  echoed_wait=0
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    REMOTE=$(git rev-parse FETCH_HEAD)
    [[ "$REMOTE" == "$EXPECTED_SHA" ]] && break
    if [[ "$echoed_wait" -eq 0 ]]; then
      echo "$(date '+%F %T') waiting for origin/main (${REMOTE:0:8}) to reach ${EXPECTED_SHA:0:8}"
      echoed_wait=1
    fi
    sleep 2
    fetch_main || true
  done
  REMOTE=$(git rev-parse FETCH_HEAD)
  if [[ "$REMOTE" != "$EXPECTED_SHA" ]]; then
    echo "$(date '+%F %T') origin/main tip ${REMOTE:0:8} != expected ${EXPECTED_SHA:0:8} — aborting (deploy only accepts main SHAs)"
    exit 1
  fi
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse FETCH_HEAD)
STAMP_SCRIPT="$ROOT/scripts/write-deploy-stamp.sh"

write_stamp() {
  if [[ -x "$STAMP_SCRIPT" ]]; then
    "$STAMP_SCRIPT" "$ROOT" || echo "$(date '+%F %T') WARN: deploy stamp write failed"
  elif [[ -f "$STAMP_SCRIPT" ]]; then
    bash "$STAMP_SCRIPT" "$ROOT" || echo "$(date '+%F %T') WARN: deploy stamp write failed"
  else
    echo "$(date '+%F %T') WARN: write-deploy-stamp.sh missing — app will report unknown commit"
  fi
}

if [[ "$LOCAL" == "$REMOTE" ]]; then
  echo "$(date '+%F %T') already on ${LOCAL:0:8} — nothing to pull"
  # Still refresh the stamp so System Health /api/health show what is running.
  write_stamp
  exit 0
fi

echo "$(date '+%F %T') deploying ${LOCAL:0:8} -> ${REMOTE:0:8}"
git merge --ff-only FETCH_HEAD || { echo "$(date '+%F %T') fast-forward failed — manual attention needed"; exit 1; }

cd backend || exit 1

if git diff --name-only "$LOCAL" "$REMOTE" | grep -q '^backend/composer.lock$'; then
  composer install --no-dev --optimize-autoloader --no-interaction \
    || { echo "$(date '+%F %T') composer install failed"; exit 1; }
fi

php artisan storage:link --force 2>/dev/null \
  || echo "$(date '+%F %T') WARN: storage:link failed — is backend/public/storage a real directory?"

php artisan migrate --force \
  && php artisan config:cache \
  && php artisan route:cache \
  && php artisan view:clear \
  && php artisan queue:restart \
  || { echo "$(date '+%F %T') Laravel deploy steps failed"; exit 1; }

if ! pgrep -f "queue:work.*test.bakeandgrill" >/dev/null 2>&1; then
  nohup php artisan queue:work redis --sleep=3 --tries=3 --max-time=3600 \
    >> storage/logs/queue-worker.log 2>&1 &
  echo "$(date '+%F %T') started test queue worker"
fi

write_stamp
echo "$(date '+%F %T') deploy complete: ${REMOTE:0:8}"
