#!/usr/bin/env bash
# Build all 4 React apps and deploy their dist/ into backend/public/.
#
# Usage:
#   ./scripts/build-all.sh            # build + deploy all apps
#   ./scripts/build-all.sh order      # build + deploy only online-order-web
#   ./scripts/build-all.sh admin kds  # build + deploy only admin + kds
#
# Mapping:
#   apps/online-order-web  →  backend/public/order/
#   apps/admin-dashboard   →  backend/public/admin/
#   apps/kds-web           →  backend/public/kds/
#   apps/pos-web           →  backend/public/pos/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

declare -A APP_DEST=(
    [order]="online-order-web"
    [admin]="admin-dashboard"
    [kds]="kds-web"
    [pos]="pos-web"
)

# Which apps to build — default to all, or pass short names as args
if [[ $# -gt 0 ]]; then
    TARGETS=("$@")
else
    TARGETS=("order" "admin" "kds" "pos")
fi

echo "=== Bake & Grill — Build All React Apps ==="
echo "Repo root: $REPO_ROOT"
echo "Targets: ${TARGETS[*]}"
echo ""

for target in "${TARGETS[@]}"; do
    if [[ -z "${APP_DEST[$target]+_}" ]]; then
        echo "ERROR: Unknown target '$target'. Valid targets: order admin kds pos"
        exit 1
    fi

    APP_DIR="${REPO_ROOT}/apps/${APP_DEST[$target]}"
    DEST_DIR="${REPO_ROOT}/backend/public/${target}"

    echo "──────────────────────────────────────────"
    echo "Building: ${APP_DEST[$target]} → backend/public/${target}/"
    echo "──────────────────────────────────────────"

    cd "$APP_DIR"

    # Install dependencies (skip if node_modules already current)
    if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
        echo "Installing dependencies..."
        npm ci --silent 2>/dev/null || npm install --silent
    fi

    npm run build

    echo "Deploying to $DEST_DIR ..."
    mkdir -p "$DEST_DIR"
    rm -rf "${DEST_DIR:?}"/*
    cp -R dist/. "$DEST_DIR/"

    echo "✓ ${APP_DEST[$target]} deployed to backend/public/${target}/"
    echo ""
done

cd "$REPO_ROOT"

echo "=== Done ==="
echo ""
echo "All built assets are in backend/public/. To deploy:"
echo "  git add backend/public/ && git commit -m 'chore: rebuild frontend assets'"
echo "  git push origin main"
echo "  cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main"
