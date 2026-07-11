/**
 * Problem re-solve backend (re-solve design §9, stage 3): admission hooks,
 * queue/complete/skip/admit routes, FSRS updates, leech suspension + topic
 * unsuspend, and plan resolveSlots. Engine decision logic is covered in
 * @dsa/intelligence; this exercises the wiring end to end.
 */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { problems, topics } from "@dsa/database/schema";
import { createSqliteDb, LLMService, runMigrations, type LLMClient } from "@dsa/integrations";
import { loadConfig, resetConfigCache } from "@dsa/shared";
import type { AppConfig } from "@dsa/shared";
import { buildApp } from "./app.js";
import { createAppContext, type AppContext } from "./context.js";

const MS_PER_DAY = 86_400_000;

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
      { id: "p3", name: "Median Arrays", topicId: "topic-a", difficulty: "Hard", status: "Not started", updatedAt: now },
    ])
    .run();
  sqlite.close();
}

beforeEach(() => {
  resetConfigCache();
  testDbPath = join(tmpdir(), `dsa-resolve-${Date.now()}-${Math.random()}.db`);
  process.env.SQLITE_PATH = testDbPath;
  process.env.ENABLE_SCHEDULERS = "false";
  seedTestDb(testDbPath);
  config = loadConfig("/nonexistent/.env");
  config = {
    ...config,
    sqlite: { path: testDbPath },
    schedulers: { ...config.schedulers, enabled: false },
    // Capacity 1 every day so tests don't depend on the weekday they run on.
    resolve: { ...config.resolve, slotsWeekday: 1, slotsWeekend: 1 },
  };
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

describe("admission via the session hook (§4, §9)", () => {
  it("a session logged with mistake tags admits the problem", async () => {
    const app = buildApp(config, ctx);
    const logged = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: {
        topicId: "topic-a",
        problemId: "p1",
        studyDuration: 10,
        mistakeTag: JSON.stringify(["off-by-one"]),
        pushToNotion: false,
      },
    });
    expect(logged.statusCode).toBe(201);

    const row = ctx.problemReviewRepo.findById("p1");
    expect(row?.admissionReason).toBe("mistake");
    expect(row?.retired).toBe(0);

    const queue = await app.inject({ method: "GET", url: "/api/resolve/queue" });
    const items = queue.json().items as Array<{ problemId: string; reason: string; status: string }>;
    const item = items.find((i) => i.problemId === "p1")!;
    expect(item.reason).toContain("1 mistake");
    expect(["due", "overdue"]).toContain(item.status);
    await app.close();
  });

  it("a clean fast Easy solve stays out; a clean Hard solve is admitted", async () => {
    const app = buildApp(config, ctx);
    await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { topicId: "topic-a", problemId: "p1", studyDuration: 10, pushToNotion: false },
    });
    expect(ctx.problemReviewRepo.findById("p1")).toBeNull();

    await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { topicId: "topic-a", problemId: "p3", studyDuration: 30, pushToNotion: false },
    });
    expect(ctx.problemReviewRepo.findById("p3")?.admissionReason).toBe("hard");
    await app.close();
  });
});

describe("completion flow (§5)", () => {
  it("records the outcome: inferred rating, FSRS advance, resolve attempt row", async () => {
    const app = buildApp(config, ctx);
    await app.inject({ method: "POST", url: "/api/resolve/p2/admit" });

    const res = await app.inject({
      method: "POST",
      url: "/api/resolve/p2/complete",
      payload: { outcome: "solved", timeTakenMin: 15 },
    });
    expect(res.statusCode).toBe(200);
    const result = res.json();
    expect(result.inferredRating).toBe("easy"); // cold, under the 45-min Medium cutoff
    expect(result.rating).toBe("easy");
    expect(result.due).toBeGreaterThan(Date.now());
    expect(result.leech).toBe(false);

    const attempts = ctx.attemptRepo.findByProblemId("p2", 10);
    expect(attempts[0]?.kind).toBe("resolve");
    expect(ctx.problemReviewRepo.findById("p2")?.reps).toBe(1);
    await app.close();
  });

  it("honors the one-tap rating override and validates bodies", async () => {
    const app = buildApp(config, ctx);
    await app.inject({ method: "POST", url: "/api/resolve/p2/admit" });

    const res = await app.inject({
      method: "POST",
      url: "/api/resolve/p2/complete",
      payload: { outcome: "solved", timeTakenMin: 15, ratingOverride: "hard" },
    });
    expect(res.json()).toMatchObject({ inferredRating: "easy", rating: "hard" });

    const bad = await app.inject({
      method: "POST",
      url: "/api/resolve/p2/complete",
      payload: { outcome: "nope" },
    });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({
      method: "POST",
      url: "/api/resolve/p1/complete",
      payload: { outcome: "solved" },
    });
    expect(missing.statusCode).toBe(404); // not in the pool
    await app.close();
  });

  it("skip defers to tomorrow, never drops", async () => {
    const app = buildApp(config, ctx);
    await app.inject({ method: "POST", url: "/api/resolve/p2/admit" });
    const res = await app.inject({ method: "POST", url: "/api/resolve/p2/skip" });
    const due = res.json().due as number;
    expect(due).toBeGreaterThan(Date.now() + MS_PER_DAY - 5_000);
    expect(due).toBeLessThan(Date.now() + MS_PER_DAY + 5_000);
    await app.close();
  });
});

