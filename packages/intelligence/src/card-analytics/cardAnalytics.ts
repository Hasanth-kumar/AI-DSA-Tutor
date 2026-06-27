/**
 * On-demand flashcard analytics over the append-only `card_events` log (§9).
 *
 * Pure and I/O-free: every figure is recomputed from the event rows passed in,
 * so the report is always live and never needs a stored column or a backfill —
 * exactly the §9 promise ("computable on demand from the log"). Live FSRS state
 * is NOT rebuilt here (that would be event sourcing, which §9 rejects); we only
 * *summarize* what happened.
 */
import type {
  CardAnalyticsOptions,
  CardAnalyticsReport,
  CardAnalyticsSummary,
  CardEventRecord,
  CardQuality,
  CardQualityFlag,
  CoverageTrendPoint,
  RetentionTrendPoint,
  RetireCandidate,
} from "./types.js";

const MS_PER_DAY = 86_400_000;

const DEFAULTS = {
  weeks: 8,
  retireMinReviews: 5,
  retireMaxRetention: 0.7,
  retireLeechRetention: 0.85,
} as const;

/** A review was a successful recall when graded better than Again (rating ≥ 2). */
function isRecall(rating: number | undefined): boolean {
  return typeof rating === "number" && rating >= 2;
}

function isLapse(rating: number | undefined): boolean {
  return rating === 1;
}

interface WeekWindow {
  start: number;
  end: number;
  startLabel: string;
  endLabel: string;
}

/** Trailing rolling 7-day windows ending at `now` (matches velocity.ts). */
function weekWindows(now: number, weeks: number): WeekWindow[] {
  const windows: WeekWindow[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end.getTime() - 6 * MS_PER_DAY);
    start.setHours(0, 0, 0, 0);
    windows.push({
      start: start.getTime(),
      end: end.getTime(),
      startLabel: start.toISOString().slice(0, 10),
      endLabel: end.toISOString().slice(0, 10),
    });
  }
  return windows;
}

/** Weekly retention buckets — recalled vs lapsed reviews over the window (§9). */
export function computeRetentionTrend(
  events: readonly CardEventRecord[],
  weeks: number = DEFAULTS.weeks,
  now: number = Date.now(),
): RetentionTrendPoint[] {
  const windows = weekWindows(now, weeks);
  const reviews = events.filter((e) => e.type === "CardReviewed");

  return windows.map((w) => {
    let total = 0;
    let recalled = 0;
    let lapses = 0;
    for (const e of reviews) {
      if (e.createdAt < w.start || e.createdAt > w.end) continue;
      total += 1;
      const rating = e.payload?.rating;
      if (isRecall(rating)) recalled += 1;
      else if (isLapse(rating)) lapses += 1;
    }
    return {
      weekStart: w.startLabel,
      weekEnd: w.endLabel,
      reviews: total,
      recalled,
      lapses,
      retention: total > 0 ? round2(recalled / total) : 0,
    };
  });
}

/** Weekly bank-growth + cumulative concept coverage from the log (§4, §9). */
export function computeCoverageTrend(
  events: readonly CardEventRecord[],
  weeks: number = DEFAULTS.weeks,
  now: number = Date.now(),
): CoverageTrendPoint[] {
  const windows = weekWindows(now, weeks);
  const firstStart = windows[0]?.start ?? now;

  // Cumulative baseline: everything that happened before the trend window so the
  // running totals are correct, not just the in-window delta.
  let cumulativeCards = 0;
  const seenConcepts = new Set<string>();
  for (const e of events) {
    if (e.createdAt >= firstStart) continue;
    if (e.type === "CardGenerated") {
      cumulativeCards += 1;
      for (const c of e.payload?.concepts ?? []) seenConcepts.add(c);
    } else if (e.type === "CardDeleted") {
      cumulativeCards -= 1;
    }
  }

  return windows.map((w) => {
    let cardsAdded = 0;
    let cardsRemoved = 0;
    for (const e of events) {
      if (e.createdAt < w.start || e.createdAt > w.end) continue;
      if (e.type === "CardGenerated") {
        cardsAdded += 1;
        for (const c of e.payload?.concepts ?? []) seenConcepts.add(c);
      } else if (e.type === "CardDeleted") {
        cardsRemoved += 1;
      }
    }
    cumulativeCards += cardsAdded - cardsRemoved;
    return {
      weekStart: w.startLabel,
      weekEnd: w.endLabel,
      cardsAdded,
      cardsRemoved,
      cumulativeCards: Math.max(0, cumulativeCards),
      cumulativeConcepts: seenConcepts.size,
    };
  });
}

interface CardAccumulator {
  reviews: number;
  recalls: number;
  lapses: number;
  ratingSum: number;
  ratingCount: number;
  edits: number;
  suspended: boolean;
  deleted: boolean;
  leech: boolean;
  lastReviewedAt: number | null;
}

function emptyAcc(): CardAccumulator {
  return {
    reviews: 0,
    recalls: 0,
    lapses: 0,
    ratingSum: 0,
    ratingCount: 0,
    edits: 0,
    suspended: false,
    deleted: false,
    leech: false,
    lastReviewedAt: null,
  };
}

