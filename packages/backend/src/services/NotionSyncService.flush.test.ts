import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { problems, topics } from "@dsa/database/schema";
import { createSqliteDb, runMigrations } from "@dsa/integrations";
import { loadConfig, resetConfigCache } from "@dsa/shared";
import type { AppConfig } from "@dsa/shared";
import { buildApp } from "../app.js";
import { createAppContext, type AppContext } from "../context.js";

let testDbPath: string;
let config: AppConfig;
let ctx: AppContext;

const NOTION_CONFIG = {
  token: "secret-test-token",
  topicsDbId: "topics-db",
  problemsDbId: "problems-db",
  sessionsDbId: "sessions-db",
};

/** A minimal stand-in for the Notion client; records pushes and can fail on demand. */
function stubNotion(opts: { failProblems?: boolean } = {}) {
  const calls = { updateTopic: [] as string[], updateProblem: [] as string[] };
  const client = {
    ensureTopicScheduleProperties: async () => [],
    updateTopic: async (id: string) => {
      calls.updateTopic.push(id);
    },
    updateProblem: async (id: string) => {
      calls.updateProblem.push(id);
      if (opts.failProblems) throw new Error("notion unreachable");
    },
  };
  return { client, calls };
}

/** Swap the lazily-created Notion client for a stub (bypasses real network). */
function injectNotion(c: AppContext, client: unknown): void {
  (c.notionSync as unknown as { notion: unknown }).notion = client;
}

function seed(dbPath: string): void {
  runMigrations(dbPath);
  const { db, sqlite } = createSqliteDb(dbPath);
  const now = Date.now();
  db.insert(topics)
    .values({
      id: "topic-a",
      name: "Arrays",
      difficulty: "Easy",
      status: "In progress",
      confidence: 55,
      revisionCount: 2,
      lastRevised: now,
      nextRevisionAt: now,
      isWeakArea: 0,
      prerequisites: null,
      updatedAt: now,
    })
    .run();
  db.insert(problems)
    .values({
      id: "problem-1",
      name: "Two Sum",
      topicId: "topic-a",
      difficulty: "Easy",
      status: "Solved",
      attempts: 1,
      updatedAt: now,
    })
    .run();
  sqlite.close();
}

beforeEach(() => {
  resetConfigCache();
  testDbPath = join(tmpdir(), `dsa-flush-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  process.env.SQLITE_PATH = testDbPath;
  process.env.ENABLE_SCHEDULERS = "false";
  seed(testDbPath);
  config = loadConfig("/nonexistent/.env");
  config = {
    ...config,
    sqlite: { path: testDbPath },
    schedulers: { ...config.schedulers, enabled: false },
    notion: { ...NOTION_CONFIG },
  };
});

afterEach(async () => {
  await ctx.close();
  resetConfigCache();
  delete process.env.SQLITE_PATH;
  delete process.env.ENABLE_SCHEDULERS;
  try {
    rmSync(testDbPath);
  } catch {
    // ignore
  }
});

describe("NotionSyncService.flushPendingToNotion", () => {
  it("drains the pending queue and clears it on success", async () => {
    ctx = createAppContext(config);
    const { client, calls } = stubNotion();
    injectNotion(ctx, client);

    ctx.notionSync.markTopicDirty("topic-a");
    ctx.notionSync.markProblemDirty("problem-1");
    expect(ctx.notionSync.getSyncHealth()).toMatchObject({
      pendingTopics: 1,
      pendingProblems: 1,
    });

    const result = await ctx.notionSync.flushPendingToNotion();

    expect(result).toEqual({ pushedTopics: 1, pushedProblems: 1, failed: 0 });
    expect(calls.updateTopic).toEqual(["topic-a"]);
    expect(calls.updateProblem).toEqual(["problem-1"]);
    expect(ctx.notionSync.getSyncHealth()).toMatchObject({
      pendingTopics: 0,
      pendingProblems: 0,
    });
  });

  it("keeps a failed push queued while clearing the ones that succeed", async () => {
    ctx = createAppContext(config);
    const { client } = stubNotion({ failProblems: true });
    injectNotion(ctx, client);

    ctx.notionSync.markTopicDirty("topic-a");
    ctx.notionSync.markProblemDirty("problem-1");

    const result = await ctx.notionSync.flushPendingToNotion();

    expect(result).toEqual({ pushedTopics: 1, pushedProblems: 0, failed: 1 });
    // The successful topic clears; the failed problem stays for the next sync.
    expect(ctx.notionSync.getSyncHealth()).toMatchObject({
      pendingTopics: 0,
      pendingProblems: 1,
    });
  });

  it("bounds a hanging push by the per-push timeout so shutdown never hangs", async () => {
    vi.useFakeTimers();
    try {
      ctx = createAppContext(config);
      injectNotion(ctx, {
        ensureTopicScheduleProperties: async () => [],
        updateTopic: () => new Promise<void>(() => {}), // never resolves
        updateProblem: async () => {},
      });
      ctx.notionSync.markTopicDirty("topic-a");

      const flushing = ctx.notionSync.flushPendingToNotion();
      await vi.advanceTimersByTimeAsync(5000);
      const result = await flushing;

      expect(result).toEqual({ pushedTopics: 0, pushedProblems: 0, failed: 1 });
      // Timed-out push stays queued for the next sync — no data loss.
      expect(ctx.notionSync.getSyncHealth().pendingTopics).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a no-op (no throw) when nothing is queued", async () => {
    ctx = createAppContext(config);
    injectNotion(ctx, stubNotion().client);
    const result = await ctx.notionSync.flushPendingToNotion();
    expect(result).toEqual({ pushedTopics: 0, pushedProblems: 0, failed: 0 });
  });

  it("returns zero counts when Notion is not configured", async () => {
    config = { ...config, notion: {} };
    ctx = createAppContext(config);
    const result = await ctx.notionSync.flushPendingToNotion();
    expect(result).toEqual({ pushedTopics: 0, pushedProblems: 0, failed: 0 });
  });
});

describe("POST /api/sync/flush", () => {
  it("flushes the queue and returns counts when configured", async () => {
    ctx = createAppContext(config);
    injectNotion(ctx, stubNotion().client);
    ctx.notionSync.markTopicDirty("topic-a");

    const app = buildApp(config, ctx);
    const response = await app.inject({ method: "POST", url: "/api/sync/flush" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ pushedTopics: 1, pushedProblems: 0, failed: 0 });
    await app.close();
  });

  it("returns 503 when Notion is not configured", async () => {
    config = { ...config, notion: {} };
    ctx = createAppContext(config);

    const app = buildApp(config, ctx);
    const response = await app.inject({ method: "POST", url: "/api/sync/flush" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "Notion is not configured" });
    await app.close();
  });
});
