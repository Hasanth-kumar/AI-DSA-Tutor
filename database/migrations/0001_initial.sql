CREATE TABLE IF NOT EXISTS `topics` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `difficulty` text,
  `status` text DEFAULT 'Not started',
  `revision_count` integer DEFAULT 0,
  `last_revised` integer,
  `confidence` integer DEFAULT 0,
  `is_weak_area` integer DEFAULT 0,
  `priority_score` real,
  `next_revision_at` integer,
  `prerequisites` text,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `problems` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `topic_id` text,
  `difficulty` text,
  `leetcode_link` text,
  `status` text DEFAULT 'Unsolved',
  `attempts` integer DEFAULT 0,
  `time_taken` integer,
  `notes` text,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`)
);

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `date` integer NOT NULL,
  `topic_id` text,
  `problems_solved` integer DEFAULT 0,
  `study_duration` integer,
  `productivity_score` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`)
);
