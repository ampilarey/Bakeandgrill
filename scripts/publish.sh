#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# publish.sh — Build the online-order React app and deploy into Laravel public
#
# Usage (from repo root):
#   ./scripts/publish.sh
#
# What it does:
#   1. Installs/updates npm dependencies for the order app
#   2. Runs `npm run build` (tsc + vite production build)
#   3. Wipes backend/public/order/ and copies the fresh dist in
#
# After running this, commit the backend/public/order/ changes and push to
# your server (or run the server-side commands below on the server directly).
#
# Server-side commands to run after deploying:
#   php artisan migrate --force
#   php artisan storage:link
#   php artisan config:cache && php artisan route:cache && php artisan view:clear
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORDER_APP="${REPO_ROOT}/apps/online-order-web"
LARAVEL_PUBLIC_ORDER="${REPO_ROOT}/backend/public/order"

cd "$REPO_ROOT"

echo "▶ Building online-order-web (production, same-origin /api)..."
cd "$ORDER_APP"
npm ci --silent 2>/dev/null || npm install --silent
npm run build

echo "▶ Deploying dist → backend/public/order/..."
mkdir -p "$LARAVEL_PUBLIC_ORDER"
rm -rf "${LARAVEL_PUBLIC_ORDER:?}"/*
cp -R dist/. "$LARAVEL_PUBLIC_ORDER/"

echo ""
echo "✓ Done. Run the following on your server after deploying:"
echo "    php artisan migrate --force"
echo "    php artisan storage:link"
echo "    php artisan config:cache && php artisan route:cache && php artisan view:clear"
echo ""
echo "  To deploy via git:"
echo "    git add -A && git commit -m 'chore: rebuild order app' && git push"
