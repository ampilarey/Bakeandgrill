#!/usr/bin/env bash
# Self-updating deploy for the TEST server (test.bakeandgrill.mv).
#
# Designed for cPanel cron — no inbound SSH required. Every run:
#   1. fetches origin/main; exits if the server is already current
#   2. asks the GitHub API whether the new commit's Actions checks are ALL green
#   3. only then fast-forwards and runs the Laravel deploy steps
# Red or still-running CI never deploys.
#
# Install once (cPanel Terminal):
#   chmod +x /home/bakeandgrill/test.bakeandgrill.mv/scripts/self-update-test.sh
#   (crontab -l 2>/dev/null; echo "*/5 * * * * /home/bakeandgrill/test.bakeandgrill.mv/scripts/self-update-test.sh >> \$HOME/self-update-test.log 2>&1") | crontab -
#
# Watch it work:  tail -f ~/self-update-test.log
set -uo pipefail

# Cron runs with a minimal PATH that often misses php/composer on cPanel.
export PATH="$HOME/bin:/usr/local/bin:/opt/cpanel/ea-php84/root/usr/bin:/usr/bin:/bin:$PATH"
command -v php >/dev/null || { echo "$(date '+%F %T') php not found on PATH=$PATH"; exit 1; }
command -v git >/dev/null || { echo "$(date '+%F %T') git not found on PATH"; exit 1; }

ROOT="/home/bakeandgrill/test.bakeandgrill.mv"
REPO="ampilarey/Bakeandgrill"
LOCK="$HOME/.self-update-test.lock"

# Skip if a previous run is still going (mkdir is atomic; works without flock).
mkdir "$LOCK" 2>/dev/null || exit 0
trap 'rmdir "$LOCK"' EXIT

cd "$ROOT" || { echo "$(date '+%F %T') cannot cd to $ROOT"; exit 1; }

git fetch origin main --quiet || { echo "$(date '+%F %T') git fetch failed"; exit 1; }

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse FETCH_HEAD)
[ "$LOCAL" = "$REMOTE" ] && exit 0

# Anonymous API call — the repo is public. ~12 calls/hour stays far below limits.
CHECKS=$(curl -fsS -m 20 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/${REPO}/commits/${REMOTE}/check-runs?per_page=100") \
    || { echo "$(date '+%F %T') GitHub API unreachable — will retry next run"; exit 0; }

GREEN=$(printf '%s' "$CHECKS" | php -r '
    $d = json_decode(stream_get_contents(STDIN), true);
    if (!is_array($d) || empty($d["check_runs"])) { echo "no"; exit; }
    foreach ($d["check_runs"] as $r) {
        if (($r["status"] ?? "") !== "completed") { echo "no"; exit; }
        if (!in_array($r["conclusion"] ?? "", ["success", "skipped", "neutral"], true)) { echo "no"; exit; }
    }
    echo "yes";
')

if [ "$GREEN" != "yes" ]; then
    echo "$(date '+%F %T') ${REMOTE:0:8}: CI not green yet — holding."
    exit 0
fi

echo "$(date '+%F %T') deploying ${LOCAL:0:8} -> ${REMOTE:0:8}"
git merge --ff-only FETCH_HEAD || { echo "$(date '+%F %T') fast-forward failed — manual attention needed"; exit 1; }

cd backend || exit 1

# Refresh vendor only when the lockfile actually changed in this update.
if git diff --name-only "$LOCAL" "$REMOTE" | grep -q '^backend/composer.lock$'; then
    composer install --no-dev --optimize-autoloader --no-interaction \
        || { echo "$(date '+%F %T') composer install failed"; exit 1; }
fi

php artisan migrate --force \
    && php artisan config:cache \
    && php artisan route:cache \
    && php artisan view:clear \
    && php artisan queue:restart \
    && echo "$(date '+%F %T') deploy complete: ${REMOTE:0:8}"
