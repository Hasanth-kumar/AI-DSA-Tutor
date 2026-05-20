# DSA Mastery OS

Autonomous learning intelligence over your Notion DSA databases — powered by local AI (Ollama), orchestrated with n8n, delivered via WhatsApp (Meta Cloud API).

## Project layout

```
dsa-mastery-os/
├── infrastructure/   # Docker Compose, setup scripts
├── database/         # Drizzle schema, migrations, seeds
├── packages/
│   ├── backend/      # Fastify REST API
│   ├── intelligence/ # Five intelligence engines (pure TS)
│   ├── integrations/ # Notion, WhatsApp clients
│   └── shared/       # Shared types and utilities
├── workflows/        # n8n workflow JSON exports
└── data/sqlite/      # Local SQLite mirror
```

## Quick start

1. Run first-time setup (creates `.env`, installs deps, builds packages):
   ```bash
   pnpm setup
   ```
   Or manually: `cp infrastructure/.env.example .env` then `pnpm install && pnpm build`

2. Fill in `.env` with your Notion token and database IDs.

3. Start infrastructure (Redis, Ollama, n8n):
   ```bash
   pnpm docker:up
   ```

4. Run the API locally (hot reload):
   ```bash
   pnpm dev
   ```

5. Optional — sync Notion → SQLite mirror:
   ```bash
   pnpm db:seed
   ```

## Health check

`GET http://localhost:3000/health` — returns overall status plus per-service checks (SQLite, Redis, Notion, Ollama).

```bash
bash infrastructure/scripts/health-check.sh
```

## Phase 0 checklist

- [x] pnpm monorepo with `shared`, `intelligence`, `integrations`, `backend`
- [x] Docker Compose: Redis, Ollama, n8n (`backend` available with `--profile full`)
- [x] Drizzle SQLite schema + migration
- [x] Notion client + one-way sync script
- [x] `GET /health` endpoint
- [x] GitHub Actions CI (lint + test)

## Phase 1 checklist

- [x] `TopicPriorityEngine` — composite scoring + daily plan generation
- [x] `RevisionEngine` — SM-2 spaced repetition + revision queue
- [x] `WeaknessEngine` — multi-signal weakness detection
- [x] `DifficultyEngine` — adaptive problem difficulty
- [x] `RoadmapEngine` — DAG prerequisites + violation detection
- [x] `IntelligenceOrchestrator` — wires all engines (`createIntelligenceOrchestrator()`)
- [x] `buildSnapshot()` — intelligence state summary
- [x] Unit tests for all engines (`pnpm --filter @dsa/intelligence test`)

```bash
pnpm --filter @dsa/intelligence test
```

## Phase 3 checklist (WhatsApp)

- [x] Meta Cloud API client (`WhatsAppClient`)
- [x] Webhook: `GET|POST /webhooks/whatsapp` (verify + incoming commands)
- [x] Commands: `plan`, `done`, `progress`, `hint`, `help`
- [x] Ollama hints via `HintService`
- [x] Cron notifications: `POST /api/notifications/daily-plan`, `revision-check`
- [x] n8n workflow exports + [workflows/WHATSAPP_SETUP.md](workflows/WHATSAPP_SETUP.md)
- [x] BullMQ schedulers optionally push to WhatsApp

Setup: see [workflows/WHATSAPP_SETUP.md](workflows/WHATSAPP_SETUP.md).
