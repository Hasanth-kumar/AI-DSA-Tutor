-- Coach-usage tracking per solved problem (D): "solved with coach" is a weaker
-- mastery signal than "solved cold". Local-only — not synced to Notion.
ALTER TABLE problem_attempts ADD COLUMN used_coach INTEGER DEFAULT 0;
ALTER TABLE problem_attempts ADD COLUMN hint_count INTEGER DEFAULT 0;
