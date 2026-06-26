/**
 * CardRepository — the Drizzle/better-sqlite3 implementation of {@link CardStore}
 * (design §3, §7, §9, §11). It is the *only* concrete persistence layer the
 * card hot path uses; `CardService` depends on the {@link CardStore} interface,
 * never on this class, so the same logic runs against a node:sqlite test store.
 *
 * Reads are local and indexed (`idx_cards_due` / topic) so warm-up and review
 * load instantly with no LLM or network (§1). Writes mark the row `dirty` for
 * the later delta sync to Notion (§8) and invalidate the dashboard mirror cache.
 */
import { and, asc, eq, gt, lte, notInArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { cardConcepts, cardEvents, cards } from "@dsa/database/schema";
import type { SqliteDb } from "@dsa/integrations";
import type { MirrorCache } from "../services/MirrorCache.js";
import type {
  CardEventInput,
  CardRow,
  CardStore,
  DueQuery,
  PreviewQuery,
  ReviewPatch,
} from "../services/cardTypes.js";

export class CardRepository implements CardStore {
  constructor(
    private readonly db: SqliteDb,
    private readonly mirrorCache?: MirrorCache,
  ) {}

  dueCards(query: DueQuery): CardRow[] {
    const conds = [eq(cards.suspended, 0), lte(cards.due, query.now)];
    if (query.topicId) conds.push(eq(cards.topicId, query.topicId));
    if (query.excludeIds?.length) conds.push(notInArray(cards.id, [...query.excludeIds]));
    return this.db
      .select()
      .from(cards)
      .where(and(...conds))
      .orderBy(asc(cards.due))
      .limit(query.limit)
      .all();
  }

  previewCards(query: PreviewQuery): CardRow[] {
    const conds = [eq(cards.suspended, 0), gt(cards.due, query.now)];
    if (query.topicId) conds.push(eq(cards.topicId, query.topicId));
    if (query.excludeIds?.length) conds.push(notInArray(cards.id, [...query.excludeIds]));
    return this.db
      .select()
      .from(cards)
      .where(and(...conds))
      .orderBy(asc(cards.due))
      .limit(query.limit)
      .all();
  }

  findById(id: string): CardRow | null {
    return this.db.select().from(cards).where(eq(cards.id, id)).get() ?? null;
  }

  findByFront(topicId: string | null, front: string): CardRow | null {
    const conds = [eq(cards.front, front)];
    if (topicId) conds.push(eq(cards.topicId, topicId));
    return (
      this.db
        .select()
        .from(cards)
        .where(and(...conds))
        .get() ?? null
    );
  }

  applyReview(id: string, patch: ReviewPatch, now: number): void {
    this.db
      .update(cards)
      .set({
        stability: patch.stability,
        difficulty: patch.difficulty,
        due: patch.due,
        lastReview: patch.lastReview,
        reps: patch.reps,
        lapses: patch.lapses,
        state: patch.state,
        elapsedDays: patch.elapsedDays,
        scheduledDays: patch.scheduledDays,
        learningSteps: patch.learningSteps,
        ...(patch.leech ? { leech: 1 } : {}),
        dirty: 1,
        updatedAt: now,
      })
      .where(eq(cards.id, id))
      .run();
    this.mirrorCache?.invalidate();
  }

  logEvent(event: CardEventInput): void {
    this.db
      .insert(cardEvents)
      .values({
        id: randomUUID(),
        cardId: event.cardId,
        type: event.type,
        payload: event.payload != null ? JSON.stringify(event.payload) : null,
        createdAt: event.createdAt,
      })
      .run();
  }

  // --- Reads used outside the hot path (coverage / analytics helpers) ---

  findByTopic(topicId: string): CardRow[] {
    return this.db.select().from(cards).where(eq(cards.topicId, topicId)).all();
  }

  /** Concept ids attached to a card (§4) — used by dedup/coverage later. */
  conceptsFor(cardId: string): string[] {
    return this.db
      .select({ conceptId: cardConcepts.conceptId })
      .from(cardConcepts)
      .where(eq(cardConcepts.cardId, cardId))
      .all()
      .map((r) => r.conceptId);
  }
}
