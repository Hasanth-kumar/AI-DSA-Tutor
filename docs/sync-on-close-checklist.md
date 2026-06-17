# Sync-on-Close Implementation Checklist

**Goal:** Keep Notion as the source of truth, keep SQLite as a fast local mirror, and guarantee that local mutations are flushed back to Notion when a study session ends and when the app/localhost is closed.

**Verdict:** Yes — this works *without* destroying the existing structure. The architecture was already built for exactly this model (Notion canonical, SQLite mirror, dirty-queue + replay). The model you describe is ~80% already implemented. The remaining work is purely **additive**: a guaranteed flush on shutdown and a hardening pass. No schema migration, no change to how Notion or SQLite store data.

---

## What already exists (do NOT rebuild)

| Capability | Where | Status |
|---|---|---|
| Notion is the canonical store | `README.md`, `NotionSyncService` | ✅ |
| SQLite mirror, fast local queries | `packages/integrations/src/sqlite/` | ✅ |
| Pull Notion → SQLite, preserve local schedule | `NotionSyncService.pullFromNotion()` + `syncNotionToSqlite()` | ✅ |
| Dirty-queue for local edits (`markTopicDirty` / `markProblemDirty`) | `SyncMetaRepository` | ✅ |
| Replay pending local mutations → Notion on next sync | `NotionSyncService.pullFromNotion()` (replay loop) | ✅ |
| Conflict detection + resolution | `ConflictRepository`, `NotionSyncService.detectConflicts/resolveConflict` | ✅ |
| **Push after each session** (best-effort, queued on failure) | `SessionService.completeSession()` lines ~172–228 | ✅ |
| Sync on startup (`pnpm study`) | `infrastructure/scripts/study.sh` (`POST /api/sync`) | ✅ |
| Manual sync endpoints | `POST /api/sync`, `/api/sync/pull`, `GET /api/sync/status` | ✅ |
| SQLite backup on stop | `infrastructure/scripts/study-stop.sh` → `POST /api/backup` | ✅ |

**Implication:** "after a user session" is *already* satisfied — `completeSession()` marks records dirty and pushes immediately; if the push fails it stays queued and replays next sync. You do not need to touch the session path except to confirm it.

---

## The actual gap

The "on app close / on localhost close" guarantee is missing:

1. `packages/backend/src/server.ts` — the `SIGINT`/`SIGTERM` `shutdown()` handler closes schedulers, context (stops backup + closes SQLite), and the HTTP server. **It does not flush the pending Notion queue first.**
2. `infrastructure/scripts/study-stop.sh` — backs up SQLite but **does not trigger a final Notion sync** before killing the dev servers.
3. There is no **push-only / flush** endpoint. The only writeback path is `POST /api/sync`, which also *pulls* (acceptable, but a last-second pull on shutdown is undesirable — see guardrails).

Net effect today: if a session's best-effort push failed (offline, schema drift) and the user closes the app, those dirty rows sit in the queue until the *next* startup. That is safe (no data loss — SQLite persists the queue), but it is not a guaranteed "sync on close."

---

## Phase 1 — Add a flush (push-only) path

- [x] Add `flushPendingToNotion()` to `NotionSyncService`. It should drain the pending queue **without pulling**: iterate `syncMeta.getPendingTopics()` / `getPendingProblems()`, call `pushTopicToNotion` / `pushProblemToNotion`, and `clearTopic` / `clearProblem` on success. Reuse the existing replay loop logic — factor the loop out of `pullFromNotion()` so both share one implementation. → shared `replayPending()` now backs both pull-replay and flush.
- [x] Return a small result `{ pushedTopics, pushedProblems, failed }` so callers/scripts can log it.
- [x] Add a bounded timeout per push (e.g. `Promise.race` with a 3–5s cap) so a slow/unreachable Notion can never hang shutdown. Failures stay queued (do not clear), exactly like the current best-effort behavior. → `withTimeout()` helper, `PUSH_TIMEOUT_MS = 4000`.
- [x] Add `POST /api/sync/flush` in `packages/backend/src/routes/sync.routes.ts` that calls `flushPendingToNotion()`. Return `503` if Notion isn't configured (mirror the existing `/sync` guard).

## Phase 2 — Flush on graceful server shutdown

