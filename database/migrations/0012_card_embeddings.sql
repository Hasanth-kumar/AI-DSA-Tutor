-- Flashcard / spaced-repetition rework — Rev 2, build-order stage 4.
-- Local embedding store for semantic duplicate detection (§6). Vectors are
-- stored as a raw little-endian Float32 BLOB directly in SQLite — there is NO
-- separate vector DB; brute-force cosine over a few thousand cards is
-- sub-millisecond.
--
-- This is a SEPARATE table (not a column on `cards`) on purpose: it keeps the
-- embeddings strictly LOCAL — the §8 Notion sync layer reads `cards` only and
-- never touches `card_embeddings`, so vectors can never sync to Notion (§6).
--
-- Design source of truth: docs/flashcard-system-design.md §6, §13, §15.4.

CREATE TABLE IF NOT EXISTS `card_embeddings` (
  `card_id` text PRIMARY KEY NOT NULL,
  -- Embedding model id (e.g. 'nomic-embed-text' via Ollama, or
  -- 'Xenova/all-MiniLM-L6-v2' via transformers.js). Stored so a model swap can
  -- be detected and the bank re-embedded + the dedup threshold re-tuned.
  `model` text NOT NULL,
  -- Vector dimension (nomic-embed-text=768, all-MiniLM-L6-v2=384). Lets readers
  -- validate the blob length without parsing it.
  `dim` integer NOT NULL,
  -- Raw little-endian Float32 vector. blob = dim * 4 bytes.
  `vector` blob NOT NULL,
  -- Content hash the vector was computed from (cards.source_hash at embed time).
  -- When the card content changes, source_hash diverges and the row is stale →
  -- recompute. Makes re-embedding a cheap, deterministic diff.
  `source_hash` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,

  FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON DELETE CASCADE
);

-- Re-embed sweep when the model changes.
CREATE INDEX IF NOT EXISTS idx_card_embeddings_model ON card_embeddings(model);
