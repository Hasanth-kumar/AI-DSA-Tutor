import {
  createNotionClient,
  getMirrorCounts,
  runMigrations,
} from "@dsa/integrations";
import type { AppConfig, HealthResponse, ServiceHealth } from "@dsa/shared";
import { Redis } from "ioredis";

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

export async function checkHealth(config: AppConfig): Promise<HealthResponse> {
  const api: ServiceHealth = { status: "ok" };

  let sqlite: ServiceHealth = { status: "down", message: "Not initialized" };
  let counts: HealthResponse["counts"];

  try {
    runMigrations(config.sqlite.path);
    const mirror = getMirrorCounts(config.sqlite.path);
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

  let redis: ServiceHealth = { status: "down", message: "Not configured" };
  try {
    const client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    const { latencyMs } = await timed(async () => {
      await client.connect();
      await client.ping();
    });
    await client.quit();
    redis = { status: "ok", latencyMs };
  } catch (err) {
    redis = {
      status: "down",
      message: err instanceof Error ? err.message : "Redis unreachable",
    };
  }

  let notion: ServiceHealth = { status: "down", message: "Not configured" };
  const { token, topicsDbId, problemsDbId, sessionsDbId } = config.notion;
  if (token && topicsDbId && problemsDbId && sessionsDbId) {
    try {
      const client = createNotionClient({
        token,
        topicsDbId,
        problemsDbId,
        sessionsDbId,
      });
      const { latencyMs } = await timed(() => client.ping());
      notion = { status: "ok", latencyMs };
    } catch (err) {
      notion = {
        status: "down",
        message: err instanceof Error ? err.message : "Notion unreachable",
      };
    }
  }

  let ollama: ServiceHealth = { status: "down", message: "Not checked" };
  try {
    const { latencyMs } = await timed(async () => {
      const res = await fetch(`${config.ollama.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    });
    ollama = { status: "ok", latencyMs };
  } catch (err) {
    ollama = {
      status: "down",
      message: err instanceof Error ? err.message : "Ollama unreachable",
    };
  }

  const services = { api, sqlite, redis, notion, ollama };
  const status = aggregateStatus(Object.values(services));

  return {
    status,
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    services,
    counts,
  };
}
