#!/usr/bin/env bash
# Install (or refresh) the 1-minute test auto-deploy cron.
# Safe to re-run — replaces any older */5 self-update line, keeps other crontab entries.
#
# Run once in cPanel Terminal:
#   bash /home/bakeandgrill/test.bakeandgrill.mv/scripts/install-self-update-cron-test.sh
set -euo pipefail

ROOT="/home/bakeandgrill/test.bakeandgrill.mv"
SCRIPT="$ROOT/scripts/self-update-test.sh"
LOG="$HOME/self-update-test.log"
CRON_LINE="* * * * * $SCRIPT >> $LOG 2>&1"

if [[ ! -f "$SCRIPT" ]]; then
  echo "ERROR: $SCRIPT not found. Run: cd $ROOT && git pull origin main"
  exit 1
fi

chmod +x "$SCRIPT"

CURRENT="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$CURRENT" | grep -v 'self-update-test.sh' | sed '/^$/d' || true)"

{
  if [[ -n "$FILTERED" ]]; then
    printf '%s\n' "$FILTERED"
  fi
  echo "$CRON_LINE"
} | crontab -

echo "✓ Test auto-deploy cron installed (every 1 minute):"
crontab -l | grep 'self-update-test.sh'
echo ""
echo "Log: tail -f ~/self-update-test.log"
