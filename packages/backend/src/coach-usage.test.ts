/**
 * Workstream D: coach-usage tracking per problem.
 *
 * Coach interactions anchored to a problem (hint route / chat with problemId)
 * are auto-captured in-memory; logging the session stamps `used_coach` +
 * `hint_count` onto the attempt (migration 0015). The capture step can
 * manually override the flag.
 */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { problems, topics } from "@dsa/database/schema";
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

function stubCoachLLM(): LLMService {
  const client: LLMClient = {
    isConfigured: () => true,
    generate: async () => "Stub hint.",
    chat: async () => "Stub reply.",
    async *chatStream() {
      yield "Stub reply.";
    },
  };
  return new LLMService({ model: "test", openrouter: { apiKey: "test" } }, client);
}

function seedTestDb(dbPath: string): void {
  runMigrations(dbPath);
  const { db, sqlite } = createSqliteDb(dbPath);
  const now = Date.now();
  db.insert(topics)
    .values({ id: "topic-a", name: "Arrays", status: "In progress", confidence: 50, updatedAt: now })
    .run();
  db.insert(problems)
    .values([
      { id: "p1", name: "Two Sum", topicId: "topic-a", difficulty: "Easy", status: "Not started", updatedAt: now },
      { id: "p2", name: "3Sum", topicId: "topic-a", difficulty: "Medium", status: "Not started", updatedAt: now },
    ])
    .run();
  sqlite.close();
}

beforeEach(() => {
  resetConfigCache();
  testDbPath = join(tmpdir(), `dsa-coach-usage-${Date.now()}-${Math.random()}.db`);
  process.env.SQLITE_PATH = testDbPath;
  process.env.ENABLE_SCHEDULERS = "false";
  seedTestDb(testDbPath);
  config = loadConfig("/nonexistent/.env");
  config = { ...config, sqlite: { path: testDbPath }, schedulers: { ...config.schedulers, enabled: false } };
  ctx = createAppContext(config, { coachLlm: stubCoachLLM() });
});

afterEach(async () => {
  await ctx.close();
  resetConfigCache();
  try {
    rmSync(testDbPath);
  } catch {
    // ignore
  }
  delete process.env.SQLITE_PATH;
});

describe("coach-usage auto-capture (D2)", () => {
  it("stamps used_coach + hint_count on the attempt after coach interactions", async () => {
    const app = buildApp(config, ctx);

    await app.inject({ method: "GET", url: "/api/coaching/hint/p1" });
    await app.inject({
      method: "POST",
      url: "/api/coaching/chat",
      payload: { message: "help me with this", problemId: "p1", includeContext: false },
    });

    const logged = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { topicId: "topic-a", problemId: "p1", studyDuration: 30, pushToNotion: false },
    });
    expect(logged.statusCode).toBe(201);
    const result = logged.json();
    expect(result.usedCoach).toBe(true);

    const attempt = ctx.attemptRepo.findById(result.attemptId)!;
    expect(attempt.usedCoach).toBe(1);
    expect(attempt.hintCount).toBe(2);
    // Stamped once, then cleared — the next solve of p1 starts cold.
    expect(ctx.coachUsage.has("p1")).toBe(false);
    await app.close();
  });

  it("a solve without coach interactions stays cold", async () => {
    const app = buildApp(config, ctx);
    const logged = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { topicId: "topic-a", problemId: "p2", studyDuration: 25, pushToNotion: false },
    });
    const result = logged.json();
    expect(result.usedCoach).toBe(false);
    const attempt = ctx.attemptRepo.findById(result.attemptId)!;
    expect(attempt.usedCoach).toBe(0);
    expect(attempt.hintCount).toBe(0);
    await app.close();
  });

  it("the capture step can manually override the flag (D3)", async () => {
    const app = buildApp(config, ctx);
    await app.inject({ method: "GET", url: "/api/coaching/hint/p1" });
    const logged = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { topicId: "topic-a", problemId: "p1", studyDuration: 30, pushToNotion: false },
    });
    const { attemptId } = logged.json();

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/attempts/${attemptId}/mistake`,
      payload: { tags: ["edge-case"], usedCoach: false },
    });
    expect(patched.statusCode).toBe(200);
    const attempt = ctx.attemptRepo.findById(attemptId)!;
    expect(attempt.usedCoach).toBe(0);
    await app.close();
  });
});
