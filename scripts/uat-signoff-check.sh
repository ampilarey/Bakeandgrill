#!/usr/bin/env bash
# One-shot UAT sign-off helper: pull latest on test + smoke URLs + stale-order counts.
# Run ON THE SERVER from repo root after owner cleanup in admin UI.
set -euo pipefail

ROOT="/home/bakeandgrill/test.bakeandgrill.mv"
cd "$ROOT"

echo "=== UAT sign-off pre-check (test) ==="
git fetch origin main
BEHIND="$(git rev-list HEAD..origin/main --count 2>/dev/null || echo 0)"
if [[ "$BEHIND" -gt 0 ]]; then
  echo "Repo is $BEHIND commit(s) behind origin/main — run: ./scripts/full-deploy.sh test"
else
  echo "OK   Git is up to date with origin/main"
fi

./scripts/post-deploy-smoke.sh test

echo ""
echo "--- Stale open orders (informational) ---"
cd backend
php artisan tinker --execute="
echo 'Open (not completed/cancelled): ' . App\Models\Order::whereNotIn('status', ['cancelled', 'completed', 'refunded'])->count() . PHP_EOL;
echo 'Pending > 7 days: ' . App\Models\Order::where('status', 'pending')->where('created_at', '<', now()->subDays(7))->count() . PHP_EOL;
echo 'Shifts open > 24h: ' . App\Models\Shift::whereNull('closed_at')->where('opened_at', '<', now()->subDay())->count() . PHP_EOL;
"

echo ""
echo "=== Manual UAT still required ==="
echo "  1. Admin → Dashboard → POS maintenance (void stale tickets if counts above are high)"
echo "  2. Checkout: promo + gift card + loyalty on one order (BML UAT card)"
echo "  3. Delivery checkout end-to-end"
echo "  4. POS: charge → Receipts → Refunds tab"
echo "  5. KDS start → POS mark ready → customer order status page"
