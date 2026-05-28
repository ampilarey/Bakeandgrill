#!/usr/bin/env bash
# Validate production/test .env before go-live. Run ON THE SERVER from repo root.
# Usage: ./scripts/prod-preflight.sh [path/to/.env]
set -euo pipefail

ENV_FILE="${1:-backend/.env}"
fail=0

warn() { echo "WARN: $*"; }
err()  { echo "FAIL: $*"; fail=1; }
ok()   { echo "OK   $*"; }

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE"
  exit 1
fi

get_env() {
  grep -E "^${1}=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

APP_ENV="$(get_env APP_ENV)"
APP_DEBUG="$(get_env APP_DEBUG)"
APP_URL="$(get_env APP_URL)"

[[ "$APP_ENV" == "production" ]] && ok "APP_ENV=production" || warn "APP_ENV=$APP_ENV (expected production on live)"
[[ "$APP_DEBUG" == "false" || "$APP_DEBUG" == "0" ]] && ok "APP_DEBUG=false" || err "APP_DEBUG must be false on live (got: $APP_DEBUG)"

if grep -q 'CHANGE_ME' "$ENV_FILE"; then
  err "Found CHANGE_ME placeholder(s) in $ENV_FILE"
else
  ok "No CHANGE_ME placeholders"
fi

BML_SIG="$(get_env BML_ENFORCE_SIGNATURE)"
[[ "$BML_SIG" == "true" || "$BML_SIG" == "1" ]] && ok "BML_ENFORCE_SIGNATURE=true" || warn "BML_ENFORCE_SIGNATURE not true"

SESSION_SECURE="$(get_env SESSION_SECURE_COOKIE)"
[[ "$SESSION_SECURE" == "true" || "$SESSION_SECURE" == "1" ]] && ok "SESSION_SECURE_COOKIE=true" || warn "SESSION_SECURE_COOKIE not true"

for key in BML_API_KEY BML_APP_ID APP_KEY DB_PASSWORD; do
  val="$(get_env "$key")"
  if [[ -z "$val" ]]; then
    err "$key is empty"
  else
    ok "$key is set"
  fi
done

if [[ -n "$APP_URL" ]]; then
  ok "APP_URL=$APP_URL"
else
  err "APP_URL is empty"
fi

echo ""
if [[ "$fail" -ne 0 ]]; then
  echo "=== Preflight FAILED — fix .env before go-live ==="
  exit 1
fi

echo "=== Preflight passed ==="
