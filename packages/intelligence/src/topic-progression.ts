import type { TopicDifficulty, TopicStatus } from "./types.js";

/** Confidence-only difficulty for syncing the Notion topic difficulty column. */
export function deriveTopicDifficultyFromConfidence(
  confidence: number,
): TopicDifficulty {
  if (confidence >= 80) return "Hard";
  if (confidence >= 50) return "Medium";
  return "Easy";
}

/**
 * Advance topic status after a logged study session.
 * - First session moves Not started → In progress.
 * - High confidence (and not flagged weak) moves In progress → Mastered.
 */
export function deriveTopicStatusAfterSession(
  currentStatus: TopicStatus,
  confidence: number,
  isWeakArea: boolean,
): TopicStatus {
  if (currentStatus === "Mastered") return "Mastered";
  if (currentStatus === "Not started") return "In progress";
  if (confidence >= 85 && !isWeakArea) return "Mastered";
  return "In progress";
}
