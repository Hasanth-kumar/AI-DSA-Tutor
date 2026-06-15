ALTER TABLE topics ADD COLUMN sm2_interval INTEGER DEFAULT 1;
ALTER TABLE topics ADD COLUMN sm2_repetition INTEGER DEFAULT 0;
ALTER TABLE topics ADD COLUMN sm2_efactor REAL DEFAULT 2.5;

-- Best-effort backfill from legacy revision_count so existing rows start coherent.
UPDATE topics
SET
  sm2_repetition = COALESCE(revision_count, 0),
  sm2_interval = CASE
    WHEN COALESCE(revision_count, 0) <= 0 THEN 1
    WHEN COALESCE(revision_count, 0) = 1 THEN 1
    WHEN COALESCE(revision_count, 0) = 2 THEN 6
    ELSE MAX(1, revision_count)
  END,
  sm2_efactor = 2.5
WHERE sm2_repetition IS NULL OR sm2_repetition = 0;
