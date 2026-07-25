import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { problems, sessions, topics } from "@dsa/database/schema";
import {
  createSqliteDb,
  LLMService,
  runMigrations,
  type LLMClient,
} from "@dsa/integrations";
import { loadConfig, resetConfigCache } from "@dsa/shared";
import type { AppConfig } from "@dsa/shared";
import { buildApp } from "./app.js";
import { createAppContext, type AppContext } from "./context.js";

let testDbPath: string;
let config: AppConfig;
let ctx: AppContext;

const MS_PER_DAY = 86_400_000;

function createTestCoachLLM(): LLMService {
  const reply = "Try breaking the problem into smaller subproblems and check edge cases.";
  const client: LLMClient = {
    isConfigured: () => true,
    generate: async () => "Structured coaching response for tests.",
    chat: async () => reply,
    async *chatStream() {
      yield reply;
    },
  };
  return new LLMService(
    { model: "test", openrouter: { apiKey: "test-key" } },
    client,
  );
}

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
        status: "Not started",
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
    seedTestDb(testDbPath);
    config = loadConfig("/nonexistent/.env");
    config = { ...config, sqlite: { path: testDbPath }, schedulers: { ...config.schedulers, enabled: false } };
    ctx = createAppContext(config, { coachLlm: createTestCoachLLM() });
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
    expect(body.curriculum).toMatchObject({
      topicNames: expect.any(Array),
      currentIndex: expect.any(Number),
      items: expect.any(Array),
    });
    await app.close();
  });

  it("GET /api/curriculum returns sequential topic state", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({ method: "GET", url: "/api/curriculum" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      topicNames: expect.arrayContaining(["Binary Search", "Trees", "DP"]),
      activeTopicId: null,
      selection: expect.objectContaining({
        topic: expect.objectContaining({ name: expect.any(String) }),
        items: expect.any(Array),
      }),
    });
    await app.close();
  });

  it("PUT /api/curriculum/active switches focused topic", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "PUT",
      url: "/api/curriculum/active",
      payload: { topicId: "topic-b" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      activeTopicId: "topic-b",
      selection: expect.objectContaining({
        topic: expect.objectContaining({ id: "topic-b" }),
      }),
    });
    await app.close();
  });

  it("GET /api/topics/orphans returns topics with no problems (E)", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({ method: "GET", url: "/api/topics/orphans" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    // topic-a has problems; topic-b has none.
    expect(body.count).toBe(1);
    expect(body.orphans[0].id).toBe("topic-b");
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

  it("POST /api/session with problemId records an attempt and defers status to mistake capture", async () => {
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
    const attemptId = response.json().attemptId as string;
    expect(attemptId).toBeDefined();
    // Status is deferred until the mistake-capture PATCH (resolve design §9)
    // resolves a smooth solve vs. a tagged mistake — see PATCH /attempts/:id/mistake.
    let problem = ctx.problemRepo.findById("problem-1");
    expect(problem?.status).toBe("Not started");
    expect(problem?.attempts).toBe(1);

    const mistakeResponse = await app.inject({
      method: "PATCH",
      url: `/api/attempts/${attemptId}/mistake`,
      payload: { tags: [] },
    });
    expect(mistakeResponse.statusCode).toBe(200);

    problem = ctx.problemRepo.findById("problem-1");
    expect(problem?.status).toBe("Solved");
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

  it("GET /api/coaching/hint finds problem by name", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/api/coaching/hint?name=Two%20Sum",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      problemId: "problem-1",
      hint: expect.any(String),
    });
    await app.close();
  });

  it("POST /api/coaching/chat creates a thread and returns assistant reply", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "POST",
      url: "/api/coaching/chat",
      payload: {
        message: "How do I approach two pointers problems?",
        includeContext: false,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      threadId: expect.any(String),
      userMessage: {
        role: "user",
        content: "How do I approach two pointers problems?",
      },
      assistantMessage: {
        role: "assistant",
        content: expect.any(String),
      },
    });
    await app.close();
  });

  it("GET /api/coaching/debrief returns debrief for latest session", async () => {
    const app = buildApp(config, ctx);
    await app.inject({
      method: "POST",
      url: "/api/session",
      payload: {
        topicId: "topic-a",
        problemsSolved: 1,
        studyDuration: 40,
        productivityScore: 78,
        pushToNotion: false,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/coaching/debrief",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sessionId: expect.any(String),
      topicName: "Arrays",
      debrief: expect.any(String),
    });
    await app.close();
  });

  it("GET /api/integrations/leetcode/stats returns 503 when not configured", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/api/integrations/leetcode/stats",
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("GET /api/integrations/leetcode/activity returns 503 when not configured", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/api/integrations/leetcode/activity",
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("GET /api/analytics/dashboard returns consolidated analytics", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/dashboard?weeks=4",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      summary: expect.objectContaining({
        sessionsCount: expect.any(Number),
        currentStreakDays: expect.any(Number),
      }),
      velocity: expect.objectContaining({
        weekly: expect.any(Array),
        topics: expect.any(Array),
      }),
      weaknessTrend: expect.any(Array),
      difficulty: expect.objectContaining({
        summary: expect.any(String),
      }),
    });
    await app.close();
  });

});
