/**
 * Intelligence layer — six engines + orchestrator (pure TS, no I/O).
 */
export type {
  DifficultyRecommendation,
  PlanOptions,
  PriorityScore,
  ProblemSuggestion,
  ResolvePlanSlot,
  RevisionProblem,
  SessionSnapshot,
  SM2State,
  StudyPlan,
  TopicDifficulty,
  TopicState,
  TopicStatus,
  CurriculumItem,
  CurriculumProgress,
  MistakeTag,
} from "./types.js";

export { MISTAKE_TAG_LABELS } from "./types.js";

export { computePriorityScore } from "./topic-priority-engine/scoring.js";
export {
  ProblemReviewEngine,
  type AdmissionReason,
  type ProblemReviewConfig,
  type ProblemReviewState,
  type ResolveRating,
} from "./problem-review-engine/ProblemReviewEngine.js";
export {
  deriveTopicDifficultyFromConfidence,
  deriveTopicStatusAfterSession,
} from "./topic-progression.js";
export { deriveProductivityFromDuration } from "./session-productivity.js";
export { buildTopicGraphEdges } from "./roadmap-engine/graph-edges.js";
export {
  createIntelligenceOrchestrator,
  IntelligenceOrchestrator,
} from "./orchestrator/IntelligenceOrchestrator.js";

export {
  gradeWarmup,
  initWarmupQueue,
  warmupAverageQuality,
  type WarmupQueueState,
} from "./warmup/warmupQueue.js";
export { formatWarmupAnswer, isWalkthroughWarmupAnswer } from "./warmup/formatAnswer.js";

export { DEFAULT_CURRICULUM_TOPICS } from "./curriculum-engine/default-topics.js";
export {
  createCurriculumEngine,
  type CurriculumConfig,
  type CurriculumSelection,
  type TopicProblemCounts,
} from "./curriculum-engine/CurriculumEngine.js";

export type {
  AnalyticsProblemInput,
  AnalyticsSessionInput,
  AnalyticsTopicInput,
  DifficultyAnalysis,
  DifficultyBucket,
  MasteryVelocityPoint,
  StreakInfo,
  TopicDifficultyAlignment,
  TopicVelocity,
  WeaknessTrendPoint,
} from "./analytics/types.js";
export {
  AnalyticsEngine,
  createAnalyticsEngine,
} from "./analytics/AnalyticsEngine.js";
export {
  buildTopicState,
  groupBy,
  type TopicSignalExtras,
} from "./analytics/build-topic-snapshot.js";

export type {
  CardAnalyticsOptions,
  CardAnalyticsReport,
  CardEventRecord,
} from "./card-analytics/types.js";
export { computeCardAnalytics } from "./card-analytics/cardAnalytics.js";
