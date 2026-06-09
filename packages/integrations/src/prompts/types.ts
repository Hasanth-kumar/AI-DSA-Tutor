import type { TopicDifficulty } from "@dsa/intelligence";

export interface HintContext {
  problemName: string;
  topicName: string;
  difficulty: TopicDifficulty;
  confidence: number;
  attempts: number;
  recommendedDifficulty?: TopicDifficulty;
}

export interface DebriefContext {
  topicName: string;
  problemName?: string;
  problemsSolved: number;
  studyDuration: number;
  productivityScore: number;
  confidence: number;
  isWeakArea: boolean;
  weaknessScore: number;
  weaknessSignals: string[];
  sessionsThisWeekOnTopic: number;
  averageProductivityThisWeek: number;
  streakDays: number;
  recommendation: string;
}

export interface ChatLearningContext {
  todayPlan?: {
    primaryTopic: string;
    reasoning: string;
    estimatedDuration: number;
    suggestedProblems: string[];
  };
  weakTopics?: {
    name: string;
    score: number;
    recommendation: string;
  }[];
  streakDays?: number;
  problem?: {
    name: string;
    topicName: string;
    difficulty: string;
    attempts: number;
    status: string;
    confidence: number;
  };
}

export interface ChatCoachOptions {
  directMode?: boolean;
}
