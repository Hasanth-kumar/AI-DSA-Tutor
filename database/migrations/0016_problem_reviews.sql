-- Problem spaced-repetition (re-solve) — stage 1: schema + backfill.
-- Design: docs/problem-spaced-repetition-design.md §4, §7, §13.
--
-- Ordering note: the ALTER is deliberately first. runMigrations re-execs every
-- file on boot and tolerates "duplicate column name" — on re-runs the ALTER
-- throws immediately and the rest of this file is skipped, so the backfill
-- INSERT below runs exactly once (boot must never re-admit problems).

-- A re-solve is recorded as a normal attempt row (§7): one history per problem.
ALTER TABLE problem_attempts ADD COLUMN kind TEXT NOT NULL DEFAULT 'solve'; -- 'solve' | 'resolve'

-- One row per pooled problem. LOCAL-ONLY — never synced, never wiped by Notion
-- pulls (same class as problem_attempts / card_embeddings, §11).
CREATE TABLE IF NOT EXISTS problem_reviews (
  problem_id TEXT PRIMARY KEY REFERENCES problems(id),
  admitted_at INTEGER NOT NULL,
  admission_reason TEXT NOT NULL,           -- 'mistake' | 'coach' | 'slow' | 'hard' | 'manual'
  retired INTEGER NOT NULL DEFAULT 0,       -- clean-streak retirement (§4)
  suspended INTEGER NOT NULL DEFAULT 0,     -- leech suspension (§5)
  -- Per-problem FSRS state — identical column set to cards (§5, §7).
  stability REAL,
  difficulty REAL,
  due INTEGER,
  last_review INTEGER,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  state INTEGER NOT NULL DEFAULT 0,         -- 0=New, 1=Learning, 2=Review, 3=Relearning
  elapsed_days INTEGER NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Due-queue read path, mirroring idx_cards_due.
CREATE INDEX IF NOT EXISTS idx_problem_reviews_due
  ON problem_reviews(due) WHERE retired = 0 AND suspended = 0;

-- Backfill (§4): run admission over the existing attempt history so the pool
-- starts populated. FSRS state stays New; due dates are staggered round-robin
-- over the first 3 weeks, rustiest (oldest last solve) first — never dump the
-- whole backlog on day one. Reason priority: mistake > coach > slow > hard.
-- ponytail: slow-solve cutoffs (minutes) hardcoded for this one-shot backfill;
-- runtime admission (stage 2 engine) reads them from config (§12).
INSERT OR IGNORE INTO problem_reviews
  (problem_id, admitted_at, admission_reason, due, created_at, updated_at)
SELECT
  problem_id,
  now_ms,
  reason,
  now_ms + ((ROW_NUMBER() OVER (ORDER BY last_solved_at) - 1) % 21) * 86400000,
  now_ms,
  now_ms
FROM (
  SELECT
    a.problem_id,
    MAX(a.solved_at) AS last_solved_at,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms,
    CASE
      -- mistake_tag holds a JSON array (legacy: bare tag string); '' / '[]' are empty.
      WHEN MAX(CASE WHEN a.mistake_tag IS NOT NULL AND a.mistake_tag NOT IN ('', '[]') THEN 1 ELSE 0 END) = 1
        THEN 'mistake'
      WHEN MAX(COALESCE(a.used_coach, 0)) > 0 OR MAX(COALESCE(a.hint_count, 0)) > 0
        THEN 'coach'
      WHEN MAX(CASE WHEN a.time_taken > CASE p.difficulty WHEN 'Easy' THEN 25 WHEN 'Hard' THEN 75 ELSE 45 END
        THEN 1 ELSE 0 END) = 1
        THEN 'slow'
      WHEN p.difficulty = 'Hard'
        THEN 'hard'
    END AS reason
  FROM problem_attempts a
  JOIN problems p ON p.id = a.problem_id
  GROUP BY a.problem_id
)
WHERE reason IS NOT NULL;
