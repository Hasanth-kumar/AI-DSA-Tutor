-- Flashcard / spaced-repetition rework — Rev 2, build-order stage 5.
-- Batch generation trigger (§5). Generation is driven by a DIRTY FLAG, never by
-- the note edit itself: a note change marks its topic dirty here; a debounced
-- batch job later drains the dirty set and runs the coverage-gap → generate →
-- dedup → store pipeline ONCE, merging however many edits accumulated since.
--
-- This is a separate, coarse per-topic queue (not the per-card `cards.dirty`
-- column, which is the §8 Notion sync delta flag — overloading it would conflate
-- "needs regeneration" with "needs sync"). Single row per topic; repeated
-- mark-dirty calls collapse into one pending unit of work.
--
-- Design source of truth: docs/flashcard-system-design.md §5, §15.5.

CREATE TABLE IF NOT EXISTS `topic_generation` (
  `topic_id` text PRIMARY KEY NOT NULL,
  -- 1 = a note/coverage change since the last generation run; 0 = clean.
  `dirty` integer NOT NULL DEFAULT 0,
  -- When the topic first became dirty in the current pending window (debounce).
  `dirty_since` integer,
  -- Content hash of the note(s) that dirtied the topic — lets the batch job skip
  -- a run when nothing actually changed since `last_generated_hash`.
  `note_hash` text,
  -- Bookkeeping from the most recent successful generation run.
  `last_generated_at` integer,
  `last_generated_hash` text,

  FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`)
);

-- The batch job scans for dirty topics.
CREATE INDEX IF NOT EXISTS idx_topic_generation_dirty ON topic_generation(dirty);
