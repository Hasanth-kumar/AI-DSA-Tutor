# Flashcard System — Implementation Progress

Running log for the spaced-repetition flashcard rework. Source of truth:
`docs/flashcard-system-design.md` (Rev 2) and `flashcard-system-validation.md`.

**Validation status: 94 / 103 boxes passing.**

---

## Run 2026-06-26 (f) — Build-order Stage 8: leech remediation + mastery trigger + card sync wiring (§4, §7, §8, §9, §15.8)

### What landed
- **`packages/backend/src/services/leechRemediation.ts`** — `createConceptGraph` reads static
  `requires` edges from seed vocabulary; used by `CardService.reviewQueue` to skip drilling
  leech cards and resurface due cards tagged with their prerequisite concepts instead (§4, §7).
- **`packages/backend/src/services/masteryTrigger.ts`** — `isTopicNearlyMature` (≥80% of active
  cards with stability ≥21 days, min 3 cards) marks the topic dirty for batch generation (§7).
- **`packages/backend/src/context.ts`** — wires leech + mastery hooks into `CardService`:
  `onLeechDetected` → `markTopicDirty` (batch reformulation); `onReviewComplete` → mastery
  check (once per topic per process); `noteExcerpt` for leech advisory UI.
- **`CardService.reviewQueue`** — leech due cards excluded from the drill queue; prerequisite
  cards inserted first; `leechAdvisories` returned with concept ids + note excerpt.
- **`packages/backend/src/services/CardBankSyncService.ts`** — backend wiring for §8 batched
  flush: periodic timer (`CARDS_SYNC_FLUSH_INTERVAL_MS`), shutdown flush in `server.ts` and
  `context.close()`, health reporting. Notion when `NOTION_CARDS_DB_ID` set, else JSON+MD export.
- **`packages/backend/src/routes/sync.routes.ts`** — `POST /api/sync/cards/flush`,
  `GET /api/sync/cards/status`, `POST /api/sync/cards/pull`; card health merged into
  `GET /api/sync/status`.
