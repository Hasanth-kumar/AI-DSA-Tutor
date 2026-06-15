interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * In-process TTL cache. A single-user, single-process backend doesn't need a
 * separate Redis service for the two things it caches (today's plan and hints),
 * so this keeps the same async API while storing entries in a plain Map.
 *
 * Trade-off vs. Redis: the cache is cleared on restart and not shared across
 * processes — both acceptable here, since cache misses simply recompute.
 */
export class CacheService {
  private readonly store = new Map<string, CacheEntry>();

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {
    this.store.clear();
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds = 3600): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
