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

pgrep -af "artisan queue:work" | grep -E "$(basename "$ROOT")|${WORKER_FILTER%%.*}" || echo "WARN: queue worker may not be running"

cd "$ROOT"
if [[ -x ./scripts/post-deploy-smoke.sh ]]; then
  ./scripts/post-deploy-smoke.sh "$ENV"
fi

echo "=== Full deploy complete ==="
