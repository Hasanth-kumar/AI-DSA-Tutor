import type { TopicDifficulty, TopicState } from "../types.js";

export interface AnalyticsSessionInput {
  date: number;
  topicId: string | null;
  problemsSolved: number;
  studyDuration: number;
  productivityScore: number;
}

export interface AnalyticsProblemInput {
  topicId: string | null;
  difficulty: string | null;
  status: string | null;
  attempts: number;
  timeTaken: number | null;
}

export interface AnalyticsTopicInput {
  id: string;
  name: string;
  difficulty: string | null;
  status: string | null;
  confidence: number;
  revisionCount: number;
  lastRevised: number | null;
  nextRevisionAt: number | null;
  isWeakArea: number;
  prerequisites: string | null;
  sm2Interval?: number | null;
  sm2Repetition?: number | null;
  sm2Efactor?: number | null;
}

export interface StreakInfo {
  currentStreakDays: number;
  longestStreakDays: number;
  activeDays: string[];
  lastSessionDate: string | null;
}

export interface MasteryVelocityPoint {
  weekStart: string;
  weekEnd: string;
  problemsSolved: number;
  studyMinutes: number;
  problemsPerHour: number;
  sessionsCount: number;
  topicsTouched: number;
}

export interface TopicVelocity {
  topicId: string;
  topicName: string;
  weeklyProblems: { weekStart: string; count: number }[];
  trend: "up" | "down" | "stable";
}

export interface WeaknessTrendPoint {
  weekStart: string;
  weekEnd: string;
  weakTopicCount: number;
  averageWeaknessScore: number;
  topWeakTopics: { topicId: string; name: string; score: number }[];
}

export interface DifficultyBucket {
  difficulty: TopicDifficulty;
  problemsTotal: number;
  problemsSolved: number;
  solveRate: number;
  averageAttempts: number;
  averageTimeMinutes: number;
}

export interface TopicDifficultyAlignment {
  topicId: string;
  topicName: string;
  topicDifficulty: TopicDifficulty;
  recommendedDifficulty: TopicDifficulty;
  alignment: "aligned" | "stretching" | "too_easy";
  solveRate: number;
}

export interface DifficultyAnalysis {
  byDifficulty: DifficultyBucket[];
  byTopic: TopicDifficultyAlignment[];
  summary: string;
}

export interface AnalyticsReport {
  streak: StreakInfo;
  masteryVelocity: MasteryVelocityPoint[];
  topicVelocity: TopicVelocity[];
  weaknessTrend: WeaknessTrendPoint[];
  difficultyAnalysis: DifficultyAnalysis;
  topics: TopicState[];
}
