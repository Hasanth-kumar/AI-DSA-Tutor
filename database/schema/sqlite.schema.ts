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
  prerequisites: text("prerequisites"),
  updatedAt: integer("updated_at").notNull(),
});

export const problems = sqliteTable("problems", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  topicId: text("topic_id").references(() => topics.id),
  difficulty: text("difficulty"),
  leetcodeLink: text("leetcode_link"),
  status: text("status").default("Unsolved"),
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
