# DSA Mastery OS — Flashcard System Validation Checklist

> Acceptance criteria derived from `flashcard-system-design.md` (Rev 2, 2026-06-25).
> Each item is a testable pass/fail check confirming the implementation matches
> design intent. Section numbers map 1:1 to the design doc.
> Mark `[x]` when verified. A failing box = drift from the intended design.

---

## §1 Goals & constraints

- [x] **No live LLM on the hot path.** Warm-up, show-answer, and review complete with zero LLM/network calls. Verify by disabling network and confirming all three flows still work.
- [x] **Hot-path latency is near-zero.** Show-answer and warm-up card load read only from local store; no synchronous LLM chain invocation remains in `WarmupService`.
- [x] **The old live behavior is gone.** Confirm `WarmupService` no longer calls the LLM chain for question generation *or* answer reveal.
- [ ] **Zero paid infrastructure.** No hosted vector DB, no paid LLM tier, no paid sync. Inspect dependencies/config and confirm every component is free-tier or local.
- [ ] **Survives Notion pricing change.** App degrades gracefully (or swaps adapter) if Notion becomes paid — see §10.
- [ ] **Single-user assumption holds.** No multi-user/auth complexity added that contradicts the single-user scope.

## §2 Core architecture

- [ ] **Notes are source of truth for content.** Cards are derived from notes; no card content is invented without a note source.
- [ ] **LLM runs in batch, offline from hot path** — triggered only on note change / mastery triggers, never on review/warm-up.
- [x] **Local question bank per topic exists** — prebuilt + cached cards persisted locally, accumulating over time.
- [ ] **Bank size is coverage-driven, not a fixed target.** No hard-coded "30–50 cards/topic" (or similar) count anywhere in generation logic.
- [x] **Curated baseline seeded** — 10–15 high-quality, version-controlled cards per topic exist in `database/seeds`.
- [ ] **LLM tops up from notes** beyond the seed baseline rather than replacing it.

## §3 Card types

- [x] **Plain recall** card type supported (atomic fact: complexity, definition).
- [x] **Pattern-trigger** card type supported (front = problem signal, back = pattern name).
- [x] **Cloze on canonical code** card type supported (single blanked line).
- [x] **Predict-the-complexity / predict-the-output** card type supported.
- [ ] **Mistake-derived** cards generated from the `## Mistakes` section of a note.
- [ ] **Confusion-pair** discrimination cards supported, sourced via the embedding store.
- [x] **Card type is a stored attribute** so generation/sampling/analytics can distinguish them.

## §4 Concept inventory (coverage + dedup backbone)

- [x] **Cards carry one or more concept tags** from a per-topic vocabulary.
- [x] **`concepts.yaml` exists per topic** and is version-controlled.
- [ ] **Vocabulary is closed.** The LLM assigns cards to existing concepts only — it can never invent a new tag. Verify generation rejects/strips unknown tags.
- [x] **New concepts are added only by a human edit to `concepts.yaml`**, not by any automated path.
- [x] **Tags are flat IDs**, not dotted/hierarchical strings (no `arrays.hashmap.lookup`).
- [x] **Optional `topic`/`parent` field** in YAML provides roll-up coverage without encoding hierarchy in the tag string.
- [x] **Static `requires` prerequisite edges** are stored in `concepts.yaml` (e.g. `sliding-window requires: [two-pointers, frequency-counting]`).
- [x] **Prerequisite edges are static/authored only** — no learned or dynamically mutated graph.
- [ ] **Repeated lapses resurface prerequisites** instead of random review.
- [x] **Coverage = concept tags with ≥1 card**, computed deterministically and auditable (e.g. "Two Sum: 8/11 concepts covered").
- [ ] **Generation prompt targets uncovered concepts** ("produce cards only for these untagged concepts: …"), not "generate N questions."
- [x] **Per-concept card cap enforced** (2–3 angles max) to keep the bank lean.

## §5 Generation pipeline

- [ ] **Trigger is a dirty flag, not the edit itself.** A note change marks affected cards/concepts `dirty`; generation does not run inline on edit.
- [ ] **Debounced batch job** (on idle / nightly) performs the actual generation, merging multiple edits into one run.
- [ ] **Pipeline order matches design:** notes + seeds + existing cards → identify uncovered tags → generate only for those (existing tags only) → Stage A dedup → Stage B dedup → store unique + provenance.
- [ ] **Stage A dedup:** LLM is instructed not to repeat existing concepts.
- [ ] **Stage B dedup:** app-side semantic check always runs — the LLM's word is never trusted alone.
- [ ] **Only unique cards are stored**, each with provenance (see §8).

