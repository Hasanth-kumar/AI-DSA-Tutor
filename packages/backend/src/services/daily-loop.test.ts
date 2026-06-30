import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CardService, type MetaStore } from "./CardService.js";
import { WarmupService } from "./WarmupService.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import type {
  CardEventInput,
  CardRow,
  CardStore,
  ConceptDueQuery,
  DueQuery,
  PreviewQuery,
  ReviewPatch,
} from "./cardTypes.js";

/**
 * Daily-loop budget acceptance (design §12).
 *
 * §12 is the one composition check: the daily flow — warm-up (3 cards, ~2–3 min)
 * → solve (~45 min) → update note (~5 min) → optional capped review — must fit a
 * ~1-hour budget and **never force extra time**. The two app-controlled surfaces
 * (warm-up and review) are the only places the app could blow the budget, so the
 * invariants that make §12 true are: warm-up is hard-bounded to 3 cards no matter
 * how much is due; review is hard-capped and signals "you're done, go solve"
 * (`hasMore`) instead of forcing a backlog clear; the gateway never blocks or adds
 * SR debt when the bank is sparse; and the two surfaces never double-count the
 * same card on the same day (so they can't stack work).
 *
 * Runs the real {@link WarmupService} + {@link CardService} against a REAL migrated
 * SQLite (Node's built-in `node:sqlite`, no platform-specific binary) — no LLM, no
 * network anywhere on this path. Skipped on runtimes without `node:sqlite`.
 */
interface StmtLike {
  run(...p: unknown[]): { changes?: number | bigint };
  get(...p: unknown[]): Record<string, unknown> | undefined;
  all(...p: unknown[]): Array<Record<string, unknown>>;
}
interface SqliteLike {
  exec(sql: string): void;
  prepare(sql: string): StmtLike;
}

const sqliteModule = "node:sqlite";
let DatabaseSync: (new (path: string) => SqliteLike) | undefined;
try {
  const mod = (await import(/* @vite-ignore */ sqliteModule)) as {
    DatabaseSync: new (path: string) => SqliteLike;
  };
  DatabaseSync = mod.DatabaseSync;
} catch {
  DatabaseSync = undefined;
}

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function mapRow(r: Record<string, unknown>): CardRow {
  return {
    id: r.id,
    topicId: r.topic_id,
    type: r.type,
    front: r.front,
    back: r.back,
    noteRef: r.note_ref,
    suspended: r.suspended,
    leech: r.leech,
    stability: r.stability,
    difficulty: r.difficulty,
    due: r.due,
    lastReview: r.last_review,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    elapsedDays: r.elapsed_days,
    scheduledDays: r.scheduled_days,
    learningSteps: r.learning_steps,
    origin: r.origin,
    sourceHash: r.source_hash,
    modelVersion: r.model_version,
    promptVersion: r.prompt_version,
    noteVersion: r.note_version,
    seedVersion: r.seed_version,
    notionPageId: r.notion_page_id,
    dirty: r.dirty,
    syncedAt: r.synced_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  } as unknown as CardRow;
}

/** A faithful CardStore over node:sqlite — same query semantics as CardRepository. */
class SqliteCardStore implements CardStore {
  constructor(private readonly db: SqliteLike) {}

  dueCards(q: DueQuery): CardRow[] {
    const topic = q.topicId ? " AND topic_id = ?" : "";
    const leech = q.excludeLeech ? " AND leech=0" : "";
    const leechOnly = q.leechOnly ? " AND leech=1" : "";
    const exclude =
      q.excludeIds && q.excludeIds.length
        ? ` AND id NOT IN (${q.excludeIds.map(() => "?").join(",")})`
        : "";
    const sql = `SELECT * FROM cards WHERE suspended=0 AND due<=?${topic}${leech}${leechOnly}${exclude} ORDER BY due ASC LIMIT ?`;
    const params = [q.now, ...(q.topicId ? [q.topicId] : []), ...(q.excludeIds ?? []), q.limit];
    return this.db.prepare(sql).all(...params).map(mapRow);
  }