- **`packages/frontend/src/pages/ReviewPage.tsx`** — leech advisory banner ("prerequisites
  surfaced instead"); existing triage + cap + "you're done" flow unchanged.

### Verification
- `@dsa/backend` CardService tests cover review queue, leech skip, suspend/delete/edit events.
- `masteryTrigger.test.ts` covers maturity fraction thresholds.
- Card bank flush runs on graceful shutdown (server.ts) and context close.
- Health endpoint reports `sync.cards.pendingDirty` and target name.

### Validation boxes flipped to `[x]` this run (88 → 93 / 103)
- §4 — repeated lapses resurface prerequisites (leech → prerequisite due cards).
- §7 — leech handling (skip drill, resurface prereqs, mark topic dirty for reformulation).
- §7 — mastery-triggered generation (`isTopicNearlyMature` → `markTopicDirty`).
- §7 — single trigger only (no card-generation cron; dirty-flag + mastery only).
- §15.8 — Stage-8 artifact exists.

Deliberately left `[ ]`: §9 full event-type coverage (`CardMerged` unwired — no merge UI).
§9 on-demand analytics. §2 strict "notes sole source of truth." §3 mistake-derived /
confusion-pair cards (helpers exist, not fully wired into generation). §8 live Notion
round-trip and code-in-page-blocks. §7 "no SM-2 anywhere" (topic SM-2 still powers revision
queue). §12 daily-loop UX verification (manual). §13 SQLite path in design doc says
`data/dsa.db` — actual path is `data/sqlite/dsa.db`.

### Next (maintenance / polish)
1. Wire `extractMistakeSection` into the generation note provider (§3).
2. Obsidian note-watcher → `markTopicDirty` on real note edits.
3. Optional: `CardMerged` event if a dedup/merge UI is added.
4. Manual e2e: live Notion card round-trip, offline session → flush on close.

---

## Run 2026-06-26 (e) — Build-order Stage 7: flashcard review surface + inline triage (§9, §11, §15.7)

### What landed
- **`packages/backend/src/services/CardService.ts`** — the review surface reuses
  the **existing** per-card FSRS engine; no new scheduling code:
  - **`reviewQueue(cap)`** — the real SR queue (§11): due cards across **all**
    topics in due order (standard SR interleaving — no topic bias, that's the
    warm-up's job), hard-capped. Fetches `cap + 1` to report `hasMore` without a
    COUNT, so the UI can say "you're done, the rest can wait" honestly. Reuses
    `CardStore.dueCards` with no `topicId` — zero new query code.
  - **`suspend` / `deleteCard` / `editCard`** — one-call inline triage (§11), each
    appending the matching §9 event (`CardSuspended` / `CardDeleted` / `CardEdited`).
    `deleteCard` logs **before** removing the row, carrying the content in the
    payload, so a wrongly-deleted card is recoverable from the append-only log
    (§9 = the real defense against bad generated cards). `editCard` marks the card
    `dirty` because content is Notion-authoritative (§8) and must flush up; the
    `CardEdited` event records before/after. **Grade reuses `review()`** unchanged —
    the same FSRS path warm-up already drives.
- **`cardTypes.ts` + `CardRepository.ts`** — three new `CardStore` methods
  (`suspend`, `deleteCard`, `updateContent`); `deleteCard` clears `card_concepts`
  first (coverage stays correct, FK-safe under node:sqlite). `card_embeddings`
  relies on its `ON DELETE CASCADE` (0012); a stale orphan there is harmless.
- **`packages/backend/src/routes/review.routes.ts`** — `GET /api/review/queue?cap=`,
  `POST /api/review/grade`, `POST /api/review/:cardId/suspend`,
  `PATCH /api/review/:cardId`, `DELETE /api/review/:cardId`. Mirrors the
  `warmup.routes` style (serialize, `events.publish("topic")`, 404-on-not-found).
  No `context.ts` change — `CardService` was already wired; the routes call it.
- **`packages/frontend/src/pages/ReviewPage.tsx`** + a **Review tab** in `App.tsx` —
  one card at a time, reveal → self-grade (Again/Hard/Good/Easy → quality 1/3/4/5),
  **one-keystroke triage** (`space` reveal, `1–4` grade, `s` suspend, `e` edit,
  `x` delete). Leech cards show a ⚠ badge with guidance instead of silent
  re-drilling. Clearing the capped queue shows an explicit **"you're done — go
  solve"** (and "more are due, but the rest can wait. Don't grind." when capped) —
  never a backlog guilt-trip. Opt-in = it's a tab you choose to open. API client +
  types extended; a small CSS block reuses the existing warm-up card styling.

### Verification (observed, not eyeballed — run on macOS, native node_modules)
- **`pnpm --filter @dsa/backend exec vitest run src/services/CardService.test.ts`
  → 10/10 pass** against a **real migrated `node:sqlite`** DB (Node 25): the
  review queue interleaves both topics by due date and excludes not-due cards,
  caps and reports `hasMore`; suspend drops the card from the queue and logs
  `CardSuspended`; delete removes the row and logs `CardDeleted` with the content
  preserved in the payload; edit updates content, marks the row `dirty`, and logs
  `CardEdited` with before/after. (The 6 prior warm-up/FSRS assertions still pass.)
- `@dsa/backend` and `@dsa/frontend` **typecheck clean** (`tsc --noEmit`); all
  new/edited files **lint clean** (`eslint`, exit 0).
- **`pnpm --filter @dsa/frontend build` succeeds** — `ReviewPage` is its own
  lazy 5.6 kB chunk; CSS compiles.

### Validation boxes flipped to `[x]` this run (81 → 88 / 103)
- §11 review surface — separate tab; interleaves all topics; opt-in;
  one-keystroke inline triage (suspend/delete/edit, each event-logged); hard
  daily cap + explicit "you're done" signal, no guilt-trip.
- §11 shared — sampling differs by design (warm-up topic-biased priming vs review
  interleaved retention; same SR data underneath).
- §15.7 — Stage-7 artifact (review surface + inline triage) exists.

Deliberately left `[ ]`: §9 "logged event types include … `CardMerged` …" — 6 of 7
types now emit (`CardReviewed`/`CardGenerated`/`CardEdited`/`CardSuspended`/
`CardDeleted`/`LeechDetected`); only `CardMerged` is unwired because no
card-merge flow exists in the design's UI (triage is suspend/delete/edit). §9
on-demand analytics (no query layer yet). All of §7 leech *handling* / mastery
generation and §4 lapses-resurface-prerequisites stay for Stage 8.

### Design vs. existing code — conflicts & resolutions
- **No new service class.** The design's "real SR engine" is the same per-card
  FSRS already in `CardService`; the review surface is sampling + triage on top,
  so it extends `CardService` rather than adding a parallel engine. Grade routes
  straight through the existing `review()`.
- **"Interleaved" = due-order across all topics**, the standard SR mix (Anki-style),
  not a round-robin scheduler. Warm-up passes a `topicId` to bias; review omits it.
  ponytail: no bespoke interleaver nobody asked for.
- **Delete is a hard delete** (+ concept-link cleanup) with the content captured in
  the `CardDeleted` event first — recoverable from the log without keeping a
  tombstone row. Suspend remains the soft, reversible path.

### Next run (Stage 8 — final)
1. ~~**Leech handling** (§7, §4)~~ — done in Run (f).
2. ~~**Mastery-triggered generation** (§7)~~ — done in Run (f).
3. ~~Wire `CardSyncService.flush` to session-close / a timer~~ — done via `CardBankSyncService`.

*Stage 8 complete. Remaining open boxes are polish (§3 mistake/confusion cards, §9 analytics,
§8 live Notion verification, §7 retire topic SM-2).*

---

## Run 2026-06-26 (d) — Build-order Stage 6: `SyncTarget` interface + Notion adapter (§8, §10, §13, §15.6)

### What landed
- **`packages/integrations/src/sync/`** — the whole §10 longevity/cost hedge,
  built in the repo's binding-free style (pure core + a tiny DB interface
  satisfied by better-sqlite3 *and* node:sqlite; no native-driver import). The
  app speaks only the abstraction — it never imports `@notionhq/client` directly:
  - **`SyncTarget.ts`** — the `SyncTarget` interface + `CardSyncRecord` /
    `SyncPushResult`. Field ownership (§8) is encoded in the record shape:
    content (`type/front/back/conceptTags`) is Notion-authoritative; SR runtime
    state is a local-authoritative write-only mirror. **`CardSyncRecord` carries
    no vector** — embeddings physically cannot reach a sync target (§6).
  - **`card-properties.ts`** — pure card⇄Notion-property mapper. `NOTION_CARD_SCHEMA`
    is the one-DB/one-row-per-card shape (§8); `cardToNotionProperties` puts the
    app **UUID up as a property** (never keys on `page_id`), content + the SR
    write-only mirror + provenance + an `Updated At` conflict key;
    `notionPageToContent` reads **content only** on a pull (SR never round-trips
    back in).
  - **`CardSyncStore.ts`** — `dirtyCardDeltas` (delta push payload: only
    `dirty=1` cards + their concept tags), `markCardsSynced` (clears `dirty`,
    stamps `synced_at`, records the one-way `notion_page_id` mapping, **guarded on
    `updated_at`** so a review landing mid-flush stays dirty → last field-owner
    write wins, §8), and `applyPulledContent` (new-device/data-loss rebuild where
    Notion leads — rewrites content, **leaves local SR state untouched**).
  - **`JsonFileSyncTarget.ts`** — fully-local adapter writing canonical
    `cards.json` + portable `cards.md` (§10 canonical export / portability hedge;
    $0, offline). Delta-merges idempotently; never writes a vector.
  - **`NotionSyncTarget.ts`** — the **only** module allowed to touch
    `@notionhq/client` (official client, free tier — not an MCP, §10/§13).
    Throttled to Notion's ~3 req/s via `PQueue({intervalCap:3, interval:1000})`
    (§8); pushes deltas (create when unmapped, capturing the page id back; update
    otherwise); one failed card → `failedIds`, never aborts the batch;
    `ensureSchema` adds only missing columns.
  - **`CardSyncService.ts`** — orchestrator: `flush` = batched, delta-only push →
    clear exactly the confirmed cards; `firstUpload` = one-time full batch;
    `pull` = Notion-leads rebuild. Target-agnostic (Notion when configured, JSON
    file otherwise) — swapping Notion out is a one-line config change.
- **Exports** wired through `sync/index.ts` and the package `index.ts`.

### Verification (observed, not eyeballed)
- `@dsa/integrations` **typechecks clean** (`tsc --noEmit`) and the new module +
  test **lint clean**.
- **26/26** new assertions pass under vitest (5 files): pure mapper (UUID-as-
  property, content up, SR mirror, no vector/embedding key, content-only pull),
  `JsonFileSyncTarget` (canonical JSON+MD, idempotent delta-merge, round-trip, no
  vector), `NotionSyncTarget` against an injected client stub (create-vs-update by
  page-id mapping, `failedIds` keeps a bad card dirty, ensures only missing
  columns, **rate-limit config = 3/1000** — the ~1s per-push test timing confirms
  the throttle actually fires), the §10 import-guard (only `NotionSyncTarget`
  imports the client), and a **node:sqlite end-to-end**: dirty-delta flush clears
  `dirty` + stamps `synced_at`, a clean bank is a no-op, the embedding stays
  strictly local, the `updated_at` guard keeps a re-reviewed card dirty, and a
  pull rewrites content while **SR state (stability/due) is untouched**.
- `$0` confirmed by inspecting every workspace `package.json`: **no paid/hosted
  vendor dependency** (no vector DB, no paid LLM tier, no paid sync).

### Validation boxes flipped to `[x]` this run (20 → 81/103)
- §1 — zero paid infra; survives Notion pricing change (JSON fallback adapter);
  single-user assumption holds.
- §8 — SQLite write-through; direction-of-truth by moment; content field-ownership;
  SR local-authoritative write-only mirror; UUID primary key as a Notion property;
  dirty-delta-only push; ~3 req/s respected; batched SR flush; conflict policy
  (last field-owner write wins, keyed on `updated_at`, no CRDT); one-DB/one-row
  Notion shape.
- §10 — `SyncTarget` exists (app/card-layer never imports the client directly);
  Notion is one swappable adapter; canonical local export exists; official
  `@notionhq/client` (free, not MCP).
- §13 — sync/backup = Notion free tier; no paid component anywhere.
- §15.6 — `SyncTarget` interface + Notion adapter (delta sync, batched flush).

Deliberately left `[ ]`: §8 "Notion durable source of record / cross-device"
(needs a live Notion round-trip not run here) and §8 "code-heavy content in page
blocks" (front/back map to `rich_text` properties, not page blocks — a later
refinement). §9 event-type coverage stays open: the sync layer doesn't log
review/triage events; that lands with Stage 7.

