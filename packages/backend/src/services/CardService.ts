/**
 * CardService — the local, no-LLM hot path for warm-up and review (design §1,
 * §7, §11).
 *
 * Everything here reads from a {@link CardStore} (local SQLite) and schedules
 * with per-card FSRS via {@link reviewRow}. There is no LLM call, no network,
 * and no topic-level SM-2 anywhere in this file — that is the whole point of
 * the rework: warm-up/show-answer/review must complete with zero live
 * generation so they are instant and work offline.
 */
import type { CardRow, CardStore } from "./cardTypes.js";
import { LEECH_LAPSE_THRESHOLD, reviewRow } from "./fsrs.js";

const MS_PER_DAY = 86_400_000;

/** Tiny key/value surface (satisfied by `SyncMetaRepository`) for served sets. */
export interface MetaStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** One card as presented in a warm-up. `counting` cards feed SR; previews don't. */
export interface WarmupCardView {
  id: string;
  topicId: string | null;
  type: string;
  front: string;
  back: string;
  /** True = a real due card (graded → SR). False = non-counting preview filler. */
  counting: boolean;
}

export interface WarmupSelection {
  cards: WarmupCardView[];
  /** `due` = at least one due card served; `preview` = only filler; `empty` = bank empty. */
  source: "due" | "preview" | "empty";
  /** Ids of the counting (due) cards, recorded so grading drives their SR. */
  countingIds: string[];
}

export interface CardReviewResult {
  cardId: string;
  due: number;
  intervalDays: number;
  state: number;
  lapses: number;
  leech: boolean;
}

export interface WarmupGradeResult {
  topicId: string;
  quality: number;
  nextRevisionAt: string | null;
  intervalDays: number;
  /** How many served cards were actually graded (preview/suspended excluded). */
  reviewed: number;
}

export class CardService {
  constructor(
    private readonly store: CardStore,
    private readonly meta: MetaStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private day(nowMs: number): string {
    return new Date(nowMs).toISOString().slice(0, 10);
  }

  private servedKey(topicId: string, day: string): string {
    return `warmup_served:${topicId}:${day}`;
  }

  /**
   * Build the warm-up set (§11). Fallback order, strictly:
   *   1. due cards of today's topic  (counting — first reps of SR review)
   *   2. any due card               (counting)
   *   3. non-counting preview cards  (topic first, then any) — never written to SR
   * Never reviews a not-due card as if it were due, and never returns empty
   * unless the entire bank is empty. The counting ids are persisted so a later
   * grade drives *those* cards' FSRS — and because grading advances their due
   * date past today, they leave the day's review queue (no double-counting).
   */
  buildWarmup(topicId: string, count = 3): WarmupSelection {
    const now = this.now();
    const picked: WarmupCardView[] = [];
    const seen = new Set<string>();

    const take = (rows: CardRow[], counting: boolean): void => {
      for (const r of rows) {
        if (picked.length >= count) break;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        picked.push({
          id: r.id,
          topicId: r.topicId,
          type: r.type,
          front: r.front,
          back: r.back,
          counting,
        });
      }
    };

    // 1 + 2: due cards (counting).
    take(this.store.dueCards({ topicId, now, limit: count }), true);
    if (picked.length < count) {
      take(this.store.dueCards({ now, limit: count, excludeIds: [...seen] }), true);
    }
    const hadDue = picked.length > 0;

    // 3: preview filler (non-counting) — topic first, then any.
    if (picked.length < count) {
      take(this.store.previewCards({ topicId, now, limit: count, excludeIds: [...seen] }), false);
    }
    if (picked.length < count) {
      take(this.store.previewCards({ now, limit: count, excludeIds: [...seen] }), false);
    }

    const countingIds = picked.filter((c) => c.counting).map((c) => c.id);
    this.meta.set(this.servedKey(topicId, this.day(now)), JSON.stringify(countingIds));

    const source: WarmupSelection["source"] =
      picked.length === 0 ? "empty" : hadDue ? "due" : "preview";
    return { cards: picked, source, countingIds };
  }

  /** Local answer lookup for "show answer" — no LLM (§1). */
  findAnswer(topicId: string, question: string): string | null {
    const row =
      this.store.findByFront(topicId, question) ?? this.store.findByFront(null, question);
    return row ? row.back : null;
  }

  /**
   * Apply one self-graded review to a single card via per-card FSRS (§7).
   * Writes the new state back, appends a `CardReviewed` event, and — the first
   * time a card crosses the lapse threshold — flags it a leech and logs
   * `LeechDetected` (§9).
   */
  review(cardId: string, quality: number, nowMs: number = this.now()): CardReviewResult {
    const row = this.store.findById(cardId);
    if (!row) throw new Error(`Card not found: ${cardId}`);

    const { patch, rating, intervalDays, leechTriggered } = reviewRow(row, quality, nowMs);
    this.store.applyReview(cardId, patch, nowMs);
    this.store.logEvent({
      cardId,
      type: "CardReviewed",
      payload: {
        rating,
        quality: Math.round(quality),
        prevState: row.state,
        nextState: patch.state,
        due: patch.due,
        stability: patch.stability,
        difficulty: patch.difficulty,
        lapses: patch.lapses,
      },
      createdAt: nowMs,
    });
    if (leechTriggered) {
      this.store.logEvent({
        cardId,
        type: "LeechDetected",
        payload: { lapses: patch.lapses, threshold: LEECH_LAPSE_THRESHOLD },
        createdAt: nowMs,
      });
    }

    return {
      cardId,
      due: patch.due,
      intervalDays,
      state: patch.state,
      lapses: patch.lapses,
      leech: leechTriggered || row.leech === 1,
    };
  }

  /**
   * Grade the warm-up. The frontend reports one averaged self-grade per topic;
   * we apply it as a per-card FSRS review to each *counting* card served in
   * today's warm-up (preview cards are never written back — §11). Returns the
   * soonest next-due across the graded cards for the "next review in N days"
   * summary. Idempotent within a day: the served set is cleared after grading.
   */
  warmupGrade(topicId: string, quality: number): WarmupGradeResult {
    const now = this.now();
    const key = this.servedKey(topicId, this.day(now));
    const raw = this.meta.get(key);
    let ids: string[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === "string");
      } catch {
        ids = [];
      }
    }

    const clamped = Math.max(0, Math.min(5, Math.round(quality)));
    let earliestDue: number | null = null;
    let reviewed = 0;
    for (const id of ids) {
      const row = this.store.findById(id);
      if (!row || row.suspended === 1) continue;
      const res = this.review(id, clamped, now);
      reviewed += 1;
      if (earliestDue == null || res.due < earliestDue) earliestDue = res.due;
    }
    this.meta.set(key, ""); // consume the served set so we never double-grade.

    return {
      topicId,
      quality: clamped,
      nextRevisionAt: earliestDue != null ? new Date(earliestDue).toISOString() : null,
      intervalDays: earliestDue != null ? Math.max(0, Math.round((earliestDue - now) / MS_PER_DAY)) : 0,
      reviewed,
    };
  }
}
