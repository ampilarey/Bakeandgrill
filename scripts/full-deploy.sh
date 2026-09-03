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
git pull origin main
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

# The print proxy is a small node service beside the printers. When it runs
# on this host from this checkout, a pull changes its source but not the
# process, so the receipt QR (2026-09-02) would never appear until somebody
# restarted it by hand. Rebuild and restart it here; skip when it is not
# running from this checkout (a LAN PC near the printers runs its own).
PROXY_DIR="$ROOT/print-proxy"
if [[ -f "$PROXY_DIR/package.json" ]] && pgrep -f "$PROXY_DIR/dist/index.js" >/dev/null; then
  echo "Rebuilding and restarting print proxy..."
  (
    cd "$PROXY_DIR"
    npm ci --silent 2>/dev/null || npm install --silent
    npm run build --silent
    pkill -f "$PROXY_DIR/dist/index.js" || true
    sleep 1
    if [[ -f .env ]]; then set -a; . ./.env; set +a; fi
    nohup node "$PROXY_DIR/dist/index.js" >> "$ROOT/backend/storage/logs/print-proxy.log" 2>&1 &
  )
  sleep 2
  pgrep -f "$PROXY_DIR/dist/index.js" >/dev/null && echo "Print proxy restarted." || echo "WARN: print proxy did not come back — check backend/storage/logs/print-proxy.log"
else
  echo "Print proxy not running from this checkout — nothing to restart."
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
