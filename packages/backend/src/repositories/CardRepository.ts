/**
 * CardRepository — the Drizzle/better-sqlite3 implementation of {@link CardStore}
 * (design §3, §7, §9, §11). It is the *only* concrete persistence layer the
 * card hot path uses; `CardService` depends on the {@link CardStore} interface,
 * never on this class, so the same logic runs against a node:sqlite test store.
 *
 * Reads are local and indexed (`idx_cards_due` / topic) so warm-up and review
 * load instantly with no LLM or network (§1). Writes mark the row `dirty` for
 * the later delta sync to Notion (§8). Cards are not mirrored in MirrorCache
 * (topics/problems/sessions only), so card writes must not invalidate it.
 */
import { and, asc, eq, gt, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { cardConcepts, cardEvents, cards } from "@dsa/database/schema";
import type { CardEventRecord } from "@dsa/intelligence";
import type { SqliteDb } from "@dsa/integrations";
import type {
  CardEventInput,
  CardRow,
  CardStore,
  ConceptDueQuery,
  DueQuery,
  PreviewQuery,
  ReviewPatch,
} from "../services/cardTypes.js";
import {
  isNearlyMatureFromCounts,
  MASTERY_STABILITY_DAYS,
} from "../services/masteryTrigger.js";

export class CardRepository implements CardStore {
  constructor(private readonly db: SqliteDb) {}

  dueCards(query: DueQuery): CardRow[] {
    const conds = [eq(cards.suspended, 0), lte(cards.due, query.now)];
    if (query.topicId) conds.push(eq(cards.topicId, query.topicId));
    if (query.excludeLeech) conds.push(eq(cards.leech, 0));
    if (query.leechOnly) conds.push(eq(cards.leech, 1));
    if (query.excludeIds?.length) conds.push(notInArray(cards.id, [...query.excludeIds]));
    return this.db
      .select()
      .from(cards)
      .where(and(...conds))
      .orderBy(asc(cards.due))
      .limit(query.limit)
      .all();
  }

  dueCardsByConcepts(query: ConceptDueQuery): CardRow[] {
    if (query.conceptIds.length === 0) return [];
    const conds = [
      eq(cards.suspended, 0),
      lte(cards.due, query.now),
      inArray(cardConcepts.conceptId, [...query.conceptIds]),
    ];
    if (query.topicId) conds.push(eq(cards.topicId, query.topicId));
    if (query.excludeIds?.length) conds.push(notInArray(cards.id, [...query.excludeIds]));
    const rows = this.db
      .select({ card: cards })
      .from(cards)
      .innerJoin(cardConcepts, eq(cardConcepts.cardId, cards.id))
      .where(and(...conds))
      .orderBy(asc(cards.due))
      .limit(query.limit * 2)
      .all();
    const seen = new Set<string>();
    const out: CardRow[] = [];
    for (const { card } of rows) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      out.push(card);
      if (out.length >= query.limit) break;
    }
    return out;
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
  }

  suspend(id: string, now: number): void {
    this.db
      .update(cards)
      .set({ suspended: 1, dirty: 1, updatedAt: now })
      .where(eq(cards.id, id))
      .run();
  }

  deleteCard(id: string): void {
    // Concept links must go first (coverage stays correct; FK-safe under node:sqlite).
    this.db.delete(cardConcepts).where(eq(cardConcepts.cardId, id)).run();
    // ponytail: card_embeddings is ON DELETE CASCADE (0012); a stale orphan there is
    // harmless (never re-served) if better-sqlite3 has FK off — clean up if it ever matters.
    this.db.delete(cards).where(eq(cards.id, id)).run();
  }

  updateContent(id: string, front: string, back: string, now: number): void {
    this.db
      .update(cards)
      .set({ front, back, dirty: 1, updatedAt: now })
      .where(eq(cards.id, id))
      .run();
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

  /**
   * Read the append-only event log for on-demand analytics (§9). Parses the JSON
   * payload into the pure-engine {@link CardEventRecord} shape and orders rows
   * oldest-first so cumulative trends fold correctly. This is opt-in analytics,
   * NOT a hot-path read — the warm-up/review path never touches it.
   */
  listEvents(sinceMs?: number): CardEventRecord[] {
    const base = this.db.select().from(cardEvents);
    const rows =
      sinceMs != null
        ? base.where(gte(cardEvents.createdAt, sinceMs)).orderBy(asc(cardEvents.createdAt)).all()
        : base.orderBy(asc(cardEvents.createdAt)).all();
    return rows.map((r) => ({
      cardId: r.cardId,
      type: r.type,
      createdAt: r.createdAt,
      payload: parsePayload(r.payload),
    }));
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

  conceptsForMany(cardIds: readonly string[]): Map<string, string[]> {
    const result = new Map<string, string[]>();
    if (cardIds.length === 0) return result;
    for (const id of cardIds) result.set(id, []);
    const rows = this.db
      .select({ cardId: cardConcepts.cardId, conceptId: cardConcepts.conceptId })
      .from(cardConcepts)
      .where(inArray(cardConcepts.cardId, [...cardIds]))
      .all();
    for (const row of rows) {
      const list = result.get(row.cardId) ?? [];
      list.push(row.conceptId);
      result.set(row.cardId, list);
    }
    return result;
  }

  isTopicNearlyMature(topicId: string): boolean {
    const row = this.db
      .select({
        active: sql<number>`count(*)`,
        mature: sql<number>`coalesce(sum(case when ${cards.stability} >= ${MASTERY_STABILITY_DAYS} then 1 else 0 end), 0)`,
      })
      .from(cards)
      .where(and(eq(cards.topicId, topicId), eq(cards.suspended, 0)))
      .get();
    return isNearlyMatureFromCounts(row?.active ?? 0, row?.mature ?? 0);
  }
}

/** Tolerant JSON parse for event payloads — a malformed row degrades to null. */
function parsePayload(raw: string | null): CardEventRecord["payload"] {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CardEventRecord["payload"];
  } catch {
    return null;
  }
}