## §6 Duplicate detection (embeddings, no vector DB)

- [x] **Local embeddings only** — `nomic-embed-text` via Ollama, or `Xenova/all-MiniLM-L6-v2` via transformers.js in the Node backend. No hosted embedding API.
- [x] **Vectors stored as a blob in SQLite** (no separate vector DB).
- [x] **Brute-force cosine similarity** over the card set is the matching method.
- [x] **Dedup keys on concept/answer, not just question text** — same answer + different wording is caught.
- [x] **Duplicate rule = concept-tag match + high cosine.**
- [x] **Threshold is configurable**, default ~0.85, not hard-coded in-line.
- [x] **Labelled golden set** of known duplicate / non-duplicate pairs exists for objective re-tuning when models change.
- [x] **Embeddings never sync to Notion** — local only.

## §7 Spaced repetition

- [x] **Per-card FSRS implemented** (not topic-level SM-2). Each card stores `stability`, `difficulty`, `due`, `last_review`, `reps`, `lapses`, `state`.
- [x] **`ts-fsrs` (MIT) is the engine** used for scheduling.
- [ ] **No SM-2 / single-`ease` model remains** anywhere in scheduling.
- [ ] **Leech handling exists** — cards repeatedly lapsed are flagged and either reformulated by the LLM or have their source note section / prerequisite concepts resurfaced (not drilled forever).
- [ ] **Mastery-triggered generation** fires when a topic's cards are nearly all mature (high stability / long intervals), producing harder cards.
- [ ] **Single trigger only** — the parallel weekly cron is dropped; only a lightweight bounded fallback remains for when the trigger never fires.

## §8 Data model (Notion canonical, SQLite write-through cache)

- [ ] **Notion is durable source of record** + cross-device sync + backup.
- [ ] **SQLite is write-through, not a passive mirror** — reviews write to SQLite first (instant), then flush to Notion in the background.
- [ ] **Direction of truth by moment is honored:** day-to-day SQLite leads / Notion follows; on new device or data loss, Notion leads and rebuilds SQLite.
- [ ] **Field ownership enforced — content fields (front, back, concept tags) are Notion-authoritative.**
- [ ] **SR runtime state (stability, difficulty, due, reps, lapses, last_review) is local-authoritative**, pushed to Notion as a write-only mirror.
- [ ] **Provenance stored per generated card:** `source_hash` + `model_version` + `prompt_version` (and `note_version` if notes go git-backed).
- [x] **`generation_confidence` and `quality_score` are NOT stored** — deferred, derivable from the event log later.
- [ ] **Code-heavy content lives in the card body / page blocks**, not Notion property fields (avoids length/formatting limits) — or such cards are kept local-authoritative.
- [ ] **Primary key is an app-generated UUID**, stored as a Notion property — the app never keys on Notion's internal `page_id`.
- [ ] **Sync pushes only dirty deltas** (tracked via `updated_at` + dirty flag); first upload may be a one-time batch.
- [ ] **Notion ~3 req/s rate limit respected** by the sync layer.
- [ ] **SR flush is batched** (session-close or every few minutes), never per card.
- [ ] **Conflict policy = last field-owner write wins, keyed on `updated_at`.** No CRDT / multi-paragraph merge logic present.
- [ ] **Notion shape = one database, one row per card** with the specified properties (stability, difficulty, due, reps, lapses, last_review, front, back, concept-tags, source-hash, model-version, prompt-version, uuid); notes are pages linked by relation.

## §9 Event log & analytics

- [x] **Append-only event log table exists alongside the mutable rows.**
- [ ] **Logged event types include:** `CardReviewed`, `CardGenerated`, `CardEdited`, `CardSuspended`, `CardDeleted`, `CardMerged`, `LeechDetected`.
- [x] **State is NOT rebuilt by replaying events** — live SR/FSRS state stays in its own table (not event-sourced).
- [ ] **Analytics are computable on demand from the log** (coverage/retention trends, per-card quality, auto-retire candidates) without extra stored columns or history backfill.

