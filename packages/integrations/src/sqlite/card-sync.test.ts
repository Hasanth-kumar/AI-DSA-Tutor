import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS } from "./migrations.js";
import {
  CardSyncService,
  JsonFileSyncTarget,
  dirtyCardDeltas,
  markCardsSynced,
  applyPulledContent,
  countDirtyCards,
  type SyncDb,
} from "../sync/index.js";
import { upsertEmbedding } from "../embeddings/index.js";

/**
 * Stage-6 end-to-end acceptance (design §8, §10). Drives the real card-sync
 * service against node:sqlite + the offline JsonFileSyncTarget, proving:
 * delta-only batched flush clears dirty + stamps synced_at, a clean bank is a
 * no-op, embeddings never leave the local table (§6), the updated_at conflict
 * guard keeps a concurrently-reviewed card dirty, and a pull rewrites content
 * while leaving local SR state untouched (§8 field ownership).
 */
interface SqliteLike extends SyncDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...p: unknown[]): { changes?: number | bigint };
    get(...p: unknown[]): unknown;
    all(...p: unknown[]): Array<Record<string, unknown>>;
  };
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

function freshDb(): SqliteLike {
  const db = new DatabaseSync!(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of MIGRATIONS) {
    const sql = readFileSync(resolve(repoRoot, "database/migrations", file), "utf-8");
    try {
      db.exec(sql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("duplicate column name") && !message.includes("no such column")) {
        throw err;
      }
    }
  }
  return db;
}

const TOPIC = "two-pointers";

