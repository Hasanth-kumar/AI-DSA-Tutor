import type { AppConfig, HealthResponse, ServiceHealth } from "@dsa/shared";
import type { AppContext } from "../context.js";

const DEEP_HEALTH_TTL_MS = 30_000;

let cachedDeepHealth: { response: HealthResponse; expiresAt: number } | null = null;

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - start };
}

function aggregateStatus(services: ServiceHealth[]): HealthResponse["status"] {
  if (services.every((s) => s.status === "ok")) return "ok";
  if (services.some((s) => s.status === "down")) return "degraded";
  return "degraded";
}

/** Process liveness — no external dependency checks. */
export function checkHealthLive(): Pick<HealthResponse, "status" | "timestamp" | "version"> {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  };
}

export async function checkHealthFromContext(
  ctx: AppContext,
  options: { deep?: boolean } = {},
): Promise<HealthResponse> {
  const deep = options.deep !== false;
  if (deep) {
    const now = Date.now();
    if (cachedDeepHealth && cachedDeepHealth.expiresAt > now) {
      return cachedDeepHealth.response;
    }
  }

  const response = await buildDeepHealth(ctx);
  if (deep) {
    cachedDeepHealth = {
      response,
      expiresAt: Date.now() + DEEP_HEALTH_TTL_MS,
    };
  }
  return response;
}

async function buildDeepHealth(ctx: AppContext): Promise<HealthResponse> {
  const api: ServiceHealth = { status: "ok" };
  let counts: HealthResponse["counts"];

  let sqlite: ServiceHealth = { status: "down", message: "Not initialized" };
  try {
    const mirror = ctx.mirrorCache.getCounts();
    counts = mirror;
    sqlite = {
      status: "ok",
      message: `${mirror.topics} topics, ${mirror.problems} problems, ${mirror.sessions} sessions`,
    };
  } catch (err) {
    sqlite = {
      status: "down",
      message: err instanceof Error ? err.message : "SQLite check failed",
    };
  }

  const [redisResult, notionResult, llmHealth] = await Promise.all([
    checkRedis(ctx),
    checkNotion(ctx),
    checkLlmHealth(ctx.config),
  ]);

  const services = { api, sqlite, redis: redisResult, notion: notionResult, ollama: llmHealth };
  const status = aggregateStatus(Object.values(services));

  let sync: HealthResponse["sync"];
  try {
    sync = ctx.notionSync.getSyncHealth();
  } catch {
    sync = undefined;
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    services,
    counts,
    sync,
  };
}

async function checkRedis(ctx: AppContext): Promise<ServiceHealth> {
  try {
    const { latencyMs } = await timed(async () => {
      const ok = await ctx.cache.ping();
      if (!ok) throw new Error("Redis ping failed");
    });
    return { status: "ok", latencyMs };
  } catch (err) {
    return {
      status: "down",
      message: err instanceof Error ? err.message : "Redis unreachable",
    };
  }
}

async function checkNotion(ctx: AppContext): Promise<ServiceHealth> {
  if (!ctx.notionSync.isConfigured()) {
    return { status: "down", message: "Not configured" };
  }
  try {
    const { latencyMs } = await timed(() => ctx.notionSync.getClient().ping());
    return { status: "ok", latencyMs };
  } catch (err) {
    return {
      status: "down",
      message: err instanceof Error ? err.message : "Notion unreachable",
    };
  }
}

/** @deprecated Use checkHealthFromContext — avoids reopening DB/Redis per probe. */
export async function checkHealth(config: AppConfig): Promise<HealthResponse> {
  void config;
  throw new Error("checkHealth(config) requires AppContext — use checkHealthFromContext");
}

async function checkLlmHealth(config: AppConfig): Promise<ServiceHealth> {
  if (config.llm.provider === "openrouter") {
    const apiKey = config.llm.openrouter.apiKey;
    if (!apiKey) {
      return { status: "down", message: "OPENROUTER_API_KEY not set" };
    }
    try {
      const baseUrl = config.llm.openrouter.baseUrl.replace(/\/$/, "");
      const { latencyMs } = await timed(async () => {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
      });
      return {
        status: "ok",
        latencyMs,
        message: `OpenRouter · ${config.llm.model}`,
      };
    } catch (err) {
      return {
        status: "down",
        message: err instanceof Error ? err.message : "OpenRouter unreachable",
      };
    }
  }

  try {
    const { latencyMs } = await timed(async () => {
      const res = await fetch(`${config.llm.ollama.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    });
    return { status: "ok", latencyMs, message: `Ollama · ${config.llm.model}` };
  } catch (err) {
    return {
      status: "down",
      message: err instanceof Error ? err.message : "Ollama unreachable",
    };
  }
}
