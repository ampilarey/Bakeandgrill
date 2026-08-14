#!/usr/bin/env bash
# Background wrapper for clone-live-to-test.sh — writes status JSON for the admin UI.
# Invoked by CloneLiveToTestTrigger (do not run by hand unless debugging).
set -uo pipefail

export HOME="${HOME:-/home/bakeandgrill}"
export PATH="$HOME/bin:/usr/local/bin:/opt/cpanel/ea-php84/root/usr/bin:/usr/bin:/bin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLONE="${SCRIPT_DIR}/clone-live-to-test.sh"
STATUS_FILE="${CLONE_STATUS_FILE:-}"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

write_status() {
  local state="$1" exit_code="$2" message="$3"
  local finished
  finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  [[ -n "$STATUS_FILE" ]] || return 0
  mkdir -p "$(dirname "$STATUS_FILE")" 2>/dev/null || true
  php -r '
    $state = $argv[1];
    $started = $argv[2];
    $finished = $argv[3];
    $exit = $argv[4];
    $message = $argv[5];
    $path = $argv[6];
    $payload = [
      "state" => $state,
      "started_at" => $started,
      "finished_at" => ($state === "running" ? null : $finished),
      "exit_code" => ($exit === "null" || $exit === "" ? null : (int) $exit),
      "message" => $message,
    ];
    file_put_contents($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
  ' "$state" "$STARTED_AT" "$finished" "$exit_code" "$message" "$STATUS_FILE"
}

if [[ ! -f "$CLONE" ]]; then
  write_status failed 127 "clone-live-to-test.sh missing"
  exit 127
fi

write_status running null "Clone started"

CONFIRM=1 bash "$CLONE"
ec=$?

if [[ $ec -eq 0 ]]; then
  write_status done "$ec" "Clone finished OK"
else
  write_status failed "$ec" "Clone failed — see log"
fi

exit "$ec"
