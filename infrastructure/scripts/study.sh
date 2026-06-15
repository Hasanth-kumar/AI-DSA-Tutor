#!/usr/bin/env bash
# "Press play" mode (1.6): one command to go from cold machine to studying.
#   1. Starts backend + frontend dev servers
#   2. Runs a Notion sync once the API is up
#   3. Opens the Today view in the browser
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="$REPO_ROOT/.study"
API_URL="${API_URL:-http://localhost:3000}"
WEB_URL="${WEB_URL:-http://localhost:5173}"

mkdir -p "$RUN_DIR"
cd "$REPO_ROOT"

port_open() {
  nc -z localhost "$1" >/dev/null 2>&1
}

echo "▶ DSA Mastery OS — study mode"

# 1. Backend + frontend (no external services — cache and scheduler run in-process)
if port_open 3000; then
  echo "  ✓ Backend already running on :3000"
else
  echo "  • Starting backend…"
  (cd "$REPO_ROOT" && pnpm --filter @dsa/backend dev >"$RUN_DIR/backend.log" 2>&1 &
   echo $! >"$RUN_DIR/backend.pid")
fi

if port_open 5173; then
  echo "  ✓ Frontend already running on :5173"
else
  echo "  • Starting frontend…"
  (cd "$REPO_ROOT" && pnpm --filter @dsa/frontend dev >"$RUN_DIR/frontend.log" 2>&1 &
   echo $! >"$RUN_DIR/frontend.pid")
fi

# 2. Wait for the API, then trigger a Notion sync (4.3: sync on startup)
echo -n "  • Waiting for API"
for _ in $(seq 1 60); do
  if curl -sf "$API_URL/health/live" >/dev/null 2>&1; then
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

if curl -sf "$API_URL/health/live" >/dev/null 2>&1; then
  echo "  • Running Notion sync…"
  SYNC_RESULT=$(curl -sf -X POST "$API_URL/api/sync" 2>/dev/null || true)
  if [ -n "$SYNC_RESULT" ]; then
    echo "  ✓ Sync done"
  else
    echo "  ⚠ Sync skipped (Notion not configured or unreachable)"
  fi
else
  echo "  ⚠ API didn't come up in time — check $RUN_DIR/backend.log"
fi

# 3. Open the Today view
case "$(uname)" in
  Darwin) open "$WEB_URL" ;;
  Linux) xdg-open "$WEB_URL" >/dev/null 2>&1 || true ;;
esac

echo "✓ Ready. Today view: $WEB_URL  (stop with: pnpm study:stop)"
