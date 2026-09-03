#!/usr/bin/env bash
# Run the print proxy in the foreground from this checkout.
#
# Meant to sit under `flock -n` so there is never more than one proxy for this
# checkout, and a crashed or rebooted one is back within a minute:
#
#   * * * * * /bin/flock -n /home/bakeandgrill/public_html/print-proxy/.run.lock \
#       /home/bakeandgrill/public_html/scripts/print-proxy-run.sh \
#       >> /home/bakeandgrill/public_html/backend/storage/logs/print-proxy.log 2>&1
#
# full-deploy.sh starts the proxy through the same lock, so the cron line and
# the deploy never race each other. See docs/DEPLOY_COMMAND.md.
#
# print-proxy/.env is loaded first, so NODE_BIN can be set there when cron's
# PATH does not include node (cPanel: /opt/alt/alt-nodejs20/root/usr/bin/node).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/print-proxy"

if [[ ! -f dist/index.js ]]; then
  echo "[print-proxy-run] dist/index.js missing — run 'npm run build' in print-proxy first" >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" ]]; then
  echo "[print-proxy-run] node not found — set NODE_BIN in print-proxy/.env" >&2
  exit 1
fi

echo "[print-proxy-run] $(date -Is) starting with $NODE_BIN"
exec "$NODE_BIN" dist/index.js
