import { eq, notInArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { NotionTopic } from "@dsa/database/notion-types";
import { problemReviews, problems, sessions, syncConflicts, topics } from "@dsa/database/schema";
import type { NotionClient } from "../notion/NotionClient.js";
import { isFullPage, mapProblemPage, mapSessionPage, mapTopicPage } from "../notion/mappers.js";
import { normalizeProblemStatus } from "../notion/problem-fields.js";
import { createSqliteDb, runMigrations, type SqliteDb } from "./client.js";

export interface SyncResult {
  topics: number;
  problems: number;
  sessions: number;
}

type TopicRow = typeof topics.$inferSelect;

/** Fields mirrored from Notion — a pull may overwrite these. */
interface MirroredTopicFields {
  name: string;
  difficulty: string | null;
  status: string | null;
  revisionCount: number;
  lastRevised: number | null;
  confidence: number;
  isWeakArea: number;
  prerequisites: string | null;
}

/** Locally-owned scheduling fields — preserved on pull per ADR Decision A. */
interface LocalScheduleFields {
  priorityScore: number | null;
  nextRevisionAt: number | null;
  sm2Interval: number | null;
  sm2Repetition: number | null;
  sm2Efactor: number | null;
}

export async function syncNotionToSqlite(
  notion: NotionClient,
  sqlitePath: string,
): Promise<SyncResult> {
  runMigrations(sqlitePath);
  const { db, sqlite } = createSqliteDb(sqlitePath);
  const now = Date.now();
  const ids = notion.databaseIds;

  try {
    const topicPages = await notion.queryDatabase(ids.topics);
    const problemPages = await notion.queryDatabase(ids.problems);
    const sessionPages = await notion.queryDatabase(ids.sessions);

    const localTopics = db.select().from(topics).all();
    const localById = new Map(localTopics.map((t) => [t.id, t]));

    // Upsert inside a transaction so a mid-pull failure cannot leave sessions
    // wiped (the old delete-all-then-insert path deleted sessions first, then
    // failed on problem_reviews FK when wiping problems).
    const syncTx = sqlite.transaction(() => {
      const notionTopicIds = new Set<string>();
      const notionProblemIds = new Set<string>();
      const notionSessionIds = new Set<string>();

      for (const page of topicPages) {
        if (!isFullPage(page)) continue;
        const mapped = mapTopicPage(page);
        notionTopicIds.add(mapped.id);
        mergeTopicFromNotion(db, mapped, localById.get(mapped.id), now);
      }

      for (const page of problemPages) {
        if (!isFullPage(page)) continue;
        const p = mapProblemPage(page);
        notionProblemIds.add(p.id);
        const row = {
          id: p.id,
          name: p.name,
          topicId: p.topicId ?? null,
          difficulty: p.difficulty ?? null,
          leetcodeLink: p.leetcodeLink ?? null,
          status: normalizeProblemStatus(p.status),
          attempts: p.attempts ?? 0,
          timeTaken: p.timeTaken ?? null,
          notes: p.notes ?? null,
          updatedAt: now,
        };
        db.insert(problems)
          .values(row)
          .onConflictDoUpdate({
            target: problems.id,
            set: {
              name: row.name,
              topicId: row.topicId,
              difficulty: row.difficulty,
              leetcodeLink: row.leetcodeLink,
              status: row.status,
              attempts: row.attempts,
              timeTaken: row.timeTaken,
              notes: row.notes,
              updatedAt: row.updatedAt,
            },
          })
          .run();
      }

      for (const page of sessionPages) {
        if (!isFullPage(page)) continue;
        const s = mapSessionPage(page);
        notionSessionIds.add(s.id);
        const row = {
          id: s.id,
          date: s.date.getTime(),
          topicId: s.topicId ?? null,
          problemsSolved: s.problemsSolved ?? 0,
          studyDuration: s.studyDuration ?? null,
          productivityScore: s.productivityScore ?? null,
          updatedAt: now,
        };
        db.insert(sessions)
          .values(row)
          .onConflictDoUpdate({
            target: sessions.id,
            set: {
              date: row.date,
              topicId: row.topicId,
              problemsSolved: row.problemsSolved,
              studyDuration: row.studyDuration,
              productivityScore: row.productivityScore,
              updatedAt: row.updatedAt,
            },
          })
          .run();
      }

      // Drop sessions Notion no longer has. If Notion returned none, keep the
      // local rows — an empty pull after a failed query must not erase history.
      if (notionSessionIds.size > 0) {
        db.delete(sessions).where(notInArray(sessions.id, [...notionSessionIds])).run();
      }

      // Drop problems Notion no longer has — but never wipe rows still
      // referenced by local-only problem_reviews (FK would fail / lose FSRS state).
      const reviewedIds = new Set(
        db.select({ id: problemReviews.problemId }).from(problemReviews).all().map((r) => r.id),
      );
      const staleProblems = db
        .select({ id: problems.id })
        .from(problems)
        .all()
        .map((r) => r.id)
        .filter((id) => !notionProblemIds.has(id) && !reviewedIds.has(id));
      for (const id of staleProblems) {
        db.delete(problems).where(eq(problems.id, id)).run();
      }

      // Drop topics Notion no longer has (skip if still referenced locally).
      for (const local of localTopics) {
        if (notionTopicIds.has(local.id)) continue;
        try {
          db.delete(topics).where(eq(topics.id, local.id)).run();
        } catch {
          // FK to cards/notes/attempts — keep the topic row locally.
        }
      }
    });

    syncTx();

    return {
      topics: topicPages.length,
      problems: problemPages.length,
      sessions: sessionPages.length,
    };
  } finally {
    sqlite.close();
  }
}

function mergeTopicFromNotion(
  db: SqliteDb,
  notion: NotionTopic,
  local: TopicRow | undefined,
  now: number,
): void {
  const mirrored = mirroredFromNotion(notion);
  const schedule = preserveLocalSchedule(local, notion);

  if (local && mirroredFieldsDiffer(localMirroredSnapshot(local), mirrored)) {
    logMirroredConflict(db, local, mirrored);
  }

  const row = {
    id: notion.id,
    ...mirrored,
    ...schedule,
    updatedAt: now,
  };

  if (local) {
    db.update(topics).set(row).where(eq(topics.id, notion.id)).run();
  } else {
    db.insert(topics).values(row).run();
  }
}

function mirroredFromNotion(notion: NotionTopic): MirroredTopicFields {
  return {
    name: notion.name,
    difficulty: notion.difficulty ?? null,
    status: notion.status ?? "Not started",
    revisionCount: notion.revisionCount ?? 0,
    lastRevised: notion.lastRevised ? notion.lastRevised.getTime() : null,
    confidence: notion.confidence ?? 0,
    isWeakArea: notion.isWeakArea ? 1 : 0,
    prerequisites: notion.prerequisites?.length
      ? JSON.stringify(notion.prerequisites)
      : null,
  };
}

function preserveLocalSchedule(
  local: TopicRow | undefined,
  notion: NotionTopic,
): LocalScheduleFields {
  if (local) {
    return {
      priorityScore: local.priorityScore ?? null,
      nextRevisionAt: local.nextRevisionAt ?? null,
      sm2Interval: local.sm2Interval ?? 1,
      sm2Repetition: local.sm2Repetition ?? 0,
      sm2Efactor: local.sm2Efactor ?? 2.5,
    };
  }

  // Brand-new topic: no prior local schedule. Notion may carry optional mirrors
  // for transparency, but null/default is fine when absent.
  return {
    priorityScore: null,
    nextRevisionAt: notion.nextRevisionAt ? notion.nextRevisionAt.getTime() : null,
    sm2Interval: notion.sm2Interval ?? 1,
    sm2Repetition: notion.sm2Repetition ?? 0,
    sm2Efactor: notion.sm2Efactor ?? 2.5,
  };
}

function localMirroredSnapshot(local: TopicRow): MirroredTopicFields {
  return {
    name: local.name,
    difficulty: local.difficulty ?? null,
    status: local.status ?? "Not started",
    revisionCount: local.revisionCount ?? 0,
    lastRevised: local.lastRevised ?? null,
    confidence: local.confidence ?? 0,
    isWeakArea: local.isWeakArea ?? 0,
    prerequisites: local.prerequisites ?? null,
  };
}

function mirroredFieldsDiffer(
  local: MirroredTopicFields,
  remote: MirroredTopicFields,
): boolean {
  return (
    local.name !== remote.name ||
    local.difficulty !== remote.difficulty ||
    local.status !== remote.status ||
    local.revisionCount !== remote.revisionCount ||
    local.lastRevised !== remote.lastRevised ||
    local.confidence !== remote.confidence ||
    local.isWeakArea !== remote.isWeakArea ||
    local.prerequisites !== remote.prerequisites
  );
}

function logMirroredConflict(
  db: SqliteDb,
  local: TopicRow,
  remote: MirroredTopicFields,
): void {
  db.insert(syncConflicts)
    .values({
      id: randomUUID(),
      entityType: "topic",
      entityId: local.id,
      entityName: local.name,
      localValue: JSON.stringify(localMirroredSnapshot(local)),
      remoteValue: JSON.stringify(remote),
      detectedAt: Date.now(),
    })
    .run();
}

export function getMirrorCounts(sqlitePath: string): SyncResult {
  runMigrations(sqlitePath);
  const { db, sqlite } = createSqliteDb(sqlitePath);
  try {
    const topicRows = db.select().from(topics).all();
    const problemRows = db.select().from(problems).all();
    const sessionRows = db.select().from(sessions).all();
    return {
      topics: topicRows.length,
      problems: problemRows.length,
      sessions: sessionRows.length,
    };
  } finally {
    sqlite.close();
  }
}
