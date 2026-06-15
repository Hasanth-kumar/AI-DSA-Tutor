#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000/health}"

echo "Checking API at $API_URL ..."
curl -sf "$API_URL" | jq . 2>/dev/null || curl -sf "$API_URL"
echo ""
echo "Done."