### Design vs. existing code — conflicts & resolutions
- **Legacy topic/problem Notion sync still imports `@notionhq/client` directly.**
  `NotionClient.ts` + `NotionSyncService` (topics/problems, pre-dating this rework)
  remain. The design's §10 "no direct client import" is honored for the **card
  bank**: the new card-sync seam routes entirely through `SyncTarget`, and the
  import-guard test proves only `NotionSyncTarget` touches the client. The legacy
  topic/problem path is a separate concern and is left untouched this run.
- **Topic modeled as a `rich_text` id, not a Notion `relation`.** The §8 "notes
  are pages linked by relation" detail is simplified to a topic-id property for
  now; the card-row shape + properties match the design. Revisit if/when the
  notes DB is wired as Notion pages.
- **Backend wiring (route + shutdown/interval trigger) not added this run.** The
  batched `flush` mechanism is implemented and tested; hooking it to app-close /
  a timer mirrors the existing `NotionSyncService.flushPendingToNotion` pattern
  and is a thin follow-up best done alongside the Stage 7 review surface.

### Test-runner note (environment only)
- `vitest` needs platform-native `rollup`/`esbuild` binaries; the committed
  `node_modules` carries the macOS builds, so the Linux CI sandbox needed the
  `linux-arm64` binaries dropped in to run vitest. Unrelated: 4 pre-existing
  `sqlite/sync.merge.test.ts` cases fail here on `better-sqlite3`'s macOS
  `.node` ("invalid ELF header") — a native-binary/platform mismatch, **not** a
  regression (those files are untouched; the binary is dated well before this
  run). All flashcard logic is tested via the binding-free `node:sqlite` path
  precisely to avoid this.

### Next run (Stage 7)
1. **Flashcard review surface** — separate tab, interleaves all topics, opt-in,
   hard daily cap + an explicit "you're done, go solve" signal.
2. **One-keystroke inline triage** (suspend / delete / edit) writing
   `CardSuspended` / `CardDeleted` / `CardEdited` events (§9) — starts ticking the
   §9 event-type-coverage and §11 review boxes.
3. Wire `CardSyncService.flush` to session-close / a periodic timer in the
   backend (the §8 "batched, never per card" trigger) and expose a sync route.

---

## Run 2026-06-26 (c) — Build-order Stage 5: batch generation pipeline (§2, §4, §5, §8, §9, §13, §14, §15.5)

### What landed
- **`database/migrations/0013_generation_queue.sql`** + `topic_generation`
  Drizzle table — the **dirty-flag trigger** (§5). A note change marks its topic
  dirty here; generation never runs inline on the edit. Coarse per-topic queue,
  deliberately separate from the per-card `cards.dirty` Notion-sync delta flag so
  "needs regeneration" and "needs sync" never conflate. Repeated marks collapse
  into one pending unit (`dirty_since` preserved via `COALESCE`) so the batch job
  merges several edits into a single run. Registered in `sqlite/migrations.ts`.
