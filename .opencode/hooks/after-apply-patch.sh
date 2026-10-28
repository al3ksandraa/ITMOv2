#!/usr/bin/env bash
set -euo pipefail

# Run project check script and print concise summary
if [ -f "scripts/check.sh" ]; then
  echo "[hook] Running scripts/check.sh"
  if bash scripts/check.sh; then
    echo "[hook] check.sh: PASS"
  else
    status=$?
    echo "[hook] check.sh: FAIL (exit=$status)" >&2
    exit "$status"
  fi
else
  echo "[hook] scripts/check.sh not found; skipping"
fi
