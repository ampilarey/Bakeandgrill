#!/usr/bin/env bash
# Build the online-order app and copy into Laravel public for publishing.
# Run from repo root: ./scripts/publish.sh
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORDER_APP="${REPO_ROOT}/apps/online-order-web"
LARAVEL_PUBLIC_ORDER="${REPO_ROOT}/backend/public/order"

cd "$REPO_ROOT"

echo "Building online-order-web (production, same-origin /api)..."
cd "$ORDER_APP"
npm ci --silent 2>/dev/null || npm install --silent
npm run build

echo "Copying dist to backend/public/order/..."
mkdir -p "$LARAVEL_PUBLIC_ORDER"
rm -rf "${LARAVEL_PUBLIC_ORDER:?}"/*
cp -R dist/. "$LARAVEL_PUBLIC_ORDER/"

echo "Done. Main site + order app are ready to publish from backend/."
echo "Next: deploy backend/ (and public/) to your server, then run:"
echo "  php artisan migrate --force"
echo "  php artisan db:seed --class=ImportMenuSeeder   # or menu:sync-item-images if DB already has items"
echo "  php artisan storage:link"
echo "  php artisan config:cache && php artisan route:cache && php artisan view:clear"
