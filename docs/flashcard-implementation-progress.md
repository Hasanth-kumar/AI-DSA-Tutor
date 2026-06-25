# Flashcard System — Implementation Progress

Running log for the spaced-repetition flashcard rework. Source of truth:
`docs/flashcard-system-design.md` (Rev 2) and `flashcard-system-validation.md`.

**Validation status: 21 / 103 boxes passing.**

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
