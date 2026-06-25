# Flashcard System — Implementation Progress

Running log for the spaced-repetition flashcard rework. Source of truth:
`docs/flashcard-system-design.md` (Rev 2) and `flashcard-system-validation.md`.

**Validation status: 5 / 103 boxes passing.**

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