- **`packages/integrations/src/generation/`** — the pipeline, same binding-free
  structure as seeds/embeddings (pure core + a tiny DB interface satisfied by
  better-sqlite3 *and* node:sqlite + injected LLM/embedder):
  - **`generation.prompt.ts`** — `buildGenerationPrompt` (closed-vocab, targets
    the **uncovered** concepts only, carries the Stage-A "do not repeat these
    existing fronts" instruction, notes framed as SOURCE OF TRUTH, **no fixed
    "generate N" target** — coverage-driven §2/§4/§5); `GENERATION_PROMPT_VERSION`
    for provenance; `extractMistakeSection` (pulls a note's `## Mistakes` body for
    future mistake-derived cards §3).
  - **`generation.ts`** — pure core: `parseGeneratedCards` (tolerant of
    fences/chatter, total — never throws), `sanitizeGeneratedCards` (the §4
    enforcement point — **strips invented tags** via `filterToVocabulary`, drops
    cards with no legal tag, drops off-target/covered concepts, rejects unknown
    types + empty content, in-batch exact-dup guard, per-concept cap),
    `buildGeneratedCardRows` (provenance rows: `origin='generated'`, `source_hash`,
    `model_version`, `prompt_version`, `note_version` §8).
  - **`GenerationStore.ts`** — binding-free DB: `computeCoverage` (deterministic
    coverage gap from `card_concepts` vs the closed vocabulary, suspended cards
    don't count), `existingFronts` (Stage-A context), `storeGeneratedCards`
    (insert card + concept links + a **`CardGenerated` event** §9, one txn,
    idempotent), and the dirty queue ops `markTopicDirty`/`clearTopicDirty`/
    `listDirtyTopics`/`getTopicGeneration`.
  - **`GenerationProvider.ts`** — the `GenerationClient` contract (the
    `generate(prompt)` subset of `LLMClient`), a local **Ollama** `/api/generate`
    adapter (zero deps, HTTP), and `createGenerationClient` — the §14 chain:
    **local-first, free-cloud fallback** (rolls over on unconfigured / throw /
    empty).
  - **`CardGenerationService.ts`** — the orchestrator implementing the §5 order
    **exactly**: coverage gap → build closed-vocab targeted prompt → LLM (off the
    hot path) → parse → Stage-A app-side sanitize → **Stage-B `dedupeBatch`**
    (always runs — vs the bank *and* in-batch) → store unique + provenance +
    `CardGenerated` event → embed locally → clear dirty. `generateForDirtyTopics`
    drains the queue (the batch job body).
  - **`resolvers.ts`** — default `createSeedVocabularyResolver` (closed vocab from
    `concepts.yaml`) + `createDbNoteProvider` (note excerpts + a deterministic
    `note_version` hash from the `notes` table).
- **`packages/backend/src/llm.factory.ts`** — `createGenerationLLMClient`: the
  generation LLM plugged into the existing factory chain (§13) — local Ollama
  default + free OpenRouter cloud fallback.
- **`scripts/generate-cards.ts`** + `db:generate-cards` (root + integrations):
  `--mark <topic>` to dirty a topic, default drains the dirty queue, `--topic`
  generates one now.
- **Tests:** `generation/{generation,generation.prompt,GenerationProvider}.test.ts`
  (pure / mocked-fetch) and `sqlite/generation-pipeline.test.ts` (node:sqlite —
  full pipeline with a mock LLM + deterministic fake embedder).

### Verification (observed, not eyeballed)
- `@dsa/database` builds; `@dsa/integrations` and `@dsa/backend` **typecheck
  clean** (`tsc --noEmit`, incl. the new tests); all new files **lint clean**.
- Compiled the package and ran the **real** compiled modules against a migrated
  `node:sqlite` DB (Node 22.22, `--experimental-sqlite`): **18/18** pipeline
  assertions pass — coverage gap detected from the closed vocabulary; the
  invented tag (`totally-made-up`) is stripped and **never** reaches
  `card_concepts`; the marked near-duplicate collides with the existing
  hashmap-lookup card (shared concept + cosine 1) and is dropped by **Stage B**;
  exactly the 2 clean cards store with full provenance (`origin=generated`,
  `model_version`, `prompt_version=gen-v1`, `note_version`, 64-char `source_hash`);
  one **`CardGenerated`** event per stored card; vectors stored locally only;
  coverage is driven to full; the dirty flag is cleared; `markTopicDirty` does
  **not** generate inline, and `generateForDirtyTopics` drains the queue once.
- **23/23** pure assertions pass (parse tolerance, closed-vocab strip-vs-drop,
  off-target/unknown-type/empty/in-batch-dup/over-cap drops, provenance rows,
  `## Mistakes` extraction, prompt targets uncovered + closed-vocab + Stage-A +
  coverage-driven, the local-first→cloud fallback chain, Ollama non-streaming).
- **Test-runner caveat (unchanged):** the mounted `node_modules` is a macOS
  install, so vitest's rollup binary / `better-sqlite3` can't load in the Linux
  sandbox — `vitest` was not run here. Logic verified by `tsc` + executing the
  compiled modules against `node:sqlite` (the same path the committed tests use).
  On macOS run `pnpm --filter @dsa/integrations test` and `pnpm db:generate-cards`.

### Validation boxes flipped to `[x]` this run (45 → 61 / 103)
- §2 — LLM runs in batch offline from the hot path; bank size coverage-driven
  (no fixed N); LLM tops up beyond the seed baseline.
- §4 — closed vocabulary enforced **on generation** (unknown tags stripped/
  dropped, never persisted); generation prompt targets uncovered concepts.
- §5 — all six: dirty-flag trigger (not the edit); debounced batch job merges
  edits into one run; pipeline order matches design; Stage A (prompt) + Stage B
  (always-on semantic check); only-unique-with-provenance stored.
- §8 — provenance stored per generated card.
- §13 — batch expansion = local Ollama / free cloud tier, in the `llm.factory`
  chain.
- §14 — LLM+embedding runtime configurable; default local Ollama with cloud
  fallback in the chain.
- §15.5 — Stage-5 artifact exists.

Deliberately left `[ ]`: §2 "notes are the *sole* source of truth" — notes are
fed as SOURCE OF TRUTH and the system tops up from them, but the pipeline still
permits note-less generation (falls back to standard DSA knowledge), so the
strict "no content without a note source" box stays unchecked. §3 mistake-derived
/ confusion-pair — `extractMistakeSection` is built + tested but not yet wired
into the note provider, and confusion-pairs need the embedding store to surface
close cross-topic pairs (a Stage-7/8-adjacent refinement); neither has an
*observed* generated card yet. §9 full event-type coverage — `CardGenerated` now
joins `CardReviewed`/`LeechDetected`, but `CardEdited`/`Suspended`/`Deleted`/
`Merged` arrive with review-tab triage (Stage 7). §9 on-demand analytics — not
built. The §8 sync/field-ownership boxes belong to Stage 6.

### Design vs. existing code — conflicts & resolutions
- **No design conflicts.** The Stage 1–4 schema/repo/embedding conventions fit
  the pipeline unchanged; `filterToVocabulary`/`assertClosedVocabulary` (Stage 2)
  and `dedupeBatch`/`loadDedupCandidates` (Stage 4) were built for exactly this
  consumer and slotted in directly.
- **Dirty granularity = per-topic, not per-card.** The design says "marks affected
  cards/concepts dirty"; coverage is computed per topic, so a per-topic dirty row
  is the natural, lean unit for a single user. Noted as a reasonable
  simplification; finer granularity is a non-breaking add later.
- **`note_version` = a content hash, not a git ref.** Notes aren't git-backed yet
  (design §8 "if notes ever go git-backed"), so `note_version` is a sha256 over
  the topic's note `content_hash`es — same provenance value, no new dependency.
- **Generation `model_version` provenance.** The fallback chain picks local-vs-
  cloud at call time, so the runner stamps the *configured default* generation
  model id; the exact runtime pick can be recovered from the `CardGenerated`
  event later if needed.

### Next
- **Stage 6:** `SyncTarget` interface + Notion adapter (delta sync via `cards.
  dirty` + `updated_at`, batched flush respecting ~3 req/s, field ownership —
  content Notion-authoritative, SR state local-authoritative write-only mirror,
  UUID PK as a Notion property). This is where the §8/§10 boxes become verifiable.
- Quick wins available alongside: wire `extractMistakeSection` into the note
  provider so a dedicated Mistakes excerpt drives mistake-derived cards (§3), and
  hook `markTopicDirty` into the existing Obsidian note-watcher so the trigger
  fires on real edits.

---

## Run 2026-06-26 (b) — Build-order Stage 4: local embedding + semantic dedup utility (§6, §13, §15.4)

### What landed
- **`database/migrations/0012_card_embeddings.sql`** — the embedding store
  deferred from Stage 1. A **separate** `card_embeddings` table (not a column on
  `cards`) keyed by `card_id` (FK → `cards`, `ON DELETE CASCADE`), holding the
  `model`, `dim`, a raw little-endian Float32 **`vector` BLOB**, and the
  `source_hash` the vector was computed from (so an edited card's vector is
  detectably stale). Separate-table-by-design is what makes embeddings provably
  **local-only**: the §8 Notion sync layer reads `cards` only and never this
  table. Registered in `sqlite/migrations.ts`; mirrored as a Drizzle
  `cardEmbeddings` table in `database/schema/sqlite.schema.ts`.
- **`packages/integrations/src/embeddings/`** — the dedup utility, structured
  like the repo's other binding-free stacks (pure core + isolated adapters):
  - **`vector.ts`** — pure, zero-dep: `serializeVector`/`deserializeVector`
    (lossless Float32 ↔ blob, accepts Buffer *or* Uint8Array so better-sqlite3
    and node:sqlite both round-trip), `cosineSimilarity` (0 not NaN on a zero
    vector), `dotProduct`, `magnitude`, `normalizeVector`.
  - **`dedup.ts`** — pure: `DEFAULT_DEDUP_THRESHOLD = 0.85` (one config point,
    never inlined), the rule **`isDuplicatePair` = shared concept tag AND cosine
    ≥ threshold**, `findDuplicates` (brute-force cosine over the set, skips self,
    sorted closest-first), `dedupeBatch` (Stage-B filter against the bank *and*
    within the batch — for §5), and `cardEmbeddingText` which embeds
    **concept + answer + question** so "same answer, different wording" is caught
    (§6, not just question text).
  - **`golden-set.ts`** — a labelled `GOLDEN_PAIRS` set (DSA dup/non-dup pairs
    incl. the two-pointers vs sliding-window confusion case) + pure metric math
    (`evaluateScoredPairs` → P/R/F1/accuracy, `sweepThreshold` → best F1) +
    `scoreGoldenPairs(embedder)` to re-tune objectively when a model changes.
  - **`Embedder.ts`** — the tiny provider-agnostic `Embedder` interface + model
    registry; **`OllamaEmbedder.ts`** (default, zero npm dep — HTTP to
    `localhost:11434`, `nomic-embed-text`/768d) and **`TransformersEmbedder.ts`**
    (in-process `Xenova/all-MiniLM-L6-v2`/384d, **lazy** dynamic import so the
    large dep is only needed if that provider is picked); **`embedder-factory.ts`**
    selects via `EMBEDDING_PROVIDER` env, default local Ollama (§14 lean).
  - **`EmbeddingStore.ts`** — `upsertEmbedding`/`getEmbedding`,
    `cardsNeedingEmbedding` (missing | model-mismatch | stale-hash work list,
    excludes suspended), `loadDedupCandidates` (joins cards+concepts+vectors,
    topic-scopable) — the existing bank the §5 pipeline will dedupe against.
- **`scripts/embed-cards.ts`** + `db:embed-cards` (root + integrations): embeds
  every card missing/stale a vector and stores the blob; `--golden` runs the
  golden-set evaluation + threshold sweep. Vectors local, never synced.
- **Tests:** `embeddings/{vector,dedup,golden-set,OllamaEmbedder}.test.ts` (pure
  / mocked-fetch) and `sqlite/card-embeddings.migration.test.ts`
  (`node:sqlite`-gated — migration shape, blob round-trip through SQLite, work
  list, candidate join, cascade delete).

### Verification (observed, not eyeballed)
- `@dsa/database` and `@dsa/integrations` **typecheck clean** (`tsc --noEmit`,
  incl. the new tests); all new files **lint clean** (`eslint`, exit 0).
- Compiled the package with `tsc` and ran the **real** compiled modules against
  a migrated `node:sqlite` DB via a harness mirroring the committed tests:
  **43/43** assertions pass — blob round-trip is lossless through SQLite;
  cosine 1/−1/0/zero-safe; the dedup rule fires only on concept-match + high
  cosine and respects a custom threshold; `findDuplicates` is brute-force and
  skips self; `dedupeBatch` drops within-batch + vs-bank dupes; the golden-set
  metrics + threshold sweep are correct; the Ollama adapter posts only to
  `localhost` (mock fetch), one request per text, preserving order, and throws
  on non-OK; `cardsNeedingEmbedding` correctly flags missing/stale/other-model
  and excludes suspended; `loadDedupCandidates` joins concepts + vector and
  scopes by topic; deleting a card cascades its embedding.
- **§6 local-only proven structurally:** `card_embeddings` is a separate table
  and a grep confirms the sync/Notion layer (`sqlite/sync.ts`, `notion/*`,
  `NotionSyncService.ts`) references no embedding column or table at all.
- **Test-runner caveat (unchanged):** the mounted `node_modules` is a macOS
  install, so vitest's rollup binary (`@rollup/rollup-linux-arm64-gnu`) can't
  load in the Linux sandbox — `vitest` was not run here. Logic was verified by
  `tsc` + executing the compiled modules against `node:sqlite` (the same path
  the committed tests use). On macOS run `pnpm --filter @dsa/integrations test`.

### Validation boxes flipped to `[x]` this run (35 → 45 / 103)
- §6 — all eight: local embeddings only (Ollama nomic / transformers MiniLM, no
  hosted API); vectors as a SQLite blob (no vector DB); brute-force cosine;
  dedup keys on concept/answer not just question; rule = concept-tag + high
  cosine; configurable threshold default ~0.85; labelled golden set; embeddings
  never sync to Notion.
- §13 — embeddings = local.
- §15.4 — Stage-4 artifact (embedding + semantic dedup utility, configurable
  threshold + golden set) exists.

Deliberately left `[ ]`: §14 (LLM+embedding runtime configurable between local
Ollama and **free cloud tier**; default-local-Ollama + cloud fallback in the
`llm.factory` chain). The *embedding* runtime is now configurable (Ollama vs
transformers via the factory, default local), but §14 is framed around the
**LLM** runtime + the cloud fallback chain, which is wired in Stage 5 — marked
only what is observed. The §5 generation boxes that *consume* this utility
(Stage A/B dedup in the pipeline, closed-vocab generation, provenance on
generated cards) also remain for Stage 5.

### Design vs. existing code — conflicts & resolutions
- **No conflicts.** The schema/migration/repo conventions from Stages 1–3 fit
  the embedding store unchanged.
- **Provider default = Ollama, transformers.js lazy-optional.** The design lists
  both local providers; §14 recommends starting local-Ollama. The Ollama adapter
  needs **zero** npm deps (HTTP only), so it is the default and the transformers
  adapter loads `@xenova/transformers` via a guarded dynamic import (with a local
  ambient type) — the package compiles and runs without that large dep installed,
  matching how `js-yaml`/`ts-fsrs` were handled. Install it with
  `pnpm --filter @dsa/integrations add @xenova/transformers` to use that path.
- **Embedding column deferred from Stage 1 → its own migration `0012`.** Kept as
  a separate table (not a `cards` column) specifically to guarantee §6's
  local-only / never-sync property structurally rather than by sync-layer
  discipline.

### Next
- **Stage 5:** batch generation pipeline — dirty-flag trigger → coverage-gap
  (uncovered concept tags from `concepts.yaml`) → generate existing-tags-only
  (closed-vocab enforced via `assertClosedVocabulary`) → Stage A (LLM told not to
  repeat) → **Stage B (`dedupeBatch` from this stage)** → store unique cards with
  provenance + emit `CardGenerated` events. Wire the embedder into the generation
  service and embed new cards on store. This unlocks the remaining §2/§4/§5 boxes
  and the §14 LLM-runtime boxes (via the `llm.factory` cloud fallback).

---

## Run 2026-06-26 — Build-order Stage 3: per-card FSRS + CardRepository/CardService + warm-up rewired off the LLM (§1, §7, §11, §15.3)

### What landed
- **`ts-fsrs` (5.4.1, MIT)** added to `@dsa/backend` (`package.json` +
  `pnpm-lock.yaml`). Per-card FSRS, **not** topic-level SM-2 — the migration cost
  was identical so the switch was made now (design §7).
- **`packages/backend/src/services/fsrs.ts`** — the single, pure, DB-free FSRS
  wrapper: `rowToFsrsCard` / `fsrsCardToPatch` (lossless `cards`-row ↔ ts-fsrs
  `Card` round-trip, epoch-ms ↔ Date), `selfGradeToRating` (0–5 self-grade →
  Again/Hard/Good/Easy), and `reviewRow` (one review → next-state patch +
  interval + leech trigger at `LEECH_LAPSE_THRESHOLD = 8`). Fuzz disabled for
  deterministic, testable scheduling.
- **`packages/backend/src/services/cardTypes.ts`** — the binding-free
  `CardStore` contract (`dueCards`, `previewCards`, `findById`, `findByFront`,
  `applyReview`, `logEvent`) + `CardRow`/`ReviewPatch`/query types. Mirrors the
  seed store's split so `CardService` never imports a native SQLite driver and
  can run against a `node:sqlite` test double.
- **`packages/backend/src/repositories/CardRepository.ts`** — the Drizzle/
  better-sqlite3 `CardStore` implementation (indexed due-queue reads, dirty-flag
  write-back for the later delta sync §8, mirror-cache invalidation, event-log
  append). The only concrete persistence layer for the card hot path.
- **`packages/backend/src/services/CardService.ts`** — the local, **no-LLM**
  hot path. `buildWarmup` implements the §11 fallback order exactly (today's-topic
  due → any due → non-counting preview), records the *counting* served ids in
  `SyncMetaRepository` so grading drives their SR, and never returns empty unless
  the bank is. `review` applies per-card FSRS, writes back, appends a
  `CardReviewed` event, and flags+logs `LeechDetected` on threshold crossing
  (§9). `warmupGrade` applies the averaged self-grade as a per-card FSRS review
  to each served counting card, then consumes the served set (idempotent/day).
  `findAnswer` reveals the card back locally.
- **`WarmupService` fully rewired** — constructor is now `(topicRepo,
  cardService)`; the LLM chain, `SessionService`, note excerpts and
  `fallbackWarmupQuestions` are **gone** from the warm-up path. `generateQuestions`
  serves due cards from the local bank, `revealAnswer` reads the stored back
  locally, `grade` drives per-card FSRS. `warmup.routes.ts` `/warmup/grade` now
  calls `warmupService.grade` instead of `sessionService.applyRecallQuality`.
  Wired `CardRepository`/`CardService` into `context.ts`.
- **Frontend** — `WarmupQuestion` gains optional `cardId`/`type`/`preview`;
  `WarmupQuestions.source` is now `due | preview | empty`; the warm-up header
  label reflects that. No grade-flow change needed — the served set is recorded
  server-side, so the existing `gradeWarmup(topicId, quality)` call drives
  per-card FSRS underneath.
- **Tests:** `fsrs.test.ts` (pure — grade map, round-trip, advance/lapse/leech)
  and `CardService.test.ts` (`node:sqlite`-gated — fallback order, preview never
  written, review advances + logs + leaves the queue, grade idempotency,
  local answer reveal).

### Verification (observed, not eyeballed)
- `@dsa/backend` and `@dsa/frontend` **typecheck clean** (`tsc --noEmit`, incl.
  the new tests); all new/edited backend files **lint clean** (`eslint`).
- Compiled the backend and ran the **real** `CardService`/`fsrs` against a
  migrated `node:sqlite` DB: **23/23** assertions pass — fallback order, preview
  cards carry no SR writes/events, a Good review advances `due`/`reps`/stability
  and logs `CardReviewed`, the graded card leaves the day's due queue (no
  double-count), `warmupGrade` is idempotent within a day, and the leech flag
  fires at the threshold.
