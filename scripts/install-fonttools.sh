#!/usr/bin/env bash
# One-time: Python fontTools + brotli so Content Hub can inspect/convert WOFF2.
# Required on CI, Cloud VMs, TEST, and PRODUCTION. Idempotent.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to inspect Dhivehi WOFF/WOFF2 uploads." >&2
  exit 1
fi

# `if cmd` is required here: with `set -e`, a bare `python3 …; already=$?`
# exits the script on ImportError before pip can run (that is what failed CI).
if python3 -c "import brotli, fontTools" 2>/dev/null; then
  echo "fontTools + brotli already available."
  exit 0
fi

if ! python3 -m pip --version >/dev/null 2>&1; then
  echo "python3-pip is required. On Ubuntu: apt-get install -y python3-pip" >&2
  exit 1
fi

# Ubuntu 24.04+ (GitHub-hosted runners) marks system Python as externally managed.
if ! python3 -m pip install --user --disable-pip-version-check fonttools brotli; then
  python3 -m pip install --user --break-system-packages --disable-pip-version-check fonttools brotli
fi

python3 -c "import brotli, fontTools; print('fontTools + brotli installed.')"
