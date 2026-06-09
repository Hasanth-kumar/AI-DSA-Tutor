# DSA Mastery OS

**Personal, single-user system.** This is not a multi-tenant product — it is built for one learner (you), one Notion workspace, one WhatsApp number, and one local SQLite mirror. There is no user accounts layer, auth beyond webhook secrets, or per-user data partitioning by design.

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
│   ├── frontend/     # React + Vite dashboard (Phase 6)
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
- [x] Configurable scoring weights via `WEIGHT_*` env vars
- [x] `explainPriorityScore()` + `GET /api/topics/:id/score/explain`
- [x] Unit tests for all engines (`pnpm --filter @dsa/intelligence test`)

```bash
pnpm --filter @dsa/intelligence test
```

## Phase 2 checklist

- [x] `GET /api/plan/today` — daily study plan with real problem suggestions
- [x] `POST /api/session` — session CRUD + intelligence update
- [x] `GET /api/topics` + `PATCH /api/topics/:id` — read/update topics
- [x] `GET /api/problems` + `PATCH /api/problems/:id` — problem catalog
- [x] `GET /api/revision` — revision queue
- [x] `GET /api/analytics/summary` — weekly stats
- [x] Notion sync — pull + pending replay (bidirectional)
- [x] Session/problem logging updates Notion + marks dirty for sync replay
- [x] Redis cache for plans + BullMQ schedulers (7 AM, 9 PM, 30 min sync, Sunday digest)

## Phase 3 checklist (WhatsApp)

- [x] Meta Cloud API client (`WhatsAppClient`)
- [x] Webhook: `GET|POST /webhooks/whatsapp` (verify + incoming commands)
- [x] Commands: `plan`, `done`, `progress`, `hint`, `help`
- [x] Ollama hints via `HintService`
- [x] Cron notifications: `POST /api/notifications/daily-plan`, `revision-check`, `weekly-digest`
- [x] n8n workflow exports + [workflows/WHATSAPP_SETUP.md](workflows/WHATSAPP_SETUP.md)
- [x] BullMQ schedulers optionally push to WhatsApp

Setup: see [workflows/WHATSAPP_SETUP.md](workflows/WHATSAPP_SETUP.md).

## Phase 4 checklist (Analytics)

- [x] `AnalyticsEngine` — streak, mastery velocity, weakness trend, difficulty analysis
- [x] `GET /api/analytics/summary` — weekly digest with trend highlights
- [x] `GET /api/analytics/streak` — current/longest streak + active days
- [x] `GET /api/analytics/mastery-velocity` — weekly problems/hr + per-topic velocity
- [x] `GET /api/analytics/weakness-trend` — weak-area count over time (session replay)
- [x] `GET /api/analytics/difficulty` — solve rates by difficulty + topic alignment
- [x] Enhanced WhatsApp weekly digest (`progress` command + Sunday cron)
- [x] n8n `weekly-digest.workflow.json` + BullMQ `weekly-digest` scheduler

```bash
pnpm --filter @dsa/intelligence test
pnpm --filter @dsa/backend test
```

## Phase 5 checklist (Advanced AI + External Sync)

- [x] `LLMService` + `OllamaClient` — shared local LLM layer
- [x] Adaptive hints — difficulty-calibrated prompts + `DifficultyEngine` recommendation
- [x] `DebriefService` — LLM session debrief with weakness + streak context
- [x] `GET /api/coaching/debrief` + `GET /api/coaching/hint`
- [x] WhatsApp: `debrief` command + auto-debrief after `done`
- [x] `LeetCodeClient` — public profile stats via GraphQL
- [x] `GET /api/integrations/leetcode/stats` (cached 1h)
- [x] `GitHubClient` — scan repo for solution files, match to problems
- [x] `POST /api/sync/github` — links `github_url` on matched problems

Env: `LEETCODE_USERNAME`, `GITHUB_REPO`, `GITHUB_TOKEN`, `GITHUB_SOLUTIONS_PATH`

## Phase 6 checklist (Web Dashboard)

- [x] `@dsa/frontend` — React + Vite + TypeScript
- [x] Overview — stats, today's plan, velocity + weakness charts
- [x] D3.js knowledge graph — topics as nodes, mastery color, prerequisite edges
- [x] Calendar heatmap — LeetCode-style activity grid
- [x] Session tracker — live timer + `POST /api/session` logging
- [x] Coach chat — free-form DSA Q&A with learning context (`POST /api/coaching/chat`)
- [x] Vite dev proxy + Fastify CORS for local development
- [x] `infrastructure/nginx/nginx.conf` for production static + API proxy

```bash
# One terminal — API + dashboard
pnpm dev:all

# Or split across two terminals:
pnpm dev        # API on :3000
pnpm dev:web    # dashboard at http://localhost:5173
```

**Important:** Open **http://localhost:5173** (Vite dev server). In dev, the dashboard calls the API at `http://127.0.0.1:3000` directly (`packages/frontend/.env.development`). Do not open `packages/frontend/dist/` with Live Server or `serve -s` — those have no API and you will see HTML-instead-of-JSON errors. For a static build behind nginx, use `infrastructure/nginx/nginx.conf`.