## §10 Cost / longevity hedge

- [ ] **`SyncTarget` interface exists** and the app never imports the Notion client directly.
- [ ] **Notion is one swappable adapter** behind that interface (alternatives: Git+Markdown, Google Sheet, SQLite-in-Dropbox) — swapping requires changing only the adapter.
- [ ] **Canonical local export (Markdown/JSON) exists** so the bank is portable.
- [ ] **Running app uses the official `@notionhq/client` (free), not an MCP.**

## §11 Two UI surfaces (kept separate)

### Warm-up (gateway)

- [x] **Exactly 3 cards** (`QUESTION_COUNT = 3`), self-graded, instant answer reveal from local DB.
- [x] **Cards drawn from today's due queue, biased toward the about-to-solve topic** — they are the first reps of SR review, not extra work.
- [x] **Fallback order implemented:** due cards of today's topic → any due card → a few non-counting "preview" cards.
- [x] **Preview cards are never written back to SR.**
- [x] **Warm-up never reviews not-due cards** (must not break SR) and **never shows an empty screen.**
- [x] **Warm-up is skippable, shows zero stats, and never blocks the problem.**

### Flashcard review (real SR engine)

- [ ] **Separate tab** from warm-up.
- [ ] **Interleaves all topics** (for retention).
- [ ] **Opt-in**, intended for days with spare time.
- [ ] **One-keystroke inline triage** — suspend / delete / edit a card during review, each logged to the event log (§9).
- [ ] **Hard daily cap on the queue** plus an explicit "you're done, go solve" signal; no guilt-trip toward clearing backlog.

### Shared behavior

- [x] **No double-counting** — a card used in warm-up leaves the review queue for that day.
- [ ] **Sampling differs by design:** warm-up = current topic (priming); review = interleaved (retention); both share the same SR data underneath.

## §12 Daily loop

- [ ] **Daily flow supports the 1-hour budget:** warm-up (3 cards, ~2–3 min) → solve (~45 min) → update note (~5 min) → optional capped review. Nothing in the flow forces extra time.

## §13 The $0 stack

- [ ] **Hot store = SQLite** at `data/dsa.db`.
- [x] **SR engine = `ts-fsrs`** (local, MIT).
- [x] **Embeddings = local** (Ollama `nomic-embed-text` or transformers.js).
- [ ] **Batch expansion = local Ollama (Llama 3.1 / Qwen2.5) or free cloud tier (Gemini / Groq)**, plugged into the existing `llm.factory` chain.
- [ ] **Sync/backup = Notion free tier.**
- [ ] **No paid component anywhere** in the stack.

## §14 Open decision (runtime choice)

- [ ] **LLM + embedding runtime is configurable** between fully-local Ollama and free cloud tier.
- [ ] **Default starts local (Ollama)** for privacy + true $0, with the cloud provider kept as a fallback in the `llm.factory` chain.

## §15 Build-order traceability

> Confirms the build followed the intended sequence and each stage's artifact exists.

- [x] **1.** Card + concept-tag + per-card FSRS schema, provenance fields, and append-only event-log table exist as a migration in `database/migrations`.
- [x] **2.** `concepts.yaml` per topic (closed vocabulary + prerequisite edges) and seed cards for the first few topics exist in `database/seeds`.
- [x] **3.** Card repository + `CardService` exist; `WarmupService` reads due cards locally with the fallback order and no live LLM on the hot path.
- [x] **4.** Local embedding + semantic dedup utility exists (configurable threshold + golden set).
- [ ] **5.** Batch generation pipeline exists (dirty-flag trigger → coverage-gap → generate → dedup → store, with provenance).
- [ ] **6.** `SyncTarget` interface + Notion adapter exist (delta sync, batched flush).
- [ ] **7.** Flashcard review surface exists (separate tab, interleaved, capped) with inline triage.
- [ ] **8.** Leech detection + mastery-triggered generation exist (using prerequisite edges).

---

### How to use this checklist

Walk each section against the implementation. A box passes only when the behavior is **observed**, not merely present in code — prefer running the flow (e.g. disable network and review a card) over reading the source. The highest-signal checks to verify first: no live LLM on the hot path (§1), closed concept vocabulary (§4), per-card FSRS (§7), field-ownership / single-writer sync (§8), and the warm-up fallback never breaking SR (§11).
