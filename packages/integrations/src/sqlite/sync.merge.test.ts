/**
 * Phase 3 — Safe / merge sync (TDD spec).
 *
 * RED until Phase 3 lands. Today `syncNotionToSqlite` does wipe-and-reinsert
 * (`db.delete(topics)` then insert), which destroys locally-owned scheduling
 * state on every pull — catastrophic on reinstall / restore / import and
 * invisible for weeks. Per ADR Decision A, local is the source of truth for
 * `next_revision_at`, `sm2_*`, and `priority_score`; a pull must MERGE, never
 * overwrite those fields with Notion's (absent) values.
 *
 * These tests drive raw SQL (not the drizzle schema object) so they exercise
 * DB-level preservation and don't presuppose the Phase 2 schema is wired into
 * the typed `topics` table yet.
 */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import type { NotionClient } from "../notion/NotionClient.js";
import { createSqliteDb, runMigrations } from "./client.js";
import { syncNotionToSqlite } from "./sync.js";

const MS_PER_DAY = 86_400_000;
let dbPath: string;

/** Minimal full Notion page carrying only mirrored (non-schedule) topic fields. */
function topicPage(
  id: string,
  name: string,
  fields: { status?: string; confidence?: number } = {},
): PageObjectResponse {
  return {
    object: "page",
    id,
    properties: {
      Name: { type: "title", title: [{ plain_text: name }] },
      Status: { type: "status", status: { name: fields.status ?? "In progress" } },
      Confidence: { type: "number", number: fields.confidence ?? 50 },
    },
  } as unknown as PageObjectResponse;
}

/** Notion client stub returning fixed pages per database id. */
function fakeNotion(topicPages: PageObjectResponse[]): NotionClient {
  return {
    databaseIds: { topics: "T", problems: "P", sessions: "S" },
    queryDatabase: async (id: string) => (id === "T" ? topicPages : []),
  } as unknown as NotionClient;
}

/** Seed a topic with full local scheduling state via raw SQL. */
function seedLocalTopic(): void {
  runMigrations(dbPath);
  const { sqlite } = createSqliteDb(dbPath);
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO topics
        (id, name, difficulty, status, revision_count, last_revised, confidence,
         is_weak_area, priority_score, next_revision_at, sm2_interval,
         sm2_repetition, sm2_efactor, prerequisites, updated_at)
       VALUES (@id,@name,'Medium','In progress',3,@last,40,1,@score,@next,@int,@rep,@ef,NULL,@now)`,
    )
    .run({
      id: "topic-a",
      name: "Arrays (local)",
      last: now - 7 * MS_PER_DAY,
      score: 87.5,
      next: now + 12 * MS_PER_DAY,
      int: 12,
      rep: 3,
      ef: 2.4,
      now,
    });
  sqlite.close();
}

function readTopic(): Record<string, unknown> {
  const { sqlite } = createSqliteDb(dbPath);
  const row = sqlite.prepare("SELECT * FROM topics WHERE id = 'topic-a'").get() as Record<
    string,
    unknown
  >;
  sqlite.close();
  return row;
}

beforeEach(() => {
  dbPath = join(tmpdir(), `dsa-sync-merge-${Date.now()}-${Math.random()}.db`);
});

afterEach(() => {
  try {
    rmSync(dbPath);
  } catch {
    // ignore
  }
});

describe("syncNotionToSqlite — merge, not wipe-and-reinsert (Phase 3)", () => {
  it("preserves local schedule fields when Notion does not carry them", async () => {
    seedLocalTopic();
    const before = readTopic();

    await syncNotionToSqlite(
      fakeNotion([topicPage("topic-a", "Arrays (notion)", { confidence: 70 })]),
      dbPath,
    );

    const after = readTopic();
    // Local-owned scheduling state survives the pull untouched.
    expect(after.next_revision_at).toBe(before.next_revision_at);
    expect(after.sm2_interval).toBe(before.sm2_interval);
    expect(after.sm2_repetition).toBe(before.sm2_repetition);
    expect(after.sm2_efactor).toBe(before.sm2_efactor);
    expect(after.priority_score).toBe(before.priority_score);
    // Mirrored fields update from Notion.
    expect(after.confidence).toBe(70);
    expect(after.name).toBe("Arrays (notion)");
  });

  it("round-trips: full local state → pull → state still intact (restore path)", async () => {
    seedLocalTopic();
    const before = readTopic();

    // Two pulls in a row must be idempotent for schedule-critical fields —
    // this is the reinstall/restore scenario the wipe currently corrupts.
    await syncNotionToSqlite(fakeNotion([topicPage("topic-a", "Arrays")]), dbPath);
    await syncNotionToSqlite(fakeNotion([topicPage("topic-a", "Arrays")]), dbPath);

    const after = readTopic();
    for (const field of [
      "next_revision_at",
      "sm2_interval",
      "sm2_repetition",
      "sm2_efactor",
      "priority_score",
    ]) {
      expect(after[field]).toBe(before[field]);
    }
  });

  it("inserts a genuinely new Notion topic with neutral default schedule", async () => {
    runMigrations(dbPath);
    await syncNotionToSqlite(fakeNotion([topicPage("topic-new", "Graphs")]), dbPath);

    const { sqlite } = createSqliteDb(dbPath);
    const row = sqlite
      .prepare("SELECT * FROM topics WHERE id = 'topic-new'")
      .get() as Record<string, unknown>;
    sqlite.close();

    expect(row).toBeTruthy();
    expect(row.name).toBe("Graphs");
    // New topic has no prior local schedule — null/default is correct, not a wipe.
    expect(row.next_revision_at == null).toBe(true);
  });

  it("logs a conflict when the same mirrored field changed locally and in Notion", async () => {
    seedLocalTopic();
    // Local confidence is 40 (seed); Notion now says 70 → genuine divergence.
    await syncNotionToSqlite(
      fakeNotion([topicPage("topic-a", "Arrays", { confidence: 70 })]),
      dbPath,
    );

    const { sqlite } = createSqliteDb(dbPath);
    const conflicts = sqlite
      .prepare("SELECT * FROM sync_conflicts WHERE entity_id = 'topic-a'")
      .all() as Record<string, unknown>[];
    sqlite.close();

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].entity_type).toBe("topic");
  });
});
