#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
UI_TEST="$ROOT_DIR/tests/check_ui_search_filter.py"
UI_TEST_BULK="$ROOT_DIR/tests/check_ui_bulk_actions.py"

echo "[check] Running UI tests"
if [ -f "$UI_TEST" ]; then
  python3 "$UI_TEST"
else
  echo "[check] WARN: $UI_TEST not found, skipping UI test"
fi

if [ -f "$UI_TEST_BULK" ]; then
  python3 "$UI_TEST_BULK"
else
  echo "[check] WARN: $UI_TEST_BULK not found, skipping bulk UI test"
fi

if command -v node >/dev/null 2>&1; then
  echo "[check] Node detected, starting server quick check"
  APP_DIR="$ROOT_DIR/practices/practice_04/task_planner"
  PORT=${PORT:-3100}
  (
    cd "$APP_DIR"
    PORT=$PORT node server.js &
    SVPID=$!
    trap 'kill "$SVPID" 2>/dev/null || true' EXIT INT TERM HUP
    # wait for readiness
    i=0
    until [ "$i" -ge 30 ]; do
      code=$(sh -c "curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/api/tasks || true")
      [ "$code" = "200" ] && break
      i=$((i+1))
      sleep 0.2
    done
    if [ "$code" != "200" ]; then
      echo "[check] ERROR: server not ready (last code=$code)" >&2
      exit 1
    fi
    echo "[check] Server ready on :$PORT"
  )
  echo "[check] MCP: tasks-lint-fix sanity"
  OK_OUT=$(node .opencode/mcp/tasks-lint-fix/server.js --tool tasks-lint-fix --input '{"path":"practices/practice_04/task_planner/data/tasks.json","autofix":false,"backup":true}' || true)
  echo "$OK_OUT" | grep '"ok":true' >/dev/null || { echo "[check] ERROR: MCP success case failed: $OK_OUT" >&2; exit 1; }
  ERR_OUT=$(node .opencode/mcp/tasks-lint-fix/server.js --tool tasks-lint-fix --input '{"path":"practices/practice_04/task_planner/data/missing.json","autofix":false}' || true)
  echo "$ERR_OUT" | grep '"ok":false' >/dev/null || { echo "[check] ERROR: MCP error case not reported: $ERR_OUT" >&2; exit 1; }
else
  echo "[check] INFO: node is not installed; skipped server checks"
fi

echo "[check] PASS"