  dueCardsByConcepts(q: ConceptDueQuery): CardRow[] {
    if (q.conceptIds.length === 0) return [];
    const topic = q.topicId ? " AND c.topic_id = ?" : "";
    const exclude =
      q.excludeIds && q.excludeIds.length
        ? ` AND c.id NOT IN (${q.excludeIds.map(() => "?").join(",")})`
        : "";
    const placeholders = q.conceptIds.map(() => "?").join(",");
    const sql = `SELECT DISTINCT c.* FROM cards c
      JOIN card_concepts cc ON cc.card_id = c.id
      WHERE c.suspended=0 AND c.due<=? AND cc.concept_id IN (${placeholders})${topic}${exclude}
      ORDER BY c.due ASC LIMIT ?`;
    const params = [
      q.now,
      ...q.conceptIds,
      ...(q.topicId ? [q.topicId] : []),
      ...(q.excludeIds ?? []),
      q.limit,
    ];
    return this.db.prepare(sql).all(...params).map(mapRow);
  }

  conceptsFor(cardId: string): string[] {
    return this.db
      .prepare("SELECT concept_id FROM card_concepts WHERE card_id = ?")
      .all(cardId)
      .map((r) => String(r.concept_id));
  }

  conceptsForMany(cardIds: readonly string[]): Map<string, string[]> {
    const result = new Map<string, string[]>();
    if (cardIds.length === 0) return result;
    for (const id of cardIds) result.set(id, []);
    const placeholders = cardIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(`SELECT card_id, concept_id FROM card_concepts WHERE card_id IN (${placeholders})`)
      .all(...cardIds);
    for (const r of rows) {
      const cardId = String(r.card_id);
      const list = result.get(cardId) ?? [];
      list.push(String(r.concept_id));
      result.set(cardId, list);
    }
    return result;
  }

