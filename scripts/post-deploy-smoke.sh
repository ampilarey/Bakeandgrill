#!/usr/bin/env bash
# Smoke-check key URLs after deploy. Exits non-zero if any check fails.
# Usage:
#   ./scripts/post-deploy-smoke.sh test
#   ./scripts/post-deploy-smoke.sh production
set -euo pipefail

ENV="${1:-test}"

case "$ENV" in
  test)
    BASE="https://test.bakeandgrill.mv"
    ;;
  production|prod)
    BASE="https://bakeandgrill.mv"
    ;;
  *)
    echo "Usage: $0 [test|production]"
    exit 1
    ;;
esac

check() {
  local path="$1"
  local label="$2"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}${path}")"
  if [[ "$code" =~ ^(200|204|302)$ ]]; then
    echo "OK  [$code] $label"
  else
    echo "FAIL [$code] $label (${BASE}${path})"
    return 1
  fi
}

echo "=== Post-deploy smoke: $BASE ==="
fail=0
check "/api/health" "API health" || fail=1
check "/" "Public homepage" || fail=1
check "/order/" "Online order app" || fail=1
check "/admin/" "Admin dashboard" || fail=1
check "/pos/" "POS app" || fail=1
check "/kds/" "KDS app" || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "=== Smoke checks FAILED ==="
  exit 1
fi

echo "=== All smoke checks passed ==="
echo
echo "Manual ops checklist (after git pull + migrate on server):"
echo "  [ ] POS Ops → Receive: select inventory SKU, status received, stock increases"
echo "  [ ] POS Ops → Waste: logs via waste-logs (not adjust-as-waste)"
echo "  [ ] Admin → Inventory → 📜 ledger shows movements"
echo "  [ ] Admin → Reports → Inventory valuation"
echo "  [ ] Admin → System Health loads without error"
echo "  [ ] Online: logged-in home shows Order again (with modifiers)"
echo "  [ ] POS Active orders: aged tickets tint warn/critical"
echo "  [ ] POS Sync panel: failed + conflict rows have Retry/Discard"
