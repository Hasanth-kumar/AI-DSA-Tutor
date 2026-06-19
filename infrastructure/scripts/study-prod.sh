#!/usr/bin/env bash
# "Press play" — production mode. One Node process serves the API *and* the
# built frontend on :3000 (no Vite/tsx dev servers), so it's much lighter on
# memory. Builds first if needed, syncs Notion, opens the app.
#   Stop with: pnpm study:stop   (same as dev mode)
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="$REPO_ROOT/.study"
API_URL="${API_URL:-http://localhost:3000}"
WEB_URL="$API_URL"   # production: the frontend is served from the API origin

mkdir -p "$RUN_DIR"
cd "$REPO_ROOT"

port_open() {
  nc -z localhost "$1" >/dev/null 2>&1
}

echo "▶ DSA Mastery OS — study mode (production)"

if port_open 3000; then
  echo "  ✓ Server already running on :3000"
else
  # Build if the compiled server or the frontend bundle is missing.
  if [ ! -f "$REPO_ROOT/packages/backend/dist/server.js" ] \
     || [ ! -f "$REPO_ROOT/packages/frontend/dist/index.html" ]; then
    echo "  • Building (first run / after changes)…"
    if ! pnpm build >"$RUN_DIR/build.log" 2>&1; then
      echo "  ✗ Build failed — see $RUN_DIR/build.log"
      exit 1
    fi
    echo "  ✓ Build done"
  fi

  echo "  • Starting server…"
  (cd "$REPO_ROOT" \
     && NODE_ENV=production SERVE_FRONTEND=true \
        node packages/backend/dist/server.js >"$RUN_DIR/backend.log" 2>&1 &
   echo $! >"$RUN_DIR/backend.pid")
fi

# Wait for the API, then trigger a Notion sync.
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

# Open the app (served from the API origin in production).
case "$(uname)" in
  Darwin) open "$WEB_URL" ;;
  Linux) xdg-open "$WEB_URL" >/dev/null 2>&1 || true ;;
esac

echo "✓ Ready. App: $WEB_URL  (stop with: pnpm study:stop)"
