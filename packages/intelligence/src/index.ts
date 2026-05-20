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
} from "./types.js";

export { DEFAULT_WEIGHTS, computePriorityScore } from "./topic-priority-engine/scoring.js";
export { TopicPriorityEngine } from "./topic-priority-engine/TopicPriorityEngine.js";
export { sm2Update, topicToSM2Quality } from "./revision-engine/sm2.js";
export { RevisionEngine } from "./revision-engine/RevisionEngine.js";
export { WeaknessEngine } from "./weakness-engine/WeaknessEngine.js";
export { DifficultyEngine } from "./difficulty-engine/DifficultyEngine.js";
export { TopicDAG } from "./roadmap-engine/dag.js";
export { DSA_PREREQUISITES } from "./roadmap-engine/dsa-roadmap.js";
export { RoadmapEngine } from "./roadmap-engine/RoadmapEngine.js";
export {
  createIntelligenceOrchestrator,
  IntelligenceOrchestrator,
} from "./orchestrator/IntelligenceOrchestrator.js";
