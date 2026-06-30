# DSA Mastery OS — Flashcard & Warm-up System Design

> Summary of design decisions worth implementing. Source of truth for the
> spaced-repetition flashcard rework. Date: 2026-06-25 (Rev 2).
>
> **Implementation status:** see `flashcard-system-validation.md` (100/103 boxes)
> and `docs/flashcard-implementation-progress.md` for the build log. Stages 1–8
> of §15 are complete. Remaining 3 boxes are design-decision or live/manual checks,
> not code: §7 "no SM-2 anywhere" (conflicts with the intentional topic-level
> revision SM-2 — card scheduling is already FSRS-only), live Notion e2e (§8),
> and the daily-loop UX budget (§12). notes-sole-source (§2) and code-in-page-blocks
> (§8) are now done.

> **Rev 2 changes:** adopted FSRS over SM-2 (§7); enforced a fixed concept
> vocabulary the LLM may not extend (§4); added provenance fields and an
> append-only event log (§8–9); batch generation on a dirty flag (§5); static
> prerequisite edges (§4); configurable dedup threshold + golden set (§6);
> warm-up fallback + one-keystroke card triage (§11). Removed the fixed
> 30–50 cards/topic target in favour of coverage-driven generation, and trimmed
> last-writer-wins prose to single-user reality. Deferred (compute later from
> the event log, don't store now): per-card `generation_confidence` and
> `quality_score`.

## 1. Goals & constraints

- **Time-boxed learner:** ~1 hour/day typical, 2 hours occasionally. The
  problem-solving is the point; everything else must be fast and optional.
- **Near-zero latency UX:** no live LLM calls on the hot path (warm-up,
  show-answer, review). The current `WarmupService` calls the LLM chain live
  for both question generation *and* answer reveal — that's what we're removing.
- **Free of cost, single user:** no paid infra (no hosted vector DB, no paid
  LLM tier required). Must survive Notion ever changing its pricing.

## 2. Core architecture

- **Notes are the source of truth.** Cards are derived from your notes, not
  invented in a vacuum.
- **LLM is a content-expansion engine, not a live question generator.** It runs
  occasionally (on note change / mastery triggers), in batch, offline from the
  hot path.
- **Local question bank per topic.** Prebuilt + cached cards, built up over time
  (not all hand-written). Bank size is **coverage-driven, not a fixed target**
  (see §4): some topics deserve 12 cards, others 90.
- **Seed a curated baseline.** 10–15 high-quality, version-controlled cards per
  topic in `database/seeds`; LLM tops up the rest from notes.

## 3. Card types (diversify beyond fact recall)

- **Plain recall** — atomic fact (complexity, definition).
- **Pattern-trigger** — front = problem signal ("sorted array, find pair summing
  to target"), back = pattern name ("two pointers"). Highest-leverage type;
  trains the recognition→pattern mapping.
- **Cloze on canonical code** — blank out the one line people get wrong (binary
  search `lo/hi/mid` update, heapify direction).
- **Predict-the-complexity / predict-the-output** — given a snippet, state Big-O
  or return value.
- **Mistake-derived** — generated from the `## Mistakes` section of the note
  ("you first reached for nested loops — why doesn't that scale?"). Highest
  personal value; targets *your* actual gaps.
- **Confusion-pair** — discrimination cards between semantically close topics
  (two-pointers vs sliding-window), found via the embedding store.

## 4. Concept inventory (coverage + dedup backbone)

- Each card is tagged with one or more **concept tags** from a small per-topic
  vocabulary (e.g. `hashmap-lookup`, `complement-trick`, `duplicate-handling`,
  `overflow`, `memory-tradeoff`).
- **Concepts are a closed, deterministic vocabulary.** Tags live in a
  version-controlled `concepts.yaml` per topic. The LLM **assigns cards to
  existing concepts only — it never invents new tags.** New concepts are added
  by you, deliberately. This is the one decision that's expensive to undo: it
  stops the taxonomy drifting into `hashmap` / `HashMap` / `hash-map` / `maps` /
  `dictionary`.
- **Keep tags flat, not dotted.** Each concept is a flat ID with an optional
  `topic`/`parent` field in the YAML for roll-up coverage ("Arrays 83%",
  "HashMaps 100%"). Don't encode hierarchy in the tag string (`arrays.hashmap.
  lookup`) — it's rigid and painful to refactor; a parent field gives the same
  analytics without the lock-in.
- **Prerequisite edges.** `concepts.yaml` also stores static `requires` edges
  (e.g. `sliding-window requires: [two-pointers, frequency-counting]`). When you
  keep lapsing a concept, the system resurfaces its prerequisites instead of
  random review. Static, authored edges only — no learned/dynamic graph.
- **Coverage = which concept tags have ≥1 card.** Deterministic, auditable,
  doubles as a progress meter ("Two Sum: 8/11 concepts covered").
- Generation prompt = "produce cards only for these untagged concepts: […]" —
  not "generate N questions."
- **Cap cards per concept** (2–3 angles max) so the bank stays lean.

## 5. Generation pipeline

- **Trigger = dirty flag, not the edit itself.** A note change marks affected
  cards/concepts `dirty`; a debounced batch job (on idle / nightly) does the
  actual generation. This lets you merge several edits, batch embeddings, and
  avoid duplicate generation runs — and it's cheaper.

```
Note + manual seed cards + existing cards (from DB)
        │
        ▼
LLM: identify uncovered concept tags (from concepts.yaml) →
     generate cards ONLY for those, assigning existing tags only
        │
        ▼
Stage A dedup: LLM told not to repeat existing concepts (~80% of dupes)
        │
        ▼
Stage B dedup: app-side semantic check (never trust LLM alone)
        │
        ▼
Store only unique cards (+ provenance: model/prompt/source — see §8)
```

## 6. Duplicate detection — embeddings, NO vector DB

- **Local embeddings**, free: `nomic-embed-text` via Ollama, or
  `Xenova/all-MiniLM-L6-v2` via transformers.js inside the Node backend.
- Store the vector as a **blob in SQLite**. Brute-force cosine over a few
  thousand cards is sub-millisecond — no vector DB needed.
- **Dedup on concept/answer, not just question text** — same answer, different
  wording = duplicate. Concept tag match + high cosine = duplicate.
- **Threshold is configurable, default ~0.85** (MiniLM scores run high; you'll
  tune it experimentally). Keep a small **labelled golden set** of known
  duplicate / non-duplicate pairs so you can re-tune objectively whenever you
  swap embedding models, instead of eyeballing it.
- Embeddings stay **local only** — never synced to Notion.

## 7. Spaced repetition

- **Per-card FSRS, not topic-level SM-2.** Each card carries its own FSRS state
  (`stability`, `difficulty`, `due`, `last_review`, `reps`, `lapses`, `state`).
  FSRS models **stability, difficulty, and retrievability as independent axes**,
  so "knows every Two-Pointer fact" (high retrievability) and "still fails hard
  interview variants" (high difficulty) are no longer conflated — which SM-2's
  single `ease` number structurally can't represent. Use `ts-fsrs` (MIT). The
  migration cost is identical to the planned per-card SM-2 change, so make the
  switch now while you're already touching the schema.
- **Leech handling:** flag cards you keep lapsing; instead of drilling forever,
  the LLM reformulates just that card or resurfaces its source note section
  (and, via §4 edges, its prerequisite concepts).
- **Mastery-triggered generation:** when a topic's cards are nearly all mature
  (high stability / long intervals), trigger coverage expansion with harder
  cards — difficulty grows with mastery. **One trigger is enough:** drop the
  parallel weekly cron; keep only a lightweight bounded fallback in case the
  trigger never fires.

## 8. Data model — Notion canonical, SQLite write-through cache

- **Notion = durable source of record + cross-device sync + backup.** SQLite =
  fast working copy. Same content both places; they converge.
- **SQLite is write-through, NOT a passive mirror.** Reviews write to SQLite
  first (instant), then flush to Notion in the background.
- **Direction of truth by moment:**
  - Day-to-day on main device: SQLite leads (reviews land there), Notion follows.
  - New device / data loss: Notion leads, pull full bank to rebuild SQLite.
- **Field ownership (single writer per field — avoids merge conflicts):**
  - Note + card *content* (front, back, concept tags) → **Notion authoritative**.
  - SR *runtime state* (stability, difficulty, due, reps, lapses, last_review) →
    **local authoritative**, pushed to Notion as a write-only mirror.
- **Card provenance.** Every generated card stores `source_hash` +
  `model_version` + `prompt_version` (and `note_version` if notes ever go
  git-backed). Six months later, "why is this card weird?" is answerable —
  generated by Qwen, prompt v3, note v17 — not a guess. Cheap columns.
  *Don't* store `generation_confidence` or `quality_score` yet — derive them on
  demand from the event log (§9) if/when you build an approval or auto-retire
  flow.
- **Keep code in the card body, not Notion properties.** Cloze/code cards
  round-trip badly through Notion property fields (length + formatting limits).
  Store code-heavy content in page blocks, or keep those cards local-authoritative.
- **Use your own UUID as primary key**, stored as a Notion property — never key
  on Notion's internal `page_id` (a fresh local DB couldn't map back).
- **Sync only dirty deltas** (track `updated_at` + dirty flag). Notion's
  ~3 req/s limit makes full pushes slow; first upload is a one-time batch.
- **Batch the SR flush** — on session-close or every few minutes, never per card.
- **Conflict policy:** single user, one device at a time → **last field-owner
  write wins, keyed on `updated_at`.** No CRDT, no multi-paragraph merge
  semantics needed.
- **Notion shape:** one database, one row per card (properties: stability,
  difficulty, due, reps, lapses, last_review, front, back, concept-tags,
  source-hash, model-version, prompt-version, uuid). Notes as pages linked by
  relation.

## 9. Event log & analytics

- **Append-only event log alongside the mutable rows — NOT event sourcing.**
  Record `CardReviewed`, `CardGenerated`, `CardEdited`, `CardSuspended`,
  `CardDeleted`, `CardMerged`, `LeechDetected`. Live SR/FSRS state stays in its
  own table; **don't rebuild state by replaying events** — that's
  over-engineering for a single user.
- **Why bother now:** it's the cheap substrate for everything analytical later —
  coverage/retention trends, per-card quality (lapses, avg response time, edits,
  skips), auto-retire candidates — all computable on demand instead of stored as
  extra columns. Append a row per action and you never have to backfill history.

## 10. Cost / longevity hedge

- **Abstract the sync target behind a `SyncTarget` interface.** The app never
  imports the Notion client directly. If Notion ever costs money, swap one
  adapter → Git+Markdown, Google Sheet, or SQLite-in-Dropbox. Nothing else
  changes.
- Keep a canonical local export (Markdown/JSON) so the bank is portable.
- The running app uses the official `@notionhq/client` (free) — not an MCP.

## 11. Two UI surfaces (keep them separate)

**Warm-up (gateway, not a study session)**
- Exactly **3 cards** (`QUESTION_COUNT = 3` stays). Self-graded, instant answer
  reveal from local DB.
- **Drawn from today's due queue, biased toward the topic you're about to
  solve** — so it's the first 3 reps of your SR review, not extra work.
- **Fallback order when today's topic has nothing due:** due cards of today's
  topic → any due card → a few non-counting "preview" cards (never written back
  to SR). Warm-up must never break SR by reviewing not-due cards, nor show an
  empty screen.
- Skippable, shows zero stats, never blocks you from the problem.

**Flashcard review (the real SR engine)**
- Separate tab. Interleaves **all** topics (retention).
- Opt-in, for days with spare time.
- **One-keystroke triage during review** — suspend / delete / edit a card
  inline, logged to the event log (§9). This is the real defense against bad
  generated cards; without it the bank rots and you stop trusting it. Matters
  more than any confidence score.
- **Hard daily cap on the queue + an explicit "you're done, go solve" signal** —
  protect problem-solving time; never guilt-trip into clearing a backlog.

Different sampling on purpose: warm-up = current topic (priming); review =
interleaved (retention). Shared SR data underneath; no double-counting (warm-up
cards leave the review queue for the day).

## 12. Daily loop (1-hour budget)

```
Warm-up (3 cards, ~2–3 min)
   → Solve the problem (~45 min)   ← the point
   → Update the note (~5 min)      ← feeds the card bank
   → Optional flashcard review (whatever's left, capped)
```

## 13. The $0 stack

- **Hot store:** SQLite (`data/sqlite/dsa.db`).
- **SR engine:** `ts-fsrs` (local, MIT — no infra).
- **Embeddings:** local (Ollama `nomic-embed-text` or transformers.js).
- **Batch question expansion:** local Ollama (Llama 3.1 / Qwen2.5) **or** free
  cloud tier (Gemini / Groq). Plugs into the existing `llm.factory` chain.
- **Sync / backup:** Notion free tier.
- No paid component anywhere.

## 14. Open decision

- **LLM + embedding runtime:** fully local (Ollama — offline, nothing leaves the
  machine, more setup) **vs** free cloud tier (Gemini/Groq — less setup, needs
  network). Recommendation: start local Ollama for privacy + true $0; keep the
  cloud provider as a fallback in the `llm.factory` chain.

## 15. Suggested build order

1. Card + concept-tag + per-card **FSRS** schema, provenance fields, and the
   append-only event-log table → migration in `database/migrations`.
2. `concepts.yaml` per topic (closed vocabulary + prerequisite edges); seed
   cards for the first few topics in `database/seeds`.
3. Card repository + `CardService`; rewire `WarmupService` to read due cards
   locally with the fallback order (drop live LLM from the hot path).
4. Local embedding + semantic dedup utility (configurable threshold + golden set).
5. Batch generation pipeline (dirty-flag trigger → coverage-gap → generate →
   dedup → store, with provenance).
6. `SyncTarget` interface + Notion adapter (delta sync, batched flush).
7. Flashcard review surface (separate tab, interleaved, capped) + inline triage.
8. Leech detection + mastery-triggered generation (using prerequisite edges).