  isTopicNearlyMature(topicId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT count(*) as active,
           coalesce(sum(case when stability >= 21 then 1 else 0 end), 0) as mature
         FROM cards WHERE topic_id = ? AND suspended = 0`,
      )
      .get(topicId) as { active: number; mature: number } | undefined;
    const active = Number(row?.active ?? 0);
    const mature = Number(row?.mature ?? 0);
    if (active < 3) return false;
    return mature / active >= 0.8;
  }

  findByTopic(topicId: string): CardRow[] {
    return this.db.prepare("SELECT * FROM cards WHERE topic_id = ?").all(topicId).map(mapRow);
  }

  previewCards(q: PreviewQuery): CardRow[] {
    const topic = q.topicId ? " AND topic_id = ?" : "";
    const exclude =
      q.excludeIds && q.excludeIds.length
        ? ` AND id NOT IN (${q.excludeIds.map(() => "?").join(",")})`
        : "";
    const sql = `SELECT * FROM cards WHERE suspended=0 AND due>?${topic}${exclude} ORDER BY due ASC LIMIT ?`;
    const params = [q.now, ...(q.topicId ? [q.topicId] : []), ...(q.excludeIds ?? []), q.limit];
    return this.db.prepare(sql).all(...params).map(mapRow);
  }

  findById(id: string): CardRow | null {
    const r = this.db.prepare("SELECT * FROM cards WHERE id = ?").get(id);
    return r ? mapRow(r) : null;
  }

  findByFront(topicId: string | null, front: string): CardRow | null {
    const sql = topicId
      ? "SELECT * FROM cards WHERE front = ? AND topic_id = ?"
      : "SELECT * FROM cards WHERE front = ?";
    const r = topicId ? this.db.prepare(sql).get(front, topicId) : this.db.prepare(sql).get(front);
    return r ? mapRow(r) : null;
  }

  applyReview(id: string, p: ReviewPatch, now: number): void {
    this.db
      .prepare(
        `UPDATE cards SET stability=?, difficulty=?, due=?, last_review=?, reps=?, lapses=?,
           state=?, elapsed_days=?, scheduled_days=?, learning_steps=?,
           leech=CASE WHEN ?=1 THEN 1 ELSE leech END, dirty=1, updated_at=? WHERE id=?`,
      )
      .run(
        p.stability,
        p.difficulty,
        p.due,
        p.lastReview,
        p.reps,
        p.lapses,
        p.state,
        p.elapsedDays,
        p.scheduledDays,
        p.learningSteps,
        p.leech ? 1 : 0,
        now,
        id,
      );
  }

  suspend(id: string, now: number): void {
    this.db.prepare("UPDATE cards SET suspended=1, dirty=1, updated_at=? WHERE id=?").run(now, id);
  }

  deleteCard(id: string): void {
    this.db.prepare("DELETE FROM card_concepts WHERE card_id=?").run(id);
    this.db.prepare("DELETE FROM cards WHERE id=?").run(id);
  }

  updateContent(id: string, front: string, back: string, now: number): void {
    this.db
      .prepare("UPDATE cards SET front=?, back=?, dirty=1, updated_at=? WHERE id=?")
      .run(front, back, now, id);
  }

  logEvent(e: CardEventInput): void {
    this.db
      .prepare("INSERT INTO card_events (id, card_id, type, payload, created_at) VALUES (?,?,?,?,?)")
      .run(
        `${e.cardId}-${e.type}-${e.createdAt}-${Math.random()}`,
        e.cardId,
        e.type,
        e.payload != null ? JSON.stringify(e.payload) : null,
        e.createdAt,
      );
  }
}

function freshDb(): SqliteLike {
  const db = new DatabaseSync!(":memory:");
  db.exec("CREATE TABLE topics (id TEXT PRIMARY KEY, name TEXT)");
  db.exec(
    "INSERT INTO topics (id, name) VALUES ('two-pointers','Two Pointers'),('sliding-window','Sliding Window')",
  );
  const sql = readFileSync(resolve(repoRoot, "database/migrations/0011_flashcards.sql"), "utf-8");
  db.exec(sql);
  return db;
}

function insertCard(
  db: SqliteLike,
  over: { id: string; topicId: string; due: number; suspended?: number; leech?: number },
): void {
  db.prepare(
    `INSERT INTO cards (id, topic_id, type, front, back, suspended, leech, reps, lapses, state,
       elapsed_days, scheduled_days, learning_steps, origin, dirty, created_at, updated_at, due)
     VALUES (?,?,?,?,?,?,?,0,0,0,0,0,0,'seed',1,?,?,?)`,
  ).run(
    over.id,
    over.topicId,
    "plain-recall",
    `Q-${over.id}`,
    `A-${over.id}`,
    over.suspended ?? 0,
    over.leech ?? 0,
    NOW,
    NOW,
    over.due,
  );
}

function inMemoryMeta(): MetaStore {
  const store = new Map<string, string>();
  return {
    get: (k) => store.get(k) ?? null,
    set: (k, v) => {
      store.set(k, v);
    },
  };
}

/** Minimal TopicRepository for WarmupService (it only reads id + name). */
function stubTopicRepo(): TopicRepository {
  return {
    findById: (id: string) => ({ id, name: id }),
  } as unknown as TopicRepository;
}

describe.skipIf(!DatabaseSync)("Daily loop respects the 1-hour budget (§12)", () => {
  it("warm-up is hard-bounded to 3 cards even when far more is due", () => {
    const db = freshDb();
    // A heavy backlog: 50 due cards for today's topic.
    for (let i = 0; i < 50; i++) {
      insertCard(db, { id: `tp${i}`, topicId: "two-pointers", due: NOW - DAY });
    }
    const cardService = new CardService(new SqliteCardStore(db), inMemoryMeta(), {}, () => NOW);
    const warmup = new WarmupService(stubTopicRepo(), cardService);

    const result = warmup.generateQuestions("two-pointers");
    // The gateway never balloons: exactly 3 questions, all real (counting) due cards.
    expect(result.questions).toHaveLength(3);
    expect(result.source).toBe("due");
    expect(result.questions.every((q) => q.preview === false)).toBe(true);
  });

  it("optional review is hard-capped and signals 'you're done' instead of forcing the backlog", () => {
    const db = freshDb();
    for (let i = 0; i < 50; i++) {
      insertCard(db, { id: `c${i}`, topicId: i % 2 ? "two-pointers" : "sliding-window", due: NOW - DAY });
    }
    const cardService = new CardService(new SqliteCardStore(db), inMemoryMeta(), {}, () => NOW);

    const q = cardService.reviewQueue(20);
    // Capped at 20 of the 50 due; the rest are allowed to wait (no guilt-trip).
    expect(q.cards).toHaveLength(20);
    expect(q.cap).toBe(20);
    expect(q.hasMore).toBe(true); // explicit "more is due, but you're done for now" signal.
  });

  it("the review cap is clamped — the queue can never explode the budget", () => {
    const db = freshDb();
    for (let i = 0; i < 150; i++) {
      insertCard(db, { id: `c${i}`, topicId: "two-pointers", due: NOW - DAY });
    }
    const cardService = new CardService(new SqliteCardStore(db), inMemoryMeta(), {}, () => NOW);

    // An absurd cap is clamped to 100; a zero/negative cap floors at 1. Either way bounded.
    expect(cardService.reviewQueue(10_000).cards.length).toBeLessThanOrEqual(100);
    expect(cardService.reviewQueue(10_000).cap).toBe(100);
    expect(cardService.reviewQueue(0).cap).toBe(1);
  });

  it("the gateway never blocks or adds SR debt when the bank is sparse", () => {
    const db = freshDb();
    // Nothing due anywhere — only a not-yet-due card exists.
    insertCard(db, { id: "future", topicId: "two-pointers", due: NOW + 5 * DAY });
    const store = new SqliteCardStore(db);
    const cardService = new CardService(store, inMemoryMeta(), {}, () => NOW);
    const warmup = new WarmupService(stubTopicRepo(), cardService);

    const result = warmup.generateQuestions("two-pointers");
    // Never an empty screen (it serves preview filler), still bounded (≤3),
    // and a preview-only warm-up writes NOTHING back to SR — no hidden time debt.
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.questions.length).toBeLessThanOrEqual(3);
    expect(result.source).toBe("preview");
    expect(result.questions.every((qn) => qn.preview === true)).toBe(true);

    const graded = warmup.grade("two-pointers", 4);
    expect(graded.reviewed).toBe(0); // preview cards are never graded → no SR write.
    expect(store.findById("future")!.reps).toBe(0);
    const events = db.prepare("SELECT COUNT(*) AS n FROM card_events").get() as { n: number };
    expect(events.n).toBe(0);
  });

  it("warm-up and review never double-count the same card on the same day", () => {
    const db = freshDb();
    // 3 due for today's topic (warm-up will take all 3) + others for the review surface.
    for (let i = 0; i < 3; i++) {
      insertCard(db, { id: `tp${i}`, topicId: "two-pointers", due: NOW - DAY });
    }
    for (let i = 0; i < 5; i++) {
      insertCard(db, { id: `sw${i}`, topicId: "sliding-window", due: NOW - DAY });
    }
    const cardService = new CardService(new SqliteCardStore(db), inMemoryMeta(), {}, () => NOW);
    const warmup = new WarmupService(stubTopicRepo(), cardService);

    // Full daily loop, in order: warm-up (3) → grade → optional review.
    const served = warmup.generateQuestions("two-pointers");
    const servedIds = served.questions.map((q) => q.cardId);
    expect(servedIds).toEqual(["tp0", "tp1", "tp2"]);
    warmup.grade("two-pointers", 4); // first 3 reps of SR — not extra work.

    // The 3 warm-up cards advanced past today, so the optional review excludes them:
    // the two surfaces don't stack the same card → the budget doesn't compound.
    const review = cardService.reviewQueue(20);
    const reviewIds = review.cards.map((c) => c.id);
    for (const id of servedIds) {
      expect(reviewIds).not.toContain(id);
    }
    // Only the untouched sliding-window cards remain due.
    expect(reviewIds.sort()).toEqual(["sw0", "sw1", "sw2", "sw3", "sw4"]);
  });

  it("review is optional — skipping it leaves SR state untouched (no forced extra time)", () => {
    const db = freshDb();
    insertCard(db, { id: "a", topicId: "two-pointers", due: NOW - DAY });
    const store = new SqliteCardStore(db);
    const cardService = new CardService(store, inMemoryMeta(), {}, () => NOW);

    // Merely *looking* at the queue (the opt-in surface) must not mutate anything.
    cardService.reviewQueue(20);
    expect(store.findById("a")!.reps).toBe(0);
    const events = db.prepare("SELECT COUNT(*) AS n FROM card_events").get() as { n: number };
    expect(events.n).toBe(0);
  });
});
