/**
 * Shared card types + the persistence contract `CardService` depends on
 * (design §7, §9, §11). Kept free of any native binding (no `better-sqlite3`)
 * so it can be implemented by the Drizzle-backed {@link CardRepository} in
 * production *and* by a `node:sqlite` test double — exactly the split the seed
 * store uses. This is why `CardService` never imports Drizzle or the SQLite
 * driver directly.
 */
import type { cards } from "@dsa/database/schema";
import type { CardEventType } from "@dsa/database/schema";

/** A `cards` row as selected from the DB (camelCase, ts-fsrs-compatible state). */
export type CardRow = typeof cards.$inferSelect;

/** Due-queue query: due (`due <= now`), not suspended, optional topic filter. */
export interface DueQuery {
  topicId?: string | null;
  now: number;
  limit: number;
  excludeIds?: readonly string[];
  /** When true, leech-flagged cards are omitted (§7 — don't drill forever). */
  excludeLeech?: boolean;
  /** When true, only leech-flagged due cards are returned. */
  leechOnly?: boolean;
}

/** Due cards tagged with any of the given concept ids (§4 leech remediation). */
export interface ConceptDueQuery {
  topicId?: string | null;
  conceptIds: readonly string[];
  now: number;
  limit: number;
  excludeIds?: readonly string[];
}

/** Preview query: not-yet-due cards used only as non-counting warm-up filler. */
export interface PreviewQuery {
  topicId?: string | null;
  now: number;
  limit: number;
  excludeIds?: readonly string[];
}

/**
 * The FSRS runtime-state columns written back after a review (§7, §8). These
 * are *local-authoritative* — pushed to Notion as a write-only mirror, never
 * read back from it. `leech` is set only when a card crosses the lapse
 * threshold (§7); it is intentionally omitted otherwise so a review never
 * clears a leech flag implicitly.
 */
export interface ReviewPatch {
  stability: number;
  difficulty: number;
  due: number;
  lastReview: number | null;
  reps: number;
  lapses: number;
  state: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  leech?: boolean;
}

/** An append-only `card_events` row (§9) — never replayed to rebuild state. */
export interface CardEventInput {
  cardId: string;
  type: CardEventType;
  payload?: unknown;
  createdAt: number;
}

/**
 * Minimal persistence surface for the hot path (warm-up + review). Reads come
 * only from the local store — **no LLM, no network** (§1). Implemented by
 * {@link CardRepository} (Drizzle/better-sqlite3) and a node:sqlite test store.
 */
export interface CardStore {
  /** Due cards (`due <= now`, not suspended), soonest-due first. */
  dueCards(query: DueQuery): CardRow[];
  /** Due cards tagged with any of the given concepts (§4 leech remediation). */
  dueCardsByConcepts(query: ConceptDueQuery): CardRow[];
  /** Concept ids attached to a card (§4). */
  conceptsFor(cardId: string): string[];
  /** Batch concept lookup for leech remediation (avoids N+1 in review queue). */
  conceptsForMany(cardIds: readonly string[]): Map<string, string[]>;
  /** SQL aggregate maturity check — avoids loading all topic cards per review. */
  isTopicNearlyMature(topicId: string): boolean;
  /** Not-yet-due cards for non-counting preview filler, soonest-due first. */
  previewCards(query: PreviewQuery): CardRow[];
  findById(id: string): CardRow | null;
  /** Exact front-text match within a topic (or any topic when `topicId` null). */
  findByFront(topicId: string | null, front: string): CardRow | null;
  /** Write back FSRS state for one card and mark it dirty for sync (§8). */
  applyReview(id: string, patch: ReviewPatch, now: number): void;
  /** Triage (§11): suspend a card (drops it from every queue), dirty for sync. */
  suspend(id: string, now: number): void;
  /** Triage (§11): hard-delete a card and its concept links. */
  deleteCard(id: string): void;
  /** Triage (§11): edit content (Notion-authoritative §8) → mark dirty for sync. */
  updateContent(id: string, front: string, back: string, now: number): void;
  /** Append one event to the log (§9). */
  logEvent(event: CardEventInput): void;
}
