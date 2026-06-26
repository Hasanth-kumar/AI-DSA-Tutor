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
  /** Not-yet-due cards for non-counting preview filler, soonest-due first. */
  previewCards(query: PreviewQuery): CardRow[];
  findById(id: string): CardRow | null;
  /** Exact front-text match within a topic (or any topic when `topicId` null). */
  findByFront(topicId: string | null, front: string): CardRow | null;
  /** Write back FSRS state for one card and mark it dirty for sync (§8). */
  applyReview(id: string, patch: ReviewPatch, now: number): void;
  /** Append one event to the log (§9). */
  logEvent(event: CardEventInput): void;
}
