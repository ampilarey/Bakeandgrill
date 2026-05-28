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
