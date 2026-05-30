#!/usr/bin/env bash
# Build all 5 React apps and deploy their dist/ into backend/public/.
#
# Usage:
#   ./scripts/build-all.sh                  # build + deploy all apps
#   ./scripts/build-all.sh order            # build + deploy only online-order-web
#   ./scripts/build-all.sh admin kds        # build + deploy only admin + kds
#
# Mapping:
#   apps/online-order-web  →  backend/public/order/
#   apps/admin-dashboard   →  backend/public/admin/
#   apps/kds-web           →  backend/public/kds/
#   apps/pos-web           →  backend/public/pos/
#   apps/delivery-web      →  backend/public/driver/  (Vite base is /driver/)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

app_dir_for() {
  case "$1" in
    order)    echo "online-order-web" ;;
    admin)    echo "admin-dashboard" ;;
    kds)      echo "kds-web" ;;
    pos)      echo "pos-web" ;;
    delivery) echo "delivery-web" ;;
    *)        return 1 ;;
  esac
}

public_dir_for() {
  case "$1" in
    order)    echo "order" ;;
    admin)    echo "admin" ;;
    kds)      echo "kds" ;;
    pos)      echo "pos" ;;
    delivery) echo "driver" ;;
    *)        return 1 ;;
  esac
}

if [[ $# -gt 0 ]]; then
  TARGETS=("$@")
else
  TARGETS=(order admin kds pos delivery)
fi

echo "=== Bake & Grill — Build All React Apps ==="
echo "Repo root: $REPO_ROOT"
echo "Targets: ${TARGETS[*]}"
echo ""

for target in "${TARGETS[@]}"; do
  APP_NAME="$(app_dir_for "$target" 2>/dev/null || true)"
  PUBLIC_NAME="$(public_dir_for "$target" 2>/dev/null || true)"
  if [[ -z "$APP_NAME" || -z "$PUBLIC_NAME" ]]; then
    echo "ERROR: Unknown target '$target'. Valid targets: order admin kds pos delivery"
    exit 1
  fi

  APP_DIR="${REPO_ROOT}/apps/${APP_NAME}"
  DEST_DIR="${REPO_ROOT}/backend/public/${PUBLIC_NAME}"

  echo "──────────────────────────────────────────"
  echo "Building: ${APP_NAME} → backend/public/${PUBLIC_NAME}/"
  echo "──────────────────────────────────────────"

  cd "$APP_DIR"

  if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
    echo "Installing dependencies..."
    npm ci --silent 2>/dev/null || npm install --silent
  fi

  npm run build

  echo "Deploying to $DEST_DIR ..."
  mkdir -p "$DEST_DIR"
  rm -rf "${DEST_DIR:?}"/*
  cp -R dist/. "$DEST_DIR/"

  if [[ "$target" == "pos" && -f scripts/verify-pos-deploy.mjs ]]; then
    node scripts/verify-pos-deploy.mjs
  fi

  echo "✓ ${APP_NAME} deployed to backend/public/${PUBLIC_NAME}/"
  echo ""
done

cd "$REPO_ROOT"

echo "=== Done ==="
