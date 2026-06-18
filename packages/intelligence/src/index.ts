/**
 * Intelligence layer — five engines + orchestrator (pure TS, no I/O).
 */
export type {
  DifficultyRecommendation,
  IntelligenceSnapshot,
  IntelligenceUpdate,
  PlanOptions,
  PriorityScore,
  PriorityWeights,
  PrerequisiteViolation,
  ProblemSuggestion,
  SessionSnapshot,
  SM2State,
  StudyPlan,
  TopicDifficulty,
  TopicState,
  TopicStatus,
  WeaknessAnalysis,
  WeaknessReport,
  WeaknessSignal,
  CurriculumItem,
  CurriculumProgress,
  MistakeTag,
} from "./types.js";

export { MISTAKE_TAGS, MISTAKE_TAG_LABELS } from "./types.js";
export { MISTAKE_TAG_ADVICE } from "./weakness-engine/signals.js";

export { DEFAULT_WEIGHTS, computePriorityScore, isMemoryExecutionDivergent } from "./topic-priority-engine/scoring.js";
export { explainPriorityScore } from "./topic-priority-engine/explain.js";
export { TopicPriorityEngine } from "./topic-priority-engine/TopicPriorityEngine.js";
export { sm2Update, readSM2State, topicToSM2Quality } from "./revision-engine/sm2.js";
export { RevisionEngine } from "./revision-engine/RevisionEngine.js";
export { WeaknessEngine } from "./weakness-engine/WeaknessEngine.js";
export { DifficultyEngine } from "./difficulty-engine/DifficultyEngine.js";
export {
  deriveTopicDifficultyFromConfidence,
  deriveTopicStatusAfterSession,
} from "./topic-progression.js";
export { deriveProductivityFromDuration } from "./session-productivity.js";
export { TopicDAG } from "./roadmap-engine/dag.js";
export { DSA_PREREQUISITES } from "./roadmap-engine/dsa-roadmap.js";
export {
  buildTopicGraphEdges,
  GRAPH_TOPIC_PREREQUISITES,
} from "./roadmap-engine/graph-edges.js";
export { RoadmapEngine } from "./roadmap-engine/RoadmapEngine.js";
export {
  createIntelligenceOrchestrator,
  IntelligenceOrchestrator,
} from "./orchestrator/IntelligenceOrchestrator.js";

export {
  gradeWarmup,
  initWarmupQueue,
  warmupAverageQuality,
  type WarmupQueueOptions,
  type WarmupQueueState,
} from "./warmup/warmupQueue.js";
export { formatWarmupAnswer, isUnavailableWarmupAnswer, isWalkthroughWarmupAnswer } from "./warmup/formatAnswer.js";

export {
  DEFAULT_CURRICULUM_TOPICS,
  TOPIC_NAME_ALIASES,
} from "./curriculum-engine/default-topics.js";
export {
  CurriculumEngine,
  createCurriculumEngine,
  resolveTopicByLabel,
  type CurriculumConfig,
  type CurriculumItemStatus,
  type CurriculumSelection,
  type TopicProblemCounts,
} from "./curriculum-engine/CurriculumEngine.js";

export type {
  AnalyticsProblemInput,
  AnalyticsReport,
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
