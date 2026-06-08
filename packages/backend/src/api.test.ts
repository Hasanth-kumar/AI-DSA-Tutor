import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { problems, sessions, topics } from "@dsa/database/schema";
import { createSqliteDb, runMigrations } from "@dsa/integrations";
import { loadConfig, resetConfigCache } from "@dsa/shared";
import type { AppConfig } from "@dsa/shared";
import { buildApp } from "./app.js";
import { createAppContext, type AppContext } from "./context.js";

let testDbPath: string;
let config: AppConfig;
let ctx: AppContext;

const MS_PER_DAY = 86_400_000;

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

  db.insert(problems)
    .values([
      {
        id: "problem-1",
        name: "Two Sum",
        topicId: "topic-a",
        difficulty: "Easy",
        status: "Unsolved",
        attempts: 0,
        updatedAt: now,
      },
      {
        id: "problem-2",
        name: "Best Time to Buy Stock",
        topicId: "topic-a",
        difficulty: "Easy",
        status: "Solved",
        attempts: 2,
        updatedAt: now,
      },
    ])
    .run();

  const yesterday = now - MS_PER_DAY;
  const twoDaysAgo = now - 2 * MS_PER_DAY;

  db.insert(sessions)
    .values([
      {
        id: "session-1",
        date: now,
        topicId: "topic-a",
        problemsSolved: 2,
        studyDuration: 60,
        productivityScore: 80,
        updatedAt: now,
      },
      {
        id: "session-2",
        date: yesterday,
        topicId: "topic-a",
        problemsSolved: 1,
        studyDuration: 45,
        productivityScore: 75,
        updatedAt: now,
      },
      {
        id: "session-3",
        date: twoDaysAgo,
        topicId: "topic-b",
        problemsSolved: 1,
        studyDuration: 30,
        productivityScore: 90,
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
    const body = response.json();
    expect(body.primaryTopic.name).toBeTruthy();
    expect(body.suggestedProblems[0].name).toBe("Two Sum");
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

  it("POST /api/session with problemId marks problem solved", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: {
        topicId: "topic-a",
        problemId: "problem-1",
        problemsSolved: 1,
        studyDuration: 30,
        productivityScore: 85,
        pushToNotion: false,
      },
    });

    expect(response.statusCode).toBe(201);
    const problem = ctx.problemRepo.findById("problem-1");
    expect(problem?.status).toBe("Solved");
    expect(problem?.attempts).toBe(1);
    await app.close();
  });

  it("GET /api/problems returns problem catalog", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({ method: "GET", url: "/api/problems" });
    expect(response.statusCode).toBe(200);
    expect(response.json().count).toBe(2);
    await app.close();
  });

  it("GET /api/topics/:id/score/explain returns score breakdown", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/api/topics/topic-a/score/explain",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      topicId: "topic-a",
      topicName: "Arrays",
      explanation: expect.any(Array),
    });
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
      currentStreakDays: expect.any(Number),
      longestStreakDays: expect.any(Number),
      velocityTrend: expect.stringMatching(/up|down|stable/),
      intelligenceSummary: expect.any(String),
    });
    await app.close();
  });

  it("GET /api/analytics/streak returns streak info", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/streak",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      currentStreakDays: expect.any(Number),
      longestStreakDays: expect.any(Number),
      activeDays: expect.any(Array),
    });
    await app.close();
  });

  it("GET /api/analytics/mastery-velocity returns weekly velocity", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/mastery-velocity?weeks=4",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.weekly).toHaveLength(4);
    expect(body.topics).toEqual(expect.any(Array));
    await app.close();
  });

  it("GET /api/analytics/weakness-trend returns trend points", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/weakness-trend?weeks=4",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().trend).toHaveLength(4);
    await app.close();
  });

  it("GET /api/analytics/difficulty returns comparative analysis", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/difficulty",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      byDifficulty: expect.any(Array),
      byTopic: expect.any(Array),
      summary: expect.any(String),
    });
    await app.close();
  });
});
