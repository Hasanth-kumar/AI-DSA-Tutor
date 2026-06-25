-- Flashcard / spaced-repetition rework — Rev 2, build-order stage 1.
-- Adds the per-card model (NOT the legacy topic-level SM-2 in 0009): each card
-- carries its own FSRS state (§7), a closed-vocabulary concept tagging via a
-- junction table (§4), generation provenance (§8), and an append-only event log
-- (§9). Embeddings (§6) are intentionally deferred to a later migration so this
-- slice stays focused on schema + provenance + event log.
--
-- Design source of truth: docs/flashcard-system-design.md §§3,4,7,8,9,15.

-- ---------------------------------------------------------------------------
-- cards: one row per flashcard. Content fields (front/back/type/concepts) are
-- Notion-authoritative (§8); FSRS runtime state is local-authoritative and
-- pushed to Notion as a write-only mirror. Primary key is an app-generated
-- UUID — never Notion's internal page_id (notion_page_id is only a mapping).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cards` (
  `id` text PRIMARY KEY NOT NULL,
  `topic_id` text,
  -- Card type (§3): plain-recall | pattern-trigger | cloze |
  -- predict-complexity | predict-output | mistake-derived | confusion-pair.
  -- Stored attribute so generation/sampling/analytics can distinguish them.
  `type` text NOT NULL,
  `front` text NOT NULL,
  `back` text NOT NULL,
  -- Reference to the source note section the card was derived from (§2).
  `note_ref` text,

  -- Triage / lifecycle flags (§7, §11).
  `suspended` integer NOT NULL DEFAULT 0,
  `leech` integer NOT NULL DEFAULT 0,

  -- Per-card FSRS state (§7) — independent stability / difficulty axes, NOT a
  -- single SM-2 ease. Mirrors the ts-fsrs Card shape for lossless round-trip.
  `stability` real,
  `difficulty` real,
  `due` integer,
  `last_review` integer,
  `reps` integer NOT NULL DEFAULT 0,
  `lapses` integer NOT NULL DEFAULT 0,
  -- FSRS state enum: 0=New, 1=Learning, 2=Review, 3=Relearning.
  `state` integer NOT NULL DEFAULT 0,
  `elapsed_days` integer NOT NULL DEFAULT 0,
  `scheduled_days` integer NOT NULL DEFAULT 0,
  `learning_steps` integer NOT NULL DEFAULT 0,

  -- Provenance (§8) — cheap columns that make "why is this card weird?"
  -- answerable later. generation_confidence / quality_score are deliberately
  -- NOT stored here; derive them on demand from card_events (§9).
  `origin` text NOT NULL DEFAULT 'manual',   -- seed | generated | manual
  `source_hash` text,                        -- hash of the source note section
  `model_version` text,                      -- generating model id
  `prompt_version` text,                     -- generation prompt version
  `note_version` text,                       -- note revision if git-backed
  `seed_version` integer,                    -- seed batch version for origin=seed

  -- Sync + generation-trigger bookkeeping (§5 dirty flag, §8 dirty deltas).
  `notion_page_id` text,                     -- mapping only, never the PK
  `dirty` integer NOT NULL DEFAULT 1,
  `synced_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,

  FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`)
);

CREATE INDEX IF NOT EXISTS idx_cards_topic ON cards(topic_id);
-- Due-queue read path for warm-up / review (§11) — excludes suspended cards.
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due) WHERE suspended = 0;
-- Dirty deltas for batch generation (§5) and sync flush (§8).
CREATE INDEX IF NOT EXISTS idx_cards_dirty ON cards(dirty) WHERE dirty = 1;
-- Leech sweep (§7).
CREATE INDEX IF NOT EXISTS idx_cards_leech ON cards(leech) WHERE leech = 1;

-- ---------------------------------------------------------------------------
-- card_concepts: normalized concept tagging (§4). The closed vocabulary itself
-- lives in version-controlled concepts.yaml per topic — the LLM may only assign
-- existing concept ids, never invent new ones. This junction makes coverage
-- ("concept tags with >=1 card") a deterministic GROUP BY and powers
-- concept-match dedup (§6).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `card_concepts` (
  `card_id` text NOT NULL,
  `concept_id` text NOT NULL,
  PRIMARY KEY (`card_id`, `concept_id`),
  FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_card_concepts_concept ON card_concepts(concept_id);

-- ---------------------------------------------------------------------------
-- card_events: append-only event log alongside the mutable card rows (§9).
-- NOT event sourcing — live FSRS state stays in `cards`; events are never
-- replayed to rebuild state. This is the cheap substrate for on-demand
-- analytics (retention trends, per-card quality, auto-retire candidates).
-- Allowed types: CardReviewed | CardGenerated | CardEdited | CardSuspended |
-- CardDeleted | CardMerged | LeechDetected.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `card_events` (
  `id` text PRIMARY KEY NOT NULL,
  `card_id` text NOT NULL,
  `type` text NOT NULL,
  `payload` text,            -- JSON: rating, response_ms, prev/next state, etc.
  `created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_card_events_card ON card_events(card_id, created_at);
CREATE INDEX IF NOT EXISTS idx_card_events_type ON card_events(type, created_at);