/** Per-card quality folded from the event history (§9 — "per-card quality"). */
export function computeCardQuality(events: readonly CardEventRecord[]): CardQuality[] {
  const byCard = new Map<string, CardAccumulator>();

  for (const e of events) {
    const acc = byCard.get(e.cardId) ?? emptyAcc();
    switch (e.type) {
      case "CardReviewed": {
        acc.reviews += 1;
        const rating = e.payload?.rating;
        if (isRecall(rating)) acc.recalls += 1;
        else if (isLapse(rating)) acc.lapses += 1;
        if (typeof rating === "number") {
          acc.ratingSum += rating;
          acc.ratingCount += 1;
        }
        if (acc.lastReviewedAt == null || e.createdAt > acc.lastReviewedAt) {
          acc.lastReviewedAt = e.createdAt;
        }
        break;
      }
      case "CardEdited":
        acc.edits += 1;
        break;
      case "CardSuspended":
        acc.suspended = true;
        break;
      case "CardDeleted":
        acc.deleted = true;
        break;
      case "LeechDetected":
        acc.leech = true;
        break;
      default:
        break;
    }
    byCard.set(e.cardId, acc);
  }

  const result: CardQuality[] = [];
  for (const [cardId, acc] of byCard) {
    const retention = acc.reviews > 0 ? acc.recalls / acc.reviews : 0;
    const flags: CardQualityFlag[] = [];
    if (acc.leech) flags.push("leech");
    if (acc.reviews >= 3 && retention < 0.6) flags.push("low-retention");
    if (acc.edits >= 2) flags.push("churned");
    if (acc.suspended) flags.push("suspended");

    result.push({
      cardId,
      reviews: acc.reviews,
      recalls: acc.recalls,
      lapses: acc.lapses,
      retention: round2(retention),
      avgRating: acc.ratingCount > 0 ? round2(acc.ratingSum / acc.ratingCount) : null,
      edits: acc.edits,
      suspended: acc.suspended,
      deleted: acc.deleted,
      leech: acc.leech,
      lastReviewedAt: acc.lastReviewedAt,
      qualityScore: qualityScore(acc, retention),
      flags,
    });
  }

  // Worst (lowest score) first — the cards most worth a human's attention.
  result.sort((a, b) => a.qualityScore - b.qualityScore);
  return result;
}

/**
 * Composite 0–1 health. With no reviews there is no negative signal, so the card
 * stays neutral-high (penalized only for churn/leech). Once reviewed, retention
 * drives the score, with edit-churn and leech penalties on top. Derived on
 * demand, never stored (§8 defers `quality_score`).
 */
function qualityScore(acc: CardAccumulator, retention: number): number {
  const base = acc.reviews > 0 ? retention : 1;
  const editPenalty = Math.min(0.3, acc.edits * 0.1);
  const leechPenalty = acc.leech ? 0.25 : 0;
  return round2(clamp(base - editPenalty - leechPenalty, 0, 1));
}

/** Cards the log says to reformulate/retire — never-improving leeches & duds. */
export function findRetireCandidates(
  quality: readonly CardQuality[],
  options: CardAnalyticsOptions = {},
): RetireCandidate[] {
  const minReviews = options.retireMinReviews ?? DEFAULTS.retireMinReviews;
  const maxRetention = options.retireMaxRetention ?? DEFAULTS.retireMaxRetention;
  const leechRetention = options.retireLeechRetention ?? DEFAULTS.retireLeechRetention;

  const candidates: RetireCandidate[] = [];
  for (const q of quality) {
    // Already gone or parked by the human — not an *auto* candidate.
    if (q.deleted || q.suspended) continue;

    let reason: string | null = null;
    if (q.leech && q.reviews >= 3 && q.retention < leechRetention) {
      reason = `leech with ${pct(q.retention)} retention over ${q.reviews} reviews`;
    } else if (q.reviews >= minReviews && q.retention < maxRetention) {
      reason = `low retention (${pct(q.retention)}) after ${q.reviews} reviews`;
    }
    if (!reason) continue;

    candidates.push({
      cardId: q.cardId,
      reason,
      reviews: q.reviews,
      retention: q.retention,
      lapses: q.lapses,
      qualityScore: q.qualityScore,
    });
  }

  candidates.sort((a, b) => a.qualityScore - b.qualityScore);
  return candidates;
}

/** The full on-demand report (§9) — one pass-equivalent over the event log. */
export function computeCardAnalytics(
  events: readonly CardEventRecord[],
  options: CardAnalyticsOptions = {},
): CardAnalyticsReport {
  const weeks = options.weeks ?? DEFAULTS.weeks;
  const now = options.now ?? Date.now();

  const cardQuality = computeCardQuality(events);
  const retireCandidates = findRetireCandidates(cardQuality, options);

  const totalReviews = cardQuality.reduce((s, q) => s + q.reviews, 0);
  const totalRecalls = cardQuality.reduce((s, q) => s + q.recalls, 0);
  const liveCards = cardQuality.filter((q) => !q.deleted).length;
  const leechCards = cardQuality.filter((q) => q.leech && !q.deleted).length;

  const summary: CardAnalyticsSummary = {
    liveCards,
    cardsEverSeen: cardQuality.length,
    totalReviews,
    overallRetention: totalReviews > 0 ? round2(totalRecalls / totalReviews) : 0,
    leechCards,
    retireCandidates: retireCandidates.length,
  };

  return {
    summary,
    retentionTrend: computeRetentionTrend(events, weeks, now),
    coverageTrend: computeCoverageTrend(events, weeks, now),
    cardQuality,
    retireCandidates,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
