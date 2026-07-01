#!/usr/bin/env bash
# "Press play" — production mode. One Node process serves the API *and* the
# built frontend on :3000 (no Vite/tsx dev servers), so it's much lighter on
# memory. Rebuilds only when sources changed (FORCE_BUILD=1 to force), opens
# the app immediately, and syncs Notion in the background.
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

# Rebuild only when the working tree has changed since the last successful
# build (source edits don't hot-reload in production mode). A stamp file in
# .study/ records the last build; FORCE_BUILD=1 forces a rebuild.
BUILD_STAMP="$RUN_DIR/build.stamp"

needs_build() {
  [ "${FORCE_BUILD:-0}" = "1" ] && return 0
  [ -f "$BUILD_STAMP" ] || return 0
  [ -f "$REPO_ROOT/packages/backend/dist/server.js" ] || return 0
  [ -d "$REPO_ROOT/packages/frontend/dist" ] || return 0
  # Any source/config file newer than the stamp means dist is stale.
  local changed
  changed=$(find "$REPO_ROOT"/packages/*/src "$REPO_ROOT/database" \
                 "$REPO_ROOT"/packages/*/package.json "$REPO_ROOT"/packages/*/tsconfig*.json \
                 "$REPO_ROOT/package.json" "$REPO_ROOT/pnpm-lock.yaml" \
                 -type f -newer "$BUILD_STAMP" -print -quit 2>/dev/null)
  [ -n "$changed" ]
}

DID_BUILD=0
if needs_build; then
  echo "  • Building…"
  if ! pnpm build >"$RUN_DIR/build.log" 2>&1; then
    echo "  ✗ Build failed — see $RUN_DIR/build.log"
    exit 1
  fi
  touch "$BUILD_STAMP"
  DID_BUILD=1
  echo "  ✓ Build done"
else
  echo "  ✓ Build up to date (skipping — FORCE_BUILD=1 to override)"
fi

START_SERVER=1
if port_open 3000; then
  if [ "$DID_BUILD" = "1" ]; then
    echo "  • Restarting server on :3000 (picking up new build)…"
    pidfile="$RUN_DIR/backend.pid"
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      pkill -TERM -P "$pid" >/dev/null 2>&1 || true
      kill "$pid" >/dev/null 2>&1 || true
      rm -f "$pidfile"
    fi
    pids=$(lsof -ti tcp:3000 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill >/dev/null 2>&1 || true
    fi
    sleep 1
  else
    echo "  ✓ Server already running on :3000 (build unchanged)"
    START_SERVER=0
  fi
else
  echo "  • Starting server…"
fi

if [ "$START_SERVER" = "1" ]; then
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
  # Open the app immediately — the UI serves from the SQLite mirror, so it's
  # usable right away. Notion sync runs in the background; the dashboard's
  # sync-status poll picks up the result.
  case "$(uname)" in
    Darwin) open "$WEB_URL" ;;
    Linux) xdg-open "$WEB_URL" >/dev/null 2>&1 || true ;;
  esac
  echo "  • Notion sync running in background (log: $RUN_DIR/sync.log)…"
  (curl -sf -X POST "$API_URL/api/sync" >"$RUN_DIR/sync.log" 2>&1 || true) &
else
  echo "  ⚠ API didn't come up in time — check $RUN_DIR/backend.log"
fi

echo "✓ Ready. App: $WEB_URL  (stop with: pnpm study:stop)"