- [x] In `packages/backend/src/server.ts`, extend `shutdown()` to call `ctx.notionSync.flushPendingToNotion()` **before** `ctx.close()` (which closes the SQLite handle). Wrap in try/catch — never let a flush error block process exit.
- [x] Guard the flush behind `ctx.notionSync.isConfigured()` so unconfigured/offline setups shut down instantly.
- [x] Make `shutdown()` idempotent / re-entrant safe (a flag) so a double `SIGINT` doesn't run the flush twice. → `shuttingDown` flag.
- [x] Add an overall shutdown deadline (e.g. `setTimeout(() => process.exit(0), 8000)` unref'd) as a hard backstop so the process always exits even if Notion hangs past the per-push timeout.
- [x] Log a one-line summary on shutdown: `flushed N topics / M problems, K queued for next sync`.

## Phase 3 — Flush on app/localhost close (the stop script)

- [x] In `infrastructure/scripts/study-stop.sh`, **before** killing the dev servers and while the API is still up, call `POST /api/sync/flush` (mirror the existing backup `curl` block). Order: flush → backup → kill servers.
- [x] Keep it best-effort: `curl -sf ... || echo "⚠ Flush skipped"`. The `SIGTERM` handler from Phase 2 is the safety net if the curl is skipped or the script isn't used.
- [x] If a desktop wrapper exists (`infrastructure/macapp/`), confirm "Quit" sends `SIGTERM` to the backend (so Phase 2 fires) or invokes `study-stop.sh`. Wire whichever is missing. → `launcher.m` `applicationWillTerminate` already runs `study-stop.sh` synchronously; no change needed.

## Phase 4 — Frontend "closing" signal (optional but recommended)

- [x] In `packages/frontend`, on `window` `beforeunload` / `pagehide`, fire `navigator.sendBeacon('/api/sync/flush')` (beacon survives tab close where `fetch` may not). This covers "user closes the browser tab" even if the backend keeps running. → `src/lib/flushOnClose.ts`, registered in `main.tsx`.
- [x] Debounce so navigating between dashboard views doesn't spam flushes. Treat it as an extra trigger, not the primary guarantee. → 10s debounce.

## Phase 5 — Tests & verification

- [x] Unit test `flushPendingToNotion()`: queue dirty topic + problem → flush → assert push called, queue cleared. Simulate a push failure → assert that row stays queued and others still clear. → `NotionSyncService.flush.test.ts`.
- [x] Unit/integration test `POST /api/sync/flush` (pattern: `packages/backend/src/api.test.ts`): configured → 200 + counts; not configured → 503.
- [x] Test the shutdown deadline: mock a hanging Notion client, assert `shutdown()` resolves within the deadline and the process would exit. → covered at the mechanism level: a never-resolving push is bounded by `PUSH_TIMEOUT_MS`, counted as `failed`, and stays queued (the server.ts 8s `unref` backstop is a defensive layer on top).
- [ ] Manual end-to-end: start `pnpm study`, complete a session **offline** (kill network so the immediate push fails and the row queues), restore network, run `pnpm study:stop`, then confirm in Notion that the topic/problem updated. Repeat using `Ctrl-C` on the backend instead of the stop script to exercise the `SIGINT` path. _(requires a live Notion workspace — run locally)_
- [ ] Confirm `GET /api/sync/status` reports `pendingTopics: 0` / `pendingProblems: 0` after a clean close. _(manual, part of the e2e run above)_

---

## Guardrails / design decisions (baked into the checklist above)

- **Flush is push-only, never pull.** A pull on shutdown could overwrite freshly-edited local rows with stale Notion values (or surface conflicts at the worst moment). Pull stays on the *startup* path, where the merge + conflict logic already lives.
- **Notion stays canonical.** On startup, `pullFromNotion()` pulls Notion → SQLite first, then replays anything that was queued. So even if a shutdown flush is missed, the next startup reconciles. SQLite is never treated as authoritative — it's a durable outbox + cache.
- **No data loss if Notion is down at close.** The dirty queue is persisted in SQLite (`SyncMetaRepository`), survives the close, and replays on next sync. The flush is an optimization on top of an already-safe model — it must never block shutdown.
- **No schema or structural changes.** Everything here is new methods, one new route, and two script/handler edits. Existing tables, Notion DBs, repositories, and the merge engine are untouched.
- **Single-user assumption holds.** No locking/queue infrastructure needed; this matches the project's "one learner, one workspace, one machine" design.

---

## Touch list (files changed)

- `packages/backend/src/services/NotionSyncService.ts` — add `flushPendingToNotion()`, factor out replay loop.
- `packages/backend/src/routes/sync.routes.ts` — add `POST /api/sync/flush`.
- `packages/backend/src/server.ts` — flush in `shutdown()` + hard deadline + re-entrancy guard.
- `infrastructure/scripts/study-stop.sh` — flush before killing servers.
- `packages/frontend/...` — `beforeunload` beacon (optional, Phase 4).
- `packages/backend/src/...test.ts` — new tests.
- Optional: a short ADR in `docs/adr/` recording "flush is push-only on shutdown."

**Not touched:** database schema/migrations, Notion database structure, `SyncMetaRepository` storage format, the merge/conflict engine, `SessionService` (verify only).
