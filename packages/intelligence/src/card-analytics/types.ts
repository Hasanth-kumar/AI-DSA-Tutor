/**
 * On-demand flashcard analytics over the append-only event log (design §9).
 *
 * Everything here is computed *from* `card_events` rows — coverage/retention
 * trends, per-card quality, and auto-retire candidates. Nothing is stored as an
 * extra column (§8 defers `generation_confidence` / `quality_score`); a fresh
 * read of the log reproduces every number, so there is no history backfill.
 *
 * Pure types only — no I/O, no `@dsa/database` dependency. The backend parses
 * `card_events.payload` JSON into {@link CardEventRecord} and feeds it in.
 */

/** The closed event-log vocabulary (§9), mirrored locally to keep this pure. */
export type CardEventKind =
  | "CardReviewed"
  | "CardGenerated"
  | "CardEdited"
  | "CardSuspended"
  | "CardDeleted"
  | "CardMerged"
  | "LeechDetected";

/**
 * Parsed payload of a `card_events` row. Only the fields the analytics read are
 * named; the rest is tolerated. `rating` is the ts-fsrs grade (1=Again, 2=Hard,
 * 3=Good, 4=Easy) written by `CardReviewed`.
 */
export interface CardEventPayload {
  rating?: number;
  quality?: number;
  stability?: number;
  difficulty?: number;
  lapses?: number;
  prevState?: number;
  nextState?: number;
  topicId?: string | null;
  /** Concept tags carried by some `CardGenerated` events (§4 coverage). */
  concepts?: string[];
  [key: string]: unknown;
}

/** One normalized append-only event-log row — the sole input to the engine. */
export interface CardEventRecord {
  cardId: string;
  type: CardEventKind | string;
  /** Epoch milliseconds. */
  createdAt: number;
  payload?: CardEventPayload | null;
}

/** Tunable thresholds — configurable, never hard-coded inline (design ethos). */
export interface CardAnalyticsOptions {
  /** Trailing rolling 7-day windows to bucket trends into. */
  weeks?: number;
  /** Clock injection for deterministic tests. */
  now?: number;
  /** Min reviews before a card can be an auto-retire candidate. */
  retireMinReviews?: number;
  /** A reviewed card below this retention is a retire candidate. */
  retireMaxRetention?: number;
  /** A leech below this retention auto-retires even with few reviews. */
  retireLeechRetention?: number;
}

/** A single trailing-week bucket of review outcomes (retention trend). */
export interface RetentionTrendPoint {
  weekStart: string;
  weekEnd: string;
  reviews: number;
  /** Reviews graded better than Again (rating ≥ 2) — i.e. recalled. */
  recalled: number;
  /** Reviews graded Again (rating 1) — a forget/lapse. */
  lapses: number;
  /** `recalled / reviews`, 0 when no reviews that week. */
  retention: number;
}

/** A single trailing-week bucket of bank growth + concept coverage. */
export interface CoverageTrendPoint {
  weekStart: string;
  weekEnd: string;
  cardsAdded: number;
  cardsRemoved: number;
  /** Cumulative live cards (added − removed) through the end of this week. */
  cumulativeCards: number;
  /** Cumulative distinct concept tags seen in `CardGenerated` payloads. */
  cumulativeConcepts: number;
}

/** Why a card is flagged unhealthy. */
export type CardQualityFlag = "leech" | "low-retention" | "churned" | "suspended";

/** Per-card quality derived from its event history. */
export interface CardQuality {
  cardId: string;
  reviews: number;
  recalls: number;
  lapses: number;
  /** `recalls / reviews`, 0 when never reviewed. */
  retention: number;
  /** Mean ts-fsrs rating (1–4) over reviews, null when never reviewed. */
  avgRating: number | null;
  edits: number;
  suspended: boolean;
  deleted: boolean;
  leech: boolean;
  lastReviewedAt: number | null;
  /** Composite health 0–1 (higher = healthier), derived not stored (§8/§9). */
  qualityScore: number;
  flags: CardQualityFlag[];
}

/** A card the log says should be reformulated or retired. */
export interface RetireCandidate {
  cardId: string;
  reason: string;
  reviews: number;
  retention: number;
  lapses: number;
  qualityScore: number;
}

/** Roll-up totals over the whole log. */
export interface CardAnalyticsSummary {
  /** Distinct non-deleted cards seen in the log. */
  liveCards: number;
  /** Distinct cards ever seen (incl. deleted). */
  cardsEverSeen: number;
  totalReviews: number;
  /** Reviews graded ≥ 2 over all reviews. */
  overallRetention: number;
  leechCards: number;
  retireCandidates: number;
}

/** The full on-demand report computed from the event log (§9). */
export interface CardAnalyticsReport {
  summary: CardAnalyticsSummary;
  retentionTrend: RetentionTrendPoint[];
  coverageTrend: CoverageTrendPoint[];
  cardQuality: CardQuality[];
  retireCandidates: RetireCandidate[];
}