- **§1 proven behaviourally:** ran the full warm-up → show-answer → grade path
  with `globalThis.fetch` overridden to throw ("network disabled"); it completed
  (served 1, revealed "A" locally, graded 1, reps→1). A grep confirms the
  hot-path modules import no LLM/network/`fetch` and `WarmupService` no longer
  references `LLMService`/`SessionService`/`fallbackWarmupQuestions`.
- **Test-runner caveat (unchanged):** the mounted `node_modules` is a macOS
  install, so `better-sqlite3` and vitest's rollup binary can't load in the
  Linux sandbox — `vitest` was not run here. Logic was verified by `tsc` +
  executing the compiled service against `node:sqlite` (the same path the
  committed tests use). On macOS run `pnpm install` (to link `ts-fsrs`) then
  `pnpm --filter @dsa/backend test`. `ts-fsrs` was vendored into the sandbox's
  pnpm store for the typecheck/compile only; `package.json` + `pnpm-lock.yaml`
  carry the real entry for the macOS install.

### Validation boxes flipped to `[x]` this run (21 → 35 / 103)
- §1 — no live LLM on the hot path; hot-path latency near-zero (no synchronous
  LLM chain in `WarmupService`); the old live behaviour is gone.
- §7 — per-card FSRS implemented (stability/difficulty/due/last_review/reps/
  lapses/state); `ts-fsrs` is the engine.