function insertCard(
  db: SqliteLike,
  id: string,
  over: { stability?: number; due?: number; updatedAt?: number; dirty?: number } = {},
): void {
  db.prepare(
    `INSERT INTO cards(id,topic_id,type,front,back,stability,difficulty,due,last_review,
       reps,lapses,state,origin,source_hash,dirty,synced_at,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    TOPIC,
    "plain-recall",
    `front-${id}`,
    `back-${id}`,
    over.stability ?? null,
    5,
    over.due ?? 1000,
    null,
    0,
    0,
    over.stability != null ? 2 : 0,
    "seed",
    `hash-${id}`,
    over.dirty ?? 1,
    null,
    1,
    over.updatedAt ?? 1,
  );
  db.prepare(`INSERT INTO card_concepts(card_id,concept_id) VALUES(?,?)`).run(id, "overflow");
}

function setup(db: SqliteLike): void {
  db.prepare(`INSERT INTO topics(id,name,updated_at) VALUES(?,?,1)`).run(TOPIC, "Two Pointers");
  insertCard(db, "A", { stability: 4.2, due: 5000, updatedAt: 100 });
  insertCard(db, "B", { stability: 1.1, due: 6000, updatedAt: 100 });
  // A local embedding for A — must never reach the sync target (§6).
  upsertEmbedding(db, {
    cardId: "A",
    model: "fake",
    vector: Float32Array.from([1, 0, 0]),
    sourceHash: "hash-A",
  });
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dsa-cardsync-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!DatabaseSync)("Stage-6 card sync (§8, §10)", () => {
  it("flushes only dirty deltas, clears them, and stamps synced_at (§8)", async () => {
    const db = freshDb();
    setup(db);
    const target = new JsonFileSyncTarget({ dir });
    const svc = new CardSyncService(db, target);

    expect(svc.pendingCount()).toBe(2);
    const report = await svc.flush(2000);
    expect(report).toEqual({ dirty: 2, pushed: 2, failed: 0, cleared: 2 });

    // Both rows are now clean with a synced_at stamp.
    const rows = db
      .prepare(`SELECT id, dirty, synced_at FROM cards ORDER BY id`)
      .all() as Array<{ id: string; dirty: number; synced_at: number }>;
    expect(rows.every((r) => Number(r.dirty) === 0)).toBe(true);
    expect(rows.every((r) => Number(r.synced_at) === 2000)).toBe(true);

    // The canonical export holds both cards and no vector (§6/§10).
    const raw = readFileSync(join(dir, "cards.json"), "utf-8");
    expect(JSON.parse(raw).cards).toHaveLength(2);
    expect(raw.toLowerCase()).not.toContain("vector");

    // The embedding stayed strictly local.
    const embs = db.prepare(`SELECT COUNT(*) AS n FROM card_embeddings`).get() as { n: number };
    expect(Number(embs.n)).toBe(1);
  });

  it("is a no-op on a clean bank (delta, never a full re-push)", async () => {
    const db = freshDb();
    setup(db);
    const svc = new CardSyncService(db, new JsonFileSyncTarget({ dir }));
    await svc.flush(2000);
    expect(await svc.flush(3000)).toEqual({ dirty: 0, pushed: 0, failed: 0, cleared: 0 });
  });

  it("only the re-reviewed card becomes dirty again and re-syncs its SR mirror", async () => {
    const db = freshDb();
    setup(db);
    const svc = new CardSyncService(db, new JsonFileSyncTarget({ dir }));
    await svc.flush(2000);

    // Simulate a review on A: new SR state + dirty + newer updated_at.
    db.prepare(
      `UPDATE cards SET stability=9.9, due=99999, dirty=1, updated_at=5000 WHERE id='A'`,
    ).run();

    expect(svc.pendingCount()).toBe(1);
    const report = await svc.flush(6000);
    expect(report).toMatchObject({ dirty: 1, pushed: 1, cleared: 1 });

    const exported = JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
    const a = exported.cards.find((c: { id: string }) => c.id === "A");
    expect(a.stability).toBe(9.9);
  });

  it("the updated_at guard keeps a card dirty if it is reviewed mid-flush (§8)", () => {
    const db = freshDb();
    setup(db);
    const deltas = dirtyCardDeltas(db); // snapshot at updated_at=100
    // A concurrent review lands after the snapshot.
    db.prepare(`UPDATE cards SET dirty=1, updated_at=9000 WHERE id='A'`).run();
    // Marking the stale snapshot synced must NOT clear A (updated_at moved).
    const cleared = markCardsSynced(
      db,
      deltas.map((d) => ({ id: d.id, updatedAt: d.updatedAt })),
      {},
      2000,
    );
    expect(cleared).toBe(1); // only B cleared
    expect(countDirtyCards(db)).toBe(1); // A still dirty
  });

  it("pull rewrites content but never touches local SR state (§8 field ownership)", async () => {
    const db = freshDb();
    setup(db);

    applyPulledContent(
      db,
      [
        // Existing card A: content changed remotely.
        {
          id: "A",
          notionPageId: "page-A",
          topicId: TOPIC,
          type: "pattern-trigger",
          front: "remote front",
          back: "remote back",
          conceptTags: ["complement-trick"],
        },
        // A brand-new card C arriving from the remote.
        {
          id: "C",
          notionPageId: "page-C",
          topicId: TOPIC,
          type: "plain-recall",
          front: "front-C",
          back: "back-C",
          conceptTags: ["overflow"],
        },
      ],
      7000,
    );

    const a = db.prepare(`SELECT * FROM cards WHERE id='A'`).get() as Record<string, unknown>;
    // Content was overwritten (Notion-authoritative)...
    expect(a.front).toBe("remote front");
    expect(a.type).toBe("pattern-trigger");
    // ...but SR runtime state is intact (local-authoritative).
    expect(a.stability).toBe(4.2);
    expect(Number(a.due)).toBe(5000);
    // Concept links were replaced to match the remote tag set.
    const tags = db
      .prepare(`SELECT concept_id FROM card_concepts WHERE card_id='A'`)
      .all()
      .map((r) => String(r.concept_id));
    expect(tags).toEqual(["complement-trick"]);

    // New card inserted clean (came from the remote, not a local edit).
    const c = db.prepare(`SELECT id, dirty FROM cards WHERE id='C'`).get() as {
      id: string;
      dirty: number;
    };
    expect(c.id).toBe("C");
    expect(Number(c.dirty)).toBe(0);
  });
});
