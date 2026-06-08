import type { DifficultyEngine } from "../../difficulty-engine/DifficultyEngine.js";
import type {
  TopicDifficulty,
  TopicState,
} from "../../types.js";
import type {
  AnalyticsProblemInput,
  DifficultyAnalysis,
  DifficultyBucket,
  TopicDifficultyAlignment,
} from "../types.js";

const DIFFICULTIES: TopicDifficulty[] = ["Easy", "Medium", "Hard"];

const DIFFICULTY_ORDER: Record<TopicDifficulty, number> = {
  Easy: 0,
  Medium: 1,
  Hard: 2,
};

export function computeDifficultyAnalysis(
  topics: TopicState[],
  problems: AnalyticsProblemInput[],
  difficultyEngine: DifficultyEngine,
): DifficultyAnalysis {
  const byDifficulty = DIFFICULTIES.map((difficulty) =>
    buildDifficultyBucket(difficulty, problems),
  );

  const byTopic = topics
    .map((topic) => buildTopicAlignment(topic, problems, difficultyEngine))
    .filter((t) => t.solveRate > 0 || topicHasProblems(t.topicId, problems))
    .sort((a, b) => a.alignment.localeCompare(b.alignment));

  const summary = buildSummary(byDifficulty, byTopic);

  return { byDifficulty, byTopic, summary };
}

function buildDifficultyBucket(
  difficulty: TopicDifficulty,
  problems: AnalyticsProblemInput[],
): DifficultyBucket {
  const bucket = problems.filter((p) => p.difficulty === difficulty);
  const solved = bucket.filter((p) => p.status === "Solved");
  const attempts = bucket.reduce((sum, p) => sum + (p.attempts ?? 0), 0);
  const times = solved
    .map((p) => p.timeTaken)
    .filter((t): t is number => t != null && t > 0);

  return {
    difficulty,
    problemsTotal: bucket.length,
    problemsSolved: solved.length,
    solveRate:
      bucket.length > 0
        ? Math.round((solved.length / bucket.length) * 100)
        : 0,
    averageAttempts:
      bucket.length > 0 ? Math.round((attempts / bucket.length) * 10) / 10 : 0,
    averageTimeMinutes:
      times.length > 0
        ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
        : 0,
  };
}

function buildTopicAlignment(
  topic: TopicState,
  problems: AnalyticsProblemInput[],
  difficultyEngine: DifficultyEngine,
): TopicDifficultyAlignment {
  const topicProblems = problems.filter((p) => p.topicId === topic.id);
  const solved = topicProblems.filter((p) => p.status === "Solved");
  const solveRate =
    topicProblems.length > 0
      ? Math.round((solved.length / topicProblems.length) * 100)
      : 0;

  const recommendation = difficultyEngine.recommendDifficulty(topic);
  const alignment = classifyAlignment(topic.difficulty, recommendation.primary);

  return {
    topicId: topic.id,
    topicName: topic.name,
    topicDifficulty: topic.difficulty,
    recommendedDifficulty: recommendation.primary,
    alignment,
    solveRate,
  };
}

function classifyAlignment(
  topicDifficulty: TopicDifficulty,
  recommended: TopicDifficulty,
): TopicDifficultyAlignment["alignment"] {
  const topicOrder = DIFFICULTY_ORDER[topicDifficulty];
  const recOrder = DIFFICULTY_ORDER[recommended];

  if (topicOrder === recOrder) return "aligned";
  if (recOrder > topicOrder) return "stretching";
  return "too_easy";
}

function topicHasProblems(topicId: string, problems: AnalyticsProblemInput[]): boolean {
  return problems.some((p) => p.topicId === topicId);
}

function buildSummary(
  byDifficulty: DifficultyBucket[],
  byTopic: TopicDifficultyAlignment[],
): string {
  const parts: string[] = [];

  const hardest = [...byDifficulty]
    .filter((b) => b.problemsTotal > 0)
    .sort((a, b) => DIFFICULTY_ORDER[b.difficulty] - DIFFICULTY_ORDER[a.difficulty])[0];

  if (hardest) {
    parts.push(
      `${hardest.difficulty} problems: ${hardest.solveRate}% solve rate (${hardest.problemsSolved}/${hardest.problemsTotal}).`,
    );
  }

  const stretching = byTopic.filter((t) => t.alignment === "stretching");
  if (stretching.length > 0) {
    parts.push(
      `${stretching.length} topic(s) ready for harder problems (e.g. ${stretching[0]!.topicName}).`,
    );
  }

  const tooEasy = byTopic.filter((t) => t.alignment === "too_easy");
  if (tooEasy.length > 0) {
    parts.push(
      `${tooEasy.length} topic(s) may need easier practice first (e.g. ${tooEasy[0]!.topicName}).`,
    );
  }

  return parts.length > 0
    ? parts.join(" ")
    : "Not enough problem data for difficulty comparison yet.";
}
