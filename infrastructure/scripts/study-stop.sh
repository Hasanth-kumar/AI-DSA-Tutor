#!/usr/bin/env bash
# Graceful shutdown for study mode (1.6): backs up SQLite and stops dev servers.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="$REPO_ROOT/.study"
API_URL="${API_URL:-http://localhost:3000}"

echo "■ DSA Mastery OS — stopping"

# 1. Backup SQLite while the API is still up (5.1)
if curl -sf "$API_URL/health/live" >/dev/null 2>&1; then
  echo "  • Backing up SQLite…"
  curl -sf -X POST "$API_URL/api/backup" >/dev/null 2>&1 \
    && echo "  ✓ Backup written" \
    || echo "  ⚠ Backup failed"
fi

# 2. Stop dev servers (tracked PIDs first, then anything left on the ports)
for name in backend frontend; do
  pidfile="$RUN_DIR/$name.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" >/dev/null 2>&1; then
      # Kill the whole process group of the pnpm wrapper.
      pkill -TERM -P "$pid" >/dev/null 2>&1 || true
      kill "$pid" >/dev/null 2>&1 || true
      echo "  ✓ Stopped $name (pid $pid)"
    fi
    rm -f "$pidfile"
  fi
done

for port in 3000 5173; do
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill >/dev/null 2>&1 || true
    echo "  ✓ Freed port $port"
  fi
done

echo "✓ Everything shut down. See you next session."
