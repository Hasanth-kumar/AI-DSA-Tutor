/**
 * One-off runtime benchmark — not part of CI.
 * Usage: pnpm exec tsx packages/backend/scripts/runtime-benchmark.ts
 */
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { LLMService, type LLMClient } from "@dsa/integrations";
import { createIntelligenceOrchestrator } from "@dsa/intelligence";
import { loadConfig, resetConfigCache } from "@dsa/shared";
import { buildApp } from "../src/app.js";
import { createAppContext, type AppContext } from "../src/context.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const DB_PATH = resolve(REPO_ROOT, "data/sqlite/dsa.db");

function percentile(sorted: number[], p: number): number {
  return sorted[Math.floor(p * (sorted.length - 1))] ?? 0;
}

function stats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    min: +sorted[0]!.toFixed(2),
    p50: +percentile(sorted, 0.5).toFixed(2),
    p95: +percentile(sorted, 0.95).toFixed(2),
    p99: +percentile(sorted, 0.99).toFixed(2),
    max: +sorted[sorted.length - 1]!.toFixed(2),
    avg: +(sum / sorted.length).toFixed(2),
  };
}

function createMockCoachLLM(): LLMService {
  const client: LLMClient = {
    isConfigured: () => true,
    generate: async () => "benchmark",
    chat: async () => "benchmark",
    async *chatStream() {
      yield "benchmark";
    },
  };
  return new LLMService(
    { model: "benchmark", openrouter: { apiKey: "x" } },
    client,
  );
}

async function benchEndpoint(
  app: ReturnType<typeof buildApp>,
  label: string,
  url: string,
  method: "GET" | "POST" = "GET",
  payload?: unknown,
  iterations = 50,
) {
  const times: number[] = [];
  let errors = 0;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const res = await app.inject({
      method,
      url,
      payload,
    });
    times.push(performance.now() - t0);
    if (res.statusCode >= 400) errors++;
  }
  return { endpoint: label, errors, ...stats(times) };
}

async function benchConcurrent(
  app: ReturnType<typeof buildApp>,
  url: string,
  concurrency: number,
  total: number,
) {
  const times: number[] = [];
  let errors = 0;
  let idx = 0;

  async function worker() {
    while (idx < total) {
      const i = idx++;
      void i;
      const t0 = performance.now();
      const res = await app.inject({ method: "GET", url });
      times.push(performance.now() - t0);
      if (res.statusCode >= 400) errors++;
    }
  }

  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const wallMs = performance.now() - t0;

  return {
    url,
    concurrency,
    total,
    errors,
    wallMs: +wallMs.toFixed(2),
    throughputRps: +(total / (wallMs / 1000)).toFixed(1),
    latency: stats(times),
  };
}

function benchMirrorCache(ctx: AppContext, iterations = 100) {
  ctx.mirrorCache.invalidate();
  const cold: number[] = [];
  for (let i = 0; i < 5; i++) {
    ctx.mirrorCache.invalidate();
    const t0 = performance.now();
    ctx.mirrorCache.getTopicStates();
    cold.push(performance.now() - t0);
  }

  const warm: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    ctx.mirrorCache.getTopicStates();
    warm.push(performance.now() - t0);
  }

  return {
    mirrorColdMs: stats(cold),
    mirrorWarmMs: stats(warm),
    counts: ctx.mirrorCache.getCounts(),
  };
}

function benchIntelligence(ctx: AppContext, iterations = 200) {
  const topics = ctx.mirrorCache.getTopicStates();
  const intel = ctx.intelligence;
  const results: Record<string, ReturnType<typeof stats>> = {};

  function run(name: string, fn: () => void, n = iterations) {
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      fn();
      times.push(performance.now() - t0);
    }
    results[name] = stats(times);
  }

  run("generateDailyPlan", () => intel.generateDailyPlan(topics));
  run("getRevisionQueue", () => intel.getRevisionQueue(topics));
  run("getWeaknessReport", () => intel.getWeaknessReport(topics));
  run("scoreAllTopics", () => {
    for (const t of topics) intel.explainTopicScore(t, topics);
  }, 50);

  return { topicCount: topics.length, ...results };
}

