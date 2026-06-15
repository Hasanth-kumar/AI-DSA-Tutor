import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  difficulty: text("difficulty"),
  status: text("status").default("Not started"),
  revisionCount: integer("revision_count").default(0),
  lastRevised: integer("last_revised"),
  confidence: integer("confidence").default(0),
  isWeakArea: integer("is_weak_area").default(0),
  priorityScore: real("priority_score"),
  nextRevisionAt: integer("next_revision_at"),
  sm2Interval: integer("sm2_interval").default(1),
  sm2Repetition: integer("sm2_repetition").default(0),
  sm2Efactor: real("sm2_efactor").default(2.5),
  prerequisites: text("prerequisites"),
  updatedAt: integer("updated_at").notNull(),
});

export const problems = sqliteTable("problems", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  topicId: text("topic_id").references(() => topics.id),
  difficulty: text("difficulty"),
  leetcodeLink: text("leetcode_link"),
  githubUrl: text("github_url"),
  status: text("status").default("Not started"),
  attempts: integer("attempts").default(0),
  timeTaken: integer("time_taken"),
  notes: text("notes"),
  updatedAt: integer("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  date: integer("date").notNull(),
  topicId: text("topic_id").references(() => topics.id),
  problemsSolved: integer("problems_solved").default(0),
  studyDuration: integer("study_duration"),
  productivityScore: integer("productivity_score"),
  updatedAt: integer("updated_at").notNull(),
});

export const syncMeta = sqliteTable("sync_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Per-problem attempt log — survives Notion pulls (which wipe/rebuild
 * topics/problems/sessions). Holds local-only signals like mistake tags.
 * Topic pulls use merge (not wipe) for schedule-critical fields — see sync.ts.
 */
export const problemAttempts = sqliteTable("problem_attempts", {
  id: text("id").primaryKey(),
  problemId: text("problem_id").notNull(),
  topicId: text("topic_id"),
  sessionId: text("session_id"),
  solvedAt: integer("solved_at").notNull(),
  timeTaken: integer("time_taken"),
  mistakeTag: text("mistake_tag"),
  createdAt: integer("created_at").notNull(),
});

/** Obsidian note metadata + cached content; the vault is the source of truth. */
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  path: text("path").notNull().unique(),
  title: text("title").notNull(),
  problemId: text("problem_id"),
  topicId: text("topic_id"),
  frontmatter: text("frontmatter"),
  content: text("content"),
  contentHash: text("content_hash"),
  matchedBy: text("matched_by"),
  updatedAt: integer("updated_at").notNull(),
});

/** Both versions of a record edited locally and in Notion between syncs. */
export const syncConflicts = sqliteTable("sync_conflicts", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  entityName: text("entity_name"),
  localValue: text("local_value").notNull(),
  remoteValue: text("remote_value").notNull(),
  detectedAt: integer("detected_at").notNull(),
  resolvedAt: integer("resolved_at"),
  winner: text("winner"),
});

export const chatThreads = sqliteTable("chat_threads", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => chatThreads.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});
