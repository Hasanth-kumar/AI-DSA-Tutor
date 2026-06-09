import {
  createLeetCodeClient,
  type LeetCodeActivity,
  type LeetCodeClient,
  type LeetCodeUserStats,
} from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import type { SyncMetaRepository } from "../repositories/SyncMetaRepository.js";

const STATS_CACHE_KEY = "leetcode_stats";
const ACTIVITY_CACHE_KEY = "leetcode_activity";
const CACHE_TTL_MS = 60 * 60 * 1000;

export class LeetCodeService {
  private readonly client: LeetCodeClient | null;

  constructor(
    config: AppConfig,
    private readonly syncMetaRepo: SyncMetaRepository,
    client?: LeetCodeClient | null,
  ) {
    this.client =
      client ??
      (config.leetcode.username
        ? createLeetCodeClient({ username: config.leetcode.username })
        : null);
  }

  isConfigured(): boolean {
    return Boolean(this.client?.isConfigured());
  }

  async getStats(forceRefresh = false): Promise<LeetCodeUserStats> {
    if (!this.client?.isConfigured()) {
      throw new Error("LeetCode is not configured (set LEETCODE_USERNAME)");
    }

    if (!forceRefresh) {
      const cached = this.readCache();
      if (cached) return cached;
    }

    const stats = await this.client.fetchUserStats();
    this.syncMetaRepo.set(
      STATS_CACHE_KEY,
      JSON.stringify({ stats, cachedAt: Date.now() }),
    );
    return stats;
  }

  async getActivity(forceRefresh = false): Promise<LeetCodeActivity> {
    if (!this.client?.isConfigured()) {
      throw new Error("LeetCode is not configured (set LEETCODE_USERNAME)");
    }

    if (!forceRefresh) {
      const cached = this.readActivityCache();
      if (cached) return cached;
    }

    const activity = await this.client.fetchActivity();
    this.syncMetaRepo.set(
      ACTIVITY_CACHE_KEY,
      JSON.stringify({ activity, cachedAt: Date.now() }),
    );
    return activity;
  }

  private readCache(): LeetCodeUserStats | null {
    const raw = this.syncMetaRepo.get(STATS_CACHE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as {
        stats: LeetCodeUserStats;
        cachedAt: number;
      };
      if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
      return parsed.stats;
    } catch {
      return null;
    }
  }

  private readActivityCache(): LeetCodeActivity | null {
    const raw = this.syncMetaRepo.get(ACTIVITY_CACHE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as {
        activity: LeetCodeActivity;
        cachedAt: number;
      };
      if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
      return parsed.activity;
    } catch {
      return null;
    }
  }
}
