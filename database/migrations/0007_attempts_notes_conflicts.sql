CREATE TABLE IF NOT EXISTS `problem_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `problem_id` text NOT NULL,
  `topic_id` text,
  `session_id` text,
  `solved_at` integer NOT NULL,
  `time_taken` integer,
  `mistake_tag` text,
  `created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_problem ON problem_attempts(problem_id, solved_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_topic ON problem_attempts(topic_id, solved_at DESC);

CREATE TABLE IF NOT EXISTS `notes` (
  `id` text PRIMARY KEY NOT NULL,
  `path` text NOT NULL UNIQUE,
  `title` text NOT NULL,
  `problem_id` text,
  `topic_id` text,
  `frontmatter` text,
  `content` text,
  `content_hash` text,
  `matched_by` text,
  `updated_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_problem ON notes(problem_id);

CREATE TABLE IF NOT EXISTS `sync_conflicts` (
  `id` text PRIMARY KEY NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `entity_name` text,
  `local_value` text NOT NULL,
  `remote_value` text NOT NULL,
  `detected_at` integer NOT NULL,
  `resolved_at` integer,
  `winner` text
);

CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON sync_conflicts(resolved_at) WHERE resolved_at IS NULL;
