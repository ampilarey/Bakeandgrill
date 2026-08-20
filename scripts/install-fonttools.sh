#!/usr/bin/env bash
# One-time: Python fontTools + brotli so Content Hub can inspect/convert WOFF2.
# Required on CI, Cloud VMs, TEST, and PRODUCTION. Idempotent.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to inspect Dhivehi WOFF/WOFF2 uploads." >&2
  exit 1
fi

python3 - <<'PY'
import sys
try:
    import brotli  # noqa: F401
    import fontTools  # noqa: F401
except ImportError:
    sys.exit(1)
sys.exit(0)
PY
already=$?

if [[ "$already" -eq 0 ]]; then
  echo "fontTools + brotli already available."
  exit 0
fi

python3 -m pip install --user --disable-pip-version-check fonttools brotli
python3 - <<'PY'
import brotli  # noqa: F401
import fontTools  # noqa: F401
print("fontTools + brotli installed.")
PY
