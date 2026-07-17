import { formatDateKey } from "../lib/json.js";
import type { SyncMetaRepository } from "../repositories/SyncMetaRepository.js";

function warmupSrsKey(topicId: string): string {
  return `warmup_srs:${topicId}`;
}

function todayUtc(): string {
  return formatDateKey(new Date());
}

/** Record that warm-up grading already drove SRS for this topic today. */
export function markWarmupSrsApplied(repo: SyncMetaRepository, topicId: string): void {
  repo.set(warmupSrsKey(topicId), todayUtc());
}

export function wasWarmupSrsAppliedToday(
  repo: SyncMetaRepository,
  topicId: string,
): boolean {
  return repo.get(warmupSrsKey(topicId)) === todayUtc();
}

/** Clear after session logging consumes the warm-up SRS slot for the day. */
export function clearWarmupSrsFlag(repo: SyncMetaRepository, topicId: string): void {
  if (repo.get(warmupSrsKey(topicId))) {
    repo.set(warmupSrsKey(topicId), "");
  }
}
