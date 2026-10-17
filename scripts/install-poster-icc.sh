#!/usr/bin/env bash
# One-time: the press ICC profile the poster PDFs embed as their PDF/X-4
# output intent (docs/POSTER_PLAN.md § 6.1, backend/config/posters.php).
#
# "ISO Coated v2 (ECI)" is the FOGRA39 profile. The ECI publishes it free but
# it is 1.8 MB, so it is fetched into storage here and never committed.
# Without it the PDFs still open and print (the intent is named by registry),
# but a strict PDF/X-4 preflight flags the missing DestOutputProfile.
#
# Required on TEST and PRODUCTION before the first real poster order.
# Idempotent. Override the source with POSTER_ICC_URL (a .zip or a bare .icc).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${POSTER_ICC_DIR:-$ROOT/backend/storage/app/posters/icc}"
DEST="$DEST_DIR/ISOcoated_v2_eci.icc"
URL="${POSTER_ICC_URL:-https://eci.org/lib/exe/eci_offset_2009.zip}"
INNER="ECI_Offset_2009/ISOcoated_v2_eci.icc"
SHA256="128dc02f7246cc3807af0323695379f64151a8f27a587736acc59f8b6ce894b8"

verify() {
  # 'acsp' at byte 36 is the ICC file signature; the hash pins the ECI build.
  [ -f "$1" ] || return 1
  [ "$(dd if="$1" bs=1 skip=36 count=4 2>/dev/null)" = "acsp" ] || return 1
  if command -v sha256sum >/dev/null 2>&1; then
    [ "$(sha256sum "$1" | cut -d' ' -f1)" = "$SHA256" ] || return 1
  fi
  return 0
}

if verify "$DEST"; then
  echo "Press ICC profile already installed: $DEST"
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to fetch the press ICC profile." >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching $URL"
curl -fsSL --retry 3 -o "$TMP/download" "$URL"

case "$(head -c 2 "$TMP/download" | tr -d '\0')" in
  PK)
    if command -v unzip >/dev/null 2>&1; then
      unzip -o -q "$TMP/download" "$INNER" -d "$TMP"
    elif command -v python3 >/dev/null 2>&1; then
      python3 - "$TMP/download" "$INNER" "$TMP" <<'PY'
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extract(sys.argv[2], sys.argv[3])
PY
    else
      echo "unzip or python3 is required to open the ECI archive." >&2
      exit 1
    fi
    cp "$TMP/$INNER" "$TMP/profile.icc"
    ;;
  *)
    cp "$TMP/download" "$TMP/profile.icc"
    ;;
esac

if ! verify "$TMP/profile.icc"; then
  echo "The downloaded file is not the expected ISO Coated v2 (ECI) profile." >&2
  echo "Put the .icc at $DEST yourself, or set POSTER_ICC_URL to a copy." >&2
  exit 1
fi

install -m 0644 "$TMP/profile.icc" "$DEST"
echo "Press ICC profile installed: $DEST"
