-- The optional free-text mistake note was dropped in favour of the Obsidian
-- note flow. Remove the now-dead column. Idempotent: on databases that never
-- had it (the add-migration was removed), runMigrations ignores "no such column".
ALTER TABLE problem_attempts DROP COLUMN mistake_note;
