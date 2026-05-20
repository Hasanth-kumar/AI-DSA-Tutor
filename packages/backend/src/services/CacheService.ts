import { Redis } from "ioredis";

export class CacheService {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 1000,
      retryStrategy: () => null,
    });
    this.redis.on("error", () => {
      // Handled per-operation; avoid unhandled error events when Redis is down
    });
  }

  async connect(): Promise<void> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis.status === "end") return;
    try {
      if (this.redis.status === "ready") {
        await this.redis.quit();
      } else {
        this.redis.disconnect();
      }
    } catch {
      this.redis.disconnect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw, dateReviver) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds = 3600): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }
}

function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return value;
}