describe("leech suspension + topic revision unsuspend (§5)", () => {
  it("a 4th lapse suspends; the topic's next session lifts it", async () => {
    const app = buildApp(config, ctx);
    await app.inject({ method: "POST", url: "/api/resolve/p2/admit" });
    // Fast-forward to the brink: Review state, 3 lapses.
    ctx.problemReviewRepo.update("p2", {
      state: 2,
      lapses: 3,
      stability: 5,
      difficulty: 6,
      reps: 6,
      lastReview: Date.now() - 6 * MS_PER_DAY,
      due: Date.now() - MS_PER_DAY,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/resolve/p2/complete",
      payload: { outcome: "failed" },
    });
    expect(res.json()).toMatchObject({ rating: "again", leech: true });
    expect(ctx.problemReviewRepo.findById("p2")?.suspended).toBe(1);

    // Failed re-solve is an attempt row carrying the failure marker.
    const attempts = ctx.attemptRepo.findByProblemId("p2", 10);
    expect(attempts[0]?.mistakeTag).toContain("could-not-solve");

    // Topic revision session completes → suspension lifts (§5).
    await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { topicId: "topic-a", studyDuration: 30, pushToNotion: false },
    });
    expect(ctx.problemReviewRepo.findById("p2")?.suspended).toBe(0);
    await app.close();
  });
});

describe("manual controls (§10)", () => {
  it("force-admit, retire, and un-retire via PATCH", async () => {
    const app = buildApp(config, ctx);
    const admitted = await app.inject({ method: "POST", url: "/api/resolve/p1/admit" });
    expect(admitted.json()).toMatchObject({ admissionReason: "manual", status: "due" });

    const retired = await app.inject({
      method: "PATCH",
      url: "/api/resolve/p1",
      payload: { retired: true },
    });
    expect(retired.json().status).toBe("retired");

    const unretired = await app.inject({
      method: "PATCH",
      url: "/api/resolve/p1",
      payload: { retired: false },
    });
    expect(unretired.json().status).toBe("due");

    const unknown = await app.inject({ method: "POST", url: "/api/resolve/nope/admit" });
    expect(unknown.statusCode).toBe(404);
    await app.close();
  });
});

describe("plan integration (§6)", () => {
  it("fits slots to capacity, persists deferrals, and prices the duration", async () => {
    ctx.problemReviewService.admit("p2");
    ctx.problemReviewService.admit("p3");
    // p3 more overdue than p2; both due, capacity 1, neither past escalation.
    ctx.problemReviewRepo.update("p2", { due: Date.now() - 2 * MS_PER_DAY });
    ctx.problemReviewRepo.update("p3", { due: Date.now() - 5 * MS_PER_DAY });

    const plan = await ctx.planService.generateTodaysPlan();
    expect(plan.resolveSlots).toHaveLength(1);
    expect(plan.resolveSlots![0]).toMatchObject({ problemId: "p3", promoted: false });
    expect(plan.resolveTotalDue).toBe(2);
    expect(plan.resolveDeferred).toBe(1);
    // 45 min for the Hard slot on top of the base estimate.
    expect(plan.estimatedDuration).toBeGreaterThanOrEqual(45);
    // Overflow rescheduled forward, not stacked (§6).
    expect(ctx.problemReviewRepo.findById("p2")!.due!).toBeGreaterThan(Date.now());
  });

  it("force-promotes a critically overdue problem past capacity with a reason", async () => {
    ctx.problemReviewService.admit("p2");
    ctx.problemReviewService.admit("p3");
    ctx.problemReviewRepo.update("p2", { due: Date.now() - 20 * MS_PER_DAY });
    ctx.problemReviewRepo.update("p3", { due: Date.now() - 16 * MS_PER_DAY });

    const plan = await ctx.planService.generateTodaysPlan();
    expect(plan.resolveSlots).toHaveLength(2);
    expect(plan.resolveSlots![1]).toMatchObject({ problemId: "p3", promoted: true });
    expect(plan.resolveSlots![1]!.reason).toContain("promoted");
    expect(plan.reasoning).toContain("Re-solve promoted");
  });
});
