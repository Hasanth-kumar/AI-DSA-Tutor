#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp infrastructure/.env.example .env
  echo "Created .env from infrastructure/.env.example — fill in your Notion and WhatsApp credentials."
fi

corepack enable 2>/dev/null || true
pnpm install
pnpm build

mkdir -p data/sqlite
echo "Setup complete. Run: pnpm docker:up && pnpm dev"