async function main() {
  resetConfigCache();
  process.env.SQLITE_PATH = DB_PATH;
  process.env.ENABLE_SCHEDULERS = "false";
  process.env.LOG_LEVEL = "fatal";
  process.env.NOTION_TOKEN = "";
  process.env.OPENROUTER_API_KEY = "";

  const config = loadConfig(resolve(REPO_ROOT, ".env"));
  const ctx = createAppContext(
    {
      ...config,
      sqlite: { path: DB_PATH },
      schedulers: { ...config.schedulers, enabled: false },
    },
    { coachLlm: createMockCoachLLM() },
  );

  const app = buildApp(config, ctx);
  await app.ready();

  const memBefore = process.memoryUsage();
  const counts = ctx.mirrorCache.getCounts();

  const topicsRes = await app.inject({ method: "GET", url: "/api/topics" });
  const problemsRes = await app.inject({ method: "GET", url: "/api/problems" });
  const topicId = topicsRes.json()[0]?.id as string | undefined;
  const problemId = problemsRes.json()[0]?.id as string | undefined;

  const endpoints = await Promise.all([
    benchEndpoint(app, "GET /health/live", "/health/live", "GET", undefined, 100),
    benchEndpoint(app, "GET /api/plan/today (cold)", "/api/plan/today"),
    benchEndpoint(app, "GET /api/plan/today (cached)", "/api/plan/today"),
    benchEndpoint(app, "GET /api/topics", "/api/topics"),
    benchEndpoint(app, "GET /api/problems", "/api/problems"),
    benchEndpoint(app, "GET /api/revision", "/api/revision"),
    benchEndpoint(app, "GET /api/analytics/dashboard", "/api/analytics/dashboard?weeks=8"),
    benchEndpoint(app, "GET /api/analytics/summary", "/api/analytics/summary"),
    benchEndpoint(app, "GET /api/sync/status", "/api/sync/status"),
    benchEndpoint(app, "GET /api/curriculum", "/api/curriculum"),
    ...(topicId
      ? [
          benchEndpoint(app, "POST /api/session", "/api/session", "POST", {
            topicId,
            studyDuration: 30,
            problemsSolved: 1,
            problemId,
          }, 20),
        ]
      : []),
  ]);

  const loadTests = await Promise.all([
    benchConcurrent(app, "/api/plan/today", 1, 100),
    benchConcurrent(app, "/api/plan/today", 5, 100),
    benchConcurrent(app, "/api/topics", 10, 200),
    benchConcurrent(app, "/api/analytics/dashboard?weeks=8", 10, 200),
  ]);

  const mirror = benchMirrorCache(ctx);
  const intelligence = benchIntelligence(ctx);

  // Simulate scaled dataset in-memory (intelligence only)
  const scaledTopics = ctx.mirrorCache.getTopicStates();
  const scaleFactors = [1, 2, 5, 10];
  const scaleBench: Record<string, number> = {};
  for (const factor of scaleFactors) {
    const expanded = Array.from({ length: factor }, () => scaledTopics).flat();
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      createIntelligenceOrchestrator(config.intelligenceWeights).generateDailyPlan(expanded);
    }
    scaleBench[`plan_${expanded.length}_topics`] = +(
      (performance.now() - t0) / 20
    ).toFixed(2);
  }

  const memAfter = process.memoryUsage();
  const dbSizeBytes = (await import("node:fs")).statSync(DB_PATH).size;

  await ctx.close();
  await app.close();

  console.log(
    JSON.stringify(
      {
        meta: {
          dbPath: DB_PATH,
          dbSizeKb: Math.round(dbSizeBytes / 1024),
          nodeVersion: process.version,
          timestamp: new Date().toISOString(),
        },
        dataVolume: counts,
        memoryMb: {
          rss: +((memAfter.rss - memBefore.rss) / 1024 / 1024).toFixed(1),
          heapUsed: +(memAfter.heapUsed / 1024 / 1024).toFixed(1),
          heapTotal: +(memAfter.heapTotal / 1024 / 1024).toFixed(1),
          external: +(memAfter.external / 1024 / 1024).toFixed(1),
        },
        endpointLatencyMs: endpoints,
        throughput: loadTests,
        mirrorCache: mirror,
        intelligenceEnginesMs: intelligence,
        intelligenceScalingMs: scaleBench,
        operationalProfile: {
          expectedDailyRequests: "50–200 (single user, dashboard + study session)",
          peakConcurrency: "1 (single browser tab; SSE keeps 1 long-lived connection)",
          backgroundJobs: "1 weekly cron (digest); nightly SQLite backup",
          cacheLayers: [
            "MirrorCache TTL 10s",
            "Plan cache TTL 3600s",
            "Health deep check TTL 30s",
            "Frontend client TTL + SSE invalidation",
          ],
          bottlenecks: [
            "Notion sync (network, 1–10s+)",
            "OpenRouter LLM (2–30s+ streaming)",
            "SQLite single-writer on POST /api/session",
          ],
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