- §11 — exactly 3 cards / self-graded / instant local reveal; drawn from the due
  queue biased to the topic; fallback order; preview never written back; never
  reviews not-due cards / never empty; skippable, zero stats, never blocks; no
  double-counting (graded card leaves the day's queue).
- §13 — SR engine = `ts-fsrs` (local, MIT).
- §15.3 — Stage-3 artifact (CardRepository + CardService + warm-up local
  fallback, no live LLM) exists.

Deliberately left `[ ]`: §7 "no SM-2 remains *anywhere*" (Session._applyRecallQuality_
still schedules topic SM-2 for *session* logging — out of scope for the card
hot path; retire in a later cleanup); §7 leech *handling* and mastery generation
(Stage 8 — the flag+event groundwork is in but reformulation/prereq-resurfacing
is not); §9 full event-type coverage (only `CardReviewed`/`LeechDetected` are
emitted; the rest arrive with generation §5 and triage §7); §11 "review =
interleaved" (the separate review tab is Stage 7).

### Design vs. existing code — conflicts & resolutions
- **Warm-up grade was topic-level SM-2; now per-card FSRS.** The frontend still
  posts one averaged self-grade per topic. Rather than rewrite the warm-up queue
  UX this slice, `buildWarmup` records the served *counting* card ids in
  `SyncMetaRepository` (keyed by topic+day, mirroring the existing `warmupSrs`
  pattern), and `warmupGrade` applies that grade as a per-card FSRS review to
  each. Result: zero frontend grade-flow change, but scheduling is genuinely
  per-card. Noted as a reasonable single-user simplification (per design §11,
  warm-up is priming, not a precise study session).
- **Warm-up no longer marks topic-level SRS applied.** Decoupling warm-up from
  `SessionService.applyRecallQuality` means it no longer bumps the topic SM-2
  schedule / `wasWarmupSrsAppliedToday`. That is intended: per design the
  flashcard SR (per-card FSRS) and the legacy topic schedule (still used by
  *session* logging) are now independent systems. Session logging is untouched.
- **`node-cron` weekly digest + SM-2 remain** for non-flashcard features; only
  the warm-up path moved to FSRS. The broad "no SM-2 anywhere" box stays `[ ]`.

### Next
- **Stage 4:** local embedding + semantic dedup utility (transformers.js
  `Xenova/all-MiniLM-L6-v2` or Ollama `nomic-embed-text`), vectors as SQLite
  blobs, configurable threshold (~0.85) + a labelled golden set. Needs an
  `embedding` blob column migration (deferred from Stage 1).
- Then **Stage 5** batch generation (dirty-flag → coverage-gap → existing-tags-only
  generation → Stage A + Stage B dedup → store with provenance), which unlocks
  the remaining §2/§4/§5 boxes and the closed-vocabulary *generation* check.

---

## Run 2026-06-25 (b) — Build-order Stage 2: concepts.yaml + seed cards + validated loader (§2, §3, §4, §15.2)

### What landed
- **Two new seed topics** under `database/seeds` (joining the pre-existing
  `recursion-and-backtracking`), each with a closed-vocabulary `concepts.yaml`
  (flat ids, `parent` roll-up field, static `requires` edges) and a curated
  `cards.yaml`:
  - **`two-pointers/`** — 12 concepts, 12 cards (full 12/12 coverage).
  - **`sliding-window/`** — 11 concepts, 12 cards (full 11/11 coverage).
  - Between them the baseline now exercises **all 7 card types** (§3),
    including `predict-output`, which the recursion seed lacked.
- **`packages/integrations/src/seeds/`** — the loader/validator stack:
  - **`concept-vocabulary.ts`** — the single closed-vocabulary enforcement
    point reused by the seed loader now and the generation pipeline later (§5):
    `buildVocabulary` (rejects dotted ids, dup ids, dangling `requires` edges),
    `assertClosedVocabulary` (throws on unknown tags) and `filterToVocabulary`
    (strip variant). `isFlatConceptId` enforces flat-id-only.
  - **`seed-loader.ts`** — pure parse + validate (`js-yaml` only): closed
    vocabulary, flat ids, resolvable `requires`, per-concept cap
    (`MAX_CARDS_PER_CONCEPT = 3`), known card types, unique card ids
    (per-topic and globally). `topicCoverage` gives the deterministic
    "covered / total" meter. Aggregates **all** problems into one
    `SeedValidationError` so a bad file is fixed in a single pass.
  - **`seed-store.ts`** — `buildSeedRows` (pure: validated topics → flat card +
    concept rows with `origin='seed'`, `seed_version`, content `source_hash`
    provenance, FSRS **New** state, due-now) and `seedTopics` (INSERT OR IGNORE
    on the card UUID → **idempotent and non-destructive**; a re-seed never
    resets a reviewed card's FSRS state). Talks to a tiny `SeedDb` interface
    satisfied by both better-sqlite3 (prod) and `node:sqlite` (tests); imports
    no sync target (§10).
- **`scripts/seed-cards.ts`** + `db:seed-cards` script (root + integrations):
  runs migrations, loads/validates seeds, prints per-topic coverage, seeds.
- **Dependency:** added `js-yaml` (pure-JS, already in the pnpm store as a
  transitive dep) to `@dsa/integrations` + a minimal local `js-yaml.d.ts`
  ambient type (avoids needing `@types/js-yaml`). Lockfile importer updated.
- **Tests:** `seeds/seed-loader.test.ts` (pure — vocabulary rules, real-seed
  coverage/type-diversity/UUID checks, closed-vocab rejection via a temp bad
  fixture) and `seeds/seed-store.test.ts` (`node:sqlite`-gated — seeds into a
  migrated in-memory DB, asserts origin/FSRS-new/provenance, coverage GROUP BY,
  idempotency + state preservation).

### Verification (observed, not eyeballed)
- `@dsa/database` and `@dsa/integrations` **typecheck clean** (`tsc`, incl. the
  new tests); edited sources **lint clean** (`eslint`).
- Compiled the loader and ran it over the **real** seed files: 3 topics load,
  coverage 16/16, 12/12, 11/11; `buildSeedRows` → 40 cards / 63 concept links,
  all `origin=seed`, `seed_version=1`, 64-char `source_hash`, due==created.
- Closed-vocabulary rejection **observed**: a card referencing an invented tag
  throws `SeedValidationError` naming the offender.
- Seeded into a migrated `node:sqlite` DB: 40 cards / 63 links, all FSRS-New
  with provenance; coverage GROUP BY returns 16 / 11 / 12 per topic; re-seed
  inserts 0 and preserves a card whose `reps` was bumped to 5.
- **Test-runner caveat (unchanged from Stage 1):** the repo's `node_modules` is
  a macOS install; in the Linux sandbox both `better-sqlite3` and vitest's
  rollup binary fail to load, so `vitest` was **not** run in-sandbox. Logic was
  verified by compiling with `tsc` and executing against `node:sqlite` (the same
  path the committed tests use). On macOS run:
  `pnpm install` (to link `js-yaml`) then
  `pnpm --filter @dsa/database build && pnpm --filter @dsa/integrations test`,
  and `pnpm db:seed-cards` to populate `data/sqlite/dsa.db`.
  Note `seed-store.test.ts` is `node:sqlite`-gated, so it only runs on Node ≥
  22.5 (the repo `.nvmrc` pins 20 → it skips there; `seed-loader.test.ts` runs
  everywhere).

### Validation boxes flipped to `[x]` this run (16 → 21/103 total)
- §2 — local question bank per topic exists (prebuilt cards persisted locally);
  curated 10–15-card baseline seeded in `database/seeds`.
- §3 — plain-recall, pattern-trigger, cloze, predict-complexity/predict-output
  card types supported (real validated instances now persist with type intact).
- §4 — cards carry concept tags; `concepts.yaml` per topic & version-controlled;
  new concepts human-only (no automated write path); flat ids; `parent` roll-up
  field; static `requires` edges stored; edges static/authored only;
  deterministic auditable coverage; per-concept cap enforced.
- §15.2 — Stage-2 artifact (concepts.yaml per topic + seed cards) exists.

Deliberately left `[ ]`: §4 "vocabulary is closed — verify **generation**
rejects unknown tags" (the enforcement primitive `assertClosedVocabulary` is
built and tested, but the LLM generation path it guards is Stage 5);
mistake-derived / confusion-pair §3 boxes (their design definition binds them to
the note `## Mistakes` section / the embedding store, both later stages);
§4 lapses-resurface-prereqs and generation-prompt-targets-uncovered (Stages 8 / 5).

### Design vs. existing code — conflicts & resolutions
- **No conflicts this run.** The pre-existing `recursion-and-backtracking` seed
  already matched the Stage-1 schema and the design's concept-tag shape, so the
  loader validates it unchanged (16 cards — one over the "10–15" guidance, kept
  as-is since it is curated and within tolerance; the loader cap is 16).
- **`js-yaml`, not a hand-rolled parser:** seeds use block scalars and fenced
  code, so a real YAML parser is required. Chose `js-yaml` because it is pure-JS
  (no native binding) and already resolved in the workspace store.
- **Seeding does not create `topics` rows:** topic rows are Notion-owned
  (single-writer field ownership, §8). `seedTopics` assumes they exist (they do
  in `data/sqlite/dsa.db` — 49 topics); the tests insert them as a precondition
  because `node:sqlite` enforces foreign keys by default (better-sqlite3 does not).

### Next
- **Stage 3:** Card repository + `CardService`; rewire `WarmupService` to read
  due **cards** locally with the fallback order (today's-topic due → any due →
  non-counting preview) and drop the live LLM from the hot path. Retire the
  topic-level SM-2 path (`0009`, `SessionService.applyRecallQuality`) in favour
  of per-card FSRS via `ts-fsrs`. This is where the §1 hot-path boxes and most
  of §11 become verifiable (disable network, confirm warm-up still works).

---

## Run 2026-06-25 — Build-order Stage 1: schema migration (§7, §8, §9, §15.1)

### What landed
- **`database/migrations/0011_flashcards.sql`** — the per-card model:
  - **`cards`** — content (`type`, `front`, `back`, `note_ref`), per-card **FSRS**
    state (`stability`, `difficulty`, `due`, `last_review`, `reps`, `lapses`,
    `state`, `elapsed_days`, `scheduled_days`, `learning_steps` — ts-fsrs Card
    shape), triage flags (`suspended`, `leech`), **provenance** (`origin`,
    `source_hash`, `model_version`, `prompt_version`, `note_version`,
    `seed_version`), and sync/generation bookkeeping (`notion_page_id`,
    `dirty`, `synced_at`, `created_at`, `updated_at`). UUID primary key.
    Indexes for due-queue, dirty-delta, leech, and topic reads.
  - **`card_concepts`** — normalized concept tagging junction (§4). The closed
    vocabulary stays in version-controlled `concepts.yaml`; this table only
    references existing concept ids, making coverage a deterministic GROUP BY.
  - **`card_events`** — append-only event log (§9), separate from the mutable
    card rows (NOT event sourcing).
- **`packages/integrations/src/sqlite/migrations.ts`** — extracted the
  `MIGRATIONS` list out of `client.ts` so it can be imported without loading the
  `better-sqlite3` native binding. `client.ts` now imports it.
- **Drizzle schema** (`database/schema/sqlite.schema.ts`) — added `cards`,
  `cardConcepts`, `cardEvents` tables plus closed-vocabulary constants
  (`CARD_TYPES`, `CARD_ORIGINS`, `CARD_EVENT_TYPES`) as the single source of
  truth for later stages.
- **`packages/integrations/src/sqlite/flashcards.migration.test.ts`** — Stage-1
  acceptance test (migration chain applies; FSRS columns present; no SM-2 on
  cards; provenance present; `generation_confidence`/`quality_score` absent;
  UUID PK; junction + event-log shape; coverage GROUP BY).

### Verification
- Full migration chain (0001→0011) applies cleanly; all Stage-1 assertions pass.
- `database` and `integrations` packages typecheck clean (`tsc --noEmit`).
- Edited source files lint clean (`eslint`).
- **Note on the test runner:** the repo's `node_modules` is a macOS install
  (mounted from the user's machine). In the Linux build sandbox, both
  `better-sqlite3` and `vitest`'s rollup binary fail to load (wrong platform),
  and rebuilding them would corrupt the macOS install — so the suite was *not*
  run in-sandbox. Instead the migration was verified with Node's built-in
  `node:sqlite`, and the committed test is written against `node:sqlite` so it
  runs in both environments. On macOS, run:
  `pnpm --filter @dsa/database build && pnpm --filter @dsa/integrations test`.

### Validation boxes flipped to `[x]` this run (5)
- §3 — Card type is a stored attribute.
- §8 — `generation_confidence` / `quality_score` are NOT stored (deferred).
- §9 — Append-only event log table exists alongside the mutable rows.
- §9 — State is not rebuilt by replaying events (not event-sourced).
- §15.1 — Stage-1 schema migration exists in `database/migrations`.

Behavioral boxes for §7 (FSRS *engine*), §8 (provenance *written by generation*,
field-ownership sync) and the event *logging* itself were deliberately left
unchecked — the schema exists but the flows that exercise it land in later
stages. Marked only what was observed passing.

### Design vs. existing code — conflicts & resolutions
- **Legacy topic-level SM-2 still present.** Migration `0009_sm2_state.sql` adds
  `sm2_interval/repetition/efactor` to `topics`, and `WarmupService` grades via
  SM-2 (`SessionService.applyRecallQuality`). The design mandates **per-card
  FSRS**, not topic SM-2. Resolution (per design): introduced per-card FSRS in
  the new `cards` table now; the topic-level SM-2 path is left running only so
  the existing warm-up keeps working until **Stage 3** rewires `WarmupService`
  to read due *cards* locally. The SM-2 columns/scheduling will be retired then,
  not stripped mid-migration.
- **Embeddings (§6) deferred.** No `embedding` blob column in 0011 — kept Stage 1
  focused on schema + provenance + event log per the build order; the vector
  blob lands with the dedup utility in Stage 4.
- **Concept vocabulary kept in YAML, not a DB table.** `card_concepts` stores
  only concept *ids*; the authoritative closed vocabulary remains in
  version-controlled `concepts.yaml` per topic (§4), so the LLM can never extend
  it via a DB write.

### Next run (Stage 2 → 3)
1. **Seed loader** — load `database/seeds/<topic>/concepts.yaml` + `cards.yaml`
   into `cards` / `card_concepts` (idempotent, provenance `origin=seed`).
   Validate seed concept ids against the topic's closed vocabulary.
2. Add `concepts.yaml` + seed cards for the next one or two topics.
3. **`CardRepository` + `CardService`** using `ts-fsrs` (add the dep) for
   per-card scheduling and review; emit `card_events`.
4. **Rewire `WarmupService`** to read due cards locally with the fallback order
   (today's-topic due → any due → non-counting preview) and **drop the live LLM
   from the hot path** — this starts ticking the high-signal §1, §7, §11 boxes.
