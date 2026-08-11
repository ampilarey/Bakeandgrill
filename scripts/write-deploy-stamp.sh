#!/usr/bin/env bash
# Write storage/app/deploy-stamp.json for the running app to read.
# Usage: write-deploy-stamp.sh <repo-root>
# Called from pull-deploy-test.sh and full-deploy.sh.
set -euo pipefail

ROOT="${1:-}"
if [[ -z "$ROOT" || ! -d "$ROOT" ]]; then
  echo "write-deploy-stamp: repo root required" >&2
  exit 1
fi

BACKEND="${ROOT}/backend"
if [[ ! -d "$BACKEND" ]]; then
  echo "write-deploy-stamp: missing backend/ under $ROOT" >&2
  exit 1
fi

FULL=$(git -C "$ROOT" rev-parse HEAD)
SHORT=$(git -C "$ROOT" rev-parse --short=7 HEAD)
BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "${BACKEND}/storage/app"
# Atomic write so readers never see a partial JSON file.
TMP="${BACKEND}/storage/app/deploy-stamp.json.tmp.$$"
cat > "$TMP" <<EOF
{"commit":"${FULL}","commit_short":"${SHORT}","branch":"${BRANCH}","deployed_at":"${TS}"}
EOF
mv -f "$TMP" "${BACKEND}/storage/app/deploy-stamp.json"

echo "$(date '+%F %T') deploy stamp: ${SHORT} on ${BRANCH} at ${TS}"
