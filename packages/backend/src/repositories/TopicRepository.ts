import { eq } from "drizzle-orm";
import { problems, sessions, topics } from "@dsa/database/schema";
import type { TopicState } from "@dsa/intelligence";
import type { SqliteDb } from "@dsa/integrations";
import { buildTopicState } from "../lib/topic-mapper.js";

export interface TopicUpdate {
  confidence?: number;
  revisionCount?: number;
  lastRevised?: Date | null;
  nextRevisionAt?: Date | null;
  isWeakArea?: boolean;
  status?: string;
  priorityScore?: number;
}

export class TopicRepository {
  constructor(private readonly db: SqliteDb) {}

  findAll(): TopicState[] {
    const topicRows = this.db.select().from(topics).all();
    const problemRows = this.db.select().from(problems).all();
    const sessionRows = this.db.select().from(sessions).all();

    const problemsByTopic = groupBy(problemRows, (p) => p.topicId);
    const sessionsByTopic = groupBy(sessionRows, (s) => s.topicId);

    return topicRows.map((topic) =>
      buildTopicState(
        topic,
        problemsByTopic.get(topic.id) ?? [],
        sessionsByTopic.get(topic.id) ?? [],
      ),
    );
  }

  findById(id: string): TopicState | null {
    const topic = this.db.select().from(topics).where(eq(topics.id, id)).get();
    if (!topic) return null;

    const topicProblems = this.db
      .select()
      .from(problems)
      .where(eq(problems.topicId, id))
      .all();
    const topicSessions = this.db
      .select()
      .from(sessions)
      .where(eq(sessions.topicId, id))
      .all();

    return buildTopicState(topic, topicProblems, topicSessions);
  }

  update(id: string, patch: TopicUpdate): void {
    const now = Date.now();
    this.db
      .update(topics)
      .set({
        ...(patch.confidence != null ? { confidence: patch.confidence } : {}),
        ...(patch.revisionCount != null
          ? { revisionCount: patch.revisionCount }
          : {}),
        ...(patch.lastRevised !== undefined
          ? { lastRevised: patch.lastRevised ? patch.lastRevised.getTime() : null }
          : {}),
        ...(patch.nextRevisionAt !== undefined
          ? {
              nextRevisionAt: patch.nextRevisionAt
                ? patch.nextRevisionAt.getTime()
                : null,
            }
          : {}),
        ...(patch.isWeakArea != null ? { isWeakArea: patch.isWeakArea ? 1 : 0 } : {}),
        ...(patch.status != null ? { status: patch.status } : {}),
        ...(patch.priorityScore != null ? { priorityScore: patch.priorityScore } : {}),
        updatedAt: now,
      })
      .where(eq(topics.id, id))
      .run();
  }

  applyPendingFields(
    id: string,
    fields: {
      confidence?: number;
      revisionCount?: number;
      lastRevised?: number | null;
      nextRevisionAt?: number | null;
      isWeakArea?: number;
      status?: string;
      priorityScore?: number | null;
    },
  ): void {
    const now = Date.now();
    this.db
      .update(topics)
      .set({
        ...(fields.confidence != null ? { confidence: fields.confidence } : {}),
        ...(fields.revisionCount != null ? { revisionCount: fields.revisionCount } : {}),
        ...(fields.lastRevised !== undefined ? { lastRevised: fields.lastRevised } : {}),
        ...(fields.nextRevisionAt !== undefined
          ? { nextRevisionAt: fields.nextRevisionAt }
          : {}),
        ...(fields.isWeakArea != null ? { isWeakArea: fields.isWeakArea } : {}),
        ...(fields.status != null ? { status: fields.status } : {}),
        ...(fields.priorityScore !== undefined
          ? { priorityScore: fields.priorityScore }
          : {}),
        updatedAt: now,
      })
      .where(eq(topics.id, id))
      .run();
  }
}

function groupBy<T>(items: T[], keyFn: (item: T) => string | null | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}
