#!/usr/bin/env bash
# Quick pull + Laravel cache refresh for test or production.
# Usage:
#   ./scripts/uat-quick-pull.sh test      # default
#   ./scripts/uat-quick-pull.sh production
set -euo pipefail

ENV="${1:-test}"

case "$ENV" in
  test)
    ROOT="/home/bakeandgrill/test.bakeandgrill.mv"
    ;;
  production|prod)
    ROOT="/home/bakeandgrill/public_html"
    ;;
  *)
    echo "Usage: $0 [test|production]"
    exit 1
    ;;
esac

echo "=== Quick pull: $ENV ($ROOT) ==="
cd "$ROOT"
git pull origin main
cd backend
php artisan config:cache
php artisan route:cache
php artisan view:clear
php artisan queue:restart
echo "=== Done ==="
echo "Run ./scripts/post-deploy-smoke.sh ${ENV} to verify endpoints."
