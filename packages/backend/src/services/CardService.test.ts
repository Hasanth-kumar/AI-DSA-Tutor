import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CardService, type MetaStore } from "./CardService.js";
import type {
  CardEventInput,
  CardRow,
  CardStore,
  DueQuery,
  PreviewQuery,
  ReviewPatch,
} from "./cardTypes.js";

/**
 * Hot-path acceptance for the warm-up + per-card FSRS engine (design §1, §7,
 * §11). Runs CardService against a REAL migrated SQLite (Node's built-in
 * `node:sqlite`, so no platform-specific binary), exercising: the warm-up
 * fallback order (topic-due → any-due → non-counting preview), that preview
 * cards are never written to SR, that a per-card review advances scheduling and
 * appends a `CardReviewed` event, and that grading a card pushes its due date
 * past today so it leaves the day's review queue (no double-counting). No LLM
 * or network is touched anywhere on this path.
 *
 * Skipped on runtimes without `node:sqlite` (Node < 22.5); the logic still runs
 * on macOS via vitest where the bundled Node provides it.
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
    const exclude =
      q.excludeIds && q.excludeIds.length
        ? ` AND id NOT IN (${q.excludeIds.map(() => "?").join(",")})`
        : "";
    const sql = `SELECT * FROM cards WHERE suspended=0 AND due<=?${topic}${exclude} ORDER BY due ASC LIMIT ?`;
    const params = [q.now, ...(q.topicId ? [q.topicId] : []), ...(q.excludeIds ?? []), q.limit];
    return this.db.prepare(sql).all(...params).map(mapRow);
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
    const r = topicId
      ? this.db.prepare(sql).get(front, topicId)
      : this.db.prepare(sql).get(front);
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
  // Minimal topics table to satisfy the cards FK, then the real 0011 migration.
  db.exec("CREATE TABLE topics (id TEXT PRIMARY KEY, name TEXT)");
  db.exec("INSERT INTO topics (id, name) VALUES ('two-pointers','Two Pointers'),('sliding-window','Sliding Window')");
  const sql = readFileSync(resolve(repoRoot, "database/migrations/0011_flashcards.sql"), "utf-8");
  db.exec(sql);
  return db;
}

function insertCard(
  db: SqliteLike,
  over: { id: string; topicId: string; front?: string; back?: string; due: number; suspended?: number },
): void {
  db.prepare(
    `INSERT INTO cards (id, topic_id, type, front, back, suspended, leech, reps, lapses, state,
       elapsed_days, scheduled_days, learning_steps, origin, dirty, created_at, updated_at, due)
     VALUES (?,?,?,?,?,?,0,0,0,0,0,0,0,'seed',1,?,?,?)`,
  ).run(
    over.id,
    over.topicId,
    "plain-recall",
    over.front ?? `Q-${over.id}`,
    over.back ?? `A-${over.id}`,
    over.suspended ?? 0,
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

describe.skipIf(!DatabaseSync)("CardService warm-up + FSRS (§1, §7, §11)", () => {
  it("warm-up prefers today's-topic due cards", () => {
    const db = freshDb();
    insertCard(db, { id: "tp1", topicId: "two-pointers", due: NOW - DAY });
    insertCard(db, { id: "tp2", topicId: "two-pointers", due: NOW - DAY });
    insertCard(db, { id: "sw1", topicId: "sliding-window", due: NOW - DAY });
    const svc = new CardService(new SqliteCardStore(db), inMemoryMeta(), () => NOW);

    const sel = svc.buildWarmup("two-pointers", 3);
    expect(sel.source).toBe("due");
    const ids = sel.cards.map((c) => c.id);
    // Both topic cards come first; only then is the cross-topic due card allowed.
    expect(ids.slice(0, 2).sort()).toEqual(["tp1", "tp2"]);
    expect(sel.cards.every((c) => c.counting)).toBe(true);
  });

  it("falls back to any-due, then to non-counting preview, and is never empty", () => {
    const db = freshDb();
    // Nothing due for the requested topic; one due elsewhere; one not-yet-due.
    insertCard(db, { id: "swDue", topicId: "sliding-window", due: NOW - DAY });
    insertCard(db, { id: "tpFuture", topicId: "two-pointers", due: NOW + 5 * DAY });
    const svc = new CardService(new SqliteCardStore(db), inMemoryMeta(), () => NOW);

    const sel = svc.buildWarmup("two-pointers", 3);
    expect(sel.cards.length).toBe(2);
    const due = sel.cards.find((c) => c.id === "swDue");
    const preview = sel.cards.find((c) => c.id === "tpFuture");
    expect(due?.counting).toBe(true); // any-due card still counts
    expect(preview?.counting).toBe(false); // not-due card is preview only
    expect(sel.countingIds).toEqual(["swDue"]);
  });

  it("never reviews a not-due (preview) card — no SR writes from a preview-only warm-up", () => {
    const db = freshDb();
    insertCard(db, { id: "future1", topicId: "two-pointers", due: NOW + 3 * DAY });
    const store = new SqliteCardStore(db);
    const svc = new CardService(store, inMemoryMeta(), () => NOW);

    const sel = svc.buildWarmup("two-pointers", 3);
    expect(sel.source).toBe("preview");
    expect(sel.countingIds).toEqual([]);
    // The previewed card's SR state is untouched and no event was logged.
    expect(store.findById("future1")!.reps).toBe(0);
    const events = db.prepare("SELECT COUNT(*) AS n FROM card_events").get() as { n: number };
    expect(events.n).toBe(0);
  });

  it("a per-card review advances scheduling, logs a CardReviewed event, and leaves the day's queue", () => {
    const db = freshDb();
    insertCard(db, { id: "tp1", topicId: "two-pointers", due: NOW - DAY });
    const store = new SqliteCardStore(db);
    const svc = new CardService(store, inMemoryMeta(), () => NOW);

    const before = store.findById("tp1")!;
    expect(before.reps).toBe(0);

    const res = svc.review("tp1", 4, NOW); // Good
    const after = store.findById("tp1")!;
    expect(after.reps).toBe(1);
    expect(after.due as number).toBeGreaterThan(NOW);
    expect(res.due).toBeGreaterThan(NOW);

    const ev = db.prepare("SELECT type FROM card_events WHERE card_id='tp1'").all();
    expect(ev.map((e) => e.type)).toContain("CardReviewed");

    // It is no longer due today → leaves the review/warm-up queue (no double count).
    const stillDue = store.dueCards({ topicId: "two-pointers", now: NOW, limit: 3 });
    expect(stillDue.map((c) => c.id)).not.toContain("tp1");
  });

  it("warm-up grade applies per-card FSRS to the cards served today and clears the served set", () => {
    const db = freshDb();
    insertCard(db, { id: "tp1", topicId: "two-pointers", due: NOW - DAY });
    insertCard(db, { id: "tp2", topicId: "two-pointers", due: NOW - DAY });
    const store = new SqliteCardStore(db);
    const meta = inMemoryMeta();
    const svc = new CardService(store, meta, () => NOW);

    svc.buildWarmup("two-pointers", 3); // records served counting ids
    const grade = svc.warmupGrade("two-pointers", 4);
    expect(grade.reviewed).toBe(2);
    expect(store.findById("tp1")!.reps).toBe(1);
    expect(store.findById("tp2")!.reps).toBe(1);
    expect(grade.nextRevisionAt).not.toBeNull();

    // Re-grading the same day is a no-op (served set consumed) → no extra reps.
    const again = svc.warmupGrade("two-pointers", 4);
    expect(again.reviewed).toBe(0);
    expect(store.findById("tp1")!.reps).toBe(1);
  });

  it("show-answer reads the back locally with no generation", () => {
    const db = freshDb();
    insertCard(db, { id: "tp1", topicId: "two-pointers", front: "Two pointers when?", back: "Sorted array / pair-sum", due: NOW });
    const svc = new CardService(new SqliteCardStore(db), inMemoryMeta(), () => NOW);
    expect(svc.findAnswer("two-pointers", "Two pointers when?")).toBe("Sorted array / pair-sum");
    expect(svc.findAnswer("two-pointers", "nonexistent")).toBeNull();
  });
});
