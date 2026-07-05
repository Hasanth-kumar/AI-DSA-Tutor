/**
 * Workstream C: concrete revision problems in the daily plan + one-tap grading.
 *
 * - `StudyPlan.revisionProblems`: one solved problem per due revision topic
 *   (oldest update first — most decayed), capped at 2/day, primary excluded,
 *   mode heuristic (weak/low-confidence → "resolve", else "recall").
 * - `POST /api/revision/:topicId/grade`: SM-2 quality with clamping, and the
 *   plan cache is invalidated so the graded topic drops out of today's plan.
 */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { problems, topics } from "@dsa/database/schema";
import { createSqliteDb, runMigrations } from "@dsa/integrations";
import { loadConfig, resetConfigCache } from "@dsa/shared";
import type { AppConfig } from "@dsa/shared";
import { buildApp } from "./app.js";
import { createAppContext, type AppContext } from "./context.js";

let testDbPath: string;
let config: AppConfig;
let ctx: AppContext;

const DAY = 86_400_000;

function seedTestDb(dbPath: string): void {
  runMigrations(dbPath);
  const { db, sqlite } = createSqliteDb(dbPath);
  const now = Date.now();

  db.insert(topics)
    .values([
      // Pinned primary (active curriculum topic) — not due for revision.
      {
        id: "topic-a",
        name: "Arrays",
        difficulty: "Easy",
        status: "In progress",
        confidence: 50,
        revisionCount: 1,
        nextRevisionAt: now + 5 * DAY,
        isWeakArea: 0,
        updatedAt: now,
      },
      // Due, strong → mode "recall". Most overdue → first in queue.
      {
        id: "topic-b",
        name: "Sorting",
        difficulty: "Medium",
        status: "Mastered",
        confidence: 80,
        revisionCount: 3,
        nextRevisionAt: now - 10 * DAY,
        isWeakArea: 0,
        updatedAt: now,
      },
      // Due, weak → mode "resolve".
      {
        id: "topic-c",
        name: "Graphs",
        difficulty: "Hard",
        status: "In progress",
        confidence: 30,
        revisionCount: 2,
        nextRevisionAt: now - 5 * DAY,
        isWeakArea: 1,
        updatedAt: now,
      },
      // Also due, least overdue — must be cut by the 2/day cap.
      {
        id: "topic-d",
        name: "Heaps",
        difficulty: "Medium",
        status: "Mastered",
        confidence: 75,
        revisionCount: 2,
        nextRevisionAt: now - 2 * DAY,
        isWeakArea: 0,
        updatedAt: now,
      },
    ])
    .run();

  db.insert(problems)
    .values([
      { id: "p-a1", name: "Two Sum", topicId: "topic-a", difficulty: "Easy", status: "Not started", updatedAt: now },
      // topic-b: unsolved decoy is OLDEST — must be filtered out by status,
      // then the older of the two solved ones wins (most decayed first).
      { id: "p-b0", name: "Sort Colors (unsolved)", topicId: "topic-b", difficulty: "Medium", status: "Not started", updatedAt: now - 20 * DAY },
      { id: "p-b1", name: "Merge Intervals", topicId: "topic-b", difficulty: "Medium", status: "Solved", leetcodeLink: "https://leetcode.com/problems/merge-intervals/", updatedAt: now - 10 * DAY },
      { id: "p-b2", name: "Sort List", topicId: "topic-b", difficulty: "Medium", status: "Solved", updatedAt: now - 1 * DAY },
      { id: "p-c1", name: "Course Schedule", topicId: "topic-c", difficulty: "Hard", status: "Solved", updatedAt: now - 3 * DAY },
      { id: "p-d1", name: "Kth Largest", topicId: "topic-d", difficulty: "Medium", status: "Solved", updatedAt: now - 2 * DAY },
    ])
    .run();

  sqlite.close();
}

beforeEach(() => {
  resetConfigCache();
  testDbPath = join(tmpdir(), `dsa-revision-plan-${Date.now()}-${Math.random()}.db`);
  process.env.SQLITE_PATH = testDbPath;
  process.env.ENABLE_SCHEDULERS = "false";
  seedTestDb(testDbPath);
  config = loadConfig("/nonexistent/.env");
  config = { ...config, sqlite: { path: testDbPath }, schedulers: { ...config.schedulers, enabled: false } };
  ctx = createAppContext(config);
  // Pin the primary so the due topics land in the revision queue deterministically.
  ctx.curriculumService.setActiveTopicId("topic-a");
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

describe("StudyPlan.revisionProblems (C)", () => {
  it("surfaces one solved problem per due topic, capped at 2, primary excluded", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({ method: "GET", url: "/api/plan/today" });
    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.primaryTopic.id).toBe("topic-a");
    expect(body.revisionProblems).toHaveLength(2);
    const topicIds = body.revisionProblems.map((p: { topicId: string }) => p.topicId);
    expect(topicIds).toEqual(["topic-b", "topic-c"]); // most overdue first, topic-d capped
    expect(topicIds).not.toContain("topic-a");
    await app.close();
  });

  it("picks the oldest-updated solved problem and applies the mode heuristic", async () => {
    const app = buildApp(config, ctx);
    const body = (await app.inject({ method: "GET", url: "/api/plan/today" })).json();

    const sorting = body.revisionProblems.find(
      (p: { topicId: string }) => p.topicId === "topic-b",
    );
    // Not the unsolved decoy (p-b0), not the recently-touched solve (p-b2).
    expect(sorting).toMatchObject({
      problemId: "p-b1",
      name: "Merge Intervals",
      leetcodeLink: "https://leetcode.com/problems/merge-intervals/",
      topicName: "Sorting",
      mode: "recall", // strong topic → quick recall check
    });

    const graphs = body.revisionProblems.find(
      (p: { topicId: string }) => p.topicId === "topic-c",
    );
    expect(graphs).toMatchObject({ problemId: "p-c1", mode: "resolve" }); // weak → re-solve
    await app.close();
  });
});

describe("POST /api/revision/:topicId/grade (C)", () => {
  it("applies the SM-2 grade, clamps quality, and reschedules the topic", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "POST",
      url: "/api/revision/topic-b/grade",
      payload: { quality: 9 }, // clamped to 5
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ topicId: "topic-b", quality: 5 });
    expect(new Date(body.nextRevisionAt).getTime()).toBeGreaterThan(Date.now());
    await app.close();
  });

  it("invalidates the plan cache so the graded topic drops out of today's plan", async () => {
    const app = buildApp(config, ctx);
    const before = (await app.inject({ method: "GET", url: "/api/plan/today" })).json();
    expect(
      before.revisionProblems.some((p: { topicId: string }) => p.topicId === "topic-b"),
    ).toBe(true);

    await app.inject({
      method: "POST",
      url: "/api/revision/topic-b/grade",
      payload: { quality: 5 },
    });

    const after = (await app.inject({ method: "GET", url: "/api/plan/today" })).json();
    expect(
      after.revisionProblems.some((p: { topicId: string }) => p.topicId === "topic-b"),
    ).toBe(false);
    await app.close();
  });

  it("rejects a missing quality and an unknown topic", async () => {
    const app = buildApp(config, ctx);
    const noQuality = await app.inject({
      method: "POST",
      url: "/api/revision/topic-b/grade",
      payload: {},
    });
    expect(noQuality.statusCode).toBe(400);

    const unknown = await app.inject({
      method: "POST",
      url: "/api/revision/nope/grade",
      payload: { quality: 3 },
    });
    expect(unknown.statusCode).toBe(404);
    await app.close();
  });
});
