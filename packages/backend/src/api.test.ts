import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { topics } from "@dsa/database/schema";
import { createSqliteDb, runMigrations } from "@dsa/integrations";
import { loadConfig, resetConfigCache } from "@dsa/shared";
import type { AppConfig } from "@dsa/shared";
import { buildApp } from "./app.js";
import { createAppContext, type AppContext } from "./context.js";

let testDbPath: string;
let config: AppConfig;
let ctx: AppContext;

function seedTestDb(dbPath: string): void {
  runMigrations(dbPath);
  const { db, sqlite } = createSqliteDb(dbPath);
  const now = Date.now();

  db.insert(topics)
    .values([
      {
        id: "topic-a",
        name: "Arrays",
        difficulty: "Easy",
        status: "In progress",
        confidence: 40,
        revisionCount: 1,
        lastRevised: now - 7 * 86_400_000,
        nextRevisionAt: now - 2 * 86_400_000,
        isWeakArea: 1,
        prerequisites: null,
        updatedAt: now,
      },
      {
        id: "topic-b",
        name: "Recursion",
        difficulty: "Medium",
        status: "Mastered",
        confidence: 90,
        revisionCount: 3,
        lastRevised: now - 3 * 86_400_000,
        nextRevisionAt: now + 5 * 86_400_000,
        isWeakArea: 0,
        prerequisites: null,
        updatedAt: now,
      },
    ])
    .run();

  sqlite.close();
}

describe("API routes", () => {
  beforeEach(() => {
    resetConfigCache();
    testDbPath = join(tmpdir(), `dsa-api-test-${Date.now()}.db`);
    process.env.SQLITE_PATH = testDbPath;
    process.env.ENABLE_SCHEDULERS = "false";
    process.env.REDIS_URL = "redis://127.0.0.1:6399";
    seedTestDb(testDbPath);
    config = loadConfig("/nonexistent/.env");
    config = { ...config, sqlite: { path: testDbPath }, schedulers: { ...config.schedulers, enabled: false } };
    ctx = createAppContext(config);
  });

  afterEach(async () => {
    await ctx.close();
    resetConfigCache();
    try {
      rmSync(testDbPath);
    } catch {
      // ignore
    }
  });

  it("GET /api/plan/today returns a study plan", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({ method: "GET", url: "/api/plan/today" });
    expect(response.statusCode).toBe(200);
    expect(response.json().primaryTopic.name).toBeTruthy();
    await app.close();
  });

  it("GET /api/revision returns queue", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({ method: "GET", url: "/api/revision" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      count: expect.any(Number),
      queue: expect.any(Array),
    });
    await app.close();
  });

  it("POST /api/session logs a session", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: {
        topicId: "topic-a",
        problemsSolved: 2,
        studyDuration: 45,
        productivityScore: 80,
        pushToNotion: false,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().topicId).toBe("topic-a");
    await app.close();
  });

  it("GET /api/analytics/summary returns weekly stats", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/summary",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sessionsCount: expect.any(Number),
      intelligenceSummary: expect.any(String),
    });
    await app.close();
  });
});
