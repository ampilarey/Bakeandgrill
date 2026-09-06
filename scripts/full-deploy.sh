#!/usr/bin/env bash
# Full deploy: pull, composer, migrate, cache, queue restart, worker keepalive.
# Usage:
#   ./scripts/full-deploy.sh test
#   ./scripts/full-deploy.sh production
set -euo pipefail

ENV="${1:-test}"

case "$ENV" in
  test)
    ROOT="/home/bakeandgrill/test.bakeandgrill.mv"
    WORKER_FILTER="queue:work.*test.bakeandgrill"
    ;;
  production|prod)
    ROOT="/home/bakeandgrill/public_html"
    WORKER_FILTER="queue:work.*public_html"
    ;;
  *)
    echo "Usage: $0 [test|production]"
    exit 1
    ;;
esac

echo "=== Full deploy: $ENV ($ROOT) ==="
cd "$ROOT"

# A file re-touched without being changed (a backup job, a chmod, the cPanel
# file manager) leaves git's stat cache stale, and `git pull` then refuses
# with "local changes would be overwritten" for files that are not actually
# modified. Refresh the cache first so only real edits can stop a deploy.
git update-index -q --refresh || true

# Real local edits on a deploy checkout are a mistake somebody should look at,
# not something to merge over or throw away in a script. Say so and stop.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to deploy: this checkout has local changes to tracked files:"
  git status --short | grep -v '^??' || true
  echo "Keep them:    git stash push -m \"local-$(date +%F)\""
  echo "Discard them: git checkout -- ."
  echo "Then re-run this deploy."
  exit 1
fi

git pull --ff-only origin main
cd backend
composer install --no-dev --optimize-autoloader

# Production must fail closed on misconfiguration (matches CI / app:verify-production-config).
if [[ "$ENV" == "production" || "$ENV" == "prod" ]]; then
  echo "Verifying production configuration..."
  php artisan app:verify-production-config
fi

# TEST and production share one Redis socket on this account. A non-production
# site on the default database numbers and prefixes would share production's
# queue and cache — a TEST SMS job run by the live worker. Fails closed on TEST.
echo "Verifying Redis isolation..."
php artisan app:verify-redis-isolation

php artisan migrate --force
php artisan storage:link --force 2>/dev/null || true
php artisan config:cache
php artisan route:cache
php artisan view:clear
php artisan queue:restart

if ! pgrep -f "$WORKER_FILTER" >/dev/null; then
  echo "Starting queue worker..."
  nohup php artisan queue:work redis --sleep=3 --tries=3 --max-time=3600 >> storage/logs/queue-worker.log 2>&1 &
fi

# Dedicated single-concurrency worker for the low-priority `social` queue
# (video renders). Separate on purpose: a long ffmpeg render must never sit
# in front of payments, orders or SMS on the main worker. Cheap when idle.
SOCIAL_WORKER_FILTER="queue:work.*--queue=social"
if ! pgrep -f "$SOCIAL_WORKER_FILTER" >/dev/null; then
  echo "Starting social queue worker..."
  nohup php artisan queue:work redis --queue=social --sleep=10 --tries=1 --max-time=3600 >> storage/logs/social-worker.log 2>&1 &
fi

pgrep -af "artisan queue:work" | grep -E "$(basename "$ROOT")|${WORKER_FILTER%%.*}" || echo "WARN: queue worker may not be running"

cd "$ROOT"

# The print proxy is a small node service beside the printers. When it is
# configured on this host (print-proxy/.env exists) or already running from
# this checkout, a pull changes its source but not the process, so the receipt
# QR (2026-09-02) would never appear until somebody restarted it by hand.
# Rebuild it, stop the old process, and start it through the same flock the
# cron keepalive uses (scripts/print-proxy-run.sh, docs/DEPLOY_COMMAND.md), so
# the deploy and the cron line never end up with two proxies. Skip when the
# proxy is not on this host (a LAN PC near the printers runs its own).
PROXY_DIR="$ROOT/print-proxy"
PROXY_LOG="$ROOT/backend/storage/logs/print-proxy.log"
if [[ -f "$PROXY_DIR/package.json" ]] && { [[ -f "$PROXY_DIR/.env" ]] || pgrep -f "$PROXY_DIR/dist/index.js" >/dev/null; }; then
  echo "Rebuilding and restarting print proxy..."
  (
    cd "$PROXY_DIR"
    npm ci --silent 2>/dev/null || npm install --silent
    npm run build --silent
  )
  pkill -f "$PROXY_DIR/dist/index.js" || true
  sleep 1
  nohup flock -n "$PROXY_DIR/.run.lock" "$ROOT/scripts/print-proxy-run.sh" >> "$PROXY_LOG" 2>&1 &
  sleep 2
  pgrep -f "$PROXY_DIR/dist/index.js" >/dev/null && echo "Print proxy restarted." || echo "WARN: print proxy did not come back — check backend/storage/logs/print-proxy.log"
else
  echo "Print proxy not configured on this host — nothing to restart."
fi
if [[ -x ./scripts/write-deploy-stamp.sh ]]; then
  ./scripts/write-deploy-stamp.sh "$ROOT" || echo "WARN: deploy stamp write failed"
elif [[ -f ./scripts/write-deploy-stamp.sh ]]; then
  bash ./scripts/write-deploy-stamp.sh "$ROOT" || echo "WARN: deploy stamp write failed"
else
  echo "WARN: write-deploy-stamp.sh missing — app will report unknown commit"
fi

if [[ -x ./scripts/post-deploy-smoke.sh ]]; then
  ./scripts/post-deploy-smoke.sh "$ENV"
fi

echo "=== Full deploy complete ==="
