#!/usr/bin/env bash
# Install (or refresh) the 1-minute test auto-deploy cron.
# Safe to re-run — replaces any older self-update line, keeps other crontab entries.
#
# Run once in cPanel Terminal:
#   cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main && bash scripts/install-self-update-cron-test.sh
set -euo pipefail

ROOT="/home/bakeandgrill/test.bakeandgrill.mv"
SCRIPT="$ROOT/scripts/self-update-test.sh"
LOG="$HOME/self-update-test.log"
CRON_LINE="* * * * * $SCRIPT >> $LOG 2>&1"

# Cron's PATH is minimal — match self-update-test.sh so this preflight is honest.
export PATH="$HOME/bin:/usr/local/bin:/opt/cpanel/ea-php84/root/usr/bin:/usr/bin:/bin:$PATH"

if [[ ! -f "$SCRIPT" ]]; then
  echo "ERROR: $SCRIPT not found. Run: cd $ROOT && git pull origin main"
  exit 1
fi

for cmd in git php composer curl; do
  if ! command -v "$cmd" >/dev/null; then
    echo "ERROR: '$cmd' not found on PATH=$PATH"
    echo "Fix PATH in scripts/self-update-test.sh for this host, then re-run."
    exit 1
  fi
done

chmod +x "$SCRIPT" \
  "$ROOT/scripts/install-self-update-cron-test.sh" \
  "$ROOT/scripts/pull-deploy-test.sh"

cd "$ROOT"
git fetch origin main --quiet || {
  echo "ERROR: git fetch origin main failed — check deploy key / remote URL"
  exit 1
}

CURRENT="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$CURRENT" | grep -v 'self-update-test.sh' | sed '/^$/d' || true)"

{
  if [[ -n "$FILTERED" ]]; then
    printf '%s\n' "$FILTERED"
  fi
  echo "$CRON_LINE"
} | crontab -

LOCAL="$(git rev-parse --short HEAD)"
REMOTE="$(git rev-parse --short FETCH_HEAD)"

echo "✓ Test auto-deploy cron installed (every 1 minute):"
crontab -l | grep 'self-update-test.sh'
echo ""
echo "  Server HEAD : $LOCAL"
echo "  origin/main : $REMOTE"
echo "  Log         : tail -f $LOG"
echo ""
echo "When CI is green on a newer main tip, test will pull + deploy within ~1 minute."
echo "Docs: docs/TEST_AUTO_DEPLOY.md"
