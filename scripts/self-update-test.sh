#!/usr/bin/env bash
# Self-updating deploy for the TEST server (test.bakeandgrill.mv).
#
# Designed for cPanel cron — no inbound SSH required. Every run:
#   1. fetches origin/main; exits if the server is already current
#   2. asks the GitHub API whether the new commit's Actions checks are ALL green
#   3. only then runs scripts/pull-deploy-test.sh
# Red or still-running CI never deploys.
#
# Prefer immediate deploy after merge: GitHub Actions calls POST /api/deploy/test-pull
# once CI is green (see docs/TEST_AUTO_DEPLOY.md). This cron remains the fallback.
#
# Install once (cPanel Terminal):
#   bash /home/bakeandgrill/test.bakeandgrill.mv/scripts/install-self-update-cron-test.sh
#
# Watch it work:  tail -f ~/self-update-test.log
export HOME="${HOME:-/home/bakeandgrill}"
set -uo pipefail

export PATH="$HOME/bin:/usr/local/bin:/opt/cpanel/ea-php84/root/usr/bin:/usr/bin:/bin:${PATH:-}"
command -v git >/dev/null || { echo "$(date '+%F %T') git not found on PATH"; exit 1; }
command -v curl >/dev/null || { echo "$(date '+%F %T') curl not found on PATH"; exit 1; }

ROOT="/home/bakeandgrill/test.bakeandgrill.mv"
REPO="ampilarey/Bakeandgrill"
PULL="$ROOT/scripts/pull-deploy-test.sh"

cd "$ROOT" || { echo "$(date '+%F %T') cannot cd to $ROOT"; exit 1; }

git fetch origin main --quiet || { echo "$(date '+%F %T') git fetch failed"; exit 1; }

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse FETCH_HEAD)
[ "$LOCAL" = "$REMOTE" ] && exit 0

# Anonymous API call — the repo is public. ~12 calls/hour stays far below limits.
CHECKS=$(curl -fsS -m 20 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/${REPO}/commits/${REMOTE}/check-runs?per_page=100") \
    || { echo "$(date '+%F %T') GitHub API unreachable — will retry next run"; exit 0; }

# Parse with grep only — cPanel's php wrapper does not support `php -r`.
# Green means: at least one check exists, none still running, none concluded badly.
if ! printf '%s' "$CHECKS" | grep -q '"total_count": *[1-9]'; then
    echo "$(date '+%F %T') ${REMOTE:0:8}: no CI checks reported yet — holding."
    exit 0
fi
if printf '%s' "$CHECKS" | grep -qE '"status": *"(queued|in_progress|pending|waiting)"'; then
    echo "$(date '+%F %T') ${REMOTE:0:8}: CI still running — holding."
    exit 0
fi
if printf '%s' "$CHECKS" | grep -qE '"conclusion": *"(failure|cancelled|timed_out|action_required|startup_failure|stale)"'; then
    echo "$(date '+%F %T') ${REMOTE:0:8}: CI not green — holding."
    exit 0
fi

if [[ ! -x "$PULL" ]]; then
  chmod +x "$PULL" 2>/dev/null || true
fi

exec bash "$PULL" "$REMOTE"
