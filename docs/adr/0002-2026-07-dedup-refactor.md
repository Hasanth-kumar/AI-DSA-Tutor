# ADR 0002 — July 2026 dedup refactor conventions

Status: **Accepted** (2026-07-18)
Scope: codebase-wide refactor executed in commits `442d7fc..b8766f1`. Records the
conventions that refactor established so future changes don't reintroduce the
duplication it removed. Duplication measured by jscpd fell 1.29% → 0.47%;
~1,900 net lines removed; behavior unchanged (399 tests green throughout).

---

## Decision A — One topic mapper, in intelligence

`buildTopicState` in
`packages/intelligence/src/analytics/build-topic-snapshot.ts` is the **only**
place raw topic/problem/session rows become a `TopicState`. It accepts
nullable-tolerant row shapes satisfied by both Drizzle rows and analytics
inputs, and takes optional `TopicSignalExtras` (mistake tags, note coverage,
coach assist).

- The backend mirror (`MirrorCache`) passes extras; those fields are always
  populated on that path.
- The analytics path passes **no extras**, and the signal fields stay **absent**
  (not empty) — weakness signals key off their presence. Preserve this split.
- Do not re-copy the mapper into the backend (a full copy lived in
  `backend/src/lib/topic-mapper.ts` until this refactor).

## Decision B — Barrels are the public API

`packages/*/src/index.ts` exports only what another package actually imports.
Internal helpers stay exported from their own modules (tests import them
relatively). When adding an export, ask who outside the package consumes it;
when a consumer disappears, remove the barrel entry.

## Decision C — Frontend types: import domain, re-declare wire

`frontend/src/types/api.ts` re-exports Date-free domain types from
`@dsa/intelligence` (which the frontend already depends on). Types whose Date
fields cross the API as strings/numbers (`Topic`, `StudyPlan`, `Session`) are
re-declared locally in wire form — they are *different types*, not copies.
The frontend must not depend on `@dsa/backend` or `@dsa/integrations`; the
few backend-shaped DTOs (`ReviewCard`, LeetCode stats) stay duplicated by
design.

## Decision D — Chat is stream-only below the send endpoint

`ChatService` exposes stream generators (`sendMessageStream`,
`regenerateMessageStream`, `editMessageStream`) sharing one `streamReply` tail
(meta → chunks → abort handling → persist-with-fallback → done) and one
`resolveContext` helper. The sync `sendMessage` remains only because
`POST /api/coaching/chat` is a live endpoint. Sync `regenerateMessage` /
`editMessage` were deleted — they had no route, caller, or test. Do not add
sync twins for new chat operations; drain the stream instead. The event
protocol is pinned by `backend/src/services/chat-stream.test.ts`.

## Decision E — Route boilerplate is shared, not copied

Established helpers to reuse instead of copying endpoint bodies:
`lib/http.ts#replyServiceError` (404/500 mapping), `startStream` + `sendHint`
(coaching.routes), `registerNotification` (whatsapp.routes), and
`buildHealth(ctx, deep)` (health.service — one builder, probe depth is a flag).

---

## What this refactor deliberately did NOT change

- **Dual scheduling** (per-card FSRS + topic-level SM-2) — see ADR 0001.
- Repository / MirrorCache layering, `context.ts` composition root, and the
  card-bank `SyncTarget` seam — load-bearing architecture, kept as-is.
- The `warmupLlm` config block was removed from `@dsa/shared` (vestigial after
  its consumer was deleted; warm-up is local FSRS cards only).
