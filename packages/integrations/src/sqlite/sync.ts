import { problems, sessions, topics } from "@dsa/database/schema";
import type { NotionClient } from "../notion/NotionClient.js";
import { isFullPage, mapProblemPage, mapSessionPage, mapTopicPage } from "../notion/mappers.js";
import { normalizeProblemStatus } from "../notion/problem-fields.js";
import { createSqliteDb, runMigrations } from "./client.js";

export interface SyncResult {
  topics: number;
  problems: number;
  sessions: number;
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

    db.delete(sessions).run();
    db.delete(problems).run();
    db.delete(topics).run();

    for (const page of topicPages) {
      if (!isFullPage(page)) continue;
      const t = mapTopicPage(page);
      db.insert(topics)
        .values({
          id: t.id,
          name: t.name,
          difficulty: t.difficulty ?? null,
          status: t.status ?? "Not started",
          revisionCount: t.revisionCount ?? 0,
          lastRevised: t.lastRevised ? t.lastRevised.getTime() : null,
          confidence: t.confidence ?? 0,
          isWeakArea: t.isWeakArea ? 1 : 0,
          prerequisites: t.prerequisites?.length
            ? JSON.stringify(t.prerequisites)
            : null,
          updatedAt: now,
        })
        .run();
    }

    for (const page of problemPages) {
      if (!isFullPage(page)) continue;
      const p = mapProblemPage(page);
      db.insert(problems)
        .values({
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
        })
        .run();
    }

    for (const page of sessionPages) {
      if (!isFullPage(page)) continue;
      const s = mapSessionPage(page);
      db.insert(sessions)
        .values({
          id: s.id,
          date: s.date.getTime(),
          topicId: s.topicId ?? null,
          problemsSolved: s.problemsSolved ?? 0,
          studyDuration: s.studyDuration ?? null,
          productivityScore: s.productivityScore ?? null,
          updatedAt: now,
        })
        .run();
    }

    return {
      topics: topicPages.length,
      problems: problemPages.length,
      sessions: sessionPages.length,
    };
  } finally {
    sqlite.close();
  }
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
